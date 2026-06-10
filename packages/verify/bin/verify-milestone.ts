#!/usr/bin/env -S npx tsx
/**
 * verify-milestone — the CLI surface the VERIFY-2 agent drives.
 *
 *   verify-milestone <projectDir> <milestoneId>
 *
 * Reads <projectDir>/spec/blueprint.json (VERIFY-1's frozen design), selects the
 * milestone, boots the BUILT game (<projectDir>/dist) headless, and runs the SIX
 * VERIFY-2 gates in order:
 *   (1) build-health  → boot + ready + canvas-not-blank (harness.boot)
 *   (2) fidelity      → drive each acceptance criterion (executable gdd assertion)
 *   (3) completability→ replay blueprint.referenceSolution through real play
 *   (4) invariants    → evaluate the sampled during-drive trace
 *   (5) perturbation  → re-run originally-passing checks with declaredRanges permuted
 *   (6) aggregate     → the VERBATIM marker (PASSED iff ALL gates pass incl.
 *                       perturbation.invariant===true), else FAILED / design escalation
 *
 * Writes <projectDir>/verify/report.M<id>.json (PER-MILESTONE, never overwritten)
 * + screenshots, prints the verbatim marker to stdout, and ALWAYS exits 0 (the
 * marker is the signal, not the exit code).
 *
 * GRACEFUL FALLBACK: when spec/blueprint.json is absent, the harness falls back
 * to the OLD single-aggregate gdd-assertion path (spec/gdd.json) so it still runs
 * on older projects (the marker is then the original §4 form).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runMilestone, runMilestoneVerify2 } from '../src/harness.js';
import { formatBootFailed } from '../src/marker.js';
import type { GddAssertion, GddEntity, GddControl } from '../src/compile.js';
import { readBlueprint, type Blueprint } from '../src/blueprint.js';

interface GddMilestone {
  id: string;
  name?: string;
  goal?: string;
  assertions: GddAssertion[];
}
interface Gdd {
  entities?: GddEntity[];
  controls?: GddControl[];
  milestones: GddMilestone[];
}

async function main(): Promise<void> {
  const [, , projectDirArg, milestoneIdArg] = process.argv;

  if (!projectDirArg || !milestoneIdArg) {
    process.stderr.write(
      'usage: verify-milestone <projectDir> <milestoneId>\n' +
        '  e.g. verify-milestone /tmp/gv-proj M1\n',
    );
    process.exit(2);
    return;
  }

  const projectDir = resolve(projectDirArg);
  const milestoneId = milestoneIdArg;

  // Prefer the VERIFY-1 blueprint (the canonical six-gate input); fall back to
  // the gdd when it is absent (older projects → the original single-aggregate path).
  const blueprint = readBlueprint(projectDir);

  if (blueprint) {
    await runSixGate(projectDir, milestoneId, blueprint);
    return;
  }

  await runGddFallback(projectDir, milestoneId);
}

/** The VERIFY-2 six-gate path (spec/blueprint.json present). */
async function runSixGate(projectDir: string, milestoneId: string, blueprint: Blueprint): Promise<void> {
  const milestone = (blueprint.milestones ?? []).find((m) => m.id === milestoneId);
  if (!milestone) {
    console.log(
      formatBootFailed(
        `milestone '${milestoneId}' not found in spec/blueprint.json (have: ${(blueprint.milestones ?? [])
          .map((m) => m.id)
          .join(', ')})`,
      ),
    );
    process.exit(0);
    return;
  }
  if (!Array.isArray(milestone.assertions) || milestone.assertions.length === 0) {
    console.log(formatBootFailed(`milestone '${milestoneId}' has no assertions to run`));
    process.exit(0);
    return;
  }

  try {
    const { markerLine, reportPath, report } = await runMilestoneVerify2({
      projectDir,
      milestoneId,
      assertions: milestone.assertions,
      blueprint,
      context: {
        entities: Array.isArray(blueprint.entities) ? blueprint.entities : undefined,
        controls: Array.isArray(blueprint.controls) ? blueprint.controls : undefined,
      },
    });

    console.log(markerLine);
    const fidN = report.fidelity?.length ?? 0;
    const fidPass = report.fidelity?.filter((f) => f.status === 'pass').length ?? 0;
    process.stderr.write(
      `report: ${reportPath} (fidelity ${fidPass}/${fidN}` +
        `, completability ${report.completability?.status ?? 'n/a'}` +
        `, invariants ${report.invariants?.filter((i) => i.held).length ?? 0}/${report.invariants?.length ?? 0}` +
        `, perturbation ${report.perturbation?.ran ? (report.perturbation.invariant ? 'invariant' : 'DIVERGED') : 'not-run'})\n`,
    );
  } catch (err) {
    console.log(formatBootFailed(`verify runner error: ${err}`));
  }

  process.exit(0);
}

/** The fallback path (no blueprint): the original single-aggregate gdd run. */
async function runGddFallback(projectDir: string, milestoneId: string): Promise<void> {
  const gddPath = join(projectDir, 'spec', 'gdd.json');
  if (!existsSync(gddPath)) {
    console.log(
      formatBootFailed(`neither spec/blueprint.json nor spec/gdd.json found in ${projectDir}`),
    );
    process.exit(0);
    return;
  }

  let gdd: Gdd;
  try {
    gdd = JSON.parse(readFileSync(gddPath, 'utf8')) as Gdd;
  } catch (err) {
    console.log(formatBootFailed(`failed to parse spec/gdd.json: ${err}`));
    process.exit(0);
    return;
  }

  const milestone = (gdd.milestones ?? []).find((m) => m.id === milestoneId);
  if (!milestone) {
    console.log(
      formatBootFailed(
        `milestone '${milestoneId}' not found in spec/gdd.json (have: ${(gdd.milestones ?? [])
          .map((m) => m.id)
          .join(', ')})`,
      ),
    );
    process.exit(0);
    return;
  }
  if (!Array.isArray(milestone.assertions) || milestone.assertions.length === 0) {
    console.log(formatBootFailed(`milestone '${milestoneId}' has no assertions to run`));
    process.exit(0);
    return;
  }

  try {
    const { markerLine, reportPath, report } = await runMilestone({
      projectDir,
      milestoneId,
      assertions: milestone.assertions,
      context: {
        entities: Array.isArray(gdd.entities) ? gdd.entities : undefined,
        controls: Array.isArray(gdd.controls) ? gdd.controls : undefined,
      },
    });

    console.log(markerLine);
    process.stderr.write(
      `report: ${reportPath} (${report.assertions.length} assertions, ${report.assertions.filter((a) => a.status === 'pass').length} passed) [gdd fallback — no blueprint]\n`,
    );
  } catch (err) {
    console.log(formatBootFailed(`verify runner error: ${err}`));
  }

  process.exit(0);
}

main();
