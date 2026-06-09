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

// ── the gdd entity + control tables (read-only context for the driver) ──────
// These let the `event`/win-path driver stay GENERIC across archetypes: it maps
// the target reference to the entity's functional type via the gdd, and derives
// which documented keys move the player toward the goal. Both are read straight
// off the gdd (the oracle) — the harness never invents a control or a constant.

export interface GddEntity {
  id: string;
  role?: string; // gdd role: player|collectible|obstacle|goal|enemy|tower|...
}

export interface GddControl {
  input: string; // a DOM key name (the player's documented control)
  action: string; // a free-text description ("move right", "jump", ...)
}

export interface GddContext {
  entities?: GddEntity[];
  controls?: GddControl[];
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
 * Resolves by id OR type OR gdd role (generic, like the event driver). Returns
 * null if the entity can't be located (the assertion errors).
 */
async function resolveEntityPosition(
  page: Page,
  entityId: string,
  ctx: GddContext,
): Promise<{ x: number; y: number } | null> {
  const refs = resolveTargetRefs(entityId, ctx);
  return page.evaluate((refList) => {
    const game = (window as any).__GAME__;
    if (!game || !Array.isArray(game.entities)) return null;
    const set = new Set(refList as string[]);
    const ent = game.entities.find(
      (e: any) => e && (set.has(e.id) || set.has(e.type)),
    );
    if (!ent) return null;
    return { x: ent.x, y: ent.y };
  }, refs);
}

/**
 * Fire `input` (grammar §2.4). Re-focuses the canvas first.
 * Returns an error message if the input could not be fired (e.g. unlocatable
 * click target), else null. `ctx` carries the gdd entity + control tables so the
 * `event`/win-path driver can stay generic (resolve the target by role, derive
 * movement keys from the documented controls).
 */
async function fireInput(
  page: Page,
  input: GddInput | undefined,
  ctx: GddContext,
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
      const pos = await resolveEntityPosition(page, input.target, ctx);
      if (!pos) return `click target '${input.target}' could not be located in entities`;
      // Canvas content has no DOM — click by coordinate (grammar §2.4).
      await page.locator(CANVAS).click({ position: { x: pos.x, y: pos.y } });
      return null;
    }
    case 'event': {
      // Drive the REAL interaction the event names: fire the player's OWN
      // documented controls toward the named target until the real interaction
      // fires (target consumed / true overlap / the observed field already
      // satisfied) OR a bounded step/time budget is exhausted. We NEVER setState
      // the observed outcome — we drive input, not the verdict. If the target
      // cannot be resolved at all, that is an honest authoring error (the event
      // names an entity not in the gdd). If it resolves but the player can't
      // reach it within budget, `driveEvent` returns OK anyway and the comparator
      // reads the real (still-unwon) state and FAILS honestly — the
      // unwinnable-level signal, never an error-as-"unsupported".
      const driven = await driveEvent(page, input.target, ctx);
      if (!driven.ok) return driven.message ?? `event '${input.target ?? ''}' could not be driven`;
      return null;
    }
    default:
      return `unknown input.type '${(input as any).type}'`;
  }
}

// ── generic target resolution + control derivation (the de-hardcoded core) ──

/**
 * Resolve a gdd target REFERENCE (e.g. 'exit', or the 2nd arg of
 * 'overlap:player,exit') to the functional entity-TYPE the hook tags it with.
 * The gdd entity table maps a referenced id to its `role`, which IS the hook's
 * entity type vocabulary (player|collectible|obstacle|goal|enemy|tower|...). So
 * a gdd entity `{id:'exit', role:'goal'}` referenced as 'exit' resolves to type
 * 'goal' — exactly what the live `__GAME__.entities[].type` carries. We return
 * BOTH the original ref and the resolved role so the page-side lookup can match
 * on id OR type OR role (whichever the W4 build tagged).
 */
function resolveTargetRefs(ref: string, ctx: GddContext): string[] {
  const refs = new Set<string>([ref]);
  const ent = (ctx.entities ?? []).find((e) => e.id === ref);
  if (ent?.role) refs.add(ent.role);
  return [...refs];
}

/**
 * Parse the event target into the entity reference the player must reach. Forms:
 *   - 'overlap:a,b'  → the SECOND operand (the thing the player overlaps WITH)
 *   - bare '<entity>' → itself
 * The first operand of an overlap is conventionally the player; we drive toward
 * the second. Generic — no per-game names.
 */
function parseEventTargetRef(target: string): string {
  const m = target.match(/^overlap:\s*[a-z_]+\s*,\s*([a-z_]+)\s*$/i);
  return m ? m[1] : target;
}

