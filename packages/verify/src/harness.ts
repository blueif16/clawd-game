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
import { executeAssertion, type GddAssertion, type AssertionResult } from './compile.js';
import { OBSERVE_INIT_SCRIPT } from './observe.js';
import { formatPassed, formatFailed, formatBootFailed } from './marker.js';
import { runAdvisoryVlm, type AdvisoryVlm } from './vlm.js';
import { buildReport, writeReport, type VerifyReport } from './report.js';

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
  greenOnEntry?: boolean;
}): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const { projectDir, milestoneId, assertions } = opts;
  const greenOnEntry = opts.greenOnEntry ?? true;

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
      });
      report.fixOutcome = 'boot_failed';
      const reportPath = writeReport(projectDir, report);
      return { report, markerLine, reportPath };
    }

    // ── run every assertion (single-aggregate, NOT fail-fast) ──────────────
    for (const assertion of assertions) {
      let result = await executeAssertion(state.page, assertion);
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
    });
    const reportPath = writeReport(projectDir, report);
    return { report, markerLine, reportPath };
  } finally {
    await teardown(state);
  }
}
