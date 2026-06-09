import Phaser from 'phaser';
import { LevelManager } from '../LevelManager';
import * as utils from '../utils';
import { ScreenEffectHelper } from '../behaviors';

/**
 * Player class registry for dynamic player creation (character select).
 */
export type PlayerClassMap = Record<
  string,
  new (scene: Phaser.Scene, x: number, y: number) => any
>;

/**
 * BaseLevelScene — Level Scene Base Class (Platformer)  (KEEP — engine)
 *
 * Foundation for all platformer level scenes. Template Method + Hooks.
 *
 * BOOTS EMPTY: unlike a tilemap-only base, this scene builds PROGRAMMATIC
 * platforms (a static physics group) so a level renders & is playable with
 * ZERO generated art (placeholder textures from the Preloader). A subclass may
 * still load a Tiled tilemap by overriding createTileMap() and setting
 * `this.groundLayer` to a TilemapLayer — collisions work with either.
 *
 * NET-NEW (game-omni): on the first interactive frame it latches the registry
 * `ready` flag and `status` = 'playing' (so window.__GAME__.ready flips true),
 * and sets `status` = 'won'/'lost' at the real win/lose points
 * (template-contract.md §3.3).
 *
 * ABSTRACT METHODS (subclass MUST implement):
 *   setupMapSize, createBackground, createTileMap, createDecorations,
 *   createPlayer, createEnemies
 *
 * HOOKS (subclass MAY override): onPreCreate, onPostCreate, onPreUpdate,
 *   onPostUpdate, onPlayerDeath, onLevelComplete, onEnemyKilled,
 *   setupCustomCollisions
 */
export abstract class BaseLevelScene extends Phaser.Scene {
  // ── scene state ─────────────────────────────────────────────────────────
  /** Flag to prevent multiple completion triggers. */
  public gameCompleted = false;
  /** Latched true after the first interactive frame (drives __GAME__.ready). */
  private _readyLatched = false;

  // ── map dimensions ──────────────────────────────────────────────────────
  public mapWidth = 0;
  public mapHeight = 0;
  public tileSize = 64;

  // ── core game objects ───────────────────────────────────────────────────
  /** Player — set in createPlayer(); read live by __GAME__.player. */
  public player: any;
  public enemies!: Phaser.GameObjects.Group;
  public enemyMeleeTriggers!: Phaser.GameObjects.Group;
  /** Collectibles / props — read by __GAME__.entities. */
  public decorations!: Phaser.GameObjects.Group;
  public playerBullets!: Phaser.GameObjects.Group;
  public enemyBullets!: Phaser.GameObjects.Group;

  /**
   * Ground collision target. Either a static physics group of programmatic
   * platform sprites (default) OR a Tiled TilemapLayer (if a subclass loads
   * one). Both work with utils.addCollider.
   */
  public groundLayer!: Phaser.Physics.Arcade.StaticGroup | Phaser.Tilemaps.TilemapLayer;

  // ── input (scene-owned; entities consume this state) ────────────────────
  public wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  public cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  public spaceKey!: Phaser.Input.Keyboard.Key;
  public shiftKey!: Phaser.Input.Keyboard.Key;
  public eKey!: Phaser.Input.Keyboard.Key;
  public qKey!: Phaser.Input.Keyboard.Key;

  // ── tilemap (optional; only if a subclass loads one) ────────────────────
  public map?: Phaser.Tilemaps.Tilemap;
  public groundTileset?: Phaser.Tilemaps.Tileset;

  // ── background ──────────────────────────────────────────────────────────
  public background?: Phaser.GameObjects.TileSprite;

  // ── audio ───────────────────────────────────────────────────────────────
  public backgroundMusic?: Phaser.Sound.BaseSound;

  constructor(config: string | Phaser.Types.Scenes.SettingsConfig) {
    super(config);
  }

  // ══════════════════════════════════════════════════════════════════════
  // TEMPLATE METHOD: CREATE
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Build all level elements (call from your create()).
   */
  createBaseElements(): void {
    this.gameCompleted = false;
    this._readyLatched = false;
    // status becomes 'playing' once ready latches; 'booting' until then.
    this.registry.set('status', 'playing');

    this.onPreCreate();

    // PHASE 1: environment
    this.setupMapSize();
    this.createBackground();
    this.createTileMap();

    // PHASE 2: groups
    this.initializeGroups();

    // PHASE 3: entities
    this.createDecorations();
    this.createPlayer();
    this.createEnemies();

    // PHASE 4: systems
    this.setupCamera();
    this.setupWorldBounds();
    this.setupInputs();

    // PHASE 5: collisions
    this.setupBaseCollisions();
    this.setupCustomCollisions();

    // PHASE 6: HUD
    this.scene.launch('UIScene', { gameSceneKey: this.scene.key });

    this.onPostCreate();
  }

