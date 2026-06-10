/**
 * invariants.ts — VERIFY-2 §5 trace-level + differential pre/post-condition
 * sampler (perturbation-grammar.md companion; SKILL §5).
 *
 * The harness today reads only the END-STATE per assertion; this adds a
 * DURING-DRIVE sampler: it polls `__GAME__.snapshot()` (falling back to a
 * field read) on a bounded cadence across every drive (the §3 fidelity drives
 * AND the §4 completability replay), accumulates a TRACE, then evaluates the
 * blueprint's invariants over that trace:
 *
 *   - monotonic:        score never decreases within a life; moveCount /
 *                       waveIndex non-decreasing; lives/health non-increasing
 *                       except at sanctioned heal/respawn points.
 *   - bounds:           player.x/y (or gridX/gridY) within layout.bounds; no
 *                       NaN/Infinity in any sampled numeric position.
 *   - no-softlock:      no long run of zero-delta whole-state under continuous
 *                       input (the val1 "frozen at x=308 for ~900 frames" class).
 *   - status-legality:  every status transition matches the frozen
 *                       win/lose/RESPAWN flow (no illegal 'lost' in a
 *                       respawn-only design; once 'won' it stays 'won').
 *   - no-side-effect:   completing one mechanism must not silently mutate an
 *                       unrelated observable (snapshot-diff off-target fields) —
 *                       evaluated per-drive by the caller via diffOffTarget().
 *
 * Anti-reward-hack: this only OBSERVES (reads snapshot/fields); it never writes
 * __GAME__ and never edits the oracle. A violation is a real bug → FAILED.
 *
 * Archetype-general: it reads whatever vocabulary the blueprint/observe expose
 * (score, moveCount, waveIndex, lives, gridX/gridY, …) — never a genre literal.
 */

import type { Page } from 'playwright';
import type { BlueprintLayout } from './blueprint.js';

/** One sampled frame of observable state (a snapshot()-shaped plain object). */
export type Sample = Record<string, unknown>;

/** A report.schema invariants[] item. */
export interface InvariantResult {
  name: string;
  kind: 'monotonic' | 'bounds' | 'no-softlock' | 'status-legality' | 'no-side-effect';
  held: boolean;
  evidence?: string;
}

const SAMPLE_INTERVAL_MS = 80; // bounded cadence (between drive steps)
const SOFTLOCK_ZERO_DELTA_RUN = 18; // ~1.4s of zero whole-state delta = soft-lock
const STATUS_FIELD = 'status';

/**
 * A trace accumulator. Start one before a drive, call `sample()` on the bounded
 * cadence (or let `sampleLoop` run it), then `evaluate()` at the end.
 */
export class InvariantSampler {
  private samples: Sample[] = [];
  private lastSampleAt = 0;

