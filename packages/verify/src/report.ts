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
import type { InvariantResult } from './invariants.js';
import type { CompletabilityResult } from './completability.js';
import type { PerturbationRecord } from './perturbation.js';
import type { EscalationRecord } from './escalation.js';

/**
 * A §3 fidelity check item (report.schema fidelity[]). Same observed-vs-expected
 * shape as an assertion, plus the frozen GIVEN VERIFY-2 placed.
 */
export interface FidelityResult {
  id: string;
  describe: string;
  given?: string;
  observe: string;
  comparator: AssertionResult['comparator'];
  expected: unknown;
  observed: unknown;
  status: 'pass' | 'fail' | 'error';
  message?: string;
  screenshot?: string;
}

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
  // ── VERIFY-2 gate blocks (additive; OPTIONAL on the schema) ────────────────
  fidelity?: FidelityResult[];
  completability?: CompletabilityResult;
  invariants?: InvariantResult[];
  perturbation?: PerturbationRecord;
  escalation?: EscalationRecord;
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
  /**
   * Self-fix cycles ALREADY consumed before this pass (0 on the initial pass,
   * 1..3 on a self-fix re-verify), threaded from the harness-owned persistent
   * per-milestone counter (fixcycles.ts). Defaults to 0 (the single-pass happy
   * path). Capped at 3 by the caller per the report.schema range.
   */
  fixCycles?: number;
  // ── VERIFY-2 gate blocks (optional; present on a six-gate run) ─────────────
  fidelity?: FidelityResult[];
  completability?: CompletabilityResult;
  invariants?: InvariantResult[];
  perturbation?: PerturbationRecord;
  escalation?: EscalationRecord;
  regression?: { priorMilestonesChecked?: string[]; broke?: string[] };
}

/**
 * Build the report object. Each invocation runs ONE verify pass; the bounded
 * self-fix loop is driven by the W5 AGENT re-invoking the CLI, but the CYCLE COUNT
 * is owned by the harness (fixcycles.ts) and threaded in via `fixCycles`:
 *   - initial pass: fixCycles=0
 *   - k-th self-fix re-verify (after the agent edited src and re-invoked): fixCycles=k
 * fixOutcome: passed_first_try (passed, 0 cycles) | fixed (passed after >=1 cycle)
 *   | boot_failed | exhausted (clean-boot FAILED — surfaced honestly).
 */
export function buildReport(args: BuildReportArgs): VerifyReport {
  const fixCycles = Math.min(Math.max(args.fixCycles ?? 0, 0), 3);
  const fixOutcome = args.bootFailed
    ? 'boot_failed'
    : args.passed
      ? fixCycles > 0
        ? 'fixed'
        : 'passed_first_try'
      : 'exhausted'; // a clean-boot FAILED is surfaced honestly

  return {
    milestoneId: args.milestoneId,
    marker: args.passed ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
    passed: args.passed,
    summary: args.summary,
    assertions: args.results.map(toReportAssertion),
    buildHealth: { greenOnEntry: args.greenOnEntry },
    fixCycles,
    fixOutcome,
    advisoryVlm: args.advisoryVlm,
    // VERIFY-2 gate blocks — only emitted when the six-gate run supplied them.
    ...(args.fidelity ? { fidelity: args.fidelity } : {}),
    ...(args.completability ? { completability: args.completability } : {}),
    ...(args.invariants ? { invariants: args.invariants } : {}),
    ...(args.perturbation ? { perturbation: args.perturbation } : {}),
    ...(args.escalation ? { escalation: args.escalation } : {}),
    ...(args.regression ? { regression: args.regression } : {}),
    screenshots: args.screenshots,
    ...(args.consoleErrors.length > 0 ? { consoleErrors: args.consoleErrors } : {}),
    durationMs: args.durationMs,
    startedAt: args.startedAt,
  };
}

/**
 * Write the report PER-MILESTONE to <projectDir>/verify/report.M<id>.json
 * (NEVER overwritten — the old node clobbered a single verify/report.json, which
 * lost the M1/M2 proof when M3 ran; SKILL §9). Returns the absolute path written.
 * A non-`M<n>` milestoneId (a boot/usage edge) falls back to `report.json` so an
 * older project still gets a file.
 */
export function writeReport(projectDir: string, report: VerifyReport): string {
  const verifyDir = join(projectDir, 'verify');
  mkdirSync(verifyDir, { recursive: true });
  const fileName = /^M[1-9][0-9]*$/.test(report.milestoneId)
    ? `report.${report.milestoneId}.json`
    : 'report.json';
  const path = join(verifyDir, fileName);
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return path;
}
