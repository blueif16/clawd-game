# game-omni genre templates

Buildable **Phaser 3.90 + Vite 6 + TypeScript 5.8** templates that W2 (scaffold)
copies into a project, W4 (implement) fills, and W5 (verify) boots headless and
asserts against `window.__GAME__`. See
`packages/skills/scaffold/template-contract.md` — that file is canonical.

## Layout

```
templates/
  core/                     # SHARED ENGINE — reused by ALL 5 archetypes
    package.json            #   pinned deps + build = "tsc --noEmit && vite build"
    tsconfig.json           #   LENIENT (do NOT tighten)
    vite.config.js          #   alias phaser → phaser/dist/phaser.js
    index.html              #   <div id="game-container">
    index.json              #   default asset-slot manifest (slots: [])
    public/assets/          #   W3 writes here
    src/
      main.ts               #   bootstrap + installs window.__GAME__  (KEEP seam)
      hook.ts               #   the window.__GAME__ adapter (KEEP — §3)  ← net-new
      gameConfig.json       #   universal groups (screenSize/debug/render + controlsHelp[])
      LevelManager.ts       #   LEVEL_ORDER + navigation (W4 fills LEVEL_ORDER)
      utils.ts              #   placeholder-fill + score/registry helpers (KEEP)
      scenes/
        Preloader.ts        #   reads index.json, PLACEHOLDER-FILLS pending slots
        TitleScreen.ts, UIScene.ts, PauseUIScene.ts,
        VictoryUIScene.ts, GameCompleteUIScene.ts, GameOverUIScene.ts
        BootScene.ts        #   core's standalone default level (ready, empty)
  modules/
    platformer/             # PLATFORMER-SPECIFIC (overlays core)
      capabilities.md       #   the API W1 constrains the GDD to
      src/
        main.ts             #   registers Level1Scene (overlays core/main.ts)
        gameConfig.json     #   universal groups + playerConfig (§4)
        utils.ts            #   core helpers + platformer helpers (overlays core/utils.ts)
        scenes/
          BaseLevelScene.ts #   KEEP engine: programmatic platforms, win/lose seam, hitStop
          Level1Scene.ts    #   the empty-but-playable default level (ships boot-ready)
          _TemplateLevel.ts #   COPY stub for W4
        characters/
          BasePlayer.ts, BaseEnemy.ts, PlayerFSM.ts   # KEEP engine (EXTEND)
          _TemplatePlayer.ts, _TemplateEnemy.ts        # COPY stubs for W4
        behaviors/          #   KEEP engine — PlatformerMovement, MeleeAttack,
                            #   RangedAttack, PatrolAI, ChaseAI, SkillBehavior(+9),
                            #   ScreenEffectHelper, BehaviorManager (COMPOSE)
```

## How W2 scaffolds a project (the merge)

1. `cp -R templates/core <project>` (recursive, no-clobber).
2. Overlay the archetype module ON TOP: `cp -R templates/modules/<archetype>/src/. <project>/src/`
   and `cp templates/modules/<archetype>/public/* <project>/public/` if present.
   The module's `main.ts`, `utils.ts`, `gameConfig.json`, `scenes/`,
   `characters/`, `behaviors/` take precedence (they reference the core engine
   files that stay: `hook.ts`, `LevelManager.ts`, `scenes/Preloader.ts`, the UI
   scenes).
3. Merge `gdd.config` into `src/gameConfig.json` (per §4).
4. Derive `index.json` at the project root (per §5); W3 fills it.
5. `npm install` (once) + `npm run build` → must exit 0.

> The empty merged project BUILDS GREEN and BOOTS TO READY with ZERO generated
> art (the Preloader placeholder-fills every `index.json` slot). Verified for the
> platformer module: `window.__GAME__.ready` flips true on the first interactive
> frame; `player.x/y/vx/vy/health`, `entities[]`, `status`, `score`, `snapshot()`,
> and `commands.{reset,seed,setState}` are all live.

## KEEP vs fill (the W4 boundary)

- **KEEP (engine — W4 must NOT edit):** `hook.ts`, `main.ts` (seam; W4 only adds
  scene registrations under the marked line), `utils.ts`, `behaviors/*`,
  `Base*.ts` (`BaseLevelScene`, `BasePlayer`, `BaseEnemy`), `PlayerFSM.ts`,
  the core UI scenes, `Preloader.ts`, `LevelManager.ts` (W4 only fills `LEVEL_ORDER`).
- **W4 fills:** COPY `_Template*` → real scene/entity files; EXTEND `Base*`;
  COMPOSE `behaviors`; override opt-in hooks; set `score`/`status` at the real
  win/lose points (already wired in `BaseLevelScene`).

## Adding the other 4 archetypes (cheap — reuse `core/`)

Each new `modules/<archetype>/` ships ONLY: its `main.ts` (overlay), its
`gameConfig.json` (universal groups + the archetype sub-object), its `utils.ts`
(re-export core helpers + archetype helpers), its `scenes/Base*Scene` + win/lose
seam, its entity bases, its systems, a `Level1Scene` default, the `_Template*`
stubs, and `capabilities.md`. `core/hook.ts` already reads the archetype extras
(`moveCount/gold/lives/waveIndex/playerHP/enemyHP/phase`) defensively, so the
hook needs no change.
