---
name: classify-game
description: "W0 CLASSIFY (Designer, first node). Route a raw game prompt to one of five physics-first archetypes, state the core loop in one line, and record an explicit scope-cut. Writes spec/classification.json — the artifact that routes the whole game-omni pipeline."
version: 1.0.0
node: W0
role: Designer
argument-hint: "<the raw game prompt> (passed as args.prompt)"
allowed-tools: Write
metadata:
  writes: spec/classification.json
  schema: classification.schema.json
  archetypes: [platformer, top_down, grid_logic, tower_defense, ui_heavy]
---

# W0 — Classify a game prompt (physics-first routing + scope-cut)

You are the **first node** in the game-omni pipeline (role: Designer). You receive ONE
raw game prompt and produce ONE on-disk artifact: `spec/classification.json`. Every
later node (W1 Spec, W2 Scaffold, …) reads that file — it is the contract, not your
chat output. Nothing you "decide" survives except what you write to disk.

Your job has exactly three parts:
1. **Classify** the prompt into one of five archetypes — by PHYSICS, not by genre name.
2. **State the core loop** in one operational sentence.
3. **Cut scope explicitly** — record what is deliberately OUT. This is the anti-slop guardrail.

Do these, write the file, stop. Do NOT design mechanics, levels, milestones, or assets —
that is W1's job. You are a router with a scope brake, not a game designer.

---

## 1. HOW TO CLASSIFY — physics-first logic

