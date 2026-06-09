/**
 * report.ts — build + write verify/report.json (schema: report.schema.json).
 *
 * The proof-of-work for ONE milestone: per-assertion observed-vs-expected, the
 * marker, buildHealth, fixCycles, advisoryVlm, screenshots, consoleErrors,
 * timing. The harness (not this module) owns the self-fix loop; the runner
 * itself is stateless per invocation (fixCycles=0, fixOutcome passed/failed/boot),
 * so the report it writes is the honest first-pass verdict the W5 agent reads.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AssertionResult } from './compile.js';
import type { AdvisoryVlm } from './vlm.js';

export interface VerifyReport {
  milestoneId: string;
  marker: 'VALIDATION_PASSED' | 'VALIDATION_FAILED';
  passed: boolean;
  summary: string;
  assertions: ReportAssertion[];
  buildHealth: {
    greenOnEntry: boolean;
    rebuiltAfterFix?: boolean;
    greenAfterFix?: boolean;
  };
  fixCycles: number;
  fixEdits?: Array<{ cycle: number; files: string[]; rationale: string }>;
  fixOutcome?: 'passed_first_try' | 'fixed' | 'exhausted' | 'stalled' | 'boot_failed';
  advisoryVlm: AdvisoryVlm;
  regression?: { priorMilestonesChecked?: string[]; broke?: string[] };
  screenshots: string[];
  consoleErrors?: string[];
  durationMs?: number;
  startedAt: string;
}

/** report.schema assertions[] item shape (observed serialized per the schema). */
interface ReportAssertion {
  id: string;
  describe: string;
  observe: string;
  comparator: AssertionResult['comparator'];
  expected: unknown;
  observed: unknown;
  status: 'pass' | 'fail' | 'error';
  message?: string;
  screenshot?: string;
}

/**
 * Map a runtime AssertionResult to the report.schema item. `observed` is null
 * when the path was missing (status 'error' with a missing-path message and a
 * null after).
 */
function toReportAssertion(r: AssertionResult): ReportAssertion {
  // Normalize observed: report.schema says null when the observe path was
  // missing/undefined. For relative comparators observed is {before, after};
  // collapse an undefined after to null per the schema.
  let observed = r.observed;
  if (observed && typeof observed === 'object' && 'after' in (observed as any)) {
    const o = observed as { before: unknown; after: unknown };
    observed = {
      before: o.before === undefined ? null : o.before,
      after: o.after === undefined ? null : o.after,
    };
  } else if (observed === undefined) {
    observed = null;
  }
  return {
    id: r.id,
    describe: r.describe,
    observe: r.observe,
    comparator: r.comparator,
    expected: r.expected === undefined ? null : r.expected,
    observed,
    status: r.status,
    ...(r.message ? { message: r.message } : {}),
    ...(r.screenshot ? { screenshot: r.screenshot } : {}),
  };
}

export interface BuildReportArgs {
  milestoneId: string;
  passed: boolean;
  summary: string;
  results: AssertionResult[];
  advisoryVlm: AdvisoryVlm;
  screenshots: string[];
  consoleErrors: string[];
  startedAt: string;
  durationMs: number;
  bootFailed: boolean;
  greenOnEntry: boolean;
}

/**
 * Build the report object. The runner is single-pass (no self-fix), so:
 *   fixCycles = 0; fixOutcome = passed_first_try | boot_failed | exhausted-not-
 *   reached. A single-pass FAILED (assertions failed, booted clean) is recorded
 *   as the honest first-pass verdict — the W5 AGENT decides whether to enter its
 *   bounded fix loop on top of this.
 */
export function buildReport(args: BuildReportArgs): VerifyReport {
  const fixOutcome = args.bootFailed
    ? 'boot_failed'
    : args.passed
      ? 'passed_first_try'
      : 'exhausted'; // single-pass: a clean-boot FAILED is surfaced honestly

  return {
    milestoneId: args.milestoneId,
    marker: args.passed ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
    passed: args.passed,
    summary: args.summary,
    assertions: args.results.map(toReportAssertion),
    buildHealth: { greenOnEntry: args.greenOnEntry },
    fixCycles: 0,
    fixOutcome,
    advisoryVlm: args.advisoryVlm,
    screenshots: args.screenshots,
    ...(args.consoleErrors.length > 0 ? { consoleErrors: args.consoleErrors } : {}),
    durationMs: args.durationMs,
    startedAt: args.startedAt,
  };
}

/**
 * Write the report to <projectDir>/verify/report.json. Returns the absolute
 * path written.
 */
export function writeReport(projectDir: string, report: VerifyReport): string {
  const verifyDir = join(projectDir, 'verify');
  mkdirSync(verifyDir, { recursive: true });
  const path = join(verifyDir, 'report.json');
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return path;
}
