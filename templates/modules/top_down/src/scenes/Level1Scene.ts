import Phaser from 'phaser';
import { BaseLevelScene } from './BaseLevelScene';
import { _TemplatePlayer } from '../characters/_TemplatePlayer';
import * as utils from '../utils';

/**
 * Level1Scene — the DEFAULT empty-but-playable level (ships with the template).
 *
 * This is the level the EMPTY template boots into: a flat arena floor fenced
 * by four programmatic boundary walls + a placeholder player, NO enemies, NO
 * goal. It exists so the empty scaffold RUNS standalone and flips
 * window.__GAME__.ready = true on the first interactive frame (via
 * BaseGameScene.markReady()), with ZERO generated art and no tilemap.
 *
 * Top-down physics: world gravity is 0 (set in main.ts + BaseGameScene), free
 * 8-direction movement (WASD or arrows). Because `_spawnedEnemyCount` stays 0,
 * the default kill-all win condition does NOT fire — status stays 'playing'.
 *
 * W4 REPLACES this with the GDD's real level (COPY _TemplateLevel.ts for a
 * tilemap dungeon, or _TemplateArena.ts for a wave shooter), or extends it.
 * It is a normal level scene (not a KEEP engine file).
 */
export class Level1Scene extends BaseLevelScene {
  constructor() {
    super({ key: 'Level1Scene' });
  }

  preload(): void {
    // Ensure the generic pixel + bullet placeholder textures exist.
    utils.ensurePlaceholderTexture(this, '__px', 8, 8, 'sprite');
    utils.createBulletTextures(this);
  }

  create(): void {
    this.createBaseElements();
    this.cameras.main.fadeIn(300);
  }

  update(): void {
    this.baseUpdate();
  }

  // ── abstract method implementations ──────────────────────────────────────

  setupMapSize(): void {
    // A compact arena that fills the screen (no tilemap).
    this.mapWidth = this.scale.width;
    this.mapHeight = this.scale.height;
  }

  createEnvironment(): void {
    // Zero-art mode: solid floor color + four programmatic boundary walls.
    this.cameras.main.setBackgroundColor('#23233f');

    const t = 24; // wall thickness
    const w = this.mapWidth;
    const h = this.mapHeight;
    // Top, bottom, left, right (origin is sprite-center for staticSprite).
    this.createWall(w / 2, t / 2, w, t);
    this.createWall(w / 2, h - t / 2, w, t);
    this.createWall(t / 2, h / 2, t, h);
    this.createWall(w - t / 2, h / 2, t, h);
  }

  createEntities(): void {
    // Player spawns in the center of the arena.
    const spawnX = this.mapWidth * 0.5;
    const spawnY = this.mapHeight * 0.5;
    this.player = new _TemplatePlayer(this, spawnX, spawnY);

    // No enemies in the empty template — _spawnedEnemyCount stays 0 so the
    // default kill-all win condition does NOT fire (W4 adds enemies + a goal).
  }
}
