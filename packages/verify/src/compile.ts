/**
 * compile.ts — the assertion COMPILER (grammar §2).
 *
 * Maps ONE declarative gdd assertion ({setup, input, observe, expect}) into a
 * sequence of Playwright actions against the booted, ready, canvas-focused page,
 * then evaluates the comparator. This is the heart of the GENERAL INTERPRETER:
 * it contains ZERO per-game logic — it executes whatever assertion W1 wrote.
 *
 * The flow per assertion (grammar §2):
 *   2.1 decide if the comparator needs a BEFORE read (relative comparators).
 *   2.2 apply `setup` (scene / commands.setState) — precondition only.
 *   2.3 BEFORE read (relative only).
 *   2.4 fire `input` (keyPress / keyHold / click / event / none), re-focusing
 *       the canvas first (the Phaser focus gotcha).
 *   2.5 AFTER read, with a poll-to-settle window for timed/relative checks.
 *   2.6 compare `expect`.
 */

import type { Page } from 'playwright';
import {
  compareExpect,
  parseComparator,
  RELATIVE_COMPARATORS,
  type Comparator,
} from './observe.js';

// ── the gdd assertion shape (gdd.schema milestones[].assertions[]) ──────────
export interface GddInput {
  type: 'keyPress' | 'keyHold' | 'click' | 'event' | 'none';
  key?: string;
  durationMs?: number;
  target?: string;
}

export interface GddAssertion {
  id: string;
  describe: string;
  setup?: {
    scene?: string;
    state?: Record<string, unknown>;
  };
  input?: GddInput;
  observe: string;
  expect: Record<string, unknown>;
}

// ── the per-assertion result (report.schema assertions[] item) ──────────────
export interface AssertionResult {
  id: string;
  describe: string;
  observe: string;
  comparator: Comparator;
  expected: unknown;
  observed: unknown; // {before, after} for relative; the after value otherwise; null if missing
  status: 'pass' | 'fail' | 'error';
  message?: string;
  screenshot?: string;
}

const SETTLE_CEILING_MS = 2000;
const CANVAS = 'canvas';

/** Read an observe expression off __GAME__ via the injected evaluator. */
async function readObserve(page: Page, observe: string): Promise<unknown> {
  return page.evaluate(
    (expr) => (window as any).__evalObserve((window as any).__GAME__, expr),
    observe,
  );
}

/** Re-focus the canvas before each key (Phaser loses focus — grammar §2.4). */
async function focusCanvas(page: Page): Promise<void> {
  try {
    await page.locator(CANVAS).focus();
  } catch {
    // fall back to a click if focus() can't target the canvas
    try {
      await page.click(CANVAS);
    } catch {
      /* ignore — boot already clicked the canvas */
    }
  }
}

/**
 * Apply `setup` (grammar §2.2). `setup.state` goes through the sanctioned
 * `commands.setState` ONLY — never a raw write — and is used to establish a
 * precondition, never to set the observed outcome (that is enforced by W1
 * authoring + the anti-reward-hack contract; the harness simply uses the
 * sanctioned command). `setup.scene` drives to the scene via `commands.reset`.
 */
async function applySetup(
  page: Page,
  setup: GddAssertion['setup'],
): Promise<void> {
  if (!setup) return;

  if (setup.scene) {
    // Drive to the requested scene. The template exposes commands.reset() to
    // restart the current level; a multi-level template may also navigate. We
    // use the sanctioned command and re-wait ready + re-focus.
    const currentScene = await page.evaluate(
      () => (window as any).__GAME__?.scene,
    );
    if (currentScene !== setup.scene) {
      await page.evaluate(() => (window as any).__GAME__?.commands?.reset());
      await page
        .waitForFunction(() => (window as any).__GAME__?.ready === true, {
          timeout: 10000,
        })
        .catch(() => {});
      await focusCanvas(page);
    }
  }

  if (setup.state && Object.keys(setup.state).length > 0) {
    await page.evaluate(
      (patch) => (window as any).__GAME__?.commands?.setState(patch),
      setup.state,
    );
  }
}

/**
 * Resolve an entity id to a canvas-relative click position via __GAME__.entities.
 * Returns null if the entity can't be located (the assertion errors).
 */
async function resolveEntityPosition(
  page: Page,
  entityId: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((id) => {
    const game = (window as any).__GAME__;
    if (!game || !Array.isArray(game.entities)) return null;
    const ent = game.entities.find((e: any) => e && (e.id === id || e.type === id));
    if (!ent) return null;
    return { x: ent.x, y: ent.y };
  }, entityId);
}

/**
 * Fire `input` (grammar §2.4). Re-focuses the canvas first.
 * Returns an error message if the input could not be fired (e.g. unlocatable
 * click target), else null.
 */
