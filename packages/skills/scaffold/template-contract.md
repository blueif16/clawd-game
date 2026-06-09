# Template & Hook Contract (game-omni) — the single source of truth

_Owner: **W2 Scaffold**. Status: **canonical / load-bearing**. This file resolves W1's open question (`w1-spec-research.md` §5.1, synthesis #5): the finalized `window.__GAME__` accessor contract. Evidence: `research/skills/w2-scaffold-research.md`._

Every genre template (`templates/modules/<archetype>`), the W2 scaffold step, the W4 implement step, and the W5 verify step are bound by this contract. It defines exactly THREE things every template must provide:

1. **The project layout** — the file shape W2 copies and W4 fills.
2. **The `gameConfig.json` shape** — the tunable surface W2 merges `gdd.config` into.
3. **The `window.__GAME__` accessor** — the test hook W4 populates and W5 reads. **This is the canonical, finalized version of W1's draft accessor schema. There is no other source of truth for the test hook.**

> **Who builds the templates?** The genre-template FILES are a separate product-build task (`build-plan-v1.md` Phase 1), adapting the donor modules in `reference-repos/OpenGame/agent-test/templates/modules/*`. Those donors have the layout + `gameConfig.json` but **lack `window.__GAME__`** — wiring it per §3 is the net-new work Phase 1 must do. W2 (this skill) assumes a template that satisfies this contract exists; until Phase 1 ships, W2 cannot run. See §6 for the exact checklist Phase 1 must satisfy.

---

## 1. The five archetypes (fixed enum)

`platformer · top_down · grid_logic · tower_defense · ui_heavy`. `gdd.meta.archetype` (carried from W0) selects `templates/modules/<archetype>`. The enum is closed; W2 falls back to `platformer` on a missing/unknown value.

---

## 2. Project layout (what every template provides)

A template is a runnable **Phaser 3 + Vite + TypeScript** project. Stack is PINNED (do not change): **Phaser `3.90.0`, Vite `^6`, TypeScript `~5.8`**, `phaser3-rex-plugins`; tests via Vitest + jsdom + `canvas`.

```
<project>/
  index.html              # single <div id="game-container">; loads /src/main.ts as a module
  package.json            # scripts.build = "tsc --noEmit && vite build"  (← the build-health gate)
  tsconfig.json           # LENIENT (noImplicitAny:false, strictPropertyInitialization:false,
                          #          noUnusedLocals:false, resolveJsonModule:true) — DO NOT tighten
  vite.config.js          # alias phaser → phaser/dist/phaser.js
  public/
    assets/               # static art/audio (W3 writes here; index.json paths point here)
  src/
    main.ts               # new Phaser.Game(config); SINGLE bootstrap point; wires window.__GAME__ (§3)
    gameConfig.json       # the tunable surface (§4)
    LevelManager.ts       # static LEVEL_ORDER[] + navigation (W4 fills; W2 leaves the stub)
    utils.ts
    scenes/               # Preloader, TitleScreen, UIScene, PauseUIScene, VictoryUIScene,
                          # GameCompleteUIScene, GameOverUIScene + the archetype's Base*Scene
    behaviors/  | systems/        # composable behavior components (juice ships here, inert)
    characters/ | entities/       # Base{Player,Enemy,GridEntity,Tower,...} abstract classes
```

Folder names by archetype: platformer/top_down use `behaviors/ characters/`; grid_logic/tower_defense use `systems/ entities/` (+ `towers/`); ui_heavy uses `ui/ systems/`. W2 records the actual tree in `STRUCTURE.md`.

**Rules the template (and W2) honor** _([E] onmax phaser-best-practices; OpusGameLabs; dev.to "rots")_:
- **Scenes-first**: code is organized around scenes; entities/behaviors live inside scenes. Input is **scene-owned** (entities consume input state, never attach their own listeners).
- **No new abstractions**: the `BehaviorManager` component pattern already covers composition. NO ECS for our scale, NO new singletons, NO state-on-`window` except the one sanctioned `window.__GAME__` read-only seam.
- **Preloader placeholder-fills** any `index.json` slot that has no real asset yet (generate a colored rect texture under the slot key) so the project **boots and builds with zero generated art** (W3 may lag / run in parallel).
- The **Preloader** is also the natural place to set `__GAME__.ready` precursors; `ready:true` flips on the first level scene's first interactive frame (§3).

---

## 3. The `window.__GAME__` accessor — THE TEST HOOK (canonical, finalized)

> **This supersedes the draft in `w1-spec-research.md` synthesis #5 and the `__GAME__` field list in `write-gdd/SKILL.md` §5.** Those were W1's best guess at the engine layer it did not own; this is the finalized contract. W1's assertions already target this surface (`__GAME__.player.x`, `__GAME__.status`, `__GAME__.score`, `entities.count(type==X)`, `moveCount/gold/lives/waveIndex`) — the field set below is a superset of everything W1 references, so all existing assertions remain valid.

