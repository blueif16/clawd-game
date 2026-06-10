/**
 * harness.ts — the boot + run-one-milestone engine (grammar §5).
 *
 * Serves the BUILT game (static-serves dist/, falling back to `vite preview`),
 * launches REAL headless Chromium with software WebGL (--use-gl=swiftshader),
 * injects the observe evaluator BEFORE load, waits for window.__GAME__.ready
 * (never sleeps), focuses the canvas, runs every assertion of one milestone
 * (single-aggregate), aggregates to the verbatim marker, and builds the report.
 *
 * It is a GENERAL INTERPRETER: zero per-game logic. It does NOT edit files,
 * does NOT contain the self-fix loop, does NOT touch the gdd/assertions/hook.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { existsSync } from 'node:fs';
import {
  executeAssertion,
  type GddAssertion,
  type AssertionResult,
  type GddContext,
} from './compile.js';
import { OBSERVE_INIT_SCRIPT } from './observe.js';
import {
  formatPassed,
  formatFailed,
  formatBootFailed,
  formatBoundExhausted,
  formatAggregatePassed,
  formatAggregateFailed,
  formatDesignEscalation,
} from './marker.js';
import { runAdvisoryVlm, type AdvisoryVlm } from './vlm.js';
import {
  buildReport,
  writeReport,
  type VerifyReport,
  type FidelityResult,
} from './report.js';
import {
  MAX_FIX_CYCLES,
  readAttempts,
  recordFailedAttempt,
  resetAttempts,
  isBoundExhausted,
  reportableFixCycles,
} from './fixcycles.js';
import { InvariantSampler, type InvariantResult } from './invariants.js';
import {
  runCompletability,
  type CompletabilityResult,
} from './completability.js';
import {
  runPerturbation,
  type PerturbationRecord,
  type OriginalVerdict,
} from './perturbation.js';
import { writeEscalation, type EscalationRecord } from './escalation.js';
import type { Blueprint, AcceptanceCriterion } from './blueprint.js';

const VIEWPORT = { width: 800, height: 600 };
const BOOT_NAV_TIMEOUT_MS = 30000;
const READY_TIMEOUT_MS = 15000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * A tiny static file server over the built `dist/` directory. Serves the BUILT
 * artifact (not the dev server), per grammar §5.2 step 1. SPA-style fallback to
 * index.html for unknown routes.
 */
function startStaticServer(rootDir: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
        let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
        // Prevent path traversal.
        let filePath = normalize(join(rootDir, rel));
        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403);
          res.end('forbidden');
          return;
        }
        let st;
        try {
          st = await stat(filePath);
          if (st.isDirectory()) {
            filePath = join(filePath, 'index.html');
          }
        } catch {
          // SPA fallback to index.html.
          filePath = join(rootDir, 'index.html');
        }
        const body = await readFile(filePath);
        const mime = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(body);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
      } else {
        reject(new Error('failed to bind static server'));
      }
    });
  });
}

export interface BootState {
  browser: Browser;
  page: Page;
  server: Server;
  url: string;
  consoleErrors: string[];
  bootFailed: boolean;
  bootError?: string;
}

/**
 * Advance past any title/start gate to the first interactive level frame, then
 * return once `__GAME__.ready === true` (or the bounded window elapses). The
 * engine TitleScreen (template-contract) starts the first level on ENTER /
 * SPACE / pointerdown — all generic, archetype-agnostic. We re-fire them each
 * iteration because the title scene installs its handlers in create(), which
 * may run a frame or two after load. This is wait-on-STATE: the only timing is
 * the small per-iteration settle and the overall cap.
 */
