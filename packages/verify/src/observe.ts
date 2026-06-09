/**
 * observe.ts — the `observe` mini-grammar evaluator + the comparator semantics.
 *
 * Conforms to assertion-execution-grammar.md §3 (the evaluator) and §2.6 (the
 * comparator table). Two halves:
 *
 *   1. PAGE-SIDE (injected via addInitScript BEFORE the game boots):
 *      `__evalObserve(game, expr)` + `__comparatorSettled(game, expr, before)`.
 *      These run inside the browser against `window.__GAME__`. They are VERBATIM
 *      the reference code in grammar §3.3 — they read ONLY `__GAME__` (never raw
 *      Phaser), and a missing path resolves to `undefined` (never throws).
 *
 *   2. HOST-SIDE (Node): `compareExpect(comparator, expected, before, after)`
 *      implements the §2.6 comparator table; `parseComparator(expect)` pulls the
 *      single comparator key out of a gdd `expect` object.
 *
 * The page-side functions are stringified and injected, so they MUST be plain,
 * self-contained, dependency-free function declarations.
 */

// ── 1. PAGE-SIDE evaluator (injected verbatim; grammar §3.3) ────────────────

/**
 * The exact source injected into the page via `addInitScript`. It defines
 * `window.__evalObserve` and `window.__comparatorSettled` so every
 * `page.evaluate` can call them. Kept as a string of plain JS (no TS, no
 * imports) because it is serialized into the browser context before load.
 */
export const OBSERVE_INIT_SCRIPT = `
(() => {
  // Evaluate the closed observe mini-grammar against window.__GAME__.
  // Supported forms (grammar §3.1):
  //   - dot-paths (max one level of nesting under a top-level key)
  //   - entities.count(type==<T>)  (the only function form)
  // A null head or a missing path resolves to undefined (never throws).
  function __evalObserve(game, expr) {
    if (game == null) return undefined;
    var m = String(expr).match(/^entities\\.count\\(type==([a-z_]+)\\)$/);
    if (m) {
      return Array.isArray(game.entities)
        ? game.entities.filter(function (e) { return e && e.type === m[1]; }).length
        : undefined;
    }
    var parts = String(expr).split('.');
    var v = game;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  // Used only by the relative-settle poll: true once the value has moved off
  // \`before\` (and is defined). Mirrors grammar §3.3 exactly.
  function __comparatorSettled(game, expr, before) {
    var after = __evalObserve(game, expr);
    return after !== undefined && after !== before;
  }

  window.__evalObserve = __evalObserve;
  window.__comparatorSettled = __comparatorSettled;
})();
`;

// ── 2. HOST-SIDE comparator table (grammar §2.6) ────────────────────────────

/** The seven gdd comparator keys (gdd.schema `expect`). */
export type Comparator =
  | 'decreases'
  | 'increases'
  | 'changes'
  | 'unchanged'
  | 'equals'
  | 'atLeast'
  | 'atMost';

/** The relative comparators need a BEFORE read (grammar §2.1). */
export const RELATIVE_COMPARATORS: ReadonlySet<Comparator> = new Set<Comparator>([
  'decreases',
  'increases',
  'changes',
  'unchanged',
]);

export interface ParsedExpect {
  comparator: Comparator;
  /** The expected value/direction (a boolean for relative, a literal for absolute). */
  expected: unknown;
}

/**
 * Pull the single comparator key out of a gdd `expect` object. The gdd schema
 * guarantees exactly one key is set; we defend against malformed input by
 * taking the first known comparator present.
 */
export function parseComparator(expect: Record<string, unknown>): ParsedExpect | null {
  const order: Comparator[] = [
    'decreases',
    'increases',
    'changes',
    'unchanged',
    'equals',
    'atLeast',
    'atMost',
  ];
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(expect, key)) {
      return { comparator: key, expected: expect[key] };
    }
  }
  return null;
}

export interface CompareResult {
  status: 'pass' | 'fail' | 'error';
  message?: string;
}

/** Deep value equality for arrays/objects (used by `changes`/`unchanged`). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function isMissing(v: unknown): boolean {
  return v === undefined || v === null;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Evaluate one comparator against the observed value(s). Returns the per-assertion
 * status + a diagnostic message. Conforms to grammar §2.6:
 *   - a missing observe path (undefined/null) → `error` "path not present"
 *   - a relative comparator on a non-numeric ordering → `error`
 *   - otherwise pass/fail per the comparator table.
 */
export function compareExpect(
  observe: string,
  comparator: Comparator,
  expected: unknown,
  before: unknown,
  after: unknown,
): CompareResult {
  const relative = RELATIVE_COMPARATORS.has(comparator);

  // Missing-path → error (grammar §2.6 + §6). For relative comparators the
  // AFTER read is the live current value; if it is missing the path is absent.
  if (isMissing(after)) {
    return {
      status: 'error',
      message: `observe path ${observe} not present on __GAME__`,
    };
  }
  if (relative && isMissing(before)) {
    return {
      status: 'error',
      message: `observe path ${observe} not present on __GAME__ (no before value)`,
    };
  }

  switch (comparator) {
    case 'decreases':
      if (!isNum(before) || !isNum(after)) {
        return {
          status: 'error',
          message: `cannot apply 'decreases' to non-numeric ${observe}; before=${fmt(before)} after=${fmt(after)}`,
        };
      }
      return after < before
        ? { status: 'pass' }
        : {
            status: 'fail',
            message: `expected ${observe} to decrease; before=${fmt(before)} after=${fmt(after)}`,
          };

    case 'increases':
      if (!isNum(before) || !isNum(after)) {
        return {
          status: 'error',
          message: `cannot apply 'increases' to non-numeric ${observe}; before=${fmt(before)} after=${fmt(after)}`,
        };
      }
      return after > before
        ? { status: 'pass' }
        : {
            status: 'fail',
            message: `expected ${observe} to increase; before=${fmt(before)} after=${fmt(after)}`,
          };

    case 'changes':
      return !deepEqual(before, after)
        ? { status: 'pass' }
        : {
            status: 'fail',
            message: `expected ${observe} to change; before=${fmt(before)} after=${fmt(after)} (unchanged)`,
          };

    case 'unchanged':
      return deepEqual(before, after)
        ? { status: 'pass' }
        : {
            status: 'fail',
            message: `expected ${observe} to be unchanged; before=${fmt(before)} after=${fmt(after)}`,
          };

    case 'equals':
      return after === expected
        ? { status: 'pass' }
        : {
            status: 'fail',
            message: `expected ${observe} === ${fmt(expected)}; got ${fmt(after)}`,
          };

    case 'atLeast':
      if (!isNum(after) || !isNum(expected)) {
        return {
          status: 'error',
          message: `cannot apply 'atLeast' to non-numeric ${observe}; observed=${fmt(after)} expected>=${fmt(expected)}`,
        };
      }
      return after >= expected
        ? { status: 'pass' }
        : {
            status: 'fail',
            message: `expected ${observe} >= ${fmt(expected)}; got ${fmt(after)}`,
          };

    case 'atMost':
      if (!isNum(after) || !isNum(expected)) {
        return {
          status: 'error',
          message: `cannot apply 'atMost' to non-numeric ${observe}; observed=${fmt(after)} expected<=${fmt(expected)}`,
        };
      }
      return after <= expected
        ? { status: 'pass' }
        : {
            status: 'fail',
            message: `expected ${observe} <= ${fmt(expected)}; got ${fmt(after)}`,
          };

    default:
      return { status: 'error', message: `unknown comparator ${comparator}` };
  }
}

function fmt(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}