  private initializeGroups(): void {
    this.decorations = this.add.group();
    this.enemies = this.add.group();
    this.enemyMeleeTriggers = this.add.group();
    this.playerBullets = this.add.group();
    this.enemyBullets = this.add.group();
  }

  /**
   * Build a programmatic static platform and add it to groundLayer.
   * Uses the '__px' placeholder texture stretched to the requested size, so
   * it renders with zero generated art. Returns the platform sprite.
   *
   * If groundLayer is a TilemapLayer (subclass loaded a tilemap), this is a
   * no-op (use the tilemap instead).
   */
  createPlatform(
    x: number,
    y: number,
    width: number,
    height = 32,
    color = 0x6b8e23,
  ): Phaser.Physics.Arcade.Sprite | null {
    if (!(this.groundLayer instanceof Phaser.Physics.Arcade.StaticGroup)) {
      return null;
    }
    utils.ensurePlaceholderTexture(this, '__px', 8, 8, 'sprite');
    const plat = this.physics.add.staticSprite(x, y, '__px');
    plat.setDisplaySize(width, height);
    plat.setTint(color);
    plat.refreshBody();
    this.groundLayer.add(plat);
    return plat;
  }

  private setupCamera(): void {
    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
    if (this.player) {
      this.cameras.main.startFollow(this.player);
      this.cameras.main.setFollowOffset(0, -128);
      this.cameras.main.setLerp(0.1, 0.1);
    }
  }

  private setupWorldBounds(): void {
    // No bottom bound — falling off the map is a death (checkPlayerFall).
    this.physics.world.setBounds(
      0,
      0,
      this.mapWidth,
      this.mapHeight,
      true,
      true,
      true,
      false,
    );
    if (this.player?.setCollideWorldBounds) {
      this.player.setCollideWorldBounds(true);
    }
    this.enemies.children.iterate((enemy: any) => {
      enemy?.setCollideWorldBounds?.(true);
      return true;
    });
  }

  /**
   * Setup input. Scene-OWNS input; entities read this state, never attach
   * their own listeners. Arrow keys AND WASD both drive movement so W5's
   * 'ArrowUp'/'ArrowLeft' inputs and a player's WASD both work.
   */
  setupInputs(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasdKeys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.shiftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.eKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.qKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
  }

  // ── collisions ───────────────────────────────────────────────────────────

  setupBaseCollisions(): void {
    this.setupGroundCollisions();
    this.setupContactDamage();
    this.setupMeleeCollisions();
    this.setupBulletCollisions();
  }

  private setupGroundCollisions(): void {
    if (!this.groundLayer) return;
    if (this.player) utils.addCollider(this, this.player, this.groundLayer);
    utils.addCollider(this, this.enemies, this.groundLayer);
  }

  private setupContactDamage(): void {
    if (!this.player) return;
    utils.addOverlap(this, this.player, this.enemies, (player: any, enemy: any) => {
      if (player.isInvulnerable || player.isHurting || player.isDead) return;
      if (enemy.isDead) return;
      const direction = player.x < enemy.x ? -1 : 1;
      player.setVelocityX?.(200 * direction);
      player.setVelocityY?.(-150);
      player.takeDamage?.(enemy.damage);
      this.showDamageNumber(player.x, player.y, enemy.damage, '#ff4444');
      this.cameras.main.flash(120, 255, 80, 80);
    });
  }

  private setupMeleeCollisions(): void {
    if (!this.player) return;
    const playerMeleeTrigger =
      this.player.meleeTrigger || this.player.melee?.meleeTrigger;
    if (playerMeleeTrigger) {
      utils.addOverlap(this, playerMeleeTrigger, this.enemies, (_t: any, enemy: any) => {
        if (!this.player.isAttacking) return;
        const targets =
          this.player.currentMeleeTargets || this.player.melee?.currentTargets;
        if (targets?.has(enemy)) return;
        if (enemy.isHurting || enemy.isDead) return;
        targets?.add(enemy);
        const direction = enemy.x > this.player.x ? 1 : -1;
        enemy.setVelocityX?.(150 * direction);
        const damage = this.player.attackDamage || this.player.melee?.damage;
        enemy.takeDamage?.(damage);
        this.showDamageNumber(enemy.x, enemy.y, damage, '#ffdd44');
        this.hitStop(60);
        ScreenEffectHelper.shakeLight(this);
        if (enemy.isDead) this.onEnemyKilled(enemy);
      });
    }

    utils.addOverlap(this, this.enemyMeleeTriggers, this.player, (trigger: any, player: any) => {
      const enemy = trigger.owner;
      if (!enemy?.isAttacking) return;
      const targets = enemy.currentMeleeTargets || enemy.melee?.currentTargets;
      if (targets?.has(player)) return;
      if (player.isInvulnerable || player.isHurting || player.isDead) return;
      targets?.add(player);
      const direction = player.x > enemy.x ? 1 : -1;
      player.setVelocityX?.(300 * direction);
      player.setVelocityY?.(-200);
      player.takeDamage?.(enemy.damage);
      this.showDamageNumber(player.x, player.y, enemy.damage, '#ff4444');
    });
  }