async function fireInput(
  page: Page,
  input: GddInput | undefined,
): Promise<string | null> {
  if (!input || input.type === 'none' || !input.type) return null;

  await focusCanvas(page);

  switch (input.type) {
    case 'keyPress': {
      if (!input.key) return `keyPress input missing 'key'`;
      await page.keyboard.press(input.key);
      return null;
    }
    case 'keyHold': {
      if (!input.key) return `keyHold input missing 'key'`;
      const durationMs = input.durationMs ?? 200;
      await page.keyboard.down(input.key);
      // This waitForTimeout is a HOLD DURATION, not a readiness wait (allowed).
      await page.waitForTimeout(durationMs);
      await page.keyboard.up(input.key);
      return null;
    }
    case 'click': {
      if (!input.target) return `click input missing 'target'`;
      const pos = await resolveEntityPosition(page, input.target);
      if (!pos) return `click target '${input.target}' could not be located in entities`;
      // Canvas content has no DOM — click by coordinate (grammar §2.4).
      await page.locator(CANVAS).click({ position: { x: pos.x, y: pos.y } });
      return null;
    }
    case 'event': {
      // Drive the REAL interaction the event names. v1 supports the
      // 'overlap:a,b' / entity-target forms by moving the player toward the
      // target with held input so the overlap happens for real. We NEVER
      // setState the observed outcome. If the event names a target entity we
      // can locate, walk toward it; otherwise this is an unsupported event form
      // and the assertion errors honestly (a real coverage gap to surface).
      const handled = await driveEvent(page, input.target);
      if (!handled) {
        return `event '${input.target ?? ''}' not drivable by natural input in v1 (no synthetic trigger)`;
      }
      return null;
    }
    default:
      return `unknown input.type '${(input as any).type}'`;
  }
}

/**
 * Best-effort REAL driver for `event` inputs. Supports `overlap:player,<entity>`
 * and a bare `<entity>` target by walking the player horizontally toward the
 * target entity until they overlap (bounded). Returns true if it drove a real
 * interaction, false if the form is unsupported (→ honest error).
 *
 * This deliberately uses ONLY held movement input (the real input path) — it
 * never mutates the observed outcome.
 */
async function driveEvent(page: Page, target?: string): Promise<boolean> {
  if (!target) return false;
  // Parse `overlap:player,coin` → targetType 'coin'; or a bare 'coin'.
  let targetRef = target;
  const m = target.match(/^overlap:\s*[a-z_]+\s*,\s*([a-z_]+)\s*$/i);
  if (m) targetRef = m[1];

  // Locate the target's x relative to the player's x.
  const info = await page.evaluate((ref) => {
    const game = (window as any).__GAME__;
    if (!game) return null;
    const player = game.player;
    if (!player) return null;
    const ent = Array.isArray(game.entities)
      ? game.entities.find((e: any) => e && (e.id === ref || e.type === ref))
      : null;
    if (!ent) return null;
    return { px: player.x, ex: ent.x };
  }, targetRef);

  if (!info) return false;

  // Walk toward the target with the real arrow key, polling until overlap or a
  // bounded time elapses (wait-on-state, not a blind sleep).
  const dirKey = info.ex >= info.px ? 'ArrowRight' : 'ArrowLeft';
  await focusCanvas(page);
  await page.keyboard.down(dirKey);
  await page
    .waitForFunction(
      (ref) => {
        const game = (window as any).__GAME__;
        if (!game || !game.player) return false;
        const ent = Array.isArray(game.entities)
          ? game.entities.find((e: any) => e && (e.id === ref || e.type === ref))
          : null;
        // Overlap proxy: target gone (collected) OR within ~32px.
        if (!ent) return true;
        return Math.abs(ent.x - game.player.x) < 32;
      },
      targetRef,
      { timeout: SETTLE_CEILING_MS },
    )
    .catch(() => {});
  await page.keyboard.up(dirKey);
  return true;
}

/**
 * Execute ONE assertion end-to-end (grammar §2). Returns the per-assertion
 * result; the harness records it and (on fail/error) captures a screenshot.
 */
export async function executeAssertion(
  page: Page,
  assertion: GddAssertion,
): Promise<AssertionResult> {
  const parsed = parseComparator(assertion.expect);
  if (!parsed) {
    return {
      id: assertion.id,
      describe: assertion.describe,
      observe: assertion.observe,
      comparator: 'equals',
      expected: undefined,
      observed: null,
      status: 'error',
      message: `assertion ${assertion.id} has no recognized comparator key in expect`,
    };
  }
  const { comparator, expected } = parsed;
  const relative = RELATIVE_COMPARATORS.has(comparator);

  // 2.2 setup (GIVEN)
  await applySetup(page, assertion.setup);

  // 2.3 BEFORE read (relative comparators only)
  let before: unknown;
  if (relative) {
    before = await readObserve(page, assertion.observe);
  }

  // 2.4 input (WHEN)
  const inputErr = await fireInput(page, assertion.input);
  if (inputErr) {
    return {
      id: assertion.id,
      describe: assertion.describe,
      observe: assertion.observe,
      comparator,
      expected,
      observed: relative ? { before, after: null } : null,
      status: 'error',
      message: inputErr,
    };
  }

  // 2.5 AFTER read + poll-to-settle (timed/relative checks)
  if (relative) {
    const durationMs = assertion.input?.durationMs ?? 0;
    const settleMs = Math.min(Math.max(durationMs + 250, 500), SETTLE_CEILING_MS);
    // Wait-on-state: poll until the value moves off `before`, bounded by settleMs.
    // On timeout we read `after` anyway and let the comparator decide (fail).
    await page
      .waitForFunction(
        ([expr, b]) =>
          (window as any).__comparatorSettled((window as any).__GAME__, expr, b),
        [assertion.observe, before] as [string, unknown],
        { timeout: settleMs },
      )
      .catch(() => {});
  }

  const after = await readObserve(page, assertion.observe);

  // 2.6 compare
  const cmp = compareExpect(
    assertion.observe,
    comparator,
    expected,
    before,
    after,
  );

  return {
    id: assertion.id,
    describe: assertion.describe,
    observe: assertion.observe,
    comparator,
    expected,
    observed: relative ? { before, after } : after,
    status: cmp.status,
    ...(cmp.message ? { message: cmp.message } : {}),
  };
}