/** A documented control mapped to a movement INTENT the driver can issue. */
interface MovementKeys {
  /** key that increases player.x (move right), if documented. */
  right?: string;
  /** key that decreases player.x (move left), if documented. */
  left?: string;
  /** key that decreases player.y (jump / move up), if documented. */
  up?: string;
  /** key that increases player.y (move down), if documented. */
  down?: string;
}

/**
 * Derive movement keys from the player's DOCUMENTED controls[] — never genre
 * constants. We classify each control by (a) its DOM key name and (b) keywords
 * in its action text, so it generalizes across archetypes (arrow keys, WASD,
 * "move right"/"jump"/"up"). A control with no movement meaning (e.g.
 * "start/restart") is ignored. If controls[] is absent/empty, we fall back to
 * the universal arrow keys (the engine's default movement binding).
 */
function deriveMovementKeys(controls: GddControl[] | undefined): MovementKeys {
  const keys: MovementKeys = {};
  const classify = (key: string, action: string): void => {
    const k = key.toLowerCase();
    const a = (action ?? '').toLowerCase();
    const has = (...words: string[]) => words.some((w) => a.includes(w));
    // Jump / up first (a jump is the canonical "reduce y" verb in 2D games).
    if (k === 'arrowup' || k === 'w' || has('jump', 'up', 'rise', 'fly', 'thrust')) {
      keys.up ??= key;
      return;
    }
    if (k === 'arrowdown' || k === 's' || has('down', 'crouch', 'descend')) {
      keys.down ??= key;
      return;
    }
    if (k === 'arrowright' || k === 'd' || has('right', 'forward', 'east')) {
      keys.right ??= key;
      return;
    }
    if (k === 'arrowleft' || k === 'a' || has('left', 'back', 'west')) {
      keys.left ??= key;
      return;
    }
  };
  for (const c of controls ?? []) {
    if (c && typeof c.input === 'string') classify(c.input, c.action);
  }
  // Universal fallback: the engine binds arrow keys for movement by default.
  keys.right ??= 'ArrowRight';
  keys.left ??= 'ArrowLeft';
  keys.up ??= 'ArrowUp';
  return keys;
}

const DRIVE_OVERLAP_PX = 36; // 2D overlap proxy radius (any archetype)
const DRIVE_STEP_MS = 140; // per-step hold duration (a short, real input burst)
const DRIVE_MAX_STEPS = 24; // bounded step budget
const DRIVE_BUDGET_MS = 6000; // bounded wall-clock budget

interface DriveResult {
  /** false ONLY when the input could not be fired at all (honest error). */
  ok: boolean;
  message?: string;
}

/**
 * GENERIC win-path / event driver. Fires the player's OWN documented controls to
 * reduce the distance to the named target until the REAL interaction fires, or a
 * bounded step/time budget is exhausted. Archetype-agnostic:
 *
 *   - Resolve the target by gdd role → live entity type/id (no literal-name dep).
 *   - Each step: read live player + target positions off __GAME__; pick the keys
 *     (from the documented controls) that REDUCE |dx| and |dy| (move toward x;
 *     jump/up when the target is above; move down when below); hold them briefly.
 *   - Terminate when the interaction fires for real: the target entity is GONE
 *     (consumed/collected), OR true 2D overlap, OR the observed field is already
 *     satisfied (the win actually happened) — checked by the caller's compare.
 *
 * Anti-reward-hack: it issues ONLY real key input and reads ONLY observable state
 * to decide direction; it NEVER writes the observed field / status. If the target
 * can't be reached in budget, it still returns ok:true — the caller reads the
 * real state and the comparator FAILS honestly (the unwinnable-level signal).
 *
 * It returns ok:false ONLY when the target cannot be resolved on __GAME__ at all
 * (the event names an entity that does not exist — a real authoring error).
 */
