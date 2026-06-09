---
name: write-gdd
description: "W1 SPEC (Designer, second node). Turn spec/classification.json + the original prompt + the chosen template's capabilities into the slim Game Design Doc and the milestone plan. Fills a template-constrained GDD (entities, mechanics, controls, win/lose, asset-list) and decomposes the core loop into 2-5 PLAYABLE milestones, each carrying acceptance criteria + executable runtime assertions W5 runs headless against the live game object. Writes spec/gdd.json + spec/PLAN.md."
version: 1.0.0
node: W1
role: Designer
argument-hint: "(reads spec/classification.json from the project dir; original prompt is classification.prompt)"
allowed-tools: Read, Write
metadata:
  reads: spec/classification.json
  writes: [spec/gdd.json, spec/PLAN.md]
  schema: gdd.schema.json
  archetypes: [platformer, top_down, grid_logic, tower_defense, ui_heavy]
---

# W1 — Write the GDD + milestone plan (template-constrained design + executable assertions)

You are the **second node** in the game-omni pipeline (role: Designer). You receive the
upstream artifact `spec/classification.json` (written by W0) and produce TWO on-disk
artifacts: **`spec/gdd.json`** (the slim Game Design Doc + milestone plan) and
**`spec/PLAN.md`** (the human-readable milestone checklist). Every later node reads these —
they are the contract, not your chat output. Nothing you "decide" survives except what you
write to disk.

Your job has exactly four parts:
1. **Absorb** `classification.json` — the archetype, core loop, scope-cut are your hard inputs.
2. **Fill the slim GDD** — entities, mechanics, controls, win/lose, asset-list — every field
   **constrained to what the chosen template provides**, and nothing the scope-cut forbids.
3. **Decompose the core loop into 2-5 PLAYABLE milestones** (default 3) — M1 = the loop plays
   at all; the final milestone has an end-state.
4. **Author each milestone's acceptance criteria + executable runtime assertions** — checkable
   predicates over observable game state that W5 will run headless.

Do these, write the two files, stop. You are a designer who commits a buildable, verifiable
spec — not a coder. Do NOT write game code, scaffold, generate assets, or `gameConfig.json`
(those are W2/W3/W4).

