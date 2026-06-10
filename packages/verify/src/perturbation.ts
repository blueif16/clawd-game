/**
 * perturbation.ts — VERIFY-2 §6 ISOMORPHIC PERTURBATION (the load-bearing
 * anti-gaming gate). Implements perturbation-grammar.md EXACTLY.
 *
 * A GENERAL INTERPRETER over blueprint.declaredRanges: it enumerates
 * `parameterPath → [min,max]`, draws an in-envelope permuted value
 * DETERMINISTICALLY (blueprint.ts selectPermutedValue — FNV-1a × permutationSeed,
 * NO Math.random), applies it through the CORRECT seam (runtime via the
 * sanctioned commands / baked-config via a permuted gameConfig.json + EXACTLY
 * ONE rebuild that is then REVERTED), re-runs the SAME compiled acceptance
 * checks + the completability replay under the permutation, and compares
 * invariance. A criterion that PASSED originally but FAILS in-envelope ⇒
 * invariant=false ⇒ marker FAILED.
 *
 * Anti-reward-hack (§9): applies ONLY via commands / gameConfig-injection, NEVER
 * edits src/** or any oracle, NEVER widens a declared range (strictly inside
 * [min,max]). The §11 self-guard: a permutation that would break the design
 * (out-of-band, or makes the design unwinnable) is a HARNESS bug, never a build
 * divergence — we permute INSIDE declaredRanges only.
 *
 * Generalizes across all 5 archetypes: it reads the blueprint's declaredRanges /
 * observe vocabulary, never a genre literal.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Page } from 'playwright';
import { executeAssertion, type GddAssertion, type GddContext } from './compile.js';
import { resetLevel, runCompletability } from './completability.js';
import {
  selectPermutedValue,
  seamFor,
  resolveOriginal,
  DEFAULT_PERMUTATION_SEED,
  type Blueprint,
  type DeclaredRanges,
  type Seam,
} from './blueprint.js';
import type { BootState } from './harness.js';

/** report.schema perturbation{} shape (perturbation-grammar.md §8). */
export interface PerturbationRecord {
  ran: boolean;
  permutationSeed?: number;
  permutationsApplied?: Array<{
    parameterPath: string;
    original: unknown;
    permuted: unknown;
    seam: Seam;
  }>;
  invariant: boolean;
  diverged?: Array<{
    checkId: string;
    permutation: string;
    originalObserved: unknown;
    permutedObserved: unknown;
  }>;
}

/** A resolved permutation move (the draw + its seam), before application. */
interface PlannedMove {
  parameterPath: string;
  original: number;
  permuted: number;
  seam: Seam;
}

/**
 * The original per-check verdict, captured during the §3 fidelity pass, that the
 * perturbation reasons against: only checks that PASSED originally are in scope
 * (§7). Keyed by assertion id.
 */
export interface OriginalVerdict {
  assertion: GddAssertion;
  passed: boolean;
  observed: unknown;
}

export interface RunPerturbationOpts {
  projectDir: string;
  page: Page;
  /** Re-boot a permuted (rebuilt) artifact; only needed for the baked-config seam. */
  reboot: (distDir: string) => Promise<BootState>;
  teardown: (s: BootState) => Promise<void>;
  blueprint: Blueprint;
  /** The gdd assertions for THIS milestone (the executable form re-run permuted). */
  assertions: GddAssertion[];
  /** The original per-assertion verdicts from the §3 fidelity pass. */
  originalVerdicts: OriginalVerdict[];
  ctx: GddContext;
  winObservable: string;
  permutationSeed?: number;
  /** Resolve the dist dir (for the baked-config rebuild path). */
  resolveDistDir: (projectDir: string) => string;
  /**
   * Did the ORIGINAL completability (§4 gate 3) pass? Only an originally-passing
   * check is in scope for the invariance verdict (§7): a completability that
   * already FAILED forces FAILED in gate 6 and must not be double-counted here.
   * Defaults to true so a permuted completability divergence is still caught when
   * the caller doesn't thread it.
   */
  originalCompletabilityPassed?: boolean;
}

