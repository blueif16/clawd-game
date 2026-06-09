# Platformer template — capabilities (the API W1 constrains the GDD to)

This is the **vocabulary the platformer template provides**. W1 (write-gdd) must
keep `gdd.entities[].behaviors`, `gdd.mechanics[].capability`, `gdd.controls[]`,
and `gdd.config{}` **within these names** — never invent a capability the
template lacks. W4 (implement-milestone) COMPOSES these onto entities and WIRES
the juice; W5 reads the resulting state off `window.__GAME__`.

Archetype: `platformer` · perspective: side-view · physics: Arcade, per-entity
gravity · movement: continuous.

---

## 1. Entity bases (EXTEND these — `characters/`)

| base | role | extend via | key fields the hook exposes |
|---|---|---|---|
| `BasePlayer` | the player (`gdd.entities[0]`, role `player`) | COPY `_TemplatePlayer.ts` → `Player.ts` | `x,y,vx,vy,health,maxHealth,facingDirection,isDead,isGrounded()` |
| `BaseEnemy` | enemies (role `enemy`) | COPY `_TemplateEnemy.ts` → `Slime.ts` etc. | tagged `__type:'enemy'`; appears in `entities[]` |

A collectible / obstacle / goal that needs no AI is a plain
`physics.add.sprite` added to a scene group (`decorations`), tagged with
`__type` (`'collectible'|'obstacle'|'goal'`) so the hook reports its type.

## 2. Behaviors (COMPOSE these — `behaviors/`, names for `entities[].behaviors`)

| behavior name | what it does | tuning (gameConfig key) |
|---|---|---|
| `PlatformerMovement` | horizontal walk + jump; air control; optional coyote-time, jump-buffer, double-jump | `walkSpeed`, `jumpPower`, `gravityY` |
| `MeleeAttack` | melee hitbox (trigger zone) + cooldown + hit tracking | `attackDamage` |
| `RangedAttack` | spawns projectiles into `playerBullets`/`enemyBullets` | `attackDamage` |
| `PatrolAI` | walk back and forth (bounds or cliff-aware on tilemaps) | enemy `walkSpeed` |
| `ChaseAI` | chase a target with detection range / give-up / stop distance | enemy `walkSpeed` |
| `SkillBehavior` (+ 9 skill types) | the Q-ultimate: `DashAttackSkill`, `AreaDamageSkill`, `TargetedExecutionSkill`, `TargetedAOESkill`, `BeamAttackSkill`, `GroundQuakeSkill`, `BoomerangSkill`, `MultishotSkill`, `ArcProjectileSkill` | `ultimateConfig` |

`mechanics[].capability` may reference a behavior method, e.g.
`PlatformerMovement.jump`, `PlatformerMovement.move`, `MeleeAttack.startAttack`,
`RangedAttack.shoot`. Composition is via `entity.behaviors.add(name, instance)`
and driven each frame by `entity.behaviors.update()` (already wired in the bases).

## 3. Scene hooks (override these in the COPIED `_TemplateLevel` — `scenes/`)

`BaseLevelScene` (KEEP) drives the level via Template Method + Hooks. W4 overrides:

| hook | when it fires | typical use |
|---|---|---|
| `setupMapSize` | create | set `mapWidth`/`mapHeight` |
| `createBackground` | create | parallax TileSprite or solid color |
| `createTileMap` | create | **programmatic platforms** (`createPlatform(x,y,w,h)`) OR a Tiled tilemap |
| `createDecorations` | create (no player yet) | spawn collectibles into `decorations` |
| `createPlayer` | create | `this.player = new Player(this, x, y)` |
| `createEnemies` | create | add to `enemies`, bump `_spawnedEnemyCount` |
| `setupCustomCollisions` | create (player exists) | coin pickup, goal/exit overlap |
| `onEnemyKilled(enemy)` | on kill | scoring / drops |
| `onLevelComplete` | win | sets registry `status:'won'` (KEEP) |
| `onPlayerDeath` | death | sets registry `status:'lost'` (KEEP) |
| `onPreUpdate` / `onPostUpdate` | each frame | custom per-frame logic |

Win/lose **seam** (sets the normalized `status` the hook reads):
- **win** → `onLevelComplete()` (default: all enemies dead when `_spawnedEnemyCount>0`; or call it from a goal-overlap). Sets `registry.status='won'`.
- **lose** → `onPlayerDeath()` (player `health<=0` via FSM, or fell off the map). Sets `registry.status='lost'`.

## 4. Controls supported (DOM/Phaser key names for `gdd.controls[]` + W5 inputs)

Input is **scene-owned**; entities read the injected state. Both arrow keys AND
WASD drive movement, so W5 can fire either.

| input | action |
|---|---|
| `ArrowLeft` / `A` | move left |
| `ArrowRight` / `D` | move right |
| `ArrowUp` / `W` / `Space` | jump |
| `Shift` | melee attack (alternating punch/kick) |
| `E` | ranged attack (if the player has a `RangedAttack`) |
| `Q` | ultimate skill (if the player has a `SkillBehavior`) |
| `Escape` | pause |
| `Enter` | start (TitleScreen) / advance (Victory) / retry (GameOver) |

## 5. Config keys (`gdd.config` → `gameConfig.json.playerConfig`)

Only these platformer keys are valid (template-contract.md §4). Any other key W1
sets is DROPPED by W2. Universal infra groups (`screenSize`/`debugConfig`/
`renderConfig`) are untouchable.

`maxHealth`, `walkSpeed`, `jumpPower`, `gravityY`, `attackDamage`,
`hurtingDuration`, `invulnerableTime`.

## 6. Juice (ships wired-but-inert — W4 fires it, never rebuilds it)

- `ScreenEffectHelper`: `shakeLight/Medium/Strong(scene)`, `createDashTrail`, `createDefaultExplosion`, `createVortex`, `showDamageNumber`.
- `BaseLevelScene` built-ins: `showDamageNumber(x,y,n,color)`, `hitStop(ms)` (≤200ms physics pause), camera `flash` on hurt, `shakeMedium` on win, knockback on contact, camera follow, `fadeIn`, the 500 ms victory delay.

## 7. What the hook exposes (so W1's `observe` stays in-bounds)

`window.__GAME__`: `ready`, `status('booting'|'playing'|'won'|'lost')`, `scene`,
`score`, `player{x,y,vx,vy,health,maxHealth,facingDirection,isDead,isGrounded}`,
`entities[]{id,type,x,y}` (types: `player|enemy|collectible|obstacle|goal|projectile`),
`snapshot()`, `commands{reset,seed,setState}`. Platformer does NOT expose the
grid/TD/ui_heavy extras (`moveCount/gold/lives/waveIndex/playerHP/enemyHP/phase`)
— those resolve to `undefined`, so W1 must not author assertions on them.