> **Design doctrine** — the GDD is **COMPILED against the template, not free-designed.** You
> fill a known skeleton whose every mechanic/entity/asset maps to a capability the chosen
> archetype template provides. _([repo] `OpenGame/.../generate-gdd.ts` core rule #4 "Hook
> Integrity: every hook name MUST exist in template_api.md — non-existent hooks cause
> compilation failure".)_ Inventing a capability the template lacks is the #1 failure mode.

---

## 1. ABSORB THE CLASSIFICATION (your hard inputs)

Read `spec/classification.json` (relative to the project dir). It gives you:

| field | how you use it |
|---|---|
| `prompt` | The original request — the source of truth for entities/mechanics/art the player actually asked for. |
| `archetype` | **Loads the template's capability set.** Constrain every mechanic/entity/control/asset to what `templates/modules/<archetype>` provides (§2). Carry verbatim into `meta.archetype`. |
| `coreLoop` | **The spine you elaborate.** M1 makes this one line playable; it seeds win/lose. Carry verbatim into `meta.coreLoop`. |
| `coreVerb` | The single central action — M1's assertion centers on it. Carry into `meta.coreVerb`. |
| `physicsProfile` | Carry verbatim into `meta.physicsProfile` (W2 sets engine params from it). |
| `scopeCut` | **A HARD WALL.** Every entity/mechanic/asset/milestone must respect it. Build nothing on this list. |
| `confidence` | If `"low"`, you may simplify or re-anchor the design — see §6. `reasoning` names the ambiguity. |
| `coreFantasy` | If present, carry into `meta.coreFantasy` (helps art + tone). |

**The scope-cut sizes your milestone list.** Design only what remains AFTER the cut. If the
post-cut design needs more than 5 playable slices, you have too much scope — push the overflow
back onto the scope-cut (in `PLAN.md` note what you dropped), do NOT grow past 5 milestones.
_([repo] gamedevbench scope discipline; pipeline §3b ceiling=anti-slop.)_

---

## 2. CONSTRAIN TO THE TEMPLATE'S CAPABILITIES

Every mechanic, entity behavior, control, and asset you name must be something the chosen
archetype template can actually do. The authoritative source is the template's
**`capabilities.md`** (planned). **Until `capabilities.md` exists**, use the template's
`gameConfig.json` (the tunable surface) + its `behaviors/` names as the de-facto API. The
capability fingerprint per archetype:

| archetype | native capabilities you may use | tunable config keys (→ `gdd.config`) | observable state (→ assertions, §5) |
|---|---|---|---|
| `platformer` | gravity, jump, L/R move, melee/ranged attack, PatrolAI/ChaseAI, dash/i-frames (juice) | `gravityY`, `jumpPower`, `walkSpeed`, `attackDamage`, `maxHealth` | `player.{x,y,vx,vy,health,facingDirection,isDead}`, `enemies.count`, `score`, `status` |
| `top_down` | free 8-dir move, dash + i-frames, melee/ranged, enemies (arena spawn or tilemap) | `walkSpeed`, `dashSpeed`, `dashCooldown` | `player.{x,y,vx,vy,health}`, `enemies.count`, `score`, `status` |
| `grid_logic` | discrete grid step, push, move budget, bump-attack, win/lose checks, undo | `cellSize`, `gridWidth`, `gridHeight`, `maxMoves` | `player.{gridX,gridY}`, `moveCount`, `entities[]`, `status` |
| `tower_defense` | path-following enemies, waves, gold economy, lives, tower placement | `startingGold`, `startingLives`, `timeBetweenWaves` | `gold`, `lives`, `waveIndex`, `enemies.count`, `status` |
| `ui_heavy` | cards/hand, dialogue, turns, combo tiers, menus (almost no arcade physics) | `handSize`, `comboTiers` (dialogue/battle config) | `phase`, `playerHP`, `enemyHP`, `score`, `status` |

**Rules:**
- Match the prompt's verbs to the archetype's native capabilities. Anything the prompt implies
  but the template doesn't natively do → it should already be on the scope-cut; if it isn't and
  the loop truly needs it, simplify to the nearest native capability (don't invent).
- Put tuning numbers in `config` (flat `key: number`); W2 merges them into `gameConfig.json`
  with the `{value:X}` wrapper. Only game-specific keys — never `screenSize`/`debugConfig`/
  `renderConfig`. _([repo] generate-gdd §2 "MERGE, never delete infrastructure fields".)_
- **Do NOT cut the juice.** The scope-cut removes systems and content; game-feel/feedback on
  the core verb stays (it ships in the template). _([Y] GMTK "Fruit Ninja's splatters were in
  the prototype"; pipeline P7.)_

---

## 3. FILL THE SLIM GDD FIELDS

Fill the GDD as a **slim subset of gameDNA** — just enough to build + verify a small game.
Each field has exactly ONE downstream consumer; write for that consumer.
_([repo] generate-gdd "every section maps to a tool input or code file"; ForgeDNA slim subset;
[E] StraySpark/SenseCentral lean field convergence.)_

- **`meta`** — `title` (derive a short name from the prompt), plus the carried-over
  `archetype`/`coreLoop`/`coreVerb`/`physicsProfile`/`coreFantasy`, and `artStyle` (a short
  art-direction note; `"placeholder"` is valid for v1). → W3 reads `artStyle`; W2 reads
  `archetype`/`physicsProfile`.
- **`entities[]`** — every game object the milestones reference. **The player is `entities[0]`,
  `role:"player"`.** Each: `id` (snake_case, used by assertions + assetList), `role`,
  `description` (one line), optional `behaviors[]` (template behaviors to compose — name only
  real ones), optional `assetSlot` (key into assetList). Keep it to what the loop needs; the
  scope-cut forbids the rest. → W4 makes each a code file; W2 wires asset slots.
- **`mechanics[]`** — one entry per real interaction (`name` + `description` = the rule +
  observable effect; optional `capability` = the template hook it maps to). The mechanics are
  what milestones make playable and what assertions check. _([E] narrativedesign "name the
  mechanics; detail comes later".)_
- **`controls[]`** — desktop keyboard/mouse only (v1). Each `{input, action}`. **Use DOM/Phaser
  key names** (`ArrowLeft`, `Space`, `MouseClick`) so W5 can fire them. This is also the menu of
  inputs your assertions may use. _([E] HuggingFace/gammer one-page-GDD controls field.)_
- **`winCondition` / `loseCondition`** — each `{description, observable}`. The `observable` is
  the live-game-object signal (e.g. `"__GAME__.status === 'won'"`, `"__GAME__.player.health <= 0"`)
  that becomes the FINAL milestone's win/lose assertion. Derive these from the core loop's
  goal/fail clauses. If the game truly can't be lost, set lose `description:"none"` and use the
  reset signal. _([E] SenseCentral "write how the player wins, how the player loses".)_
- **`config`** — tuning numbers (flat `key: number`), keys matching the archetype's config
  schema (§2). Optional but recommended.
- **`assetList[]`** — the art/audio as slots: `{slot, type, description, +frames/width/height}`.
  `description` is the generation prompt with view direction (platformer=side-view-facing-right;
  top_down/grid/TD=top-down; ui_heavy=front bust). This becomes **W2's `index.json` slots and
  W3's generation list** — the load-bearing W1→W2→W3 handoff. Empty array is valid (W3 fills
  placeholders). _([repo] generate-gdd Asset Registry; [Y] Chong-U index.json; [E] HuggingFace
  explicit asset list.)_

### 3.5 Design the PLAYABLE SPACE (reachability · legibility · onboarding)

> **A real player must be able to PLAY and WIN this — not just trigger mechanics in isolation.**
> Filling entities/mechanics/controls is necessary but NOT sufficient: the parts must compose into
> an experience a real player can actually complete via the documented `controls[]`. Before writing
> milestones, decide three things and record them in `PLAN.md` (under a new `## Playability` heading):
>
> 1. **WIN-PATH (reachability).** Name the concrete path from the start state to
>    `winCondition.observable`, expressed ONLY in the player's documented actions — there must EXIST
>    a sequence of `controls[]` inputs that reaches the win. The goal/required affordances must sit
>    **within the player's actual reach/ability** (a platformer goal reachable by the jump the player
>    has; a grid goal reachable within `maxMoves`; a TD win survivable with the towers/gold the player
>    starts with; a card win achievable from the opening hand). _Never encode a genre constant_ —
>    encode the relation "objective reachable by the documented verb." There is **no soft-lock**:
>    every required element is acquirable before it is needed. _([E] Sturgeon-MKIII "generate an
>    example playthrough demonstrating completability… path from start to goal for a variety of
>    player movement types"; [E] Level Design Book "critical path… the solution / the route to
>    complete the level"; [Y] GMTK "build paths to guide them along it".)_
> 2. **LEGIBILITY.** The player can perceive, before acting, **where the goal is, what is
>    interactive, and what is a threat** — they are visually distinguishable from the background and
>    from each other (the goal entity exists and is on-screen/locatable; interactables and hazards
>    are distinct). Fold this into `assetList[]` descriptions + entity roles; do not invent a HUD the
>    template lacks. _([E] gamedeveloper "6 elements of visual guidance" —
>    signifiers/affordance/signal-to-noise/contrast; [R] r/gamedev "non-gamers weren't using half the
>    game" until reactions were legible.)_
> 3. **ONBOARDING (teach the verb safely).** M1 exercises `coreVerb` in a **safe, low-stakes**
>    setting — the verb is usable and observable BEFORE any threat or fail-state (the "teach" beat).
>    The first thing the player meets is the core action with no penalty, not the obstacle. _([E]
>    GMTK 4-step "introduce the concept in a safe environment… so if you fall you don't lose a life";
>    [E] Level Design Book "teach, test, twist" + "start slow and quiet"; [E] "Isolation Principle";
>    [Y] Chong-U "gym level" with debug bounds — which catches the unreachable-platform bug directly.)_

---

## 4. DECOMPOSE INTO 2-5 PLAYABLE MILESTONES (default 3)

A milestone is **a PLAYABLE vertical slice with a verify gate** — at the end of it the game
runs and the player can do something meaningful. It is an **outcome**, NOT an internal task.
_([E] StraySpark "the loop works for five minutes"; [Y] GMTK "a tiny sample of a specific
feature, not every system"; [Y] Peter Yang "the right playable experience each time".)_

- task-shaped (WRONG): `"implement the scoring system"`
- milestone-shaped (RIGHT): `"the player can collect a coin and the score increases"`

**The invariants (non-negotiable):**
1. **M1 = the core loop plays at all** — the player appears, responds to input, and the core
   verb works (it renders + moves). This is the "it plays" gate. _([Y] Chong-U "first get basic
   movement and a single character in — the gym level".)_
2. The **FINAL milestone includes an end-state** — win and/or lose; the game can finish.
3. **Bounded 2-5, default 3.** Floor 2 = loop + goal (never one-shot). Ceiling 5 = the
   scope-control: more than 5 slices ⇒ cut back, don't grow.
4. Each milestone carries **its own acceptance criteria + runtime assertions** (§5).
5. Milestones are in **build order** (`M1`, `M2`, …); each builds on the last.

**How to size the count** (it follows the post-cut game, it is NOT fixed):
- The canonical 3-shape: **M1** = core-loop prototype (move/act + the central verb) → **M2** =
  one more system/progression (collect + hazards, or a second mechanic) → **M3** = end-state
  (win/lose + restart). _([Y] Peter Yang's exact 3-milestone shape: prototype → progression →
  boss+polish.)_
- 2 if the loop + win/lose is genuinely all there is (e.g. grid-logic 2048: M1 loop · M2
  win/lose+score). 4-5 only if distinct playable systems remain after the cut (e.g.
  tower-defense: path+1 tower · waves+economy · base-health/win+upgrades).
- Each milestone should be a thin slice you could verify by *playing* it. If two "milestones"
  can only be tested together, they're one milestone.

Write the milestones into `gdd.json.milestones[]` AND mirror them as a checklist in `PLAN.md`.

---

## 5. AUTHOR EXECUTABLE RUNTIME ASSERTIONS (the spine of verification)

Each milestone's assertions are what **W5 (Verify) runs LATER, in a headless browser, against
the live game object the template exposes on `window.__GAME__`**, after firing synthetic input.
They are the executable form of the acceptance criteria. This is the highest-value thing W1
produces — get it right.

**The assertion model = Given → When → Then over observable state** (the BDD game-test
structure): `setup` (load scenario / set precondition) → `input` (fire the synthetic
input/event) → `observe` + `expect` (read an observable and check it changed as expected).
_([repo] gamedevbench `test.gd`: setup → mutate → fire → assert-with-message →
VALIDATION_PASSED/FAILED; [E] arxiv 2506.17057 iv4XR "load scenario → execute action → validate
oracle"; [E] chongdashu `window.__TEST__.state()` + Playwright assert-state-after-input.)_

**The live game object `__GAME__` exposes** (the only things you may `observe` — W5 reads these,
never engine internals):
- `__GAME__.ready` (true after first interactive frame), `__GAME__.status`
  (`'playing'|'won'|'lost'`), `__GAME__.scene`
- `__GAME__.player { x, y, vx, vy, health, ... }` (archetype-appropriate fields; grid uses
  `gridX,gridY`)
- `__GAME__.score`, `__GAME__.entities[] { id, type, x, y }` (use `entities.count(type==X)`)
- archetype extras: `moveCount`, `gold`, `lives`, `waveIndex`, `playerHP`/`enemyHP`

**Authoring rules:**
1. **1:1 with acceptance criteria.** Every acceptance bullet has exactly one assertion; every
   assertion has a bullet. No orphans either way. _([repo] task_validation "all tests are in the
   instruction, all instructions are in the tests".)_
2. **Assert OBSERVABLE BEHAVIOR/STATE, never implementation.** "after Up for 300ms, `player.y`
   decreases" ✓ — "`PlatformerMovement.jump()` was called" ✗. This is the anti-reward-hack rule.
   _([repo] task_validation "validate behavior rather than implementation details".)_
3. **Be deterministic.** Use a concrete `durationMs` for holds; assert invariants, not exact
   pixel values where physics varies (prefer `decreases`/`increases`/`atLeast` over `equals` for
   continuous quantities). _([repo] CCGS coding-standards "no random seeds, no time-dependent
   assertions"; [E] chongdashu "seed RNG, freeze time".)_
4. **`describe` is the failure message** — write it as the human-readable predicate.
5. **The win-path is asserted end-to-end, through the documented controls — not just per-mechanic
   in isolation.** Beyond the per-mechanic assertions, the FINAL milestone MUST carry a
   **REACHABILITY assertion**: fire the player's own `controls[]` (an `input.type:"event"` that
   drives real held input toward the goal, or a bounded sequence of `keyHold`/`keyPress`/`click` the
   player would actually use) and assert the win observable becomes true — e.g. `observe:"status",
   expect:{equals:"won"}` (grid: also `moveCount atMost maxMoves`; TD: `lives atLeast 1` at win;
   ui_heavy: `enemyHP atMost 0`). This proves a real player can WIN via the verb, not merely that the
   verb moves a number. **It asserts OBSERVABLE state only and is satisfiable ONLY by a genuinely
   completable level — it is un-fakeable (W5 §7) and de-hardcoded (it names the player's actions +
   the win signal, never a genre constant like a jump height).** **M1 additionally asserts the core
   verb is usable in the safe onboarding setting** (the verb's observable changes with no fail-state
   triggered — the "teach" beat). When the goal/affordance the win-path needs cannot be reached by
   the documented controls, the milestone is mis-scoped: fix the DESIGN (placement/reach in §3.5),
   never weaken the assertion. _([E] Sturgeon-MKIII completability-by-playthrough; [E] Level Design
   Book critical path; [repo] assertion-execution-grammar §2.4 `event` = "the event must happen for
   real".)_
6. Use only `input.key` values that appear in `controls[]`.

**The `expect` comparators** (set exactly one): `decreases` / `increases` / `changes` /
`unchanged` / `equals:<val>` / `atLeast:<n>` / `atMost:<n>`. For an at-scene-start check (e.g.
"3 enemies exist"), omit `input` and just `observe` + `expect:{equals:3}`.

---

## 6. THE ARTIFACTS YOU WRITE

Write **exactly two files** (relative to the project dir). Create `spec/` if needed.

### A) `spec/gdd.json` — valid against `gdd.schema.json` (next to this skill)
The slim GDD + milestone plan. Required top-level: `meta`, `entities`, `mechanics`, `controls`,
`winCondition`, `loseCondition`, `assetList`, `milestones`. Optional: `subMode`, `config`.

### B) `spec/PLAN.md` — the human-readable milestone checklist (kept updated downstream)
_([repo] godogen/CCGS PLAN + state-file convention.)_ Shape:
```markdown
# PLAN — <title>
_Archetype: <archetype> · Core loop: <coreLoop>_

## Scope (from W0)
IN: <one line of what's in>
OUT (scope-cut): <the classification.scopeCut list> [+ anything W1 pushed back]

## Milestones
- [ ] **M1 — <name>**: <goal>
  - AC: <acceptance criteria, one per line>
- [ ] **M2 — <name>**: <goal>
  - AC: ...
- [ ] **M3 — <name>**: <goal>  *(final — includes end-state)*
  - AC: ...

## Win / Lose
Win: <winCondition.description>  ·  Lose: <loseCondition.description>
```
Downstream nodes tick the boxes as milestones pass verify.

### Worked example — **EXAMPLE ONLY, DO NOT COPY. Re-derive every real game from its own classification.json.**
For a `classification.json` with `archetype:"platformer"`, `coreLoop:"The player runs and jumps
across platforms collecting coins and avoiding spikes to reach the exit; falling or hitting a
spike resets the attempt."`, `coreVerb:"jump"`:
```json
{
  "meta": {
    "title": "Coin Dash",
    "archetype": "platformer",
    "coreLoop": "The player runs and jumps across platforms collecting coins and avoiding spikes to reach the exit; falling or hitting a spike resets the attempt.",
    "coreVerb": "jump",
    "artStyle": "bright pixel art, side-view",
    "physicsProfile": { "hasGravity": true, "perspective": "side", "movementType": "continuous" }
  },
  "entities": [
    { "id": "player", "role": "player", "description": "Side-view hero who runs and jumps.", "behaviors": ["PlatformerMovement"], "assetSlot": "player" },
    { "id": "coin", "role": "collectible", "description": "Pickup that adds 1 to score on overlap.", "assetSlot": "coin" },
    { "id": "spike", "role": "obstacle", "description": "Hazard that resets the attempt on contact.", "assetSlot": "spike" },
    { "id": "exit", "role": "goal", "description": "Door that wins the level on reach.", "assetSlot": "exit" }
  ],
  "mechanics": [
    { "name": "run", "description": "Left/Right moves the player horizontally.", "capability": "PlatformerMovement" },
    { "name": "jump", "description": "Up makes the player jump against gravity.", "capability": "PlatformerMovement" },
    { "name": "collect coin", "description": "Overlapping a coin removes it and increments score by 1." },
    { "name": "hazard reset", "description": "Touching a spike or falling off-screen resets the attempt (lose)." }
  ],
  "controls": [
    { "input": "ArrowLeft", "action": "move left" },
    { "input": "ArrowRight", "action": "move right" },
    { "input": "ArrowUp", "action": "jump" }
  ],
  "winCondition": { "description": "Reach the exit door.", "observable": "__GAME__.status === 'won'" },
  "loseCondition": { "description": "Hit a spike or fall off-screen.", "observable": "__GAME__.status === 'lost'" },
  "config": { "gravityY": 1200, "jumpPower": 620, "walkSpeed": 200 },
  "assetList": [
    { "slot": "player", "type": "animation", "description": "side-view hero facing right", "frames": ["idle", "run", "jump"] },
    { "slot": "coin", "type": "sprite", "description": "spinning gold coin, side-view" },
    { "slot": "spike", "type": "sprite", "description": "grey floor spike, side-view" },
    { "slot": "exit", "type": "sprite", "description": "wooden exit door, side-view" },
    { "slot": "bg_level", "type": "background", "description": "parallax sky background, tileable" }
  ],
  "milestones": [
    {
      "id": "M1", "name": "Move and jump",
      "goal": "The player appears and can run left/right and jump on platforms — the core loop plays.",
      "acceptanceCriteria": [
        "The player object exists at scene start.",
        "Pressing Right moves the player right.",
        "Pressing Up makes the player rise (jump)."
      ],
      "assertions": [
        { "id": "M1-A1", "describe": "exactly one player exists at scene start", "observe": "entities.count(type==player)", "expect": { "equals": 1 } },
        { "id": "M1-A2", "describe": "holding Right for 300ms increases player.x", "input": { "type": "keyHold", "key": "ArrowRight", "durationMs": 300 }, "observe": "player.x", "expect": { "increases": true } },
        { "id": "M1-A3", "describe": "pressing Up decreases player.y within 300ms (jump)", "input": { "type": "keyHold", "key": "ArrowUp", "durationMs": 300 }, "observe": "player.y", "expect": { "decreases": true } }
      ]
    },
    {
      "id": "M2", "name": "Collect coins, avoid spikes",
      "goal": "The player can collect coins (score rises) and dies to spikes — the risk/reward is playable.",
      "acceptanceCriteria": [
        "Overlapping a coin increments the score.",
        "Touching a spike sets status to lost."
      ],
      "assertions": [
        { "id": "M2-A1", "describe": "overlapping a coin increments score", "input": { "type": "event", "target": "overlap:player,coin" }, "observe": "score", "expect": { "increases": true } },
        { "id": "M2-A2", "describe": "touching a spike sets status to lost", "input": { "type": "event", "target": "overlap:player,spike" }, "observe": "status", "expect": { "equals": "lost" } }
      ]
    },
    {
      "id": "M3", "name": "Win, lose, restart",
      "goal": "Reaching the exit wins; the lose state resets — the game can finish.",
      "acceptanceCriteria": [
        "Reaching the exit sets status to won.",
        "After a lose, the attempt resets to a playable state."
      ],
      "assertions": [
        { "id": "M3-A1", "describe": "reaching the exit sets status to won", "input": { "type": "event", "target": "overlap:player,exit" }, "observe": "status", "expect": { "equals": "won" } },
        { "id": "M3-A2", "describe": "after losing, status returns to playing on restart", "setup": { "state": { "status": "lost" } }, "input": { "type": "event", "target": "restart" }, "observe": "status", "expect": { "equals": "playing" } }
      ]
    }
  ]
}
```
This is a *shape* reference. A grid_logic or tower_defense prompt yields different entities,
controls, observables (`moveCount`/`gold`/`lives`), and a different milestone count.

> **Note (per §5 rule 5):** the assertions shown above check mechanics in isolation. A real GDD's
> FINAL milestone must ALSO carry the §5 **reachability assertion** — fire the documented `controls[]`
> toward the goal (here: a bounded run/jump sequence to the exit) and assert `status` becomes `"won"`
> — so the spec proves a player can WIN the level via the verb, not just that the verb moves a number.

---

## 7. EDGE & FAILURE HANDLING

- **`confidence: "low"` in the classification.** You may simplify or re-anchor the design to the
  cleanest playable interpretation of the archetype (e.g. default to the archetype's most basic
  loop). Note the re-anchor in `PLAN.md`. Never block; always emit a buildable GDD. _([repo]
  W0 handoff: low-confidence → "you may simplify or re-anchor".)_
- **Prompt UNDER-scoped** (too vague to fill mechanics). Build the minimal canonical game for the
  archetype: the core verb + one obstacle/collectible + a win/lose. Default to 2-3 milestones.
  The template's native capabilities are your menu. Don't invent richness the prompt didn't ask
  for. _([repo] generate-gdd "user-faithful, do not invent unasked features".)_
- **Prompt OVER-scoped** (would need >5 playable slices after the cut). You have too much scope.
  Keep the 5 highest-value slices that include M1 (loop) and a final end-state; push the rest
  onto the scope-cut and record the pushed-back items in `PLAN.md` under OUT. The ceiling of 5
  is a hard wall — never grow past it. _([repo] gamedevbench; pipeline §3b.)_
- **A capability the prompt implies isn't native to the template.** It should already be on the
  scope-cut. If it's load-bearing for the loop, simplify to the nearest native capability (don't
  invent a hook). If it's not load-bearing, drop it to the scope-cut.
- **Can't write a checkable assertion for an acceptance criterion.** Then the criterion is
  probably not observable — rewrite it as observable behavior (something that changes on
  `__GAME__`), or drop it. Every acceptance criterion MUST have an executable assertion. _([repo]
  task_validation 1:1.)_
- **The win-path assertion can't be authored from the documented controls** (no sequence of
  `controls[]` reaches `winCondition.observable`). The level is **unwinnable as designed** — that is
  the bug Bucket 3 names. Re-place the goal/required affordances within the player's reach (§3.5
  WIN-PATH); do NOT drop the assertion or relax `winCondition`. A level with no authorable win-path
  must not ship.
- **Game with no lose state** (e.g. an endless/sandbox toy). Set `loseCondition.description:
  "none"` and make the final milestone's end-state the win and/or a meaningful reset; the final
  milestone still must have a checkable end-state assertion.

## 8. PI-PORTABILITY NOTE (for the workflow author)
This node is a single `agent()` call with a forced-JSON output matching `gdd.schema.json` — no
result-dependent branching the extractor can't see. The **milestone list is a discovered-once
list the pipeline fans out over with a static default of 3**: an extractor that can't see the
real list still gets a sane 3-milestone shape (M1 loop · M2 system · M3 end-state). Keep the
list bounded 2-5 (schema-enforced) so the extractor records clean, finite lanes — this is the
well-supported "scout the work-list, then pipeline over it" pattern, not open-ended fan-out
(pipeline §7). The asset-slot list (`assetList[]`) is the second discovered-once list (W3 fans
over it). Temperature can be moderate (design wants some creativity) but the schema + the
template-capability constraint keep it on-rails.
