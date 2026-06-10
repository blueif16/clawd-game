/**
 * marker.ts — the verbatim VALIDATION_PASSED/FAILED marker contract.
 *
 * Conforms to assertion-execution-grammar.md §4 (ported from gamedevbench
 * validation.py). The marker is the binary gate the orchestrator parses; a
 * missing marker = FAILED by default.
 *
 *   - All pass + booted clean → `VALIDATION_PASSED: <id> all <N> assertions passed`
 *   - Any fail/error         → `VALIDATION_FAILED: <describe1>; <describe2>; …`
 *   - Never ready / crashed   → `VALIDATION_FAILED: game did not become ready (boot failed)`
 */

export interface MarkerResult {
  passed: boolean;
  /** The trailing message (the part after the marker token). May be empty. */
  message: string;
}

/**
 * Format the PASS marker line. `n` = total assertion count.
 */
export function formatPassed(milestoneId: string, n: number): string {
  return `VALIDATION_PASSED: ${milestoneId} all ${n} assertions passed`;
}

/**
 * Format the FAIL marker line from the failed assertions' `describe` strings
 * (the gamedevbench '; '-joined issues[]).
 */
export function formatFailed(failedDescribes: string[]): string {
  const joined = failedDescribes.join('; ');
  return `VALIDATION_FAILED: ${joined}`;
}

/**
 * The boot-failed marker (never became ready / fatal console error).
 */
export function formatBootFailed(detail?: string): string {
  const base = 'game did not become ready (boot failed)';
  return `VALIDATION_FAILED: ${detail ? `${base}: ${detail}` : base}`;
}

/**
 * Format the AGGREGATE PASS marker (SKILL §7) for the six-gate VERIFY-2 run.
 * Verbatim: `VALIDATION_PASSED: <id> all <N> checks passed (fidelity +
 * completability + invariants + perturbation)`. `n` = total checks that passed.
 */
export function formatAggregatePassed(milestoneId: string, n: number): string {
  return `VALIDATION_PASSED: ${milestoneId} all ${n} checks passed (fidelity + completability + invariants + perturbation)`;
}

/**
 * Format the AGGREGATE FAIL marker (SKILL §7) from the failed checks' describe
 * strings ('; '-joined, the gamedevbench issues[] convention). A perturbation
 * divergence's describe reads e.g. `M2-A1 diverged under permutation
 * (coord-shift): real build invariant, this build not`.
 */
export function formatAggregateFailed(failedDescribes: string[]): string {
  const joined = failedDescribes.filter((d) => d && d.trim()).join('; ');
  return `VALIDATION_FAILED: ${joined || 'one or more gates failed'}`;
}

/**
 * The DESIGN-ESCALATION marker variant (SKILL §8): a genuine design defect (the
 * frozen blueprint itself is wrong / a step unwinnable even when built faithfully)
 * is routed UPSTREAM, never fixed by bending the build. It is a VALIDATION_FAILED
 * so the existing parser regex (`/VALIDATION_(PASSED|FAILED)(?::\s*(.+))?/`)
 * still matches it as a fail — only the trailing message distinguishes it.
 */
export function formatDesignEscalation(line: string): string {
  const tail = line && line.trim() ? line.trim() : 'blueprint design defect';
  return `VALIDATION_FAILED: design escalation — ${tail}`;
}

/**
 * The bound-exhausted marker — the harness REFUSES to run another verify pass
 * because the structural ≤N self-fix bound is used up (emitted BEFORE booting, so
 * the cost is capped). It is an HONEST VALIDATION_FAILED carrying the last real
 * failures; it never fakes a pass and never touches the oracle.
 */
export function formatBoundExhausted(maxCycles: number, lastFailures?: string): string {
  const tail = lastFailures && lastFailures.trim() ? lastFailures.trim() : 'last verify failed';
  return `VALIDATION_FAILED: self-fix bound (${maxCycles}) exhausted — ${tail}`;
}

/**
 * The two-line parser (ported verbatim from gamedevbench validation.py).
 * Scans output for the FIRST marker; PASSED wins iff found first. The optional
 * trailing group is the human-readable message. A MISSING marker = FAILED by
 * default (the safe oracle: the absence of a genuine pass is a fail).
 */
export function parseMarker(output: string): MarkerResult {
  const passedRe = /VALIDATION_PASSED(?::\s*(.+))?/;
  const failedRe = /VALIDATION_FAILED(?::\s*(.+))?/;

  // Scan line by line; the first marker found wins (grammar §4).
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const p = line.match(passedRe);
    if (p) return { passed: true, message: (p[1] ?? '').trim() };
    const f = line.match(failedRe);
    if (f) return { passed: false, message: (f[1] ?? '').trim() };
  }
  // No marker found → FAILED by default.
  return { passed: false, message: 'No validation result found in output' };
}