> Source pattern: `OpenGame/packages/core/src/tools/game-type-classifier.ts` (the
> physics-first classifier) and `OpenGame/agent-test/prompts/custom.md` (the gen
> protocol's CLASSIFY step). We adopt its exact taxonomy and decision heuristics.

**Classify by PHYSICS and PERSPECTIVE, not by the genre word the user used.** A prompt
that says "puzzle" or "RPG" or "racing" tells you almost nothing — the physics tells you
everything. Ask the three physics questions, then map to the archetype.

### The three physics questions (answer these first)
- **Gravity** — does a character/object FALL when nothing is beneath it? (yes → side-view platformer family)
- **Perspective** — `side` (camera from the side), `top_down` (camera from above), or `none` (UI panels)?
- **Movement** — `continuous` (free analog motion), `grid` (discrete tile steps), `path` (enemies follow fixed routes), or `ui_only` (click/tap state changes)?

### The five supported archetypes (the ONLY valid outputs)

| archetype | physics signature | KEY QUESTION (the disambiguator) | example games | native mechanics the template ships |
|---|---|---|---|---|
| `platformer` | gravity ON, side view, L/R + jump | **Does the character FALL with no ground beneath it?** | Mario, Terraria, Angry Birds, Flappy Bird, Hill Climb Racing, Street Fighter, Metal Slug | gravity, jump, side-move, side combat, enemies/boss |
| `top_down` | no gravity, top-down/iso, free 8-dir | **Can the character move UP without jumping?** | Zelda, Binding of Isaac, Vampire Survivors, Asteroids, Hotline Miami, 2D GTA | free 8-dir move, dash + i-frames, enemies |
| `grid_logic` | snap-to-grid, discrete steps | **Does movement happen in discrete grid steps?** | Sokoban, Tetris, Snake, Match-3, Minesweeper, Chess, Fire Emblem, 2048, city/factory builders | tile board, discrete stepping, move budget |
| `tower_defense` | enemies follow fixed paths, waves | **Do enemies follow a fixed path while the player places defenses?** | Kingdom Rush, Bloons TD, Plants vs Zombies | path-following, waves, gold economy, lives, tower placement |
| `ui_heavy` | almost no arcade physics, UI panels | **Is the game primarily UI panels + state changes?** | Card games (Slay the Spire), visual novels, idle/clicker, rhythm (note highways), quiz | cards/hand, dialogue, turns, combo tiers, menus |

**Match the prompt's core verb to the archetype's native mechanics (last column).** The chosen
template already ships those mechanics *with juice wired in*, so prefer the archetype whose native
mechanics carry the prompt's main action — and push everything the template doesn't natively do
into the scope-cut (§3).
> Grounding: each archetype's `OpenGame/agent-test/templates/modules/<archetype>/src/gameConfig.json`
> defines its tunable surface — `platformer` has `gravityY`/`jumpPower`, `top_down` has `dashSpeed`,
> `grid_logic` has `cellSize`/`maxMoves`, `tower_defense` has `startingGold`/`timeBetweenWaves`,
> `ui_heavy` has `handSize`/`comboTiers`/`dialogueConfig`.

### Disambiguation rules — the "common mistakes" the classifier MUST avoid
> Lifted verbatim from `game-type-classifier.ts` ("Common Mistakes to Avoid") — these are
> the genre-name traps that fool naive classification.
- Terraria is **platformer**, not top_down — it has gravity.
- Angry Birds is **platformer**, not "puzzle" — it has gravity physics.
- Hill Climb Racing is **platformer**, not top_down — it has gravity.
- SimCity / Factorio are **grid_logic** (grid-based building), not top_down.
- Racing: side-view-with-gravity → `platformer`; top-down → `top_down`.
- Snake / Tetris / 2048 are **grid_logic** (discrete steps), even though some feel "continuous".
- A "puzzle" with gravity (physics drops/projectiles) → `platformer`, not grid_logic.

### Tie-break order (when two archetypes both seem plausible)
Apply in this order and stop at the first that fires:
1. **Gravity present?** → `platformer`. (Gravity dominates; it forces side-view physics.)
2. **Enemies on a fixed path + player places defenses?** → `tower_defense`.
3. **Discrete grid/tile steps?** → `grid_logic`.
4. **Free top-down movement?** → `top_down`.
5. **Otherwise (mostly UI/state)** → `ui_heavy`.

Set `confidence` to `high` when one archetype is unambiguous, `medium` when you used a
tie-break rule, `low` when the prompt barely fits (see §5 edge handling).

---

## 2. HOW TO WRITE THE CORE LOOP (one line)

> Source pattern: [Y] Game Maker's Toolkit "How to find amazing game ideas" — the
> win-state / obstacle / fail-state / player-verb decomposition (Crazy Taxi worked example);
> CCGS `brainstorm/SKILL.md` "Verb-First Design" (the core verb IS the game); [E] Easton
> "self-enclosed loop"; [E] videogame.link "one central verb".

Write ONE sentence describing the repeating moment-to-moment action. Build it from this atomic
frame — answer each from the prompt:
- **Player verb(s)** — the ONE central action (run, jump, shoot, push, place, match, tap, dodge…). Prefer a single verb; each extra verb sharply raises the learning curve and balancing cost.
- **Goal / win-state** — what the player works toward.
- **Obstacle** — what gets in the way.
- **Fail-state** — how the player loses / the loop resets.

Compose into one **self-enclosed** sentence that returns to its start (the player is motivated to
do it again). Format: *"The player [verb]s to [goal], while [obstacle]; [reward/progress], or [fail resets]."*

- Present tense, "the player". One sentence — no sub-clauses listing features/menus/progression.
- It describes the *loop*, not the whole game.
- This line is the spine W1 elaborates AND it seeds W1's win/lose conditions — so make the win and the fail legible.

**Quality gate — the one-sentence test:** if you can't state the loop cleanly in one sentence, the
design isn't ready — simplify the verb set until you can. _([E] Easton: "If you can't articulate it, the core gameplay hasn't taken shape yet.")_

Good: `"The player runs and jumps across platforms, collecting coins and avoiding spikes, to reach the exit; falling or hitting a spike resets the attempt."`
Good: `"The player swaps adjacent gems to make lines of three, clearing them for points before moves run out."`
Bad (feature list, not a loop): `"A platformer with 5 levels, a shop, boss fights, and unlockable skins."`

---

## 3. HOW TO PRODUCE THE SCOPE-CUT (the anti-slop guardrail)

> Source pattern — this is the #1 cross-source practice in the research: [E] Ziva "Scope
> boundary = a list of what is OUT… every feature idea gets checked against this list"; [E]
> gammer "the most important document in the sprint"; [E] Sense Central "Not Now list"; [E]
> Mind Studios "not-in-MVP list"; [R] r/godot "Make Small Games" (737 pts); CCGS
> `brainstorm/SKILL.md` "anti-pillars". OpenGame's classifier has NO scope-cut — this is where
> W0 adds value. Why it matters: GameDevBench — game tasks need >3× the code of normal SWE
> tasks, best agent solves only 54.5% — so disciplined scope is **survival, not polish**
> (game-omni `pipeline-design-v1.md` §2 P8).

Record what is **deliberately OUT of v1**, as a short list of concrete cut items. This is
the single most important thing W0 does for pipeline success: it pre-commits the build to a
shippable surface so the generative middle (W4) cannot sprawl into 800–1000-line slop.

How to build the list (aim for 4–8 items):
- **Cut everything the prompt did not explicitly demand AND the archetype does not natively
  provide (§1 last column).** When in doubt, cut it — W1 can promote a cut item back in if the
  core loop truly needs it.
- **Apply the core-loop filter:** *does this directly strengthen the one-line core loop (§2)? If
  not, it is OUT.* _([E] Wayline "if it doesn't enhance the core loop, axe it".)_
- Each entry is a short noun phrase naming a feature/system that will NOT be built (optionally
  "→ why" in a few words): e.g. `"multiplayer"`, `"save/load + persistence"`,
  `"procedural level generation"`, `"in-game economy / shop"`, `"dialogue/story cutscenes"`,
  `"more than one level"`, `"online leaderboards"`.
- **Always cut by default** (unless the prompt makes one of these the literal core loop) —
  these are the standard AI-codegen over-scope traps _([Y] Chong-U; [E] videogame.link, gammer)_:
  multiplayer/networking, account/login, save/cloud-save, monetization/analytics, procedural
  generation, multiple levels/worlds beyond what the loop needs, multiple playable characters,
  narrative/cutscenes, and mobile/touch/VR controls (target **desktop + web, one control scheme**).
- **DO NOT cut the juice.** The scope-cut removes *systems and content* — never the
  game-feel/feedback on the core verb. That feedback is part of what makes the verb fun and the
  templates already ship it. _([Y] GMTK: Fruit Ninja's splatters were in the prototype; pipeline P7.)_
- Keep entries general and reusable — name the *system* being cut, not one named feature from
  this one prompt (Hermes law: a cut that only helps one prompt is a bug).

The scope-cut is a hard contract: downstream nodes treat anything on this list as
out-of-bounds. W1 sizes its milestone list (2–5) to what remains AFTER the cut.

---

## 4. THE ARTIFACT YOU WRITE

Write **exactly one file**: `spec/classification.json` (relative to the project dir), valid
against `classification.schema.json` (next to this skill). Create the `spec/` directory if
it does not exist. Write nothing else.

### Schema (field by field)
| field | type | required | meaning |
|---|---|---|---|
| `prompt` | string | yes | The raw `args.prompt`, copied verbatim (provenance for every later node). |
| `archetype` | enum | yes | One of `platformer` `top_down` `grid_logic` `tower_defense` `ui_heavy`. **Must** be in the set — never invent one. |
| `coreLoop` | string | yes | The one-line core loop from §2 (verb + goal + obstacle + fail; self-enclosed). |
| `coreVerb` | string | yes | The single central player verb (e.g. "jump", "push", "place tower"). |
| `physicsProfile` | object | yes | `{ hasGravity: bool, perspective: "side"\|"top_down"\|"none", movementType: "continuous"\|"grid"\|"path"\|"ui_only" }`. The structured physics that justifies the archetype. |
| `reasoning` | string | yes | 1–2 sentences: which physics question(s) decided the archetype. Cite the KEY QUESTION you used. |
| `confidence` | enum | yes | `high` \| `medium` \| `low` (see §1 + §5). |
| `scopeCut` | string[] | yes | The §3 list of things deliberately OUT. 4–8 short noun phrases. Non-empty. |
| `coreFantasy` | string | no | Optional ≤8-word emotional hook (e.g. "a nimble hero racing to the goal"). Helps W1 + W3; omit if not obvious. |

### Worked example — **EXAMPLE ONLY, DO NOT COPY. Reclassify every real prompt from scratch.**
For the prompt *"a game where you push boxes onto targets to solve puzzles"*:
```json
{
  "prompt": "a game where you push boxes onto targets to solve puzzles",
  "archetype": "grid_logic",
  "coreLoop": "The player steps tile-by-tile to push every box onto a target square, solving the room; pushing a box into a dead corner forces a restart.",
  "coreVerb": "push",
  "physicsProfile": { "hasGravity": false, "perspective": "top_down", "movementType": "grid" },
  "reasoning": "Movement happens in discrete grid steps (Sokoban-style) — the grid_logic KEY QUESTION fires; no gravity and no free analog motion.",
  "confidence": "high",
  "scopeCut": ["multiplayer", "save/load + persistence", "level editor", "more than a handful of built-in levels", "story/dialogue", "in-game shop/economy", "mobile/touch controls (desktop keyboard only)", "procedural level generation"],
  "coreFantasy": "a methodical solver clearing one room at a time"
}
```
This is a *shape* reference. A different prompt yields a different archetype, loop, and cut.

---

## 5. EDGE & FAILURE HANDLING

- **Prompt fits NO archetype cleanly.** Every 2D game still has a dominant physics profile —
  run the §1 tie-break order to completion; it always lands on exactly one of the five
  (`ui_heavy` is the catch-all for "mostly UI/state"). Pick the closest, set
  `confidence: "low"`, and in `reasoning` name the mismatch so W1 can adapt or simplify.
  **Never** emit an archetype outside the supported set, and never refuse to classify.
- **Prompt is empty / under ~3 chars / gibberish.** Do not guess a game. Default to
  `platformer` (the richest, safest template), `confidence: "low"`, and put
  `"prompt was empty/unclear — defaulted to platformer"` in `reasoning`. (Mirrors the
  reference classifier's parse-fallback default in `game-type-classifier.ts`.)
- **Prompt requests 3D / multiplayer / a non-2D-web genre.** Classify the closest 2D
  archetype anyway and add the unsupported dimension to `scopeCut`
  (e.g. `"3D rendering (shipping 2D)"`, `"multiplayer (single-player only)"`).
  game-omni v1 is Phaser 2D single-player; W0 absorbs the mismatch into the scope-cut
  rather than failing.
- **Ambiguous between two archetypes.** Use the §1 tie-break order, set
  `confidence: "medium"`, and record the runner-up in `reasoning`.

## 6. PI-PORTABILITY NOTE (for the workflow author)
This node is a single `agent()` call with a forced-JSON output matching the schema above —
no result-dependent branching the extractor can't see. The archetype is one of a **fixed**
five-value enum, so the downstream template lane is statically known from the artifact; the
pipeline routes on a read of `archetype`, not on hidden model state. Keep temperature low
(~0.3) — classification wants determinism, not creativity.
