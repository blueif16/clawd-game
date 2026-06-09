import Phaser from 'phaser';

/**
 * UIScene (KEEP — engine HUD overlay; W4 may add HUD elements)
 *
 * Runs in parallel with the active level scene. Phaser-native (no DOM) HUD:
 * - score (from game.registry 'score')
 * - player health bar (from the level scene's `.player`)
 * - ESC to pause
 *
 * Launched by the base level scene: `this.scene.launch('UIScene', { gameSceneKey })`.
 */
export default class UIScene extends Phaser.Scene {
  private gameSceneKey: string | null = null;
  private scoreText!: Phaser.GameObjects.Text;
  private healthBarBg!: Phaser.GameObjects.Graphics;
  private healthBar!: Phaser.GameObjects.Graphics;
  private healthText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: { gameSceneKey?: string }): void {
    this.gameSceneKey = data.gameSceneKey ?? null;
  }

  create(): void {
    this.scoreText = this.add
      .text(16, 14, 'Score: 0', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.healthBarBg = this.add.graphics().setScrollFactor(0).setDepth(1000);
    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(1001);
    this.healthText = this.add
      .text(16, 44, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(1002);

    this.input.keyboard?.on('keydown-ESC', () => this.pauseGame());
  }

  private pauseGame(): void {
    if (!this.gameSceneKey) return;
    if (!this.scene.isActive(this.gameSceneKey)) return;
    this.scene.pause(this.gameSceneKey);
    this.scene.launch('PauseUIScene', { currentLevelKey: this.gameSceneKey });
  }

  update(): void {
    // Score from the registry (the single source).
    const score = this.registry.get('score') ?? 0;
    this.scoreText.setText(`Score: ${score}`);

    // Player health bar from the live level scene.
    const gameScene = this.gameSceneKey
      ? (this.scene.get(this.gameSceneKey) as any)
      : null;
    const player = gameScene?.player;

    const x = 16;
    const y = 44;
    const w = 200;
    const h = 16;
    this.healthBarBg.clear();
    this.healthBar.clear();

    if (player && typeof player.health === 'number') {
      const max = player.maxHealth || player.health || 1;
      const pct = Phaser.Math.Clamp(player.health / max, 0, 1);
      this.healthBarBg.fillStyle(0x000000, 0.6);
      this.healthBarBg.fillRect(x - 2, y - 2, w + 4, h + 4);
      const color = pct > 0.5 ? 0x4caf50 : pct > 0.25 ? 0xffc107 : 0xf44336;
      this.healthBar.fillStyle(color, 1);
      this.healthBar.fillRect(x, y, w * pct, h);
      this.healthText.setText(
        `${Math.max(0, Math.round(player.health))}/${Math.round(max)}`,
      );
      this.healthText.setPosition(x + w + 8, y);
    } else {
      this.healthText.setText('');
    }
  }
}
