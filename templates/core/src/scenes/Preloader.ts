import Phaser from 'phaser';
import * as utils from '../utils';
import indexManifest from '../../index.json';

/**
 * Preloader (KEEP — engine; do NOT edit in W4)
 *
 * Loads assets from the `index.json` slot manifest AND placeholder-fills any
 * slot that W3 has not generated yet, so the game BOOTS AND RENDERS with ZERO
 * generated art (W3 runs in a parallel lane).
 *
 * For each slot:
 *   - status === 'generated'  → load the real file from assetsDir/path.
 *   - otherwise (pending/placeholder) → generate a flat colored-rect texture
 *     under the slot key in create() (so a key always resolves).
 *
 * An empty manifest (`slots: []`) is valid — the game still boots
 * (programmatic shapes / base-scene greybox).
 */

interface AssetSlot {
  slot: string;
  type: string;
  path: string;
  width: number;
  height: number;
  frames?: string[];
  status: string;
}

interface IndexManifest {
  archetype?: string;
  assetsDir?: string;
  slots?: AssetSlot[];
}

export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader');
  }

  preload(): void {
    this.setupLoadingProgressUI();

    const manifest = indexManifest as IndexManifest;
    const assetsDir = (manifest.assetsDir ?? 'public/assets').replace(
      /^public\//,
      '',
    );
    const slots = manifest.slots ?? [];

    for (const s of slots) {
      // Only attempt to load files W3 says are ready. Everything else is
      // placeholder-filled in create() — never block boot on a missing file.
      if (s.status !== 'generated' || !s.path) continue;
      const url = `${assetsDir}/${s.path}`.replace(/\/+/g, '/');
      try {
        if (s.type === 'audio') {
          this.load.audio(s.slot, url);
        } else if (s.type === 'animation' && s.frames && s.frames.length > 0) {
          // Spritesheet: assume horizontal strip of `frames.length` cells.
          this.load.spritesheet(s.slot, url, {
            frameWidth: s.width,
            frameHeight: s.height,
          });
        } else {
          this.load.image(s.slot, url);
        }
      } catch {
        /* a malformed slot must never crash the loader */
      }
    }

    // If a real file fails to load, fall back to a placeholder rather than die.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: any) => {
      const slot = slots.find((x) => x.slot === file?.key);
      if (slot) {
        utils.ensurePlaceholderTexture(
          this,
          slot.slot,
          slot.width || 64,
          slot.height || 64,
          slot.type,
        );
      }
    });
  }

  create(): void {
    const manifest = indexManifest as IndexManifest;
    const slots = manifest.slots ?? [];

    // Placeholder-fill EVERY slot key that isn't already a real texture, so a
    // texture key from the manifest always resolves (boots with zero art).
    for (const s of slots) {
      if (s.type === 'audio') continue; // no placeholder for audio
      utils.ensurePlaceholderTexture(
        this,
        s.slot,
        s.width || 64,
        s.height || 64,
        s.type,
      );
    }

    // Generic fallback textures the base scenes rely on (programmatic greybox).
    utils.ensurePlaceholderTexture(this, '__px', 8, 8, 'sprite');

    this.scene.start('TitleScreen');
  }

  private setupLoadingProgressUI(): void {
    const cam = this.cameras.main;
    const width = cam.width;
    const height = cam.height;
    const barWidth = Math.floor(width * 0.6);
    const barHeight = 18;
    const x = Math.floor((width - barWidth) / 2);
    const y = Math.floor(height * 0.5);

    const box = this.add.graphics();
    box.fillStyle(0x222222, 0.8);
    box.fillRect(x - 4, y - 4, barWidth + 8, barHeight + 8);

    const bar = this.add.graphics();
    const label = this.add
      .text(width / 2, y - 22, 'Loading…', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const onProgress = (value: number): void => {
      bar.clear();
      bar.fillStyle(0xffffff, 1);
      bar.fillRect(x, y, barWidth * value, barHeight);
    };
    this.load.on('progress', onProgress);
    this.load.once('complete', () => {
      this.load.off('progress', onProgress);
      bar.destroy();
      box.destroy();
      label.destroy();
    });
  }
}
