#!/usr/bin/env -S npx tsx
/**
 * verify-milestone — the CLI surface the W5 agent drives (grammar §5.1).
 *
 *   verify-milestone <projectDir> <milestoneId>
 *
 * Reads <projectDir>/spec/gdd.json, selects milestones[milestoneId], boots the
 * BUILT game (<projectDir>/dist) headless, runs that milestone's assertions
 * against window.__GAME__, prints the verbatim marker to stdout, writes
 * <projectDir>/verify/report.json + screenshots, and ALWAYS exits 0 (the marker
 * is the signal, not the exit code — matches gamedevbench).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runMilestone } from '../src/harness.js';
import { formatBootFailed } from '../src/marker.js';
import type { GddAssertion, GddEntity, GddControl } from '../src/compile.js';

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
    // No marker for a usage error — but per the contract a missing marker on a
    // real run is FAILED. For a usage error we print to stderr and exit 2.
    process.stderr.write(
      'usage: verify-milestone <projectDir> <milestoneId>\n' +
        "  e.g. verify-milestone /tmp/gv-proj M1\n",
    );
    process.exit(2);
    return;
  }

  const projectDir = resolve(projectDirArg);
  const milestoneId = milestoneIdArg;

  // Read the gdd (the oracle — read-only).
  const gddPath = join(projectDir, 'spec', 'gdd.json');
  if (!existsSync(gddPath)) {
    // Cannot find the spec → boot cannot proceed → FAILED marker.
    console.log(formatBootFailed(`spec/gdd.json not found at ${gddPath}`));
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
    console.log(
      formatBootFailed(`milestone '${milestoneId}' has no assertions to run`),
    );
    process.exit(0);
    return;
  }

  try {
    const { markerLine, reportPath, report } = await runMilestone({
      projectDir,
      milestoneId,
      assertions: milestone.assertions,
      // The gdd entity + control tables let the generic event/win-path driver
      // resolve the target by role and derive movement from the documented
      // controls — no per-game logic, no genre constants.
      context: {
        entities: Array.isArray(gdd.entities) ? gdd.entities : undefined,
        controls: Array.isArray(gdd.controls) ? gdd.controls : undefined,
      },
    });

    // Print the verbatim marker (the gate the orchestrator parses).
    console.log(markerLine);
    // A short human pointer to the report (stderr — does NOT affect the marker).
    process.stderr.write(
      `report: ${reportPath} (${report.assertions.length} assertions, ${report.assertions.filter((a) => a.status === 'pass').length} passed)\n`,
    );
  } catch (err) {
    // Any unexpected runner crash → no clean marker → FAILED (the safe oracle).
    console.log(formatBootFailed(`verify runner error: ${err}`));
  }

  // Always exit 0 — the marker is the signal, not the exit code.
  process.exit(0);
}

main();
