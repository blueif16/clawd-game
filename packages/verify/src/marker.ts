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
