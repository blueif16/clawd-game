---
name: scaffold
description: "W2 SCAFFOLD (Coder, third node). Turn spec/gdd.json into a RUNNING, EMPTY Phaser/Vite/TS project: copy templates/modules/<archetype>, merge gdd.config into gameConfig.json, derive index.json (asset slots + dims), write STRUCTURE.md (the architecture map), ensure window.__GAME__ is exposed per the template contract, and pass the BUILD-HEALTH gate (npm run build). Owns the template/engine contract the whole pipeline reads. Writes the project + index.json + STRUCTURE.md (+ MEMORY.md notes)."
version: 1.0.0
node: W2
role: Coder
argument-hint: "(reads spec/gdd.json from the project dir; archetype is gdd.meta.archetype)"
allowed-tools: Read, Write, Edit, Bash
metadata:
  reads: spec/gdd.json
  writes: [project files (copied template), gameConfig.json (merged), index.json, STRUCTURE.md, MEMORY.md]
  schema: index.schema.json
  contract: template-contract.md
  archetypes: [platformer, top_down, grid_logic, tower_defense, ui_heavy]
---

# W2 — Scaffold an empty, building Phaser project from the GDD

You are the **third node** in the game-omni pipeline (role: Coder). You receive the upstream
artifact **`spec/gdd.json`** (written by W1) and produce a **RUNNING, EMPTY Phaser/Vite/TS
project** — copied from the chosen genre template, building green, with NO game logic yet —
plus the two grounding files the rest of the pipeline reads: **`index.json`** (asset slots) and
**`STRUCTURE.md`** (the architecture map). You also ensure the template exposes the
**`window.__GAME__`** test hook. Every later node reads these on-disk artifacts — they ARE the
contract, not your chat output.

Your job has exactly six parts, in this order:
1. **Absorb** `spec/gdd.json` — archetype, config, entities, assetList, controls are your inputs.
2. **Merge** the template into the project: copy shared `templates/core/`, then overlay `templates/modules/<archetype>/` on top (module wins) — the empty starter. (§2)
3. **Merge** `gdd.config` into `gameConfig.json` (flat → `{value:X}`, correct sub-object; infra untouchable) + copy `gdd.controls[]` into `gameConfig.controlsHelp` (the on-screen "how to play").
4. **Derive** `index.json` — every asset slot + dims from `assetList` ∪ `entities[].assetSlot`.
5. **Write** `STRUCTURE.md` — the scenes/entities/systems/controls map (always in full).
6. **Ensure** `window.__GAME__` is exposed per `template-contract.md`, then pass **BUILD-HEALTH** (`npm run build`).

