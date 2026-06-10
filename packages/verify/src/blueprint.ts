/**
 * blueprint.ts — the spec/blueprint.json type surface + the deterministic
 * permutation selector (perturbation-grammar.md §1–§2).
 *
 * This is the SHARED type home VERIFY-2's net-new gates (completability /
 * invariants / perturbation) read against. It models only the blueprint
 * SECTIONS the harness consumes — `.config`, `.layout`, `.coupling`,
 * `.referenceSolution`, `.acceptanceCriteria`, `.declaredRanges` — per
 * verify-design/blueprint.schema.json. The blueprint is the IMMUTABLE ORACLE;
 * nothing here mutates it.
 *
 * It ALSO commits the deterministic in-envelope value selector
 * (FNV-1a(parameterPath) × permutationSeed → an in-[min,max] value that moves
 * OFF the original when the band permits), which is `perturbation.ts`'s drawing
 * primitive — NO Math.random (unavailable on the pi runner), reproducible so a
 * divergence is replayable (perturbation-grammar.md §2 / §9.4).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GddAssertion, GddEntity, GddControl } from './compile.js';

// ── blueprint section shapes (blueprint.schema.json subset we consume) ───────

/** A `[min, max]` perturbation band (blueprint.schema $defs/range). */
export type Range = [number, number];

/** declaredRanges = FLAT map { "<parameterPath>": [min,max] } (§1). */
export type DeclaredRanges = Record<string, Range>;

/** A Given/When/Then acceptance criterion (blueprint.acceptanceCriteria[]). */
export interface AcceptanceCriterion {
  id: string; // e.g. 'AC-M3-win'
  milestone: string; // e.g. 'M3'
  /** ID-LINK: the gdd assertion id this AC upgrades (e.g. 'M3-A1'). Pairs the
   * frozen GIVEN onto the executed assertion BY ID (fallback: milestone+order). */
  assertionId?: string;
  given: string;
  when: string;
  then: string;
  observable: string; // the __GAME__ path/field being observed
  expect: Record<string, unknown>; // exactly one comparator key
}

/** One step of the reference (intended) solution (blueprint.referenceSolution.steps[]). */
export interface ReferenceStep {
  input: string; // documented control / event (free text, e.g. 'keyHold ArrowRight 600ms')
  reaches?: string;
  clears?: string;
  engagesThreat?: string;
  observe?: string; // a __GAME__ observable to check after this step
  expect?: string | number | boolean; // expected value of `observe`
}

export interface ReferenceSolution {
  winsVia: string;
  steps: ReferenceStep[];
  engagesEveryThreat?: boolean;
}

/** A placed entity / threat / coordinate carries free-form position keys. */
export interface Coordinate {
  x?: number;
  y?: number;
  gridX?: number;
  gridY?: number;
  [k: string]: unknown;
}

export interface BlueprintLayout {
  playerSpawn?: Coordinate;
  goal?: { id: string } & Coordinate;
  rewards?: Array<{ id: string } & Coordinate>;
  threats?: Array<{ id: string; kind: string } & Coordinate>;
  bounds?: { width: number; height: number };
  [k: string]: unknown;
}

export interface BlueprintMilestone {
  id: string;
  name?: string;
  goal?: string;
  acceptanceCriteria?: string[]; // human strings on the milestone (NOT the GWT objects)
  assertions: GddAssertion[];
}

/**
 * The blueprint sections VERIFY-2 reads. A strict superset of the gdd; we only
 * type the fields the harness touches (the schema is the full contract).
 */
export interface Blueprint {
  meta?: { archetype?: string; title?: string; [k: string]: unknown };
  entities?: GddEntity[];
  controls?: GddControl[];
  config?: Record<string, number>;
  milestones: BlueprintMilestone[];
  layout?: BlueprintLayout;
  coupling?: Array<{
    for: string;
    threat: string;
    meetsAt?: Coordinate;
    passableWindowMs?: number;
    note?: string;
  }>;
  referenceSolution?: ReferenceSolution;
  /** The top-level Given/When/Then acceptance contract (§10 / D3 canonical). */
  acceptanceCriteria?: AcceptanceCriterion[];
  declaredRanges?: DeclaredRanges;
  verdict?: { result?: string; [k: string]: unknown };
  [k: string]: unknown;
}

