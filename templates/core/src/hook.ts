import Phaser from 'phaser';

/**
 * ============================================================================
 * window.__GAME__  —  THE TEST HOOK  (KEEP — engine seam, do NOT edit in W4)
 * ============================================================================
 *
 * Canonical, finalized accessor per `packages/skills/scaffold/template-contract.md` §3.
 *
 * A THIN, READ-ONLY adapter over the live Phaser game. It is set ONCE in
 * `main.ts` (after `new Phaser.Game(config)`) and exposes IDs + essential
 * PRIMITIVE fields, NEVER raw Phaser/engine objects. Every field is a live
 * getter, so W5 (Playwright) always reads current state.
 *
 * The same object works in a real browser (`page.evaluate`) and headless
 * (`Phaser.HEADLESS`) — it is renderer-agnostic and JSON-serializable via
 * `snapshot()`.
 *
 * HOW STATE FLOWS (W4 makes the REAL state true; this hook only reflects it):
 *   - `score`  ← game.registry.get('score')            (the single source)
 *   - `status` ← game.registry.get('status') normalized (base scenes set it
 *                at the real win/lose point — see template-contract §3.3)
 *   - `player` ← the active level scene's `.player` (a BasePlayer)
 *   - `entities[]` ← the scene's gameplay groups (enemies/decorations/…)
 *
 * This file is GENERIC across all five archetypes. Per-archetype `player`
 * extras and the `extras` block are read defensively (a field that doesn't
 * apply is `undefined`, never throws).
 */

// ── normalized status enum ──────────────────────────────────────────────────
export type GameStatus = 'booting' | 'playing' | 'won' | 'lost';

// ── the public shapes W5 observes (template-contract §3.2) ──────────────────
export interface HookPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: number;
  maxHealth: number;
  // grid_logic:
  gridX?: number;
  gridY?: number;
  // platformer / top_down extras:
  facingDirection?: 'left' | 'right';
  isDead?: boolean;
  isGrounded?: boolean;
}

export interface HookEntity {
  id: string;
  type: string;
  x: number;
  y: number;
  gridX?: number;
  gridY?: number;
}

export interface GameHook {
  ready: boolean;
  status: GameStatus;
  scene: string | null;
  score: number;
  player: HookPlayer | null;
  entities: HookEntity[];

  // archetype extras (present only when meaningful; undefined otherwise)
  moveCount?: number;
  maxMoves?: number;
  gold?: number;
  lives?: number;
  waveIndex?: number;
  playerHP?: number;
  enemyHP?: number;
  phase?: string;

  snapshot(): Record<string, unknown>;
  commands: {
    reset(): void;
    seed(n: number): void;
    setState(patch: Record<string, unknown>): void;
  };
}

declare global {
  interface Window {
    __GAME__?: GameHook;
    __PHASER_GAME__?: Phaser.Game;
  }
}

// ── helpers (engine-internal, not part of the observed surface) ─────────────

/** Scene keys that are NOT gameplay level scenes (UI/menu overlays). */
const NON_LEVEL_KEYS = new Set<string>([
  'Boot',
  'Preloader',
  'TitleScreen',
  'UIScene',
  'PauseUIScene',
  'VictoryUIScene',
  'GameCompleteUIScene',
  'GameOverUIScene',
  'CharacterSelectScene',
]);

/** Find the active level scene (the first RUNNING scene that is a real level). */
function getActiveLevelScene(game: Phaser.Game): Phaser.Scene | null {
  const scenes = game.scene.getScenes(true); // only active/running
  for (const s of scenes) {
    const key = (s.scene as any).key as string;
    if (!NON_LEVEL_KEYS.has(key)) return s;
  }
  return null;
}

/** Read a numeric field off a live object, defaulting to 0. */
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** Map a Phaser game object's role to the functional entity type vocabulary. */
function entityType(obj: any): string {
  if (obj?.__type) return obj.__type as string; // explicit tag wins
  if (obj?.entityType) return obj.entityType as string;
  return 'obstacle';
}