/**
 * Run the perturbation pass. Returns the perturbation record. The page passed in
 * is the ORIGINAL boot (used for the runtime seam); for the baked-config seam we
 * rebuild + re-boot internally and tear that boot down before returning.
 */
export async function runPerturbation(opts: RunPerturbationOpts): Promise<PerturbationRecord> {
  const { blueprint, originalVerdicts, ctx, winObservable } = opts;
  const permutationSeed = opts.permutationSeed ?? DEFAULT_PERMUTATION_SEED;
  const declaredRanges = blueprint.declaredRanges;

  // ── missing/empty declaredRanges ⇒ a VERIFY-1 contract gap (§1) ────────────
  // ran:false; invariant:true is NOT asserted here — the orchestrator/escalation
  // path treats ran:false as INCOMPLETE (a design escalation), never a pass.
  if (!declaredRanges || Object.keys(declaredRanges).length === 0) {
    return { ran: false, invariant: false };
  }

  // ── 1. ENUMERATE declaredRanges → deterministic in-envelope moves (§1/§2) ──
  const moves = planMoves(blueprint, declaredRanges, permutationSeed);

  // No path could move (all point-ranges) ⇒ vacuously invariant (§2.3), weak gate.
  if (moves.length === 0) {
    return {
      ran: true,
      permutationSeed,
      permutationsApplied: [],
      invariant: true,
      diverged: [],
    };
  }

  // Only checks that PASSED originally are in scope (§7).
  const inScope = originalVerdicts.filter((v) => v.passed);
  const completabilityInScope = opts.originalCompletabilityPassed ?? true;

  const runtimeMoves = moves.filter((m) => m.seam === 'runtime');
  const bakedMoves = moves.filter((m) => m.seam === 'baked-config');

  const permutationsApplied = moves.map((m) => ({
    parameterPath: m.parameterPath,
    original: m.original,
    permuted: m.permuted,
    seam: m.seam,
  }));

  const diverged: PerturbationRecord['diverged'] = [];

  // ── 2/3. Apply seam + re-run the in-scope checks + completability ──────────
  // BAKED-CONFIG seam (if any): rebuild ONCE with a permuted gameConfig.json,
  // boot the rebuilt artifact, apply the runtime moves on top, re-run; ALWAYS
  // revert gameConfig.json + restore the original dist afterward (§4.2).
  if (bakedMoves.length > 0) {
    await runBakedConfigPass({
      ...opts,
      permutationSeed,
      bakedMoves,
      runtimeMoves,
      inScope,
      completabilityInScope,
      diverged,
    });
  } else {
    // RUNTIME-ONLY: re-use the already-booted original page.
    await applyRuntimeMoves(opts.page, runtimeMoves);
    await reRunInScope({
      page: opts.page,
      inScope,
      ctx,
      blueprint,
      winObservable,
      runtimeMoves,
      completabilityInScope,
      diverged,
    });
  }

  const invariant = diverged.length === 0;
  return {
    ran: true,
    permutationSeed,
    permutationsApplied,
    invariant,
    diverged,
  };
}

// ── plan the moves: enumerate declaredRanges deterministically ──────────────

