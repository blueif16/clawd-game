# Handoff — build the remaining game-omni genre templates

_Paste everything below the line into a fresh session in `/Users/tk/Desktop/game-omni`. It is self-contained._

---

You are building the remaining **genre templates** for **game-omni**, an AI game-generation engine. The
engine is a pipeline (`.claude/workflows/game-omni.js`) whose W2 node **copies a genre template** into a
project, W4 fills it, and W5 boots it headless and asserts against `window.__GAME__`. One template
(**platformer**) is already built and proven; you build the other four so any prompt routes correctly.

## Read these first (they are the CONTRACT — match them, do not redesign them)
1. `CLAUDE.md` (project constitution — the stewardship rules) and `.agents/skill-system-map.md` (the system map).
2. `templates/README.md` — esp. **"Adding the other 4 archetypes (cheap — reuse `core/`)"**: the exact recipe.
3. `packages/skills/scaffold/template-contract.md` — THE SPEC. §3 the `window.__GAME__` accessor + the
   **per-archetype extras**, §3.3 status normalization, §6 the per-template checklist, the `gameConfig.json`
   config sub-objects (`gridConfig` / `towerDefenseConfig` / `battleConfig`).
4. `templates/modules/platformer/` — the **worked example**. Mirror its file-by-file shape (`capabilities.md`,
   `src/main.ts`, `src/gameConfig.json`, `src/scenes/{Base*Scene,Level1Scene,_Template*}`, `src/characters/`,
   `src/behaviors|systems/`). `templates/core/` is the **shared engine — DO NOT modify it** (`core/src/hook.ts`
   already reads every archetype's extras defensively, so the hook needs no change).
5. `packages/skills/write-gdd/gdd.schema.json` — what W1 hands W4 (`entities[].behaviors`,
   `mechanics[].capability`, `controls`, `config`). Your `capabilities.md` must NAME the behaviors/capabilities
   this vocabulary refers to, so W1 stays in-bounds.
6. `packages/skills/verify/assertion-execution-grammar.md` — HOW W5 boots + observes (the `ready` gate, the
   generic title-advance, the observe grammar). Your template MUST be bootable+observable exactly this way.
7. The **donor** for each archetype: `reference-repos/OpenGame/agent-test/templates/modules/<archetype>/`
   — adapt its scenes/behaviors/juice; it has everything EXCEPT the `window.__GAME__` hook + the registry
   `status` flag (the net-new wiring you add, copied from how `platformer` does it).

## What each archetype must provide (from the contract)
| archetype | movement / physics | `window.__GAME__` extras (already read by core/hook.ts) | `gameConfig.json` sub-object (example keys) |
|---|---|---|---|
| `top_down` | free 8-dir, no gravity; `player.{x,y,vx,vy,health}` | (none beyond universal) | `playerConfig` (e.g. `walkSpeed`, `dashSpeed`, `dashCooldown`) |
| `grid_logic` | discrete grid steps; `player.{gridX,gridY}` | `moveCount`, `maxMoves`, `phase` | `gridConfig` (e.g. `cellSize`, `maxMoves`, `gridWidth`, `gridHeight`) |
| `tower_defense` | enemies on fixed paths, waves | `gold`, `lives`, `waveIndex` | `towerDefenseConfig` (e.g. `startingGold`, `startingLives`, `timeBetweenWaves`) |
| `ui_heavy` | UI panels / turns, ~no arcade physics | `playerHP`, `enemyHP`, `phase` | `battleConfig` (e.g. `handSize`, `comboTiers`, `startingHP`) |

## Procedure — ONE archetype at a time (recommended order: top_down → grid_logic → tower_defense → ui_heavy)
For each archetype:
1. **Scaffold the module** under `templates/modules/<archetype>/` mirroring `platformer/`'s shape. Reuse
   `templates/core/` unchanged.
2. **Adapt the donor** (`reference-repos/OpenGame/.../modules/<archetype>/`): bring over its `Base*Scene`,
   systems (e.g. `TurnManager` / `EconomyManager` / `WaveManager`), entity bases, and juice. Add the
   **net-new wiring** the donor lacks: set the registry `status` flag at the real win/lose points, and ensure
   the archetype's extras land in `window.__GAME__` (core/hook.ts already reads them — your scenes/systems just
   need to write the registry/fields it reads; see how platformer does score+status).
3. **gameConfig.json**: universal groups (untouched: `screenSize`/`debugConfig`/`renderConfig`) + the archetype
   sub-object above.
4. **A default `Level1Scene`** that boots **ready + empty** (so the template runs standalone and W5 can boot it),
   plus `_Template*` stubs W4 copies, and a `capabilities.md`.
5. **Build green:** materialize a merged project (per `templates/README.md`: `cp -R templates/core/. /tmp/<a>/`
   then overlay `cp -R templates/modules/<archetype>/src/. /tmp/<a>/src/`), `npm install`, `npm run build` →
   exit 0. Fix scaffold-level breakage only; never tighten tsconfig.
6. **PROVE the hook + the harness:** hand-write a tiny `spec/gdd.json` with one milestone whose 2-3 assertions
   match REAL behavior of your default level (e.g. grid: a key press increments `moveCount`; TD: `gold` starts
   at N). Run the verify harness:
   `cd packages/verify && npx tsx bin/verify-milestone.ts /tmp/<a> M1` → must emit `VALIDATION_PASSED`. Then
   flip one assertion false → must emit `VALIDATION_FAILED` + a screenshot. Paste both markers.
7. **Update** `templates/README.md` (note the archetype is done) and, if you had to diverge from or extend the
   contract, append a one-line entry to the diagnostics log in `.agents/skill-system-map.md` and flag it.

## Discipline (project rules — see `CLAUDE.md`)
- **Match the canonical contract; never silently diverge.** If `template-contract.md` has a real gap/conflict,
  implement the closest faithful thing and **flag it** (it may need a Hermes edit to the contract — route it
  rather than hard-coding around it).
- **Generalize:** the module works for ANY prompt of that archetype; never hard-code one game.
- **Don't touch `core/`** unless the contract itself is wrong (then route the fix to the contract + core together,
  and re-verify platformer still builds + boots).
- **Done = builds green + boots to `ready` + hook fields live + a sample assertion PASSes and a false one FAILs**
  via `packages/verify/`. Then move to the next archetype.

Deliver: the four `templates/modules/<archetype>/` directories, each proven; `templates/README.md` updated; any
contract divergences logged. Build one, prove it, then the next — don't batch.
