import Phaser from 'phaser';
import { LevelManager } from '../LevelManager';

/**
 * TitleScreen (KEEP — engine; W4 may restyle text, must keep the start flow)
 *
 * Minimal start screen. Press Enter / Space / click to start the first level.
 * Phaser-native (no DOM/tailwind) so it renders headless with zero art.
 */
export class TitleScreen extends Phaser.Scene {
  private isStarting = false;

  constructor() {
    super({ key: 'TitleScreen' });
  }

  init(): void {
    this.isStarting = false;
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height * 0.38, this.game.registry.get('title') ?? 'GAME', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.58, 'Press ENTER / SPACE to start', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffd34a',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => this.startGame());
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
    this.input.once('pointerdown', () => this.startGame());
  }

  private startGame(): void {
    if (this.isStarting) return;
    this.isStarting = true;
    const first = LevelManager.getFirstLevelScene() ?? 'Level1Scene';
    this.scene.start(first);
  }
}