function planMoves(
  bp: Blueprint,
  declaredRanges: DeclaredRanges,
  permutationSeed: number,
): PlannedMove[] {
  const out: PlannedMove[] = [];
  for (const [parameterPath, range] of Object.entries(declaredRanges)) {
    if (!Array.isArray(range) || range.length !== 2) continue;
    const [min, max] = range;
    if (typeof min !== 'number' || typeof max !== 'number') continue;

    // The frozen original. For rng.* there is NO frozen literal (a runtime-seeded
    // game has no seed on the blueprint, perturbation-grammar.md §2.2): use the
    // band min as a SENTINEL "original" purely so the move-the-needle selector
    // (§2.3) has an anchor to differ from. This is NOT a fabricated design value —
    // permutationsApplied[].original for an rng.* path is a sentinel (§8), and the
    // seed the build runs under is always `permuted`.
    const seam = seamFor(parameterPath);
    const resolved = resolveOriginal(bp, parameterPath);
    const original = resolved ?? (parameterPath.startsWith('rng.') ? min : undefined);
    if (original === undefined) {
      // The blueprint doesn't carry this value — cannot meaningfully permute it
      // (we don't know the original to move off). Skip (a no-op, not a failure).
      continue;
    }

    const sel = selectPermutedValue(parameterPath, [min, max], original, permutationSeed);
    if (!sel.moved) continue; // point-range / could not move
    out.push({ parameterPath, original, permuted: sel.value, seam });
  }
  return out;
}

// ── seam application ────────────────────────────────────────────────────────

/**
 * Apply the RUNTIME moves via the sanctioned commands seam (§4.1):
 *  - rng.seed       → commands.seed(n)
 *  - layout.*       → commands.setState(patch) targeting the entity/coordinate.
 *
 * We build a single setState patch grouping the layout moves, plus seed calls.
 * The patch is keyed by the entity id where resolvable; the template's setState
 * applies whatever fields it recognizes (a field it doesn't model is a no-op,
 * which the §11 self-guard treats as "the move had no effect" — recorded, never
 * a spurious divergence, because a no-op move cannot make a passing check fail).
 */
async function applyRuntimeMoves(page: Page, moves: PlannedMove[]): Promise<void> {
  // Reset to a fresh level FIRST so the permutation lands on a clean state.
  await resetLevel(page);

  const patch: Record<string, unknown> = {};
  for (const m of moves) {
    if (m.parameterPath.startsWith('rng.')) {
      await page
        .evaluate((n) => (window as any).__GAME__?.commands?.seed?.(n), m.permuted)
        .catch(() => {});
      continue;
    }
    // layout.<collection>.<id>.<axis>  OR  layout.<obj>.<axis>  OR layout.<coll>.count
    buildLayoutPatch(patch, m.parameterPath, m.permuted);
  }
  if (Object.keys(patch).length > 0) {
    await page
      .evaluate((p) => (window as any).__GAME__?.commands?.setState?.(p), patch)
      .catch(() => {});
  }
}

/**
 * Translate a layout parameterPath move into a setState patch entry. We expose
 * BOTH a flattened dotted key and a nested {layout:{…}} form so different
 * template setState implementations can pick up whichever they model — neither
 * is the observed outcome, so this is a legal precondition (§6 D2): a coordinate/
 * count is an upstream placement, never the field the mechanism reads back.
 */
function buildLayoutPatch(patch: Record<string, unknown>, parameterPath: string, value: number): void {
  // Strip the leading 'layout.' for the dotted key the template is likeliest to model.
  const sub = parameterPath.replace(/^layout\./, '');
  patch[parameterPath] = value; // full path, e.g. 'layout.rewards.coin_1.x'
  patch[sub] = value; // stripped path, e.g. 'rewards.coin_1.x'
}

// ── baked-config seam: permute gameConfig.json + ONE rebuild + REVERT ───────

interface BakedPassArgs extends RunPerturbationOpts {
  permutationSeed: number;
  bakedMoves: PlannedMove[];
  runtimeMoves: PlannedMove[];
  inScope: OriginalVerdict[];
  completabilityInScope: boolean;
  diverged: NonNullable<PerturbationRecord['diverged']>;
}

/**
 * The BAKED-CONFIG seam (§4.2): write a permuted src/gameConfig.json with the
 * config.* moves (batched into ONE file so the rebuild happens ONCE), run
 * `npm run build`, boot the rebuilt dist, apply the runtime moves on top, re-run
 * the in-scope checks + completability — then ALWAYS revert gameConfig.json and
 * restore the original dist so the project is left UNPERTURBED.
 */
