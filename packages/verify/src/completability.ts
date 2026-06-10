/**
 * completability.ts — VERIFY-2 §4 COMPLETABILITY (SKILL §4).
 *
 * Replay blueprint.referenceSolution.steps[] step-by-step through the REAL game
 * flow (reusing compile.ts's input primitives), assert each step's interim
 * observable, and assert the win observable at the end — NEVER via setState of
 * the outcome. Proves the BUILT game realizes the proven-winnable design (the
 * reference solution VERIFY-1 froze), through genuine play.
 *
 * Anti-reward-hack: every step is driven as REAL input (keyPress/keyHold/event/
 * click); interim observables are READ off __GAME__; nothing is injected. A win
 * that only appears via an injected field cannot pass here (the interim
 * observables — e.g. score reached through real collection — won't hold).
 *
 * Archetype-general: the step `input` is free text VERIFY-1 wrote (e.g.
 * 'keyHold ArrowRight 600ms', 'keyPress ArrowUp', 'navigate to coin_1 …',
 * 'place tower at cell (3,2)', 'BFS move sequence: U,R,R,D'). We parse it into
 * the harness's GddInput vocabulary and drive it with the same primitives the
 * fidelity gate uses — no genre constants.
 */

import type { Page } from 'playwright';
import {
  fireInput,
  focusCanvas,
  readObserve,
  type GddInput,
  type GddContext,
} from './compile.js';
import { parseComparator, compareExpect } from './observe.js';
import type { ReferenceSolution, ReferenceStep } from './blueprint.js';
import { InvariantSampler } from './invariants.js';

/** report.schema completability{} shape. */
export interface CompletabilityResult {
  ran: boolean;
  intendedSolutionId?: string;
  reachedWin: boolean;
  interimObservables: Array<Record<string, unknown>>;
  status: 'pass' | 'fail' | 'error';
  message?: string;
}

const STEP_SETTLE_MS = 250; // bounded post-step settle (not a readiness wait)

/**
 * Replay the reference solution. Returns the completability record. Optionally
 * threads an InvariantSampler so §5 invariants are sampled THROUGH the replay
 * (the caller passes the same sampler used across the §3 drives).
 */
export async function runCompletability(
  page: Page,
  reference: ReferenceSolution | undefined,
  ctx: GddContext,
  winObservable: string,
  sampler?: InvariantSampler,
): Promise<CompletabilityResult> {
  if (!reference || !Array.isArray(reference.steps) || reference.steps.length === 0) {
    // No reference solution to replay → cannot certify completability. This is a
    // VERIFY-1 contract gap (the blueprint should always carry one), recorded
    // honestly as error (a verdict-correctness signal), never a silent pass.
    return {
      ran: false,
      reachedWin: false,
      interimObservables: [],
      status: 'error',
      message: 'blueprint.referenceSolution absent or empty — cannot replay the intended solution',
    };
  }

  const interim: Array<Record<string, unknown>> = [];

  // Reset to a fresh playable level so the replay starts from the real spawn.
  await resetLevel(page);

  for (let i = 0; i < reference.steps.length; i += 1) {
    const step = reference.steps[i];
    const input = parseReferenceInput(step, ctx);

    // Drive the REAL input for this step.
    const err = await fireInput(page, input, ctx);
    if (sampler) await sampler.sample(page, true);
    if (err) {
      return {
        ran: true,
        intendedSolutionId: reference.winsVia,
        reachedWin: false,
        interimObservables: interim,
        status: 'error',
        message: `step ${i + 1} input could not be fired (${describeInput(step.input)}): ${err}`,
      };
    }

    // Bounded settle, then the interim observable check (if the step names one).
    await page.waitForTimeout(STEP_SETTLE_MS).catch(() => {});
    if (sampler) await sampler.sample(page, true);

    if (step.observe && step.expect !== undefined) {
      const observed = await readObserve(page, step.observe);
      const ok = checkInterim(step.observe, step.expect, observed);
      interim.push({
        step: i + 1,
        input: step.input,
        observe: step.observe,
        expect: step.expect,
        observed: observed === undefined ? null : observed,
        status: ok ? 'pass' : 'fail',
      });
      if (!ok) {
        // A mis-implemented step (door doesn't latch, coin doesn't increment,
        // RESPAWN wrong) → IMPLEMENTATION FAILURE (fixable §7), recorded as fail.
        return {
          ran: true,
          intendedSolutionId: reference.winsVia,
          reachedWin: false,
          interimObservables: interim,
          status: 'fail',
          message: `step ${i + 1} interim observable failed: ${step.observe} expected ${fmt(
            step.expect,
          )}, observed ${fmt(observed)}`,
        };
      }
    }
  }

  // Final: assert the win observable was reached THROUGH the real sequence.
  const finalStatus = await readObserve(page, winObservable);
  const reachedWin = finalStatus === 'won';
  if (sampler) await sampler.sample(page, true);

  return {
    ran: true,
    intendedSolutionId: reference.winsVia,
    reachedWin,
    interimObservables: interim,
    status: reachedWin ? 'pass' : 'fail',
    ...(reachedWin
      ? {}
      : {
          message: `intended-solution replay did not reach the win: ${winObservable}='${fmt(
            finalStatus,
          )}' (expected 'won')`,
        }),
  };
}

// ── reference-step input parsing (free text → GddInput) ─────────────────────