### 3.1 What it is
`window.__GAME__` is a **thin, read-only adapter object** over the live Phaser game, set ONCE in `src/main.ts` (after `new Phaser.Game(config)`). It exposes **IDs + essential primitive fields, NOT raw Phaser/engine objects** _([E] chongdashu "Expose IDs + essential fields, not raw Phaser/engine objects")_. It is a plain object with live getters, so the SAME object works in:
- **W5 / Playwright** (real browser): `page.evaluate(() => window.__GAME__.player.x)`.
- **vitest + `Phaser.HEADLESS`** (no GPU): the seam is renderer-agnostic; `waitUntil(() => window.__GAME__.ready)`.

It must be **JSON-serializable** when snapshotted (`__GAME__.snapshot()` returns a plain object) and **deterministic** (no time/RNG leakage into observed fields beyond the game's own state).

### 3.2 The canonical field-by-field contract

```ts
window.__GAME__ = {
  // ── universal (every archetype) ───────────────────────────────────────────
  ready: boolean,          // false until the first level scene's first interactive frame, then true
  status: 'booting' | 'playing' | 'won' | 'lost',   // NORMALIZED by the hook (see §3.3)
  scene: string,           // the active level scene key (e.g. 'Level1Scene'); null before ready
  score: number,           // game.registry.get('score') ?? 0  (the registry is the single source)

  player: {                // the player entity ('player' = gdd.entities[0]); null if none yet
    x: number, y: number,  // world position (platformer/top_down/TD); see grid note below
    vx: number, vy: number,// body.velocity.x / .y  (0 for non-physics archetypes)
    health: number,        // current health/HP (maps to player.health, or playerHP for ui_heavy)
    maxHealth: number,
    // grid_logic ALSO exposes discrete coords:
    gridX?: number, gridY?: number,
    // platformer/top_down extras (present when meaningful):
    facingDirection?: 'left' | 'right',
    isDead?: boolean, isGrounded?: boolean
  } | null,

  entities: Array<{        // ALL gameplay entities incl. the player (use entities.count helper, §3.4)
    id: string,            // stable id (gdd.entities[].id when known, else generated)
    type: string,          // functional type: 'player'|'enemy'|'collectible'|'obstacle'|'goal'|'tower'|'projectile'
    x: number, y: number   // world position (grid entities also carry gridX/gridY)
  }>,

  // ── archetype extras (present ONLY for that archetype; absent/undefined otherwise) ──
  moveCount?: number,      // grid_logic: turnManager.moveCount
  maxMoves?: number,       // grid_logic: turnManager.maxMoves (-1 = unlimited)
  gold?: number,           // tower_defense: economyManager.gold
  lives?: number,          // tower_defense: scene.lives
  waveIndex?: number,      // tower_defense: waveManager.currentWaveIndex (0-based); waveNumber = +1
  playerHP?: number,       // ui_heavy: scene.playerHP   (player.health mirrors this)
  enemyHP?: number,        // ui_heavy: scene.enemyHP
  phase?: string,          // ui_heavy/grid: turnManager.phase / battle phase

  // ── methods (read-only + the few sanctioned commands) ─────────────────────
  snapshot(): object,      // a plain JSON-serializable copy of all fields above (for W5 state dumps)
  commands?: {             // OPTIONAL, sanctioned mutations W5 may use to set up a scenario:
    reset(): void,         //   restart the current level to a fresh playable state
    seed(n: number): void, //   seed RNG for determinism (no-op if the game has no RNG)
    setState(patch): void  //   apply assertion `setup.state` field→value (e.g. {status:'lost'}); used sparingly
  }
};
// Optional debug escape hatch (NOT for assertions): window.__PHASER_GAME__ = game;
```

**Field rules:**
- Reads come LIVE from the scene/registry each access (getters), so W5 always sees current state.
- `player` fields are the union appropriate to the archetype; assertions only read fields W1 declared (the GDD's per-archetype `observe` vocabulary). A field that doesn't apply is `undefined`, never throws.
- `entities[]` includes the player (so `entities.count(type==player) === 1`) and every gameplay object; it reads from the archetype's groups (`scene.enemies`, `scene.decorations`, `scene.entities`, `scene.towersGroup/enemiesGroup`).

### 3.3 `status` normalization (the hook computes ONE normalized status per archetype)

No base scene has a single `status` field — the hook derives it:

| archetype | `status:'playing'` | `status:'won'` | `status:'lost'` |
|---|---|---|---|
| platformer / top_down | level scene active, player alive | `scene.gameCompleted === true` / `onLevelComplete` fired (or `registry.get('won')`) | `player.isDead === true` / `onPlayerDeath` fired |
| grid_logic | turnManager started, no end yet | `checkWinCondition()` true / `onWinConditionMet` fired | `checkLoseCondition()` true / `onLoseConditionMet` fired |
| tower_defense | wave in progress | `scene.isVictory === true` | `scene.isGameOver === true` / `lives <= 0` |
| ui_heavy | battle phase active | `enemyHP <= 0` | `playerHP <= 0` |
| (all) | `'booting'` before `ready` | — | — |

**Implementation note for the template author (Phase 1):** the cleanest implementation is to have the base scenes set a registry flag (`registry.set('status', 'won'|'lost')`) at the exact points they currently launch `VictoryUIScene`/`GameOverUIScene`/`onWinConditionMet`/etc., and have the hook read `registry.get('status') ?? (ready ? 'playing' : 'booting')`. This keeps `status` a single normalized value W5 reads, regardless of archetype internals.

### 3.4 The `observe` mini-grammar W5 evaluates against `__GAME__`

W1's assertions use a tiny observe grammar; the hook must support exactly these read forms (W5 evaluates them; the template just needs the underlying fields):
- dot-paths: `player.x`, `player.y`, `player.vx`, `player.health`, `score`, `status`, `moveCount`, `gold`, `lives`, `waveIndex`, `playerHP`, `enemyHP`, `phase`, `player.gridX`.
- the count helper: `entities.count(type==<T>)` → `__GAME__.entities.filter(e => e.type === '<T>').length`.

If a future game needs a richer predicate, W5 owns extending the grammar; the template only owns exposing the fields above.

---

## 4. `gameConfig.json` shape + the config-merge rule

Every value is wrapped: `{ "value": X, "type": "number|boolean|string|array", "description": "..." }`. Keys are grouped under named sub-objects.

**Three UNIVERSAL groups every template has (W2 NEVER touches these):**
- `screenSize` → `width`, `height`
- `debugConfig` → `debug` (+ archetype debug flags)
- `renderConfig` → `pixelArt`

**The per-archetype game-specific sub-object (where W2 merges `gdd.config`):**

| archetype | sub-object | keys W1 may set (flat → wrapped here) |
|---|---|---|
| `platformer` | `playerConfig` | `maxHealth, walkSpeed, jumpPower, gravityY, attackDamage, hurtingDuration, invulnerableTime` |
| `top_down` | `playerConfig` | `maxHealth, walkSpeed, attackDamage, dashSpeed, dashDuration, dashCooldown` |
| `grid_logic` | `gridConfig` | `cellSize, gridWidth, gridHeight, maxMoves, animationSpeed, inputDebounceMs` |
| `tower_defense` | `towerDefenseConfig` | `startingGold, startingLives, cellSize, timeBetweenWaves, sellRefundRate` |
| `ui_heavy` | `battleConfig` | `playerMaxHP, enemyMaxHP, handSize, comboTiers` |

**The merge rule (W2):**
1. Read the GDD's flat `config:{ key:number }`.
2. For each key: if it belongs to the archetype's sub-object (table above), set `sub-object[key] = { value:<n>, type:"number", description:"<from template default or ''>" }`. **MERGE** — keep every template default for keys W1 didn't set.
3. Place under the correct sub-object only. NEVER write into `screenSize`/`debugConfig`/`renderConfig`.
4. A key not in the archetype's schema → DROP it, record `"dropped config key <k> (not in <archetype> schema)"` in `STRUCTURE.md`/`MEMORY.md`. NEVER invent a new `gameConfig` field.

---

## 5. `index.json` (asset slot manifest) + `STRUCTURE.md` (architecture map)

These are W2's two grounding artifacts; their exact schemas are committed in this skill's `index.schema.json` and in `SKILL.md` §5–6. Summary here for the contract:

- **`index.json`** (project root): the asset SLOT MANIFEST — the engine-agnostic `slot → {type,path,width,height,frames?,status}` map. Derived from `gdd.assetList[]` ∪ `gdd.entities[].assetSlot`. W3 reads it (what to generate) and writes back `path`+`status`; W4/the Preloader read it (the canonical key↔dims map). Distinct from any per-atlas Phaser JSON-Hash frame file (which W3 may produce alongside).
- **`STRUCTURE.md`** (project root): the architecture map — Controls table · Scenes · Entities (file·extends·behaviors·assetSlot) · Systems · Event/registry map · `index.json` pointer. Always written IN FULL; every file it names exists in the tree.

---

## 6. Phase-1 template-build checklist (what the template FILES must satisfy)

A `templates/modules/<archetype>` satisfies this contract iff:
- [ ] It is a Phaser 3.90 / Vite 6 / TS 5.8 project that **`npm run build` passes empty** (lenient tsconfig per §2).
- [ ] `index.html` has `<div id="game-container">`; `src/main.ts` mounts there and is the single bootstrap.
- [ ] `src/gameConfig.json` has the three universal groups + the archetype's sub-object (§4) with sensible defaults.
- [ ] The base level scene boots with the Preloader placeholder-filling any missing `index.json` slot (boots with zero real art).
- [ ] **`src/main.ts` (or a `src/hook.ts` it imports) sets `window.__GAME__` per §3** — the universal fields, the archetype `player` fields + extras, normalized `status` (via the registry-flag approach in §3.3), `entities[]` over the archetype's groups, `score` from the registry, `snapshot()`, and the `commands.{reset,seed,setState}`. `ready` flips true on the first interactive frame.
- [ ] Juice/behavior modules ship present-but-inert (wired by W4).
- [ ] A `capabilities.md` lists the behaviors/hooks the archetype provides (the API W1 constrains the GDD to; until it exists, `gameConfig.json` + `behaviors/` names are the de-facto API).

When all five archetypes pass this checklist, W2 can scaffold any GDD end-to-end.