  private setupBulletCollisions(): void {
    utils.addOverlap(this, this.playerBullets, this.enemies, (bullet: any, enemy: any) => {
      if (enemy.isDead || enemy.isHurting) return;
      const direction = bullet.body?.velocity?.x > 0 ? 1 : -1;
      enemy.setVelocityX?.(200 * direction);
      const damage = bullet.damage ?? this.player?.attackDamage ?? 10;
      enemy.takeDamage?.(damage);
      this.showDamageNumber(enemy.x, enemy.y, damage, '#ffdd44');
      this.destroyBullet(bullet);
      if (enemy.isDead) this.onEnemyKilled(enemy);
    });

    if (this.groundLayer) {
      utils.addCollider(this, this.playerBullets, this.groundLayer, (bullet: any) =>
        this.destroyBullet(bullet),
      );
      utils.addCollider(this, this.enemyBullets, this.groundLayer, (bullet: any) =>
        this.destroyBullet(bullet),
      );
    }

    if (this.player) {
      utils.addOverlap(this, this.player, this.enemyBullets, (player: any, bullet: any) => {
        if (player.isInvulnerable || player.isHurting || player.isDead) return;
        const direction =
          (bullet as any).direction ?? (bullet.body?.velocity?.x > 0 ? 1 : -1);
        player.setVelocityX?.(150 * direction);
        player.takeDamage?.(bullet.damage ?? 15);
        this.showDamageNumber(player.x, player.y, bullet.damage ?? 15, '#ff4444');
        this.destroyBullet(bullet);
      });
    }
  }

  private destroyBullet(bullet: any): void {
    if (typeof bullet.hit === 'function') bullet.hit();
    else bullet.destroy();
  }

  // ══════════════════════════════════════════════════════════════════════
  // TEMPLATE METHOD: UPDATE
  // ══════════════════════════════════════════════════════════════════════

  baseUpdate(): void {
    // Latch ready on the first interactive frame (drives __GAME__.ready).
    this.markReady();

    if (!this.player || !this.player.active) {
      this.onPreUpdate();
      this.onPostUpdate();
      return;
    }

    this.onPreUpdate();

    try {
      this.player.update?.(
        this.wasdKeys,
        this.spaceKey,
        this.shiftKey,
        this.eKey,
        this.qKey,
        this.cursors,
      );
    } catch (error) {
      console.error('Error updating player:', error);
    }

    this.updateEnemies();
    this.updateBullets();
    this.checkWinCondition();
    this.updateParallax();
    this.checkPlayerFall();

    this.onPostUpdate();
  }

  /**
   * Latch the registry `ready` flag once (first interactive frame).
   * window.__GAME__.ready reads registry.get('ready').
   */
  protected markReady(): void {
    if (this._readyLatched) return;
    this._readyLatched = true;
    this.registry.set('ready', true);
    // keep status 'playing' unless a win/lose flag already fired
    const s = this.registry.get('status');
    if (s !== 'won' && s !== 'lost') this.registry.set('status', 'playing');
  }

  private updateEnemies(): void {
    this.enemies.children.iterate((enemy: any) => {
      if (enemy?.active && enemy.update) {
        try {
          enemy.update();
        } catch (error) {
          console.error('Error updating enemy:', error);
        }
      }
      return true;
    });
  }

  private updateBullets(): void {
    this.enemyBullets.children.iterate((b: any) => {
      if (b?.active && b.update) b.update();
      return true;
    });
    this.playerBullets.children.iterate((b: any) => {
      if (b?.active && b.update) b.update();
      return true;
    });
  }

  private updateParallax(): void {
    if (this.background) {
      this.background.tilePositionX = this.cameras.main.scrollX * 0.2;
    }
  }

  private checkPlayerFall(): void {
    if (this.player.y > this.mapHeight + 100 && !this.player.isDead) {
      this.player.health = 0;
      this.player.isDead = true;
      this.onPlayerDeath();
    }
  }