async function driveEvent(
  page: Page,
  target: string | undefined,
  ctx: GddContext,
): Promise<DriveResult> {
  if (!target) {
    return { ok: false, message: `event input missing 'target'` };
  }
  const baseRef = parseEventTargetRef(target);
  const candidateRefs = resolveTargetRefs(baseRef, ctx);
  const keys = deriveMovementKeys(ctx.controls);

  await focusCanvas(page);

  // We can only DRIVE if there is a player to drive (no player = a real boot/
  // contract gap → honest input error). A target that is not currently present
  // is NOT an error here — it is left to the comparator: an absent goal means
  // the win never fires and the assertion FAILS honestly (the unwinnable-level
  // signal), it is never reported as "unsupported".
  const located = await locateState(page, candidateRefs);
  if (!located || !located.hasPlayer) {
    return {
      ok: false,
      message: `event target '${baseRef}': no player on __GAME__ to drive toward it`,
    };
  }

  const deadline = Date.now() + DRIVE_BUDGET_MS;
  let pressedHoriz: string | null = null;

  try {
    for (let step = 0; step < DRIVE_MAX_STEPS && Date.now() < deadline; step += 1) {
      const s = await locateState(page, candidateRefs);
      // Interaction fired for real: target consumed (gone) or true 2D overlap.
      if (!s || s.reached) break;

      const dx = s.tx - s.px;
      const dy = s.ty - s.py;

      // Horizontal: hold the documented key that reduces |dx|. Keep it held
      // across steps (continuous walk); only flip when the sign of dx flips.
      const wantHoriz: string | null =
        Math.abs(dx) > DRIVE_OVERLAP_PX
          ? (dx > 0 ? keys.right : keys.left) ?? null
          : null;
      if (wantHoriz !== pressedHoriz) {
        if (pressedHoriz) await page.keyboard.up(pressedHoriz).catch(() => {});
        if (wantHoriz) await page.keyboard.down(wantHoriz).catch(() => {});
        pressedHoriz = wantHoriz;
      }

      // Vertical: a TAP per step (a jump is a discrete press, not a hold). Jump
      // when the target is meaningfully ABOVE the player; move down when below.
      if (dy < -DRIVE_OVERLAP_PX && keys.up) {
        await page.keyboard.press(keys.up).catch(() => {});
      } else if (dy > DRIVE_OVERLAP_PX && keys.down) {
        await page.keyboard.press(keys.down).catch(() => {});
      }

      // A short real-input burst, then re-read (wait-on-state, bounded).
      await page.waitForTimeout(DRIVE_STEP_MS);
    }
  } finally {
    if (pressedHoriz) await page.keyboard.up(pressedHoriz).catch(() => {});
  }

  // Brief bounded settle so the engine's overlap/win callback latches before the
  // caller's AFTER read (the win flips a frame or two after the overlap fires).
  // This is a one-time post-interaction settle, not a per-step blind sleep.
  await page.waitForTimeout(DRIVE_STEP_MS).catch(() => {});

  // Always ok: the input was driven for real. Whether the interaction fired is
  // decided by the caller reading the real observable (pass = it happened;
  // fail = the target was unreachable within budget — the honest unwinnable
  // signal). We never assert the outcome here.
  return { ok: true };
}

/**
 * Read the live player + target positions off __GAME__ in ONE page call.
 * `reached` = the interaction has already fired for real (target consumed/gone,
 * or true 2D overlap within DRIVE_OVERLAP_PX). Returns null if there is no
 * player. Matching the target tolerates id OR type OR role (whichever W4 tagged).
 */
async function locateState(
  page: Page,
  refs: string[],
): Promise<{
  hasPlayer: boolean;
  px: number;
  py: number;
  tx: number;
  ty: number;
  reached: boolean;
} | null> {
  return page.evaluate(
    ([refList, overlapPx]) => {
      const game = (window as any).__GAME__;
      if (!game) return null;
      const player = game.player;
      if (!player) return { hasPlayer: false, px: 0, py: 0, tx: 0, ty: 0, reached: false };
      const ents = Array.isArray(game.entities) ? game.entities : [];
      const set = new Set(refList as string[]);
      const ent = ents.find(
        (e: any) => e && (set.has(e.id) || set.has(e.type)),
      );
      const px = Number(player.x) || 0;
      const py = Number(player.y) || 0;
      if (!ent) {
        // Target gone → the interaction consumed it (collected/destroyed) = the
        // real interaction fired. We only treat "gone" as reached if we have a
        // player (a fresh boot with no entities returns hasPlayer:false above).
        return { hasPlayer: true, px, py, tx: px, ty: py, reached: true };
      }
      const tx = Number(ent.x) || 0;
      const ty = Number(ent.y) || 0;
      const reached =
        Math.abs(tx - px) <= (overlapPx as number) &&
        Math.abs(ty - py) <= (overlapPx as number);
      return { hasPlayer: true, px, py, tx, ty, reached };
    },
    [refs, DRIVE_OVERLAP_PX] as [string[], number],
  );
}

/**
 * Execute ONE assertion end-to-end (grammar §2). Returns the per-assertion
 * result; the harness records it and (on fail/error) captures a screenshot.
 * `ctx` carries the gdd entity + control tables so the `event`/win-path driver
 * and `click` target resolution stay generic (resolve by role, derive movement
 * keys from the documented controls). Defaults to empty (the keyPress/keyHold/
 * none paths don't need it).
 */
export async function executeAssertion(
  page: Page,
  assertion: GddAssertion,
  ctx: GddContext = {},
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
  const inputErr = await fireInput(page, assertion.input, ctx);
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