Do these, write the artifacts, stop. You are a Coder who delivers a buildable empty shell + the
grounding files — **NOT** a game implementer. Do NOT write game logic, level layouts, entity
behavior, or assets (those are W3/W4). _([repo] godogen `scaffold.md`: "Defines what exists and
how it connects — not behavior.")_

> **Doctrine — scaffold the SHAPE; W4 fills it.** AI codegen rots when the model designs the
> shape *and* fills it in one go; it excels at filling a shape someone else designed. W2 designs
> the shape (the copied module skeleton + `STRUCTURE.md`'s per-file contract) so W4 fills a
> designed container, not a blank file. _([E] dev.to "Why Your Claude Code Rots": "Claude is
> excellent at filling in a shape… much weaker at designing the shape"; pipeline P2.)_

> **The contract you OWN.** `template-contract.md` (next to this skill) is the single source of
> truth for the project layout, `gameConfig.json` shape, and the **finalized `window.__GAME__`
> accessor**. It resolves W1's open question about the engine layer. Read it; honor it exactly.

---

## 1. ABSORB THE GDD (your hard inputs)

Read `spec/gdd.json` (relative to the project dir). It validates against
`write-gdd/gdd.schema.json`. The fields you use:

| field | how you use it |
|---|---|
| `meta.archetype` | **Selects the template lane.** Copy `templates/modules/<archetype>` (§2). Fixed enum. |
| `meta.physicsProfile` | Confirms engine params; feeds the config merge sanity-check (gravity only for platformer). |
| `meta.title` | Set `package.json.name` (slugified) and the `STRUCTURE.md` heading. |
| `config` | **Flat tuning numbers → `gameConfig.json`** (§3). Merge, don't replace. |
| `entities[]` | The entity→file map + behaviors in `STRUCTURE.md` (§5); `assetSlot` feeds `index.json` (§4). |
| `assetList[]` | **The asset slots** → `index.json` rows (§4). Empty array is valid. |
| `controls[]` | The input wiring table in `STRUCTURE.md` (§5) **AND** the on-screen "how to play" — copied verbatim into `gameConfig.controlsHelp` so the running game can render the controls (§3.1). |
| `mechanics[]` / `winCondition` / `loseCondition` / `milestones[]` | Context for `STRUCTURE.md`'s event map; you do NOT implement them (that's W4). |

You do NOT design anything new. Everything you scaffold traces to a GDD field. If a GDD field
references a capability the template lacks, that is a W1 error — note it in `MEMORY.md`, scaffold
the nearest real thing, never invent a template file.

---

## 2. COPY THE TEMPLATE (the empty starter)

> Source pattern: `OpenGame/.../tools/copy-template.ts` (recursive `fs.cp`, never clobber) +
> `agent-game-forge/.../bootstrap.ts` (write-if-missing, one genre per project).

- **Merge two layers — copy the shared `core/` FIRST, then overlay the archetype module ON TOP (the
  module WINS on conflict).** The templates ship as a shared `templates/core/` (engine reused by all
  five archetypes) + a thin `templates/modules/<archetype>/` overlay. Canonical sequence (see
  `templates/README.md` "How W2 scaffolds a project"):
  1. `cp -R templates/core/. <project>/` — the engine: `hook.ts`, `Preloader.ts`, UI scenes,
     `LevelManager.ts`, build config (`package.json`/`tsconfig.json`/`vite.config.js`/`index.html`).
  2. Overlay the module so ITS files take precedence: `cp -R templates/modules/<archetype>/src/. <project>/src/`
     then `cp templates/modules/<archetype>/public/*` if present. The module's `main.ts`, `utils.ts`,
     `gameConfig.json`, `scenes/`, `characters/`, `behaviors/` MUST overwrite core's (they reference the
     core engine files that stay). The module is copied SECOND precisely so it wins — **do NOT use
     no-clobber for the module overlay**, or the project boots core's empty default scene instead of the
     archetype's. (No-clobber applies only to not overwriting artifacts already written THIS run, e.g. a
     re-scaffold.) The project carries ONLY its chosen archetype — never all five.
  _([repo] copy-template `force:false`; bootstrap "one genre per project"; canonical merge `templates/README.md`.)_
- Set `package.json.name` to a slug of `meta.title`.
- Do NOT run `npm install` if `node_modules` already exists (templates ship pinned deps); if the
  build step needs deps and they're missing, run `npm install` once.
- After copying, the project is the **canonical layout** in `template-contract.md` §2:
  `index.html(#game-container)`, `src/{main.ts, gameConfig.json, LevelManager.ts, scenes/,
  behaviors|systems/, characters|entities/}`, `public/assets/`. Leave `LevelManager.LEVEL_ORDER`
  as the stub (W4 fills it).