/**
 * Parse a reference step's free-text `input` into the harness GddInput
 * vocabulary. Recognized forms (blueprint.referenceSolution.steps[].input):
 *   - 'keyHold <Key> <ms>ms'         → keyHold
 *   - 'keyPress <Key>'               → keyPress
 *   - 'click <entityId>'             → click
 *   - 'navigate to <entityId> …'     → event toward <entityId> (the win-path driver)
 *   - 'place tower at cell (x,y)'    → click (resolved by the TD entity, best-effort)
 *   - 'BFS move sequence: U,R,R,D'   → first move as a keyPress (grid); the driver
 *                                       handles the rest via the event fallback below
 *   - bare '<entityId>' / 'overlap:a,b' → event toward the target
 * Anything unrecognized falls back to an `event` toward the step's `reaches`
 * landmark when present (drive the documented controls toward it), else 'none'.
 */
export function parseReferenceInput(step: ReferenceStep, _ctx: GddContext): GddInput {
  const raw = (step.input ?? '').trim();
  const lower = raw.toLowerCase();

  // keyHold <Key> <ms>ms
  let m = raw.match(/^keyhold\s+(\S+)\s+(\d+)\s*ms$/i);
  if (m) return { type: 'keyHold', key: normalizeKey(m[1]), durationMs: parseInt(m[2], 10) };

  // keyPress <Key>
  m = raw.match(/^keypress\s+(\S+)$/i);
  if (m) return { type: 'keyPress', key: normalizeKey(m[1]) };

  // grid BFS move sequence: take the FIRST move as a keyPress (the driver/event
  // fallback below covers reaching the goal; a grid game advances one cell/press).
  m = raw.match(/move sequence:\s*([UDLR])/i);
  if (m) return { type: 'keyPress', key: gridMoveToKey(m[1]) };

  // click / place at an entity
  m = raw.match(/^(?:click|place\b.*?\bat)\s+.*?\b([a-z_][a-z0-9_]*)/i);
  if (m && /click|place/i.test(lower)) {
    // best-effort: resolve a named entity to click; if it's a cell coordinate the
    // event fallback handles it instead.
    const named = raw.match(/\b([a-z_][a-z0-9_]*)\s*$/i);
    if (named && !/cell|tower/i.test(named[1])) return { type: 'click', target: named[1] };
  }

  // navigate to <entity> / overlap:a,b / bare entity → event toward the target.
  m = raw.match(/^overlap:\s*[a-z_]+\s*,\s*([a-z_][a-z0-9_]*)/i);
  if (m) return { type: 'event', target: raw };
  m = raw.match(/navigate to\s+([a-z_][a-z0-9_]*)/i);
  if (m) return { type: 'event', target: m[1] };

  // Fall back to driving toward the step's landmark (reaches/clears) if it names
  // an entity-like token; else drive toward a bare single token; else 'none'.
  const landmark = step.reaches ?? step.clears;
  if (landmark) {
    const lm = landmark.match(/([a-z_][a-z0-9_]*)/i);
    if (lm) return { type: 'event', target: lm[1] };
  }
  const bare = raw.match(/^([a-z_][a-z0-9_]*)$/i);
  if (bare) return { type: 'event', target: bare[1] };

  return { type: 'none' };
}

function normalizeKey(k: string): string {
  // Accept 'ArrowRight', 'arrowright', 'Right', 'Space', 'Up', single letters.
  const t = k.trim();
  const lower = t.toLowerCase();
  const arrow: Record<string, string> = {
    right: 'ArrowRight',
    left: 'ArrowLeft',
    up: 'ArrowUp',
    down: 'ArrowDown',
    arrowright: 'ArrowRight',
    arrowleft: 'ArrowLeft',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    space: 'Space',
    spacebar: 'Space',
    enter: 'Enter',
  };
  return arrow[lower] ?? t;
}

function gridMoveToKey(c: string): string {
  switch (c.toUpperCase()) {
    case 'U':
      return 'ArrowUp';
    case 'D':
      return 'ArrowDown';
    case 'L':
      return 'ArrowLeft';
    case 'R':
    default:
      return 'ArrowRight';
  }
}

function describeInput(s: string): string {
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

// ── reset + interim compare ─────────────────────────────────────────────────

/** commands.reset() to a fresh playable level, re-wait ready, re-focus. */
export async function resetLevel(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__GAME__?.commands?.reset?.()).catch(() => {});
  await page
    .waitForFunction(() => (window as any).__GAME__?.ready === true, { timeout: 10000 })
    .catch(() => {});
  await focusCanvas(page);
}

/**
 * Compare an interim observable. The reference step `expect` is a literal
 * (string|number|boolean). We treat it as: equals for string/boolean, and
 * atLeast for a number (the design requires REACHING that count/threshold — a
 * higher value still satisfies "reached the count").
 */
function checkInterim(observe: string, expect: string | number | boolean, observed: unknown): boolean {
  if (typeof expect === 'number') {
    const cmp = compareExpect(observe, 'atLeast', expect, undefined, observed);
    return cmp.status === 'pass';
  }
  const parsed = parseComparator({ equals: expect });
  if (!parsed) return observed === expect;
  const cmp = compareExpect(observe, 'equals', expect, undefined, observed);
  return cmp.status === 'pass';
}

function fmt(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}