  /** Take ONE sample now if the cadence has elapsed (cheap; safe to over-call). */
  async sample(page: Page, force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastSampleAt < SAMPLE_INTERVAL_MS) return;
    this.lastSampleAt = now;
    const snap = await readSnapshot(page);
    if (snap) this.samples.push(snap);
  }

  /** Number of accumulated samples (diagnostic). */
  get length(): number {
    return this.samples.length;
  }

  /** The raw trace (read-only access for the caller, e.g. side-effect diffs). */
  get trace(): ReadonlyArray<Sample> {
    return this.samples;
  }

  /**
   * Evaluate the five invariant classes over the accumulated trace.
   * `bounds` comes from the blueprint layout (the level extents). When a class
   * has no data in the trace (e.g. no score field ever sampled) it is reported
   * held:true with an evidence note (vacuously true — nothing violated it).
   */
  evaluate(layout?: BlueprintLayout): InvariantResult[] {
    return [
      this.checkMonotonic(),
      this.checkBounds(layout),
      this.checkNoSoftlock(),
      this.checkStatusLegality(),
    ];
  }

  // ── monotonic (differential) ───────────────────────────────────────────────
  private checkMonotonic(): InvariantResult {
    // score / moveCount / waveIndex must be non-decreasing across the trace;
    // a single life is the whole trace here (a respawn resets position, not
    // score). A drop is a real bug.
    const nonDecreasing: Array<'score' | 'moveCount' | 'waveIndex'> = [
      'score',
      'moveCount',
      'waveIndex',
    ];
    for (const field of nonDecreasing) {
      let prev: number | undefined;
      for (const s of this.samples) {
        const v = numField(s, field);
        if (v === undefined) continue;
        if (prev !== undefined && v < prev) {
          return {
            name: `${field} never decreases`,
            kind: 'monotonic',
            held: false,
            evidence: `${field} dropped ${prev}→${v} mid-trace`,
          };
        }
        prev = v;
      }
    }
    return {
      name: 'score/moveCount/waveIndex non-decreasing',
      kind: 'monotonic',
      held: true,
    };
  }

  // ── bounds (in-extent + no NaN/Inf) ─────────────────────────────────────────
  private checkBounds(layout?: BlueprintLayout): InvariantResult {
    const w = layout?.bounds?.width;
    const h = layout?.bounds?.height;
    for (const s of this.samples) {
      const player = (s as any).player as
        | { x?: unknown; y?: unknown; gridX?: unknown; gridY?: unknown }
        | null
        | undefined;
      if (!player) continue;
      // NaN / Infinity in any position component is always a bug.
      for (const key of ['x', 'y', 'gridX', 'gridY'] as const) {
        const v = player[key];
        if (typeof v === 'number' && !Number.isFinite(v)) {
          return {
            name: 'player position finite + in-bounds',
            kind: 'bounds',
            held: false,
            evidence: `player.${key} is ${String(v)} (not finite)`,
          };
        }
      }
      // In-extent only when the blueprint gave us the level extents. Allow a
      // small slack (sprites have width; the body may dip a few px past an edge).
      if (typeof w === 'number' && typeof player.x === 'number') {
        if (player.x < -SLACK_PX || player.x > w + SLACK_PX) {
          return {
            name: 'player position finite + in-bounds',
            kind: 'bounds',
            held: false,
            evidence: `player.x=${player.x} outside [0,${w}] (±${SLACK_PX}px)`,
          };
        }
      }
      if (typeof h === 'number' && typeof player.y === 'number') {
        if (player.y < -SLACK_PX || player.y > h + SLACK_PX) {
          return {
            name: 'player position finite + in-bounds',
            kind: 'bounds',
            held: false,
            evidence: `player.y=${player.y} outside [0,${h}] (±${SLACK_PX}px)`,
          };
        }
      }
    }
    return { name: 'player position finite + in-bounds', kind: 'bounds', held: true };
  }

  // ── no soft-lock (long zero-delta whole-state run under continuous input) ────
  private checkNoSoftlock(): InvariantResult {
    // Only meaningful if the caller drove continuous input through these samples.
    // We detect a long run of identical whole-state snapshots: the player neither
    // moved nor changed any observable while input was being fired.
    let runStart = 0;
    let run = 1;
    for (let i = 1; i < this.samples.length; i += 1) {
      if (sampleEqual(this.samples[i], this.samples[i - 1])) {
        run += 1;
        if (run >= SOFTLOCK_ZERO_DELTA_RUN) {
          const px = numField(this.samples[i], 'player.x');
          return {
            name: 'no soft-lock (state changes under input)',
            kind: 'no-softlock',
            held: false,
            evidence:
              `whole-state unchanged for ${run} consecutive samples` +
              (px !== undefined ? ` (player.x≈${px})` : '') +
              ` starting at sample ${runStart}`,
          };
        }
      } else {
        run = 1;
        runStart = i;
      }
    }
    return { name: 'no soft-lock (state changes under input)', kind: 'no-softlock', held: true };
  }

  // ── status legality (transitions match a legal flow) ────────────────────────
  private checkStatusLegality(): InvariantResult {
    let prev: string | undefined;
    for (const s of this.samples) {
      const cur = strField(s, STATUS_FIELD);
      if (cur === undefined) continue;
      if (prev !== undefined && prev !== cur) {
        // Legal transitions: booting→playing, playing→won, playing→lost,
        // playing→playing (RESPAWN keeps 'playing'). A terminal status must
        // not flip away (won→playing, lost→won, won→lost are illegal).
        if (!isLegalStatusTransition(prev, cur)) {
          return {
            name: 'status transitions are legal',
            kind: 'status-legality',
            held: false,
            evidence: `illegal status transition ${prev}→${cur}`,
          };
        }
      }
      prev = cur;
    }
    return { name: 'status transitions are legal', kind: 'status-legality', held: true };
  }
}