/** Stable id for an entity (gdd id when tagged, else a generated one). */
function entityId(obj: any, idx: number): string {
  if (obj?.__id) return obj.__id as string;
  if (obj?.entityId) return obj.entityId as string;
  if (obj?.name) return obj.name as string;
  return `${entityType(obj)}_${idx}`;
}

/** Collect gameplay entities from a level scene's known groups. */
function collectEntities(scene: any, player: any): HookEntity[] {
  const out: HookEntity[] = [];
  let idx = 0;

  // The player is entity #0 (so entities.count(type==player) === 1).
  if (player && player.active !== false) {
    out.push({
      id: 'player',
      type: 'player',
      x: num(player.x),
      y: num(player.y),
      ...(typeof player.gridX === 'number'
        ? { gridX: player.gridX, gridY: player.gridY }
        : {}),
    });
  }

  // Known group names across archetypes. A missing group is skipped.
  const groupNames = [
    'enemies',
    'decorations',
    'collectibles',
    'obstacles',
    'goals',
    'entities',
    'towersGroup',
    'enemiesGroup',
    'projectiles',
    'playerBullets',
    'enemyBullets',
  ];

  for (const gname of groupNames) {
    const group = scene[gname];
    if (!group || typeof group.getChildren !== 'function') continue;
    const children = group.getChildren();
    for (const child of children) {
      if (!child || child.active === false) continue;
      idx += 1;
      out.push({
        id: entityId(child, idx),
        type: entityType(child),
        x: num(child.x),
        y: num(child.y),
        ...(typeof child.gridX === 'number'
          ? { gridX: child.gridX, gridY: child.gridY }
          : {}),
      });
    }
  }

  return out;
}

/** Build the live player view from a BasePlayer-like object. */
function buildPlayer(player: any): HookPlayer | null {
  if (!player) return null;
  const body = player.body;
  const view: HookPlayer = {
    x: num(player.x),
    y: num(player.y),
    vx: num(body?.velocity?.x),
    vy: num(body?.velocity?.y),
    health: num(player.health),
    maxHealth: num(player.maxHealth, num(player.health)),
  };
  if (typeof player.facingDirection === 'string') {
    view.facingDirection = player.facingDirection;
  }
  if (typeof player.isDead === 'boolean') view.isDead = player.isDead;
  // isGrounded is a method on BasePlayer; read it defensively.
  if (typeof player.isGrounded === 'function') {
    try {
      view.isGrounded = !!player.isGrounded();
    } catch {
      /* ignore */
    }
  } else if (typeof player.isGrounded === 'boolean') {
    view.isGrounded = player.isGrounded;
  }
  if (typeof player.gridX === 'number') view.gridX = player.gridX;
  if (typeof player.gridY === 'number') view.gridY = player.gridY;
  return view;
}

/**
 * Install `window.__GAME__` over a live Phaser game.
 * Called ONCE from `main.ts` after `new Phaser.Game(config)`.
 */
