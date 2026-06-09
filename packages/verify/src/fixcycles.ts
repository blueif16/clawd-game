/**
 * fixcycles.ts — the HARNESS-OWNED, structurally-enforced ≤3 self-fix bound.
 *
 * The W5 self-fix LOOP is the AGENT re-invoking `verify-milestone <project> <mid>`
 * after each src edit. The harness is stateless per invocation, so the prose
 * "≤3 cycles" bound in the SKILL is not enforceable by the runner alone — a cheap
 * model can (and did, in the plat1 run) ignore the prose and re-invoke ~8×,
 * burning to the node timeout.
 *
 * This module makes the bound STRUCTURAL: the harness persists a per-milestone
 * attempt counter in a sidecar under <projectDir>/verify/ and consults it BEFORE
 * booting Chromium. Once the bound is exhausted the harness REFUSES to run another
 * verify pass — it emits the honest bound-exhausted VALIDATION_FAILED marker and
 * exits immediately (no browser launched → the cost is capped no matter how many
 * times the agent re-invokes).
 *
 * Semantics (matches the SKILL §5 ladder):
 *   - attempts = the number of verify passes ALREADY run for this <mid> while it
 *     has stayed FAILED. attempts=0 is the INITIAL pass (the first verify after
 *     W4). attempts=1..3 are the 3 permitted self-fix cycles (verify-after-edit).
 *   - The bound is MAX_FIX_CYCLES (=3) self-fix cycles AFTER the initial pass, i.e.
 *     the harness runs at most (1 + 3) = 4 verify passes before it refuses.
 *   - `fixCycles` reported = attempts already consumed at run start, capped at
 *     MAX_FIX_CYCLES (so report.fixCycles is 0 on the initial pass, 1..3 on a
 *     self-fix pass — exactly the schema's 0..3 range).
 *
 * ANTI-REWARD-HACK: this ONLY stops the loop. At the bound the harness emits an
 * HONEST VALIDATION_FAILED carrying the last real failures. It NEVER fakes a pass,
 * never weakens an assertion, never touches the oracle. An honest FAILED after 3
 * cycles is the correct output.
 *
 * The counter is RESET (sidecar removed) the moment a milestone PASSES, and is
 * absent for a fresh milestone — so each milestone gets its own independent budget
 * and a re-run after a genuine fix starts clean.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** The structural bound: at most this many self-fix cycles after the initial pass. */
export const MAX_FIX_CYCLES = 3;

interface FixCyclesSidecar {
  milestoneId: string;
  /** Verify passes already run for this milestone while it has stayed FAILED. */
  attempts: number;
  /** The marker message from the most recent FAILED pass (for the bound marker). */
  lastFailures?: string;
  updatedAt: string;
}

/** The sidecar path the harness owns: <projectDir>/verify/.fixcycles-<mid>.json. */
function sidecarPath(projectDir: string, milestoneId: string): string {
  return join(projectDir, 'verify', `.fixcycles-${milestoneId}.json`);
}

/**
 * Read the persisted attempt count for this milestone (0 if no sidecar / unreadable
 * — a fresh milestone or a clean slate after a pass). A corrupt sidecar is treated
 * as a fresh start (0) rather than crashing the run.
 */
export function readAttempts(projectDir: string, milestoneId: string): {
  attempts: number;
  lastFailures?: string;
} {
  const p = sidecarPath(projectDir, milestoneId);
  if (!existsSync(p)) return { attempts: 0 };
  try {
    const data = JSON.parse(readFileSync(p, 'utf8')) as FixCyclesSidecar;
    const attempts = Number.isInteger(data.attempts) && data.attempts >= 0 ? data.attempts : 0;
    return { attempts, lastFailures: data.lastFailures };
  } catch {
    return { attempts: 0 };
  }
}

/**
 * Persist that a FAILED verify pass just ran: increment the attempt counter and
 * record the failures so the NEXT (refused) invocation can surface them honestly.
 */
export function recordFailedAttempt(
  projectDir: string,
  milestoneId: string,
  priorAttempts: number,
  lastFailures: string,
): void {
  const verifyDir = join(projectDir, 'verify');
  mkdirSync(verifyDir, { recursive: true });
  const sidecar: FixCyclesSidecar = {
    milestoneId,
    attempts: priorAttempts + 1,
    lastFailures,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(sidecarPath(projectDir, milestoneId), JSON.stringify(sidecar, null, 2) + '\n', 'utf8');
}

/**
 * Reset the budget for this milestone (remove the sidecar). Called when a milestone
 * PASSES — the bounded loop is over and a future re-run starts clean.
 */
export function resetAttempts(projectDir: string, milestoneId: string): void {
  const p = sidecarPath(projectDir, milestoneId);
  try {
    if (existsSync(p)) rmSync(p);
  } catch {
    /* best-effort reset; a stale sidecar would only RAISE the bound's strictness */
  }
}

/**
 * Is the self-fix bound exhausted at the START of this invocation? True once the
 * milestone has already run (1 initial + MAX_FIX_CYCLES) FAILED verify passes —
 * i.e. attempts > MAX_FIX_CYCLES. At that point the harness must REFUSE to boot.
 */
export function isBoundExhausted(attempts: number): boolean {
  return attempts > MAX_FIX_CYCLES;
}

/**
 * The fixCycles value to report for a pass that is about to RUN, given the attempts
 * already consumed. Clamped to 0..MAX_FIX_CYCLES (the report.schema range): the
 * initial pass is 0, the k-th self-fix pass is k.
 */
export function reportableFixCycles(attempts: number): number {
  return Math.min(Math.max(attempts, 0), MAX_FIX_CYCLES);
}