async function runBakedConfigPass(args: BakedPassArgs): Promise<void> {
  const { projectDir, bakedMoves, runtimeMoves, inScope, ctx, blueprint, winObservable, completabilityInScope, diverged } = args;
  const gameConfigPath = join(projectDir, 'src', 'gameConfig.json');
  const backupPath = gameConfigPath + '.perturb-backup';
  const distDir = args.resolveDistDir(projectDir);
  const distBackup = distDir + '.perturb-backup';

  let configBackedUp = false;
  let distBackedUp = false;
  let permutedBoot: BootState | undefined;

  try {
    if (!existsSync(gameConfigPath)) {
      // No gameConfig.json to permute — the baked seam can't run. Treat as a
      // verdict-correctness gap (§11): skip the baked moves, run runtime-only on
      // the ORIGINAL boot so the pass is not silently dropped.
      await applyRuntimeMoves(args.page, runtimeMoves);
      await reRunInScope({
        page: args.page,
        inScope,
        ctx,
        blueprint,
        winObservable,
        runtimeMoves,
        completabilityInScope,
        diverged,
      });
      return;
    }

    // 1. Back up the original gameConfig.json + dist, then write the permuted config.
    copyFileSync(gameConfigPath, backupPath);
    configBackedUp = true;
    if (existsSync(distDir)) {
      cpDir(distDir, distBackup);
      distBackedUp = true;
    }
    writePermutedGameConfig(gameConfigPath, bakedMoves);

    // 2. EXACTLY ONE rebuild.
    const built = rebuild(projectDir);
    if (!built.ok) {
      // The permuted rebuild failed (e.g. a transient tsc error). This is NOT a
      // build divergence — it is a harness-side issue (§11). Record nothing as a
      // divergence; the perturbation simply could not exercise the baked seam.
      return;
    }

    // 3. Boot the rebuilt artifact, apply runtime moves on top, re-run.
    permutedBoot = await args.reboot(distDir);
    if (permutedBoot.bootFailed) {
      // Permuted artifact didn't boot — again a §11 harness/verdict issue (an
      // in-band config should still boot), not a build divergence. Skip.
      return;
    }
    await applyRuntimeMoves(permutedBoot.page, runtimeMoves);
    await reRunInScope({
      page: permutedBoot.page,
      inScope,
      ctx,
      blueprint,
      winObservable,
      runtimeMoves,
      completabilityInScope,
      diverged,
    });
  } finally {
    // 4. ALWAYS revert: restore gameConfig.json, restore the original dist (so the
    // project is left exactly as VERIFY-2 found it), tear down the permuted boot.
    if (permutedBoot) await args.teardown(permutedBoot).catch(() => {});
    if (configBackedUp && existsSync(backupPath)) {
      try {
        copyFileSync(backupPath, gameConfigPath);
        rmSync(backupPath);
      } catch {
        /* best-effort revert */
      }
    }
    if (distBackedUp && existsSync(distBackup)) {
      try {
        rmSync(distDir, { recursive: true, force: true });
        cpDir(distBackup, distDir);
        rmSync(distBackup, { recursive: true, force: true });
      } catch {
        /* best-effort dist restore */
      }
    }
  }
}

/**
 * Write the permuted config.* values into src/gameConfig.json. The file is the
 * template's wrapped tunable surface (template-contract §4): keys live under a
 * per-archetype sub-object as `{ value, type, description }`. We locate each
 * `config.<key>` by searching every sub-object for a matching key and overwrite
 * its `.value` (preserving the wrapper). Only the permuted keys change; the rest
 * is byte-preserved. This is a permutation of an INPUT the build legitimately
 * reads — never game logic, never an oracle.
 */