export function installGameHook(game: Phaser.Game): GameHook {
  // `ready` is latched true by the base level scene on its first interactive
  // frame (registry flag 'ready'); see BaseLevelScene.markReady().
  const isReady = (): boolean => game.registry.get('ready') === true;

  const computeStatus = (): GameStatus => {
    const flag = game.registry.get('status') as GameStatus | undefined;
    if (flag === 'won' || flag === 'lost' || flag === 'playing') return flag;
    return isReady() ? 'playing' : 'booting';
  };

  const hook: GameHook = {
    // ── universal ───────────────────────────────────────────────────────────
    get ready() {
      return isReady();
    },
    get status() {
      return computeStatus();
    },
    get scene() {
      const s = getActiveLevelScene(game);
      return s ? ((s.scene as any).key as string) : null;
    },
    get score() {
      return num(game.registry.get('score'), 0);
    },
    get player() {
      const s = getActiveLevelScene(game) as any;
      return s ? buildPlayer(s.player) : null;
    },
    get entities() {
      const s = getActiveLevelScene(game) as any;
      return s ? collectEntities(s, s.player) : [];
    },

    // ── archetype extras (read defensively off the active scene) ─────────────
    get moveCount() {
      const s = getActiveLevelScene(game) as any;
      const v = s?.turnManager?.moveCount ?? s?.moveCount;
      return typeof v === 'number' ? v : undefined;
    },
    get maxMoves() {
      const s = getActiveLevelScene(game) as any;
      const v = s?.turnManager?.maxMoves ?? s?.maxMoves;
      return typeof v === 'number' ? v : undefined;
    },
    get gold() {
      const s = getActiveLevelScene(game) as any;
      const v = s?.economyManager?.gold ?? s?.gold;
      return typeof v === 'number' ? v : undefined;
    },
    get lives() {
      const s = getActiveLevelScene(game) as any;
      const v = s?.lives;
      return typeof v === 'number' ? v : undefined;
    },
    get waveIndex() {
      const s = getActiveLevelScene(game) as any;
      const v = s?.waveManager?.currentWaveIndex ?? s?.waveIndex;
      return typeof v === 'number' ? v : undefined;
    },
    get playerHP() {
      const s = getActiveLevelScene(game) as any;
      const v = s?.playerHP;
      return typeof v === 'number' ? v : undefined;
    },
    get enemyHP() {
      const s = getActiveLevelScene(game) as any;
      const v = s?.enemyHP;
      return typeof v === 'number' ? v : undefined;
    },
    get phase() {
      const s = getActiveLevelScene(game) as any;
      const v = s?.turnManager?.phase ?? s?.phase;
      return typeof v === 'string' ? v : undefined;
    },

    // ── methods ───────────────────────────────────────────────────────────────
    snapshot() {
      // A plain, JSON-serializable copy of the observed surface.
      const out: Record<string, unknown> = {
        ready: this.ready,
        status: this.status,
        scene: this.scene,
        score: this.score,
        player: this.player,
        entities: this.entities,
      };
      // Include archetype extras only when present (keeps the dump clean).
      const extras = [
        'moveCount',
        'maxMoves',
        'gold',
        'lives',
        'waveIndex',
        'playerHP',
        'enemyHP',
        'phase',
      ] as const;
      for (const k of extras) {
        const v = (this as any)[k];
        if (v !== undefined) out[k] = v;
      }
      return out;
    },

    commands: {
      reset() {
        const s = getActiveLevelScene(game) as any;
        if (s && s.scene && typeof s.scene.restart === 'function') {
          // Clear end-state flags so the restarted level is playable.
          game.registry.set('status', 'playing');
          s.scene.restart();
        }
      },
      seed(n: number) {
        // Seed Phaser's RNG for determinism. No-op-safe.
        try {
          (game as any).config?.seed;
          if ((Phaser.Math as any).RND?.sow) {
            (Phaser.Math as any).RND.sow([String(n)]);
          }
        } catch {
          /* ignore */
        }
        game.registry.set('__seed', n);
      },
      setState(patch: Record<string, unknown>) {
        // Apply a precondition for a W5 assertion — sparingly, never to fake
        // the OBSERVED outcome (that is W5's contract responsibility).
        const s = getActiveLevelScene(game) as any;
        for (const [key, value] of Object.entries(patch)) {
          if (key === 'status' || key === 'score') {
            game.registry.set(key, value);
            continue;
          }
          // dot-path into the player (e.g. "player.health": 1)
          const parts = key.split('.');
          if (parts[0] === 'player' && s?.player) {
            let target: any = s.player;
            for (let i = 1; i < parts.length - 1; i += 1) {
              target = target?.[parts[i]];
            }
            const leaf = parts[parts.length - 1];
            if (target && leaf) target[leaf] = value;
          } else if (s) {
            // top-level scene field fallback
            s[key] = value;
          }
        }
      },
    },
  };

  // Optional debug escape hatch (NOT for assertions).
  window.__PHASER_GAME__ = game;
  window.__GAME__ = hook;
  return hook;
}
