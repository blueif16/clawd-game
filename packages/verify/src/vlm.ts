/**
 * vlm.ts — the ADVISORY screenshot review (grammar §7 / SKILL §7).
 *
 * NEVER blocks the marker in v1. Two cheap parts:
 *   1. the deterministic "canvas not blank" check (toDataURL().length > 1000) —
 *      a blank canvas with passing assertions is a notable advisory signal.
 *   2. an OPTIONAL VLM intent-alignment verdict — a no-op stub in v1 (flag
 *      'skipped'); a real VLM call is out of scope for the runner and lives in
 *      the W5 agent layer if enabled.
 *
 * Evidence (why advisory): VLM precision ~0.50; high false-positive; "rank but
 * cannot score"; a VLM signal can reward a crashed game. The deterministic
 * __GAME__ mechanic assertions are the authority.
 */

import type { Page } from 'playwright';

export interface AdvisoryVlm {
  ran: boolean;
  flag: 'looks_right' | 'looks_off' | 'inconclusive' | 'skipped';
  canvasNotBlank?: boolean;
  note?: string;
}

/**
 * The deterministic canvas-content probe. Reads the canvas data URL length —
 * a blank canvas produces a very short data URL. Threshold 1000 per the
 * contract (report.schema advisoryVlm.canvasNotBlank).
 *
 * NOTE: WebGL and 2D contexts are mutually exclusive, so we use toDataURL()
 * (works for the WebGL-backed Phaser canvas) rather than getImageData().
 * Defensive: returns undefined if the canvas can't be read (never throws).
 */
export async function canvasNotBlank(page: Page): Promise<boolean | undefined> {
  try {
    return await page.evaluate(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (!c) return false;
      try {
        const url = c.toDataURL();
        return typeof url === 'string' && url.length > 1000;
      } catch {
        // toDataURL can throw on a tainted canvas; treat as unknown.
        return undefined as unknown as boolean;
      }
    });
  } catch {
    return undefined;
  }
}

/**
 * Run the advisory review. v1: the deterministic canvas check + a 'skipped' VLM
 * flag (no model call). Returns the advisoryVlm record for report.json. Pass
 * `enableVlm: true` to mark `ran` (still a stub verdict here).
 */
export async function runAdvisoryVlm(
  page: Page,
  _opts?: { enableVlm?: boolean; intent?: string },
): Promise<AdvisoryVlm> {
  const notBlank = await canvasNotBlank(page);
  return {
    ran: false,
    flag: 'skipped',
    ...(notBlank !== undefined ? { canvasNotBlank: notBlank } : {}),
    note:
      notBlank === false
        ? 'canvas appears blank (advisory only — does not block the marker)'
        : 'advisory VLM disabled in v1; deterministic canvas-content check only',
  };
}