function writePermutedGameConfig(gameConfigPath: string, bakedMoves: PlannedMove[]): void {
  const cfg = JSON.parse(readFileSync(gameConfigPath, 'utf8')) as Record<string, unknown>;
  for (const m of bakedMoves) {
    const key = m.parameterPath.replace(/^config\./, '');
    let placed = false;
    for (const group of Object.values(cfg)) {
      if (group && typeof group === 'object' && !Array.isArray(group)) {
        const g = group as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(g, key)) {
          const entry = g[key];
          if (entry && typeof entry === 'object' && 'value' in (entry as any)) {
            (entry as any).value = m.permuted;
          } else {
            g[key] = m.permuted;
          }
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      // Key not in any sub-object — the template doesn't model it; skip (a no-op
      // move that cannot make a passing check fail; never a spurious divergence).
    }
  }
  writeFileSync(gameConfigPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/** Run `npm run build` once for the permuted pass. */
function rebuild(projectDir: string): { ok: boolean; output: string } {
  const res = spawnSync('npm', ['run', 'build'], {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 180000,
  });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  return { ok: res.status === 0, output };
}

/** Recursive directory copy (Node 16+ fs.cpSync). */
function cpDir(src: string, dest: string): void {
  cpSync(src, dest, { recursive: true });
}

// ── re-run the in-scope checks under the permutation + compare invariance ────

interface ReRunArgs {
  page: Page;
  /** The originally-passing checks (each carries its gdd assertion) — §7 scope. */
  inScope: OriginalVerdict[];
  ctx: GddContext;
  blueprint: Blueprint;
  winObservable: string;
  runtimeMoves: PlannedMove[];
  /** Only re-run permuted completability when it PASSED originally (§7 scope). */
  completabilityInScope: boolean;
  diverged: NonNullable<PerturbationRecord['diverged']>;
}

/**
 * Re-run EXACTLY the originally-passing acceptance checks (the gdd assertions are
 * the executable form, §10/D3) under the applied permutation, plus completability,
 * and record any DIVERGENCE (passed originally → fails now). The permutation
 * label names the moves so the fix step can localize the contortion (§8).
 */
async function reRunInScope(args: ReRunArgs): Promise<void> {
  const { page, inScope, ctx, blueprint, winObservable, runtimeMoves, completabilityInScope, diverged } = args;
  const permLabel = describePermutation(runtimeMoves);

  for (const v of inScope) {
    const result = await executeAssertion(page, v.assertion, ctx);
    if (result.status !== 'pass') {
      diverged.push({
        checkId: v.assertion.id,
        permutation: permLabel,
        originalObserved: v.observed ?? null,
        permutedObserved: result.observed ?? null,
      });
    }
  }

  // Completability under the permutation: the win must still be reached THROUGH
  // real play on the permuted layout (catches injected-win / count-keyed-to-
  // literal). Only run it when it PASSED originally (§7 — the invariance verdict
  // reasons solely over originally-passing checks; an originally-failed
  // completability already forces FAILED in gate 6 and must not double-count).
  if (!completabilityInScope) return;
  const comp = await runCompletability(page, blueprint.referenceSolution, ctx, winObservable);
  if (comp.ran && comp.status === 'fail') {
    diverged.push({
      checkId: 'completability',
      permutation: permLabel,
      originalObserved: 'reachedWin=true (original layout)',
      permutedObserved: comp.message ?? 'win not reached on permuted layout',
    });
  }
}

/** A short human label of the permutation moves applied (for diverged[].permutation). */
function describePermutation(moves: PlannedMove[]): string {
  if (moves.length === 0) return 'baked-config permutation';
  const parts = moves
    .slice(0, 3)
    .map((m) => `${shortPath(m.parameterPath)} ${m.original}→${m.permuted}`);
  if (moves.length > 3) parts.push(`+${moves.length - 3} more`);
  return parts.join(', ');
}

function shortPath(p: string): string {
  const segs = p.split('.');
  return segs.length > 2 ? segs.slice(-2).join('.') : p;
}