  /**
   * Default win condition: all enemies defeated. A subclass with a goal/exit
   * sets gameCompleted=true and calls onLevelComplete() directly instead.
   * NOTE: if a level has zero enemies, this would fire immediately — so the
   * default only triggers when the level HAD at least one enemy.
   */
  checkWinCondition(): void {
    if (this.gameCompleted) return;
    if (this._spawnedEnemyCount === 0) return; // no kill-all goal in this level
    const alive = this.enemies.children.entries.filter(
      (e: any) => e.active && !e.isDead,
    ).length;
    if (alive === 0) {
      this.gameCompleted = true;
      this.onLevelComplete();
    }
  }

  /** Count of enemies spawned this level (gates the kill-all win condition). */
  protected _spawnedEnemyCount = 0;

  // ── hooks ────────────────────────────────────────────────────────────────

  protected onPreCreate(): void {}
  protected onPostCreate(): void {}
  protected onPreUpdate(): void {}
  protected onPostUpdate(): void {}

  /**
   * Called when the player dies. Sets registry `status` = 'lost' (the
   * normalized win/lose seam) then shows the game-over screen.
   */
  protected onPlayerDeath(): void {
    this.registry.set('status', 'lost');
    this.scene.launch('GameOverUIScene', { currentLevelKey: this.scene.key });
  }

  /**
   * Called when the level is completed. Sets registry `status` = 'won' (the
   * normalized win/lose seam) then shows the victory / game-complete screen
   * after a short delay.
   */
  protected onLevelComplete(): void {
    this.registry.set('status', 'won');
    ScreenEffectHelper.shakeMedium(this);
    this.time.delayedCall(500, () => {
      if (LevelManager.isLastLevel(this.scene.key)) {
        this.scene.launch('GameCompleteUIScene', {
          currentLevelKey: this.scene.key,
        });
      } else {
        this.scene.launch('VictoryUIScene', { currentLevelKey: this.scene.key });
      }
    });
  }

  /** Called when an enemy is killed. Override for scoring / drops. */
  protected onEnemyKilled(_enemy: any): void {}

  /** Override to add player-decoration / trigger collisions (player exists). */
  protected setupCustomCollisions(): void {}

  // ══════════════════════════════════════════════════════════════════════
  // JUICE  (ships wired-but-inert; W4 fires it on the right events)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Hit-stop: briefly pause physics for impact weight (W4's requested helper).
   * Scoped & self-resuming; clamped to a safe range (≤200ms).
   * @param ms pause duration in milliseconds (default 60).
   */
  hitStop(ms = 60): void {
    const clamped = Phaser.Math.Clamp(ms, 0, 200);
    if (clamped <= 0) return;
    this.physics.world.pause();
    this.time.delayedCall(clamped, () => this.physics.world.resume());
  }

  /**
   * Floating damage number that drifts up and fades (ships from the base).
   */
  showDamageNumber(
    x: number,
    y: number,
    damage: number,
    color = '#ffffff',
    fontSize = 18,
    duration = 600,
  ): void {
    const text = this.add
      .text(x, y - 20, `${Math.round(damage)}`, {
        fontFamily: 'monospace',
        fontSize: `${fontSize}px`,
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.tweens.add({
      targets: text,
      y: y - 20 - fontSize * 2.5,
      alpha: 0,
      duration,
      ease: 'Power1',
      onComplete: () => text.destroy(),
    });
  }

  // ── dynamic player creation (character select integration) ──────────────

  protected getPlayerClasses(): PlayerClassMap {
    return {};
  }

  protected createPlayerByType(
    x: number,
    y: number,
    defaultClass: new (scene: Phaser.Scene, x: number, y: number) => any,
  ): any {
    const selected = this.registry.get('selectedCharacter') as
      | string
      | undefined;
    const classes = this.getPlayerClasses();
    const PlayerClass =
      selected && classes[selected] ? classes[selected] : defaultClass;
    return new PlayerClass(this, x, y);
  }

  // ── abstract methods (subclass MUST implement) ──────────────────────────

  /** Set this.mapWidth / this.mapHeight. */
  abstract setupMapSize(): void;
  /** Create the background (TileSprite for parallax, or nothing). */
  abstract createBackground(): void;
  /** Build ground collision. Default: programmatic platforms in a StaticGroup. */
  abstract createTileMap(): void;
  /** Create decorations/collectibles. WARNING: player does not exist yet. */
  abstract createDecorations(): void;
  /** Create the player. Must set this.player. */
  abstract createPlayer(): void;
  /** Create enemies. Add them to this.enemies; bump _spawnedEnemyCount. */
  abstract createEnemies(): void;
}
