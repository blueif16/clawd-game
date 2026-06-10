/**
 * escalation.ts — the VERIFY-2 §8 DESIGN-ESCALATION writer.
 *
 * A genuine DESIGN problem (the frozen blueprint itself is wrong — a step
 * unwinnable even when built faithfully, a contradiction VERIFY-1 missed) is
 * routed UPSTREAM, NEVER 'fixed' by bending the build. The harness writes
 * `verify/escalations.M<id>.json` (mirrors the report's `escalation` block) and
 * the caller emits the `VALIDATION_FAILED: design escalation — <line>` marker.
 *
 * Anti-reward-hack: an escalation is an HONEST output for a design defect; it is
 * NEVER a substitute for fixing a real implementation bug, and it never edits the
 * blueprint/oracle. The harness only emits the design escalation when a gate's
 * own verdict-correctness reasoning concludes the BLUEPRINT (not the build) is at
 * fault — in the autonomous harness path this is reserved for the case the
 * completability replay cannot run because the reference solution is absent/empty
 * (a VERIFY-1 contract gap) AND perturbation could not run for the same upstream
 * reason; the richer build-vs-design discrimination is the agent's job (SKILL §8).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface EscalationRecord {
  milestoneId: string;
  kind: 'design-defect';
  evidence?: {
    check?: string;
    observed?: unknown;
    blueprintExpected?: unknown;
    [k: string]: unknown;
  };
  note: string;
}

/**
 * Write verify/escalations.M<id>.json. Returns the path written. The same record
 * is also carried in report.M<id>.json's `escalation` block by the report builder.
 */
export function writeEscalation(projectDir: string, record: EscalationRecord): string {
  const verifyDir = join(projectDir, 'verify');
  mkdirSync(verifyDir, { recursive: true });
  const path = join(verifyDir, `escalations.${record.milestoneId}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n', 'utf8');
  return path;
}