**Edge — missing/unknown archetype:** if `templates/modules/<archetype>` does not exist, fall back
to **`platformer`** (richest, safest — mirrors W0's empty-prompt default), and record
`"archetype <x> template missing → fell back to platformer"` in `MEMORY.md`. Never fail to produce
a project. _([repo] W0 platformer fallback; copy-template default-on-missing.)_

---

## 3. MERGE `gdd.config` INTO `gameConfig.json` (flat → wrapped, correct sub-object)

> Source pattern: `OpenGame/.../generate-gdd.ts` §2 "MERGE, never delete infrastructure fields" +
> the actual `gameConfig.json` shape across all five modules (`{value,type,description}` wrapper,
> named sub-objects). Full rule: `template-contract.md` §4.

The GDD gives flat `config:{ key:number }`. The template's `gameConfig.json` wraps every value as
`{ "value":X, "type":"...", "description":"..." }`, grouped under named sub-objects.

**Do this:**
1. Read the template's `src/gameConfig.json`.
2. For each `key:value` in `gdd.config`, find the archetype's game-specific sub-object and key:

   | archetype | sub-object | valid keys |
   |---|---|---|
   | `platformer` | `playerConfig` | maxHealth, walkSpeed, jumpPower, gravityY, attackDamage, hurtingDuration, invulnerableTime |
   | `top_down` | `playerConfig` | maxHealth, walkSpeed, attackDamage, dashSpeed, dashDuration, dashCooldown |
   | `grid_logic` | `gridConfig` | cellSize, gridWidth, gridHeight, maxMoves, animationSpeed, inputDebounceMs |
   | `tower_defense` | `towerDefenseConfig` | startingGold, startingLives, cellSize, timeBetweenWaves, sellRefundRate |
   | `ui_heavy` | `battleConfig` | playerMaxHP, enemyMaxHP, handSize, comboTiers |

3. **Set** `sub-object[key].value = <gdd value>` (keep the existing `type`/`description`; if the key
   is new to the sub-object, add `{value, type:"number", description:""}`). **MERGE**: every
   template default for keys W1 did NOT set stays as-is.
4. **NEVER touch** `screenSize`, `debugConfig`, `renderConfig` (the universal infra groups).
5. **A key not in the archetype's schema → DROP it**, and record
   `"dropped config key '<k>' (not in <archetype> gameConfig schema)"` in `STRUCTURE.md` (Notes) and
   `MEMORY.md`. **Never invent a new `gameConfig` field.** _([repo] generate-gdd "do not invent".)_

### 3.1 Carry `gdd.controls`, the spec's `failModel`, and `winCondition.description` into the runtime via `gameConfig`

> The running game bundles ONLY `src/gameConfig.json` — it does NOT import `spec/gdd.json`. So the
> documented controls must ride into the build through `gameConfig.json`, or a first-time player has
> no way to learn the inputs. The template's `TitleScreen` renders a generic "HOW TO PLAY" panel from
> this group; if it is empty/absent it renders nothing. _(P4: playtester "couldn't understand how to
> play" — the GDD declared the controls but they never surfaced in the game.)_

After the config merge above, also populate the `controlsHelp` group (it already exists in every
template `gameConfig.json` as `[]`):
1. Set `gameConfig.controlsHelp` = a **copy of `gdd.controls[]`** — each entry **`{ "input": <string>,
   "action": <string> }`** (the exact GDD `controls[]` shape; a plain ARRAY, NOT the
   `{value,type,description}` wrapper — it is a list, not a tuning number). Generic across archetypes:
   copy WHATEVER controls W1 declared (platformer arrows/jump, top_down WASD, grid moves, TD placement,
   ui_heavy clicks) verbatim — **never hard-code one game's keys**.
2. **Empty/absent `gdd.controls`** → leave `controlsHelp` as `[]` (the template renders nothing,
   gracefully). Do not invent controls.
3. This is the ONE new `gameConfig` group W2 adds; it is NOT a `screenSize`/`debugConfig`/`renderConfig`
   infra group and does not feed engine params — it is the player-facing controls hint only.
4. Set `gameConfig.failModel` = the spec's `meta.failModel` VERBATIM (when scaffolding from a frozen
   blueprint, `blueprint.meta.failModel`, falling back to `gdd.meta.failModel`; missing in both →
   leave the template default and record it in MEMORY.md). Plain string, not the `{value,…}` wrapper.
   This is the HUD-selection seam: the template UIScene shows the health bar IFF 'health', a lives
   readout IFF 'lives', and no depleting-resource widget for 'respawn'/'none'. Never invent a value.
5. Set `gameConfig.objective` = `winCondition.description` VERBATIM (missing → `""`). The
   TitleScreen/UIScene render it as the one-line GOAL — the objective-legibility twin of
   controlsHelp (a player must learn WHAT to do, not only WHICH keys). Do not author new prose.

Write the merged `gameConfig.json` back. Validate it is still valid JSON.

---

## 4. DERIVE `index.json` (the asset slot manifest — the W2→W3→W4 handoff)

> Source pattern: `generate-gdd.ts` Asset Registry + `[E]` feliperyba `TEXTURE_KEY` registry +
> pixijs manifest/bundles + `[Y]` Chong-U "the single index.json file ensures correct dimensions
> and all assets working every time, otherwise it re-parses public/ over and over." Schema:
> `index.schema.json` (next to this skill). Full rule: `template-contract.md` §5.

`index.json` is the **engine-agnostic asset SLOT MANIFEST** — the single source of truth for asset
keys + dims so W3 (generation) and W4/the Preloader (code) agree without re-scanning `public/`. It
is NOT a Phaser JSON-Hash atlas file (that's a per-atlas frame file W3 may produce alongside).

**Build the slot list = `gdd.assetList[]` UNION any `gdd.entities[].assetSlot` not already covered:**
1. One row per `assetList[]` entry → `{ slot, type, path, width, height, frames?, entityIds?, description, status:"pending" }`.
   - `path` = a conventional default (e.g. `sprites/<slot>.png`, `tiles/<slot>.png`, `backgrounds/<slot>.png`, `audio/<slot>.mp3` by `type`). W3 confirms/overwrites when it writes the file.
   - `width`/`height` = `assetList[].width/height` if present, else an **archetype default HINT** (see below) W3 may refine.
   - `frames` = `assetList[].frames` for `type:"animation"`; omit otherwise.
   - `entityIds` = the `entities[].id`s whose `assetSlot` == this slot (provenance).
   - `description` = `assetList[].description` (W3's generation prompt).
2. For every `entities[].assetSlot` NOT already a slot, add a row with `type:"sprite"`,
   `description` from the entity's `description`, `entityIds:[that id]`, default dims, `status:"pending"`.
3. **Empty `assetList` AND no `entities[].assetSlot`** → write `slots: []` (valid). The template
   Preloader placeholder-fills nothing; the game still boots (programmatic shapes). Record the
   empty-asset case in `MEMORY.md`.

**Archetype default dims (hints only — W3 may overwrite and write back):**
- platformer/top_down sprite 64×64 (player display-height 128), tile/tileset 64×64, background = `screenSize` (1152×768).
- grid_logic sprite = `gridConfig.cellSize`×`cellSize` (default 64×64).
- tower_defense sprite/tower 64×64 (tower_defense `cellSize`), enemy 48×48.
- ui_heavy card 180×240, portrait/bust 256×256, background 1024×768.

Write `index.json` at the **project root**. Set `archetype` and `assetsDir:"public/assets"`.
Validate against `index.schema.json`.

---

## 5. WRITE `STRUCTURE.md` (the architecture map — always in full)

> Source pattern: `godogen/.../scaffold.md` ("STRUCTURE.md — Complete architecture reference.
> Always written in full, even for incremental updates… Architecture graph… No descriptions, no
> requirements, no task ordering") + `gamestudio engine_configs` structure-as-config + `[E]`
> living-architecture / structure-map ("every module must resolve to an actual folder") + dev.to
> "rots" ("design the interface before generating").

`STRUCTURE.md` is the per-file CONTRACT W4 fills — "what each file is responsible for." It is the
anti-rot lever. **Always write it COMPLETE; never a diff. Every file it names must exist in the
tree, and every gameplay src file should be named.** Shape (ported from godogen to web/Phaser):

```markdown
# <title>

## Archetype & Stack
<archetype> · Phaser 3.90 / Vite 6 / TypeScript · perspective <side|top_down|none>

## Controls (input wiring)
| Input | Action |  (from gdd.controls[] — DOM/Phaser key names so W5 can fire them)
|---|---|
| ArrowLeft | move left |
| ArrowUp | jump |

## Scenes
| Scene (file) | Role | Children / launches |
|---|---|---|
| Preloader (src/scenes/Preloader.ts) | load assets (index.json) + placeholder-fill | TitleScreen |
| Level1Scene (src/scenes/Level1Scene.ts) | TODO-W4: extends Base<Archetype>Scene; the playable level | UIScene |
| UIScene / GameOverUIScene / VictoryUIScene | HUD / end screens (template) | — |

## Entities (entity → file → behaviors → asset)
| id | role | file (TODO-W4) | extends | behaviors | assetSlot |
|---|---|---|---|---|---|
| player | player | src/characters/Player.ts | BasePlayer | PlatformerMovement | player |
| coin | collectible | src/characters/Coin.ts | (sprite) | — | coin |
(rows from gdd.entities[]; player is entities[0])

## Systems
<the archetype's systems: behaviors/ or systems/ — BehaviorManager, TurnManager, EconomyManager, WaveManager, etc. — present in the template, wired by W4>

## State & Event Map
- score → game.registry 'score' (set by W4; __GAME__.score reads it)
- status → game.registry 'status' ('playing'|'won'|'lost'); normalized for __GAME__ (template-contract §3.3)
- win: <winCondition.observable>   ·   lose: <loseCondition.observable>
- key events: scoreChanged, moveCountChanged, goldChanged, hpChanged (template scene events)

## Test hook
window.__GAME__ exposed in src/main.ts per template-contract.md §3 (ready/status/scene/player/score/entities + archetype extras).

## Assets
See index.json (N slots). public/assets/ ; Preloader placeholder-fills 'pending' slots.

## Build
npm run build  (tsc --noEmit && vite build) — passes empty.

## Notes
<config keys dropped, archetype fallbacks, empty-assetList, any quirk — also mirrored in MEMORY.md>
```

Mark W4's fill-in points with `TODO-W4:` so the next node knows exactly what to implement and where.

---

## 6. ENSURE `window.__GAME__` + PASS BUILD-HEALTH

### 6a. Ensure the test hook
`template-contract.md` §3 is the canonical, finalized `window.__GAME__` accessor (it supersedes
W1's draft). **A conformant template already wires it in `src/main.ts`** (the Phase-1 build
requirement). Your job here is to VERIFY, not author game logic:
- Confirm `src/main.ts` (or a `src/hook.ts` it imports) sets `window.__GAME__` with the universal
  fields (`ready, status, scene, player, score, entities[]`) + the archetype extras
  (`moveCount/gold/lives/waveIndex/playerHP/enemyHP`) + `snapshot()` + `commands`.
- If the template is missing or has an incomplete hook, ADD the thin adapter in `src/main.ts` per
  the contract (read-only getters over the live scene + registry; **IDs + primitives, never raw
  Phaser objects** _([E] chongdashu "expose IDs not engine objects")_; `status` normalized per
  §3.3; `score` from `game.registry.get('score') ?? 0`). This is the ONE place W2 may write engine
  glue — and only the seam, never gameplay.
- Record in `STRUCTURE.md` "## Test hook" that `__GAME__` is exposed.

### 6b. BUILD-HEALTH gate (the done-criteria)
> Source pattern: `godogen/.../scaffold.md` build-as-done-gate ("if the build reports a mismatch,
> STOP and fix it first") + `templates/core/package.json` `build = tsc --noEmit && vite build`.

Run **`npm run build`** in the project dir. It must succeed (`tsc --noEmit && vite build`, exit 0).
- **PASS** → W2 is done. The artifacts (`gameConfig.json`, `index.json`, `STRUCTURE.md`, the
  building project) are on disk.
- **FAIL** → this is a HARD gate. Read the error; fix ONLY scaffold-level problems (a malformed
  `gameConfig.json` merge, a broken import you introduced, a missing dep → `npm install`). Do NOT
  paper over it by deleting files or stubbing out the template. If the build cannot be made green
  with scaffold-level fixes, record the exact error in `MEMORY.md` and **surface the failure** —
  do not report success. A red build is a real failure, never silently passed.
- Do NOT tighten `tsconfig.json` to "fix" type errors — the lenient config is intentional so the
  empty scaffold (abstract bases + `import gameConfig.json`) compiles. Tightening it is a bug.

---

## 7. EDGE & FAILURE HANDLING

- **Template module missing/unknown archetype** → fall back to `platformer`; note in `MEMORY.md`. Never fail to produce a project. (§2)
- **Empty `assetList[]`** → still derive `index.json` slots from `entities[].assetSlot`; if none, write `slots:[]`. The template still boots (placeholder/programmatic shapes). Note in `MEMORY.md`. (§4)
- **`gdd.config` key not in the archetype schema** → DROP it; record in `STRUCTURE.md` Notes + `MEMORY.md`. Never invent a `gameConfig` field. (§3)
- **`gdd.config` empty / absent** → leave the template `gameConfig.json` defaults untouched (a valid scaffold). Note that defaults are in effect.
- **physicsProfile mismatch** (e.g. `hasGravity:true` on a non-platformer) → trust the archetype's template (it already has the right physics); note the mismatch in `MEMORY.md` for W1's benefit. Do not hand-edit engine physics.
- **`gameConfig.json` invalid after merge** → you broke it; re-merge carefully (it must stay valid JSON with the `{value,...}` wrapper). The build will also catch this.
- **BUILD-HEALTH red and unfixable at scaffold level** → record the error in `MEMORY.md` and surface failure (§6b). Do not report success on a red build.
- **`window.__GAME__` absent and the template can't be made to expose it** → add the thin adapter in `main.ts` per the contract (§6a); if even that fails to build, treat as a build-health failure.

## 8. THE ARTIFACTS YOU WRITE / TOUCH

Relative to the project dir:
- The **copied project** (template module + core shell) — empty, building.
- **`src/gameConfig.json`** — merged (`gdd.config` wrapped into the archetype sub-object; infra untouched) + `controlsHelp`, `failModel`, `objective` populated from the spec (§3.1).
- **`index.json`** (project root) — the asset slot manifest (valid against `index.schema.json`).
- **`STRUCTURE.md`** (project root) — the architecture map, written in full.
- **`src/main.ts`** — verified/ensured `window.__GAME__` per `template-contract.md` §3 (seam only).
- **`MEMORY.md`** (project root, append) — quirks/discoveries/dropped-keys/fallbacks for W4 (create if absent). _([repo] godogen/CCGS state-file convention.)_

Do NOT write: level scenes, entity behavior, asset files, or `spec/*` (those are W4/W3/W1).

## 9. PI-PORTABILITY NOTE (for the workflow author)
This node is a single `agent()` call with deterministic, schema-shaped outputs. The **archetype is
a fixed five-value enum**, so the template-copy lane is statically known from `gdd.meta.archetype`
— the pipeline routes on a read of the artifact, not hidden model state (pipeline §7). `index.json`
is the second discovered-once list (W3 fans over its `slots[]`); the milestone list (W1) is the
first. Both are bounded and recorded as clean finite lanes for the extractor. The BUILD-HEALTH gate
is a `Bash` step (`npm run build`) the script can assert on (exit 0) independent of model output.
Keep temperature low — scaffolding wants determinism (copy + merge + map), not creativity.