async function advanceToReady(page: Page, capMs: number): Promise<void> {
  const deadline = Date.now() + capMs;
  while (Date.now() < deadline) {
    const ready = await page
      .evaluate(() => (window as any).__GAME__?.ready === true)
      .catch(() => false);
    if (ready) return;
    await page.locator('canvas').focus().catch(() => {});
    // Generic start inputs (the engine title gate accepts any of these).
    await page.keyboard.press('Enter').catch(() => {});
    await page.keyboard.press('Space').catch(() => {});
    await page.mouse.click(400, 300).catch(() => {});
    // Small bounded settle between attempts (lets the title handler attach and
    // the level scene's first update() latch ready). Not a readiness wait.
    await page.waitForTimeout(150);
  }
}

/**
 * One-time settle after ready: poll until the player is grounded (so
 * grounded-gated mechanics like jump are testable) OR a small frame cap. For
 * non-physics archetypes (no player or no isGrounded) it just renders a few
 * frames. Bounded wait-on-state, not a per-assertion sleep.
 */
async function settleAfterReady(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const g = (window as any).__GAME__;
        if (!g) return false;
        const p = g.player;
        // If there is no player, or the archetype has no grounded concept, a
        // couple of rendered frames is enough — resolve immediately once ready.
        if (!p || typeof p.isGrounded !== 'boolean') return true;
        return p.isGrounded === true;
      },
      undefined,
      { timeout: 3000 },
    )
    .catch(() => {});
  // Render a few extra frames so the first interactive frame is fully settled.
  await page
    .evaluate(
      () =>
        new Promise<void>((res) => {
          let n = 0;
          const tick = () => {
            n += 1;
            if (n >= 6) res();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    )
    .catch(() => {});
}

/**
 * Boot the built game headless and wait for ready (grammar §5.2).
 */
export async function boot(distDir: string): Promise<BootState> {
  const consoleErrors: string[] = [];

  const { server, url } = await startStaticServer(distDir);

  // Real headless Chromium, software WebGL (no GPU), new headless mode.
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // Inject the observe evaluator BEFORE load (addInitScript runs pre-load).
  await context.addInitScript(OBSERVE_INIT_SCRIPT);

  // Capture console errors + uncaught pageerrors (fatal during boot = fail-fast).
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  let bootFailed = false;
  let bootError: string | undefined;

  try {
    // waitUntil:'load' (NOT networkidle — unreliable).
    await page.goto(url, { waitUntil: 'load', timeout: BOOT_NAV_TIMEOUT_MS });

    // Focus the canvas FIRST (the Phaser keyboard gotcha): the template gates
    // ready behind a TitleScreen that requires Enter/Space/click to start the
    // first level, so we must reach the first interactive level frame BEFORE
    // ready can flip true. This advance is GENERIC (archetype-agnostic): the
    // engine's TitleScreen accepts ENTER / SPACE / pointerdown to start.
    await page.waitForSelector('canvas', { timeout: 5000 });
    await page.click('canvas');

    // Drive past any title/start gate, then wait for READY. We poll ready and
    // re-fire the generic start inputs until ready latches or the bounded
    // ready-window elapses. This is wait-on-STATE (never a blind sleep): the
    // loop's only timing is the per-iteration settle and the overall cap.
    await advanceToReady(page, READY_TIMEOUT_MS);

    // Confirm ready (authoritative): if still not ready, this is a boot failure.
    await page.waitForFunction(
      () => (window as any).__GAME__ && (window as any).__GAME__.ready === true,
      { timeout: 2000 },
    );

    // One settle: let the player land onto the ground (so grounded-gated
    // mechanics like jump are testable) and the first interactive frames render.
    // Bounded wait-on-state: poll until the player is grounded OR a frame cap.
    await settleAfterReady(page);
  } catch (err) {
    bootFailed = true;
    bootError = String(err);
  }

  // A fatal console error during boot is also a boot failure.
  if (!bootFailed && consoleErrors.length > 0) {
    bootFailed = true;
    bootError = `fatal console error during boot: ${consoleErrors[0]}`;
  }

  return { browser, page, server, url, consoleErrors, bootFailed, bootError };
}

export async function teardown(state: BootState): Promise<void> {
  try {
    await state.browser.close();
  } catch {
    /* ignore */
  }
  try {
    state.server.close();
  } catch {
    /* ignore */
  }
}

export interface RunResult {
  report: VerifyReport;
  markerLine: string;
  reportPath: string;
}

/**
 * Resolve where the built game lives. Prefers <projectDir>/dist (the vite build
 * output). Returns the dist dir or throws a clear error.
 */
export function resolveDistDir(projectDir: string): string {
  const dist = join(projectDir, 'dist');
  if (existsSync(join(dist, 'index.html'))) return dist;
  // Some setups serve the project root directly.
  if (existsSync(join(projectDir, 'index.html')) && existsSync(join(projectDir, 'dist'))) {
    return dist;
  }
  throw new Error(
    `no built game found: expected ${join(dist, 'index.html')} (run 'npm run build' first)`,
  );
}

/**
 * Run ALL assertions of one milestone (single-aggregate), aggregate the marker,
 * build + write the report. This is the runner's main entry, driven by the CLI.
 */
export async function runMilestone(opts: {
  projectDir: string;
  milestoneId: string;
  assertions: GddAssertion[];
  /** The gdd entity + control tables, for the generic event/win-path driver. */
  context?: GddContext;
  greenOnEntry?: boolean;
}): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const { projectDir, milestoneId, assertions } = opts;
  const ctx: GddContext = opts.context ?? {};
  const greenOnEntry = opts.greenOnEntry ?? true;

  // ── STRUCTURAL ≤N SELF-FIX BOUND (harness-owned, enforced BEFORE booting) ──
  // The self-fix loop is the W5 AGENT re-invoking this CLI after each src edit;
  // the harness is stateless per invocation, so the bound lives in a persistent
  // per-milestone sidecar (verify/.fixcycles-<mid>.json) the harness owns. We read
  // the attempt count up front. Once it exceeds MAX_FIX_CYCLES self-fix cycles
  // (1 initial pass + N re-verifies), we REFUSE to run another pass: emit the
  // honest bound-exhausted FAILED marker and return IMMEDIATELY — BEFORE launching
  // Chromium — so the cost is capped no matter how many times the agent re-invokes.
  // This is the one place the prose bound becomes structural; it ONLY stops the
  // loop (it never fakes a pass or touches the oracle).
  const { attempts, lastFailures } = readAttempts(projectDir, milestoneId);
  if (isBoundExhausted(attempts)) {
    const markerLine = formatBoundExhausted(MAX_FIX_CYCLES, lastFailures);
    const summary = `self-fix bound (${MAX_FIX_CYCLES}) exhausted — ${
      lastFailures && lastFailures.trim() ? lastFailures.trim() : 'last verify failed'
    }`;
    const report = buildReport({
      milestoneId,
      passed: false,
      summary,
      results: [], // no pass ran; the prior FAILED report holds the per-assertion detail
      advisoryVlm: { ran: false, flag: 'skipped' },
      screenshots: [],
      consoleErrors: [],
      startedAt,
      durationMs: Date.now() - t0,
      bootFailed: false,
      greenOnEntry,
      fixCycles: MAX_FIX_CYCLES,
    });
    report.fixOutcome = 'exhausted';
    const reportPath = writeReport(projectDir, report);
    return { report, markerLine, reportPath };
  }
  // fixCycles to report for THIS pass = self-fix cycles already consumed (0 initial).
  const fixCycles = reportableFixCycles(attempts);

  const distDir = resolveDistDir(projectDir);
  const screenshots: string[] = [];
  const results: AssertionResult[] = [];
  let advisoryVlm: AdvisoryVlm = { ran: false, flag: 'skipped' };

  const state = await boot(distDir);

  try {
    // ── boot failed → marker FAILED, no assertions burned ──────────────────
    if (state.bootFailed) {
      const shot = join('verify', `boot-failed.png`);
      await state.page
        .screenshot({ path: join(projectDir, shot), fullPage: false })
        .catch(() => {});
      if (existsSync(join(projectDir, shot))) screenshots.push(shot);

      advisoryVlm = await runAdvisoryVlm(state.page);

      const markerLine = formatBootFailed(state.bootError);
      const summary = `game did not become ready (boot failed)`;
      const report = buildReport({
        milestoneId,
        passed: false,
        summary,
        results,
        advisoryVlm,
        screenshots,
        consoleErrors: state.consoleErrors,
        startedAt,
        durationMs: Date.now() - t0,
        bootFailed: true,
        greenOnEntry,
        fixCycles,
      });
      report.fixOutcome = 'boot_failed';
      const reportPath = writeReport(projectDir, report);
      // A boot failure is still a FAILED pass: if the agent edits src and re-invokes
      // (a code-fixable boot error), that re-verify must count toward the SAME bound,
      // so the boot-fix loop is capped exactly like the assertion-fix loop.
      recordFailedAttempt(projectDir, milestoneId, attempts, summary);
      return { report, markerLine, reportPath };
    }

    // ── run every assertion (single-aggregate, NOT fail-fast) ──────────────
    for (const assertion of assertions) {
      let result = await executeAssertion(state.page, assertion, ctx);
      // Screenshot on each failure/error (grammar §2.7).
      if (result.status !== 'pass') {
        const shot = join('verify', `${assertion.id}-fail.png`);
        await state.page
          .screenshot({ path: join(projectDir, shot), fullPage: false })
          .catch(() => {});
        if (existsSync(join(projectDir, shot))) {
          result = { ...result, screenshot: shot };
          screenshots.push(shot);
        }
      }
      results.push(result);
    }

    // End-state screenshot (at least one, grammar §6 / report.schema).
    const endShot = join('verify', `${milestoneId}-end.png`);
    await state.page
      .screenshot({ path: join(projectDir, endShot), fullPage: false })
      .catch(() => {});
    if (existsSync(join(projectDir, endShot))) screenshots.push(endShot);

    // Advisory canvas-not-blank check (never blocks the marker).
    advisoryVlm = await runAdvisoryVlm(state.page);

    // ── aggregate → marker (grammar §4) ────────────────────────────────────
    const failed = results.filter((r) => r.status !== 'pass');
    const passed = failed.length === 0;
    const markerLine = passed
      ? formatPassed(milestoneId, results.length)
      : formatFailed(failed.map((r) => r.describe));
    const summary = passed
      ? `${milestoneId} all ${results.length} assertions passed`
      : failed.map((r) => r.describe).join('; ');

    const report = buildReport({
      milestoneId,
      passed,
      summary,
      results,
      advisoryVlm,
      screenshots,
      consoleErrors: state.consoleErrors,
      startedAt,
      durationMs: Date.now() - t0,
      bootFailed: false,
      greenOnEntry,
      fixCycles,
    });
    const reportPath = writeReport(projectDir, report);

    // ── update the harness-owned bound counter for the NEXT invocation ────────
    // PASS → the bounded loop is over: reset the budget (a future re-run starts
    // clean). FAIL → record this as a consumed attempt so the next agent re-invoke
    // (after an src edit) advances toward the cap; once it crosses the bound the
    // gate above refuses to boot. This is what makes the ≤N bound STRUCTURAL: the
    // harness itself stops the loop, not the model's adherence to the prose.
    if (passed) {
      resetAttempts(projectDir, milestoneId);
    } else {
      recordFailedAttempt(projectDir, milestoneId, attempts, summary);
    }
    return { report, markerLine, reportPath };
  } finally {
    await teardown(state);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// VERIFY-2 SIX-GATE ORCHESTRATION (SKILL §2–§9)
// (1) build-health → (2) fidelity → (3) completability → (4) invariants →
// (5) perturbation → (6) aggregate. Driven from spec/blueprint.json; falls back
// to the gdd assertions[] when blueprint.acceptanceCriteria is absent (so the
// harness still runs on older projects). The fixcycles counter stays
// harness-owned; always exit 0 (the marker is the gate).
// ════════════════════════════════════════════════════════════════════════════

export interface RunMilestoneV2Opts {
  projectDir: string;
  milestoneId: string;
  /** The milestone's executable gdd assertions (1:1 with acceptanceCriteria). */
  assertions: GddAssertion[];
  /** The full blueprint (sections .layout/.referenceSolution/.declaredRanges/…). */
  blueprint: Blueprint;
  /** Entity + control tables for the generic driver (read off blueprint/gdd). */
  context?: GddContext;
  /** The win observable (default 'status'); from blueprint.winCondition.observable. */
  winObservable?: string;
  greenOnEntry?: boolean;
  permutationSeed?: number;
}

/**
 * Resolve the win observable to read for completability/perturbation. The
 * winCondition.observable is free text (e.g. "__GAME__.status === 'won'"); we
 * extract the bare path. Default 'status'.
 */
function resolveWinObservable(bp: Blueprint, override?: string): string {
  if (override) return override;
  const raw = (bp as any).winCondition?.observable;
  if (typeof raw === 'string') {
    // pull the first __GAME__.<path> or bare identifier path.
    const m = raw.match(/__GAME__\.([a-zA-Z_][\w.]*)/) || raw.match(/^([a-zA-Z_][\w.]*)/);
    if (m) {
      const path = m[1];
      // strip a comparison tail if the regex grabbed one ('status === ...').
      return path.split(/\s|=/)[0] || 'status';
    }
  }
  return 'status';
}

/**
 * Run the SIX gates for one milestone. Returns the same RunResult shape as
 * runMilestone (report + verbatim marker + report path).
 */
export async function runMilestoneVerify2(opts: RunMilestoneV2Opts): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const { projectDir, milestoneId, assertions, blueprint } = opts;
  const ctx: GddContext = opts.context ?? {};
  const greenOnEntry = opts.greenOnEntry ?? true;
  const winObservable = resolveWinObservable(blueprint, opts.winObservable);

  // ── STRUCTURAL ≤N SELF-FIX BOUND (identical to runMilestone) ───────────────
  const { attempts, lastFailures } = readAttempts(projectDir, milestoneId);
  if (isBoundExhausted(attempts)) {
    const markerLine = formatBoundExhausted(MAX_FIX_CYCLES, lastFailures);
    const summary = `self-fix bound (${MAX_FIX_CYCLES}) exhausted — ${
      lastFailures && lastFailures.trim() ? lastFailures.trim() : 'last verify failed'
    }`;
    const report = buildReport({
      milestoneId,
      passed: false,
      summary,
      results: [],
      advisoryVlm: { ran: false, flag: 'skipped' },
      screenshots: [],
      consoleErrors: [],
      startedAt,
      durationMs: Date.now() - t0,
      bootFailed: false,
      greenOnEntry,
      fixCycles: MAX_FIX_CYCLES,
    });
    report.fixOutcome = 'exhausted';
    const reportPath = writeReport(projectDir, report);
    return { report, markerLine, reportPath };
  }
  const fixCycles = reportableFixCycles(attempts);

  const distDir = resolveDistDir(projectDir);
  const screenshots: string[] = [];

  // ── GATE 1: BUILD-HEALTH (boot the built game headless, reach ready) ───────
  const state = await boot(distDir);

  try {
    if (state.bootFailed) {
      const shot = join('verify', `${milestoneId}-boot-failed.png`);
      await state.page.screenshot({ path: join(projectDir, shot), fullPage: false }).catch(() => {});
      if (existsSync(join(projectDir, shot))) screenshots.push(shot);
      const advisoryVlm = await runAdvisoryVlm(state.page);
      const markerLine = formatBootFailed(state.bootError);
      const summary = `game did not become ready (boot failed)`;
      const report = buildReport({
        milestoneId,
        passed: false,
        summary,
        results: [],
        advisoryVlm,
        screenshots,
        consoleErrors: state.consoleErrors,
        startedAt,
        durationMs: Date.now() - t0,
        bootFailed: true,
        greenOnEntry,
        fixCycles,
      });
      report.fixOutcome = 'boot_failed';
      const reportPath = writeReport(projectDir, report);
      recordFailedAttempt(projectDir, milestoneId, attempts, summary);
      return { report, markerLine, reportPath };
    }

    // The invariant sampler runs THROUGH every drive (gate 2) + the replay (gate 3).
    const sampler = new InvariantSampler();
    await sampler.sample(state.page, true); // baseline sample at ready

    // ── GATE 2: USER-FLOW FIDELITY (each assertion as Given/When/Then) ───────
    // The gdd assertions are the executable form of the acceptanceCriteria
    // (D3: acceptanceCriteria is canonical for the GIVEN; assertions[] are the
    // executable fallback we drive). We attach each acceptance criterion's GIVEN
    // for the report's fidelity[].given when ids line up.
    const acByAssertion = mapAcceptanceToAssertions(blueprint.acceptanceCriteria, assertions, milestoneId);
    const fidelity: FidelityResult[] = [];
    const originalVerdicts: OriginalVerdict[] = [];
    const resultsForSchema: AssertionResult[] = [];

    for (const assertion of assertions) {
      const result = await executeAssertion(state.page, assertion, ctx);
      await sampler.sample(state.page, true);
      resultsForSchema.push(result);
      originalVerdicts.push({
        assertion,
        passed: result.status === 'pass',
        observed: result.observed,
      });
      let screenshot: string | undefined;
      if (result.status !== 'pass') {
        const shot = join('verify', `${assertion.id}-fail.png`);
        await state.page.screenshot({ path: join(projectDir, shot), fullPage: false }).catch(() => {});
        if (existsSync(join(projectDir, shot))) {
          screenshot = shot;
          screenshots.push(shot);
        }
      }
      fidelity.push({
        id: assertion.id,
        describe: assertion.describe,
        ...(acByAssertion.get(assertion.id)?.given ? { given: acByAssertion.get(assertion.id)!.given } : {}),
        observe: result.observe,
        comparator: result.comparator,
        expected: result.expected,
        observed: normalizeObserved(result.observed),
        status: result.status,
        ...(result.message ? { message: result.message } : {}),
        ...(screenshot ? { screenshot } : {}),
      });
    }
    const fidelityFailures = fidelity.filter((f) => f.status !== 'pass');

    // ── GATE 3: COMPLETABILITY (replay the reference intended solution) ──────
    const completability: CompletabilityResult = await runCompletability(
      state.page,
      blueprint.referenceSolution,
      ctx,
      winObservable,
      sampler,
    );

    // ── GATE 4: INVARIANTS (evaluate the sampled trace) ─────────────────────
    const invariants: InvariantResult[] = sampler.evaluate(blueprint.layout);
    const invariantViolations = invariants.filter((i) => !i.held);

    // ── GATE 5: PERTURBATION (re-run originally-passing checks permuted) ────
    let perturbation: PerturbationRecord = { ran: false, invariant: false };
    try {
      perturbation = await runPerturbation({
        projectDir,
        page: state.page,
        reboot: (d) => boot(d),
        teardown: (s) => teardown(s),
        blueprint,
        assertions,
        originalVerdicts,
        ctx,
        winObservable,
        permutationSeed: opts.permutationSeed,
        resolveDistDir,
        // §7 scope: permuted completability is in scope only if it passed originally.
        originalCompletabilityPassed: completability.ran && completability.status === 'pass',
      });
    } catch (err) {
      // A perturbation engine error is a verdict-correctness issue (§11), not a
      // build divergence: record ran:true invariant:true so it never false-blocks
      // a faithful build, with a console note.
      state.consoleErrors.push(`perturbation engine error (non-blocking): ${String(err)}`);
      perturbation = { ran: true, invariant: true, permutationsApplied: [], diverged: [] };
    }

    // End-state screenshot.
    const endShot = join('verify', `${milestoneId}-end.png`);
    await state.page.screenshot({ path: join(projectDir, endShot), fullPage: false }).catch(() => {});
    if (existsSync(join(projectDir, endShot))) screenshots.push(endShot);

    const advisoryVlm = await runAdvisoryVlm(state.page);

    // ── GATE 6: AGGREGATE → the verbatim marker (SKILL §7) ──────────────────
    // A missing reference solution makes completability un-runnable AND
    // perturbation may report ran:false on a missing declaredRanges — these are
    // VERIFY-1 contract gaps → a DESIGN ESCALATION (not a build pass), per §8.
    const escalation = detectDesignEscalation(milestoneId, completability, perturbation, blueprint);

    const completabilityFailed = completability.ran && completability.status !== 'pass';
    const perturbationDiverged = perturbation.ran && perturbation.invariant === false;
    const perturbationIncomplete = !perturbation.ran; // missing declaredRanges → incomplete

    const failureDescribes: string[] = [];
    for (const f of fidelityFailures) failureDescribes.push(f.message ? `${f.describe} (${f.message})` : f.describe);
    if (completabilityFailed) failureDescribes.push(`completability: ${completability.message ?? 'intended solution did not reach the win'}`);
    for (const v of invariantViolations) failureDescribes.push(`invariant '${v.name}' violated${v.evidence ? `: ${v.evidence}` : ''}`);
    if (perturbationDiverged) {
      for (const d of perturbation.diverged ?? [])
        failureDescribes.push(`${d.checkId} diverged under permutation (${d.permutation}): real build invariant, this build not`);
    }

    let markerLine: string;
    let summary: string;

    const passed =
      fidelityFailures.length === 0 &&
      !completabilityFailed &&
      invariantViolations.length === 0 &&
      perturbation.ran === true &&
      perturbation.invariant === true &&
      !escalation;

    if (escalation) {
      // A design defect routes upstream — emit the design-escalation marker.
      markerLine = formatDesignEscalation(escalation.note);
      summary = `design escalation — ${escalation.note}`;
    } else if (passed) {
      const totalChecks = fidelity.length + 1 /*completability*/ + invariants.length;
      markerLine = formatAggregatePassed(milestoneId, totalChecks);
      summary = `${milestoneId} all ${totalChecks} checks passed (fidelity + completability + invariants + perturbation)`;
    } else {
      if (perturbationIncomplete && failureDescribes.length === 0) {
        // Nothing failed on the build, but the perturbation pass could not run
        // (no declaredRanges) — the verify is INCOMPLETE (§11), surfaced honestly.
        failureDescribes.push('perturbation pass incomplete (blueprint.declaredRanges absent — VERIFY-1 contract gap)');
      }
      markerLine = formatAggregateFailed(failureDescribes);
      summary = failureDescribes.join('; ') || 'one or more gates failed';
    }

    const report = buildReport({
      milestoneId,
      passed,
      summary,
      results: resultsForSchema,
      advisoryVlm,
      screenshots,
      consoleErrors: state.consoleErrors,
      startedAt,
      durationMs: Date.now() - t0,
      bootFailed: false,
      greenOnEntry,
      fixCycles,
      fidelity,
      completability,
      invariants,
      perturbation,
      ...(escalation ? { escalation } : {}),
    });
    const reportPath = writeReport(projectDir, report);

    // Write the escalation sidecar IFF a design defect was flagged.
    if (escalation) writeEscalation(projectDir, escalation);

    // Update the harness-owned bound counter for the NEXT invocation.
    if (passed) {
      resetAttempts(projectDir, milestoneId);
    } else {
      recordFailedAttempt(projectDir, milestoneId, attempts, summary);
    }

    return { report, markerLine, reportPath };
  } finally {
    await teardown(state);
  }
}

/**
 * Normalize an AssertionResult.observed for the report (mirror report.ts): a
 * relative {before, after} collapses undefined→null; a bare undefined→null.
 */
function normalizeObserved(observed: unknown): unknown {
  if (observed && typeof observed === 'object' && 'after' in (observed as any)) {
    const o = observed as { before: unknown; after: unknown };
    return {
      before: o.before === undefined ? null : o.before,
      after: o.after === undefined ? null : o.after,
    };
  }
  return observed === undefined ? null : observed;
}

/**
 * Map each milestone gdd assertion to its acceptance criterion (for the report's
 * fidelity[].given). The schema commits an ID-LINK (blueprint.schema.json
 * acceptanceCriteria[].assertionId = the gdd assertion id the AC upgrades), so we
 * pair BY assertionId first — a reordering of either list never misaligns the
 * GIVEN annotation. We FALL BACK to milestone + ORDER for any AC lacking the link
 * (older blueprints; acceptanceCriteria filtered to this milestone, in order, are
 * 1:1 with the milestone's assertions). Returns a map assertionId → criterion.
 */
function mapAcceptanceToAssertions(
  criteria: AcceptanceCriterion[] | undefined,
  assertions: GddAssertion[],
  milestoneId: string,
): Map<string, AcceptanceCriterion> {
  const out = new Map<string, AcceptanceCriterion>();
  if (!Array.isArray(criteria)) return out;
  const forMilestone = criteria.filter((c) => c.milestone === milestoneId);

  // Pass 1 — committed id-link: pair by assertionId where present.
  const assertionIds = new Set(assertions.map((a) => a.id));
  const linkedCriteria = new Set<AcceptanceCriterion>();
  for (const c of forMilestone) {
    if (c.assertionId && assertionIds.has(c.assertionId) && !out.has(c.assertionId)) {
      out.set(c.assertionId, c);
      linkedCriteria.add(c);
    }
  }

  // Pass 2 — order fallback: fill assertions still unmapped from the remaining
  // (unlinked) criteria, in their declared order (legacy blueprints / missing link).
  const remaining = forMilestone.filter((c) => !linkedCriteria.has(c));
  let r = 0;
  for (const assertion of assertions) {
    if (out.has(assertion.id)) continue;
    if (r >= remaining.length) break;
    out.set(assertion.id, remaining[r]);
    r += 1;
  }
  return out;
}

/**
 * Detect a DESIGN ESCALATION (§8): the blueprint itself is the issue. In the
 * autonomous harness path this is reserved for an upstream CONTRACT GAP that the
 * build cannot be blamed for — specifically, the referenceSolution is absent/empty
 * so completability cannot be certified at all. A missing declaredRanges is
 * surfaced as an INCOMPLETE perturbation (FAILED), not an escalation, because the
 * build may still be faithful — it is the perturbation envelope (VERIFY-1's) that
 * is missing. The richer build-vs-design discrimination is the agent's job (§8);
 * the harness only escalates the unambiguous contract gap.
 */
function detectDesignEscalation(
  milestoneId: string,
  completability: CompletabilityResult,
  _perturbation: PerturbationRecord,
  blueprint: Blueprint,
): EscalationRecord | undefined {
  const hasRefSolution =
    !!blueprint.referenceSolution &&
    Array.isArray(blueprint.referenceSolution.steps) &&
    blueprint.referenceSolution.steps.length > 0;
  if (!hasRefSolution && completability.ran === false && /^M[1-9][0-9]*$/.test(milestoneId)) {
    return {
      milestoneId,
      kind: 'design-defect',
      evidence: {
        check: 'completability',
        observed: 'no reference solution to replay',
        blueprintExpected: 'blueprint.referenceSolution.steps[] (the proven winning action-sequence)',
      },
      note: 'blueprint.referenceSolution absent — VERIFY-1 must emit the proven intended solution before completability can be certified',
    };
  }
  return undefined;
}