/** Read spec/blueprint.json if present (the canonical VERIFY-2 input). */
export function readBlueprint(projectDir: string): Blueprint | null {
  const p = join(projectDir, 'spec', 'blueprint.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Blueprint;
  } catch {
    return null;
  }
}

// ── deterministic in-envelope permutation selector (§2) ─────────────────────

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/**
 * FNV-1a over a string, mixed with the permutationSeed. A pure function of
 * (permutationSeed, parameterPath) — reproducible, no Math.random / wall-clock
 * (§2.1). Returns a non-negative 32-bit integer index.
 */
export function fnv1aIndex(parameterPath: string, permutationSeed: number): number {
  let h = FNV_OFFSET ^ (permutationSeed >>> 0);
  h = h >>> 0;
  for (let i = 0; i < parameterPath.length; i += 1) {
    h ^= parameterPath.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  // final mix with the seed again so different seeds reorder selection
  h ^= permutationSeed >>> 0;
  return h >>> 0;
}

/** Is this band a count/seed (integer band) vs a continuous (coordinate/timing) one? */
function isIntegerBand(path: string): boolean {
  // rng.seed and any *.count are integer bands; everything else is treated
  // continuous (interior quartiles). The first/last path segment classes it.
  const last = path.split('.').pop() ?? '';
  return path.startsWith('rng.') || last === 'count' || last === 'seed';
}

export interface SelectedValue {
  /** The in-[min,max] permuted value (strictly inside for continuous bands). */
  value: number;
  /** false ⇒ point-range (min===max): nothing to vary; skip (§2.2 degenerate). */
  moved: boolean;
}

/**
 * Select ONE in-envelope permuted value for `parameterPath` from `[min,max]`,
 * given the frozen `original` value, per perturbation-grammar.md §2:
 *
 *  - continuous (coordinate/speed/timing): pick STRICTLY INSIDE the band — the
 *    interior is unambiguously behavior-preserving (an endpoint may sit on a
 *    feasibility boundary). Use the quartile offset set {¼,½,¾}·span, selected
 *    by the derived index, rounded to an integer for pixel coordinates.
 *  - integer band (count / seed): picked = min + (i % (max-min+1)).
 *  - degenerate (min===max): no permutation possible → moved:false.
 *
 * MOVE-THE-NEEDLE (§2.3): when the band permits (max>min) the result MUST differ
 * from `original`; if the first pick lands on `original`, advance to the next
 * offset / count until it moves (or, for a 2-value integer band, take the other).
 */
export function selectPermutedValue(
  parameterPath: string,
  range: Range,
  original: number,
  permutationSeed: number,
): SelectedValue {
  const [min, max] = range;
  if (!(max > min)) {
    // point-range — cannot vary.
    return { value: min, moved: false };
  }
  const i = fnv1aIndex(parameterPath, permutationSeed);

  if (isIntegerBand(parameterPath)) {
    const span = Math.floor(max) - Math.floor(min); // inclusive count = span+1
    const lo = Math.floor(min);
    let picked = lo + (i % (span + 1));
    if (picked === original) {
      // advance within the band to guarantee a move (§2.3).
      picked = lo + ((i + 1) % (span + 1));
      if (picked === original && span >= 1) {
        picked = picked === lo ? lo + 1 : picked - 1;
      }
    }
    return { value: picked, moved: picked !== original };
  }

  // continuous: interior quartiles, never an endpoint (§2.2).
  const span = max - min;
  const offsets = [0.25, 0.5, 0.75];
  const isPixel = Number.isInteger(original) || /\.(x|y)$/.test(parameterPath);
  for (let k = 0; k < offsets.length; k += 1) {
    const off = offsets[(i + k) % offsets.length];
    let v = min + off * span;
    if (isPixel) v = Math.round(v);
    if (v !== original && v > min && v < max) {
      return { value: v, moved: true };
    }
  }
  // Fallback: the midpoint (still interior); accept even if === original (rare —
  // a band centred exactly on the original with all quartiles colliding).
  let mid = min + 0.5 * span;
  if (isPixel) mid = Math.round(mid);
  return { value: mid, moved: mid !== original };
}

/** The first path segment classes the seam (§1 / §4): config.* baked, else runtime. */
export type Seam = 'runtime' | 'baked-config';

/**
 * Route a parameterPath to its seam (perturbation-grammar.md §4.3 table):
 *  - `config.*` → BAKED-CONFIG (a tunable read once in create(); permute via
 *    gameConfig.json + one rebuild) — unless it is re-read live each frame (rare;
 *    the engine prefers correctness, defaulting config.* to baked).
 *  - `layout.*` / `rng.*` → RUNTIME (commands.setState / seed / injected config).
 */
export function seamFor(parameterPath: string): Seam {
  return parameterPath.startsWith('config.') ? 'baked-config' : 'runtime';
}

/** The default deterministic selector seed (0xC0FFEE) — reproducible (§2.1). */
export const DEFAULT_PERMUTATION_SEED = 0xc0ffee;

/**
 * Resolve the frozen ORIGINAL value of a parameterPath off the blueprint.
 * `config.<k>` → blueprint.config[k]; `layout.<...>` → walk blueprint.layout;
 * `rng.*` → has NO frozen literal by contract (a runtime-seeded game carries no
 * seed on the blueprint; perturbation-grammar.md §2.2) → returns undefined and the
 * caller uses the band-min SENTINEL (an anchor for move-the-needle, NOT a design
 * value). Returns undefined when the path is not present (the engine then skips it).
 */
export function resolveOriginal(bp: Blueprint, parameterPath: string): number | undefined {
  const segs = parameterPath.split('.');
  const head = segs[0];

  if (head === 'config') {
    const v = bp.config?.[segs.slice(1).join('.')];
    return typeof v === 'number' ? v : undefined;
  }
  if (head === 'rng') {
    // No frozen literal for the seed; the perturbation supplies one in-band.
    return undefined;
  }
  if (head === 'layout') {
    return resolveLayoutPath(bp.layout, segs.slice(1));
  }
  return undefined;
}

/**
 * Walk a layout subpath, tolerating the two collection shapes the schema uses:
 *  - object map by id is NOT how the schema stores rewards/threats (they are
 *    ARRAYS of {id,...}); so `rewards.coin_1.x` resolves coin_1 by id in the
 *    rewards[] array, then reads `.x`.
 *  - `playerSpawn.x`, `goal.x`, `bounds.width` are plain nested objects.
 *  - `rewards.count` resolves to rewards.length.
 */
function resolveLayoutPath(
  layout: BlueprintLayout | undefined,
  segs: string[],
): number | undefined {
  if (!layout || segs.length === 0) return undefined;
  const [first, ...rest] = segs;

  // collection paths: rewards / threats are arrays keyed by id.
  if ((first === 'rewards' || first === 'threats') && Array.isArray((layout as any)[first])) {
    const arr = (layout as any)[first] as Array<{ id: string } & Record<string, unknown>>;
    if (rest[0] === 'count' && rest.length === 1) return arr.length;
    const ent = arr.find((e) => e.id === rest[0]);
    if (!ent) return undefined;
    const v = ent[rest[1]];
    return typeof v === 'number' ? v : undefined;
  }

  // plain nested object walk (playerSpawn.x, goal.x, bounds.width, …).
  let cur: unknown = (layout as any)[first];
  for (const k of rest) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === 'number' ? cur : undefined;
}