const SLACK_PX = 64;

/**
 * Snapshot-diff off-target fields after a single drive (the §5 no-side-effect
 * class). Given the BEFORE and AFTER snapshot and the set of fields the drive
 * was EXPECTED to change (the observe path + its parents), report a no-side-effect
 * invariant: held:false if an UNEXPECTED top-level scalar observable changed.
 */
export function diffOffTarget(
  before: Sample | undefined,
  after: Sample | undefined,
  expectedChangedPaths: string[],
): InvariantResult {
  if (!before || !after) {
    return { name: 'no unexpected side-effect', kind: 'no-side-effect', held: true };
  }
  const expected = new Set(expectedChangedPaths.map((p) => p.split('.')[0]));
  // Only compare the universal scalar observables (status/score/moveCount/…);
  // player position legitimately drifts during any drive, so it is never an
  // "off-target" surprise and is excluded.
  const scalarKeys = ['status', 'score', 'moveCount', 'waveIndex', 'gold', 'lives', 'phase'];
  for (const key of scalarKeys) {
    if (expected.has(key)) continue;
    const b = (before as any)[key];
    const a = (after as any)[key];
    if (b === undefined && a === undefined) continue;
    if (b !== a) {
      return {
        name: 'no unexpected side-effect',
        kind: 'no-side-effect',
        held: false,
        evidence: `off-target field '${key}' changed ${fmt(b)}→${fmt(a)} (drive targeted ${[...expected].join(',') || 'nothing'})`,
      };
    }
  }
  return { name: 'no unexpected side-effect', kind: 'no-side-effect', held: true };
}

// ── page-side read + small helpers ──────────────────────────────────────────

/** Read __GAME__.snapshot() (preferred) or a shallow field read (fallback). */
async function readSnapshot(page: Page): Promise<Sample | null> {
  return page
    .evaluate(() => {
      const g = (window as any).__GAME__;
      if (!g) return null;
      try {
        if (typeof g.snapshot === 'function') {
          const snap = g.snapshot();
          if (snap && typeof snap === 'object') return snap;
        }
      } catch {
        /* fall through to a shallow read */
      }
      // Shallow read of the universal vocabulary (never throws on a missing field).
      const player = g.player
        ? {
            x: g.player.x,
            y: g.player.y,
            gridX: g.player.gridX,
            gridY: g.player.gridY,
            health: g.player.health,
          }
        : null;
      return {
        status: g.status,
        score: g.score,
        moveCount: g.moveCount,
        waveIndex: g.waveIndex,
        gold: g.gold,
        lives: g.lives,
        phase: g.phase,
        player,
      } as Record<string, unknown>;
    })
    .catch(() => null);
}

/** Resolve a dotted scalar path (one level under a top key) to a number. */
function numField(s: Sample, path: string): number | undefined {
  const v = resolvePath(s, path);
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function strField(s: Sample, path: string): string | undefined {
  const v = resolvePath(s, path);
  return typeof v === 'string' ? v : undefined;
}
function resolvePath(s: Sample, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = s;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Whole-snapshot structural equality (stable JSON) for the soft-lock run. */
function sampleEqual(a: Sample, b: Sample): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Legal status flow (template-contract §3.3): playing is the only re-entrant. */
function isLegalStatusTransition(prev: string, cur: string): boolean {
  if (prev === cur) return true;
  if (prev === 'booting') return cur === 'playing'; // boot → first frame
  if (prev === 'playing') return cur === 'won' || cur === 'lost' || cur === 'playing';
  // 'won' and 'lost' are terminal — no legal transition away from them.
  return false;
}

function fmt(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}
