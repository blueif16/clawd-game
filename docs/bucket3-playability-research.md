# Bucket 3 — "the game is unplayable" — research-grounded fix brief

_Status: **PROPOSAL for human approval** (Hermes gates structural change — this brief does NOT edit any skill).
Generated 2026-06-09 by the Bucket-3 research sub-agent. Owner-to-be on approval: `write-gdd/SKILL.md`
(primary) + a companion note in `implement-milestone/SKILL.md`._

> **The bug we are correcting.** A real platformer run shipped a level whose only platforms exceeded the
> jump arc and whose goal needed no jumping — yet it "PASSED" because the design + assertions only check
> mechanics in **ISOLATION** ("x increases on Right", "y decreases on Up"), never whether a real player
> can actually PLAY and WIN the thing. Root cause: **the pipeline has no step that designs — or verifies —
> "how a player actually experiences/plays this game."** W1 constrains-to-template and authors per-mechanic
> assertions but never designs the player experience; W4 assembles parts, not an experience.

> **The single hard constraint (de-hardcode).** The fix MUST generalize across ALL FIVE archetypes
> (`platformer`, `top_down`, `grid_logic`, `tower_defense`, `ui_heavy`). **"jump height ≤ N" is FORBIDDEN** —
> that is the exact genre-specific mistake we are correcting. The principle must be archetype-agnostic and
> grounded in EVIDENCE. The fix STRENGTHENS observable assertions; it never weakens the oracle or hard-codes
> a pass (anti-reward-hack is absolute).

---

## (a) What our EXISTING research already grounds

Our records already contain the seed of the fix — the milestone is *supposed* to be a "playable slice" — but
they stop at per-mechanic isolation and never demand a **win-path** or **player-legibility**. Quoting:

- **The milestone is defined as PLAYABLE, but operationalized as isolated mechanics.**
  `research/skills/w1-spec-research.md` §3.3 (Peter Yang): _"what I'm looking for is the milestones because I
  want to make sure that it's building the right **playable experience each time**."_ And §3.3 (GMTK
  prototyping): a slice _"lets you answer a question — the biggest is: is this game fun?"_ — yet the committed
  assertion examples in `packages/skills/write-gdd/SKILL.md` §6 (the worked GDD, M1) are `player.x increases on
  Right` / `player.y decreases on Up`. **The intent ("playable") is present; the assertion that would PROVE it
  ("the player can reach the goal via the verb") is absent.** This gap is the bug.

- **"Build a path you want players to follow" — already cited, never operationalized into a design step.**
  `research/skills/w1-spec-research.md` carries GMTK's pre-production frame (_"What does a level look like?…
  What's the core loop?"_) but W1's SKILL §3 only fills `entities/mechanics/controls/win/lose` — it never
  authors **where things are placed relative to the player's reach**. (The yt-rag leg below surfaces GMTK's
  exact phrasing: _"In most games, level design is a bit like designing a course… you want players to follow,
  and you build paths to guide them along it."_)

- **The assertion grammar can ALREADY express reachability — we just never required it.**
  `packages/skills/verify/assertion-execution-grammar.md` §2.4 defines the `event` input type:
  _"trigger the REAL interaction the event names (`target:'overlap:player,coin'` → **drive held input so the
  player actually overlaps the coin**)… The event must happen for real."_ And the win observable is already
  the canonical `__GAME__.status === 'won'` (W1 SKILL §3 `winCondition`). **So "drive the documented controls
  and confirm the win actually fires" is expressible TODAY in the immutable grammar — no schema change, no new
  comparator. The fix is to make W1 AUTHOR that assertion, every time, on the final milestone.**

- **Anti-reward-hack is already absolute and already structural.**
  `assertion-execution-grammar.md` §7 + §3.4: _"a pixel/VLM signal can reward a crashed game"_ → W5 reads
  observable STATE off `__GAME__`, the oracle is outside the fix edit set. **Our reachability assertion lands
  squarely inside this guarantee:** a win-path assertion that drives real input and reads `status` can only
  pass if the game is genuinely completable — faking it is impossible AND pointless (W4 §6).

- **"Don't cut the juice / legibility of what's possible" — half-present.**
  W1 SKILL §2 ("Do NOT cut the juice") and the W4 research §3 (GMTK "double down on the core verb") cover
  *feedback*. But neither frames feedback as a **legibility/affordance** requirement — that the player can
  *perceive* the goal, what's interactive, and what's a threat *before* acting. (The Reddit leg below shows
  this is a real playability failure: non-gamers _"weren't using half of the possibility offered by the game"_
  purely from missing reaction-feedback.)

**Net:** our research grounds the milestone-as-playable-slice and the immutable observable-assertion oracle.
What it does NOT yet ground is the explicit DESIGN of a reachable, legible, learnable player experience, and
the REQUIREMENT to assert the win-path end-to-end.

---

## (b) Gaps + what multi-source research found (cited)

Three genuine gaps, filled by a 3-leg multi-source pass (Exa web / yt-rag curated YouTube / Reddit). Legs run:
Exa (4 queries) + yt-rag (`yt_game_feel_ui`, `yt_ai_game_generation`) + Reddit (`r/gamedesign`,`r/gamedev`).

### Gap 1 — REACHABILITY / completability of the objective (the actual bug)
Nothing in our records demands the objective be reachable *through the core verb*. The strongest evidence is
an academic technique that is **archetype-agnostic by construction**:

- **[E] Sturgeon-MKIII (Seth Cooper, Northeastern), ACM FDG 2023** —
  https://dl.acm.org/doi/fullHtml/10.1145/3582437.3587205 — _"a constraint-based approach to level generation
  for 2D tile-based games that **simultaneously generates a level and an example playthrough of the level
  demonstrating its completability** … demonstrated… including **lock-and-key dungeons, platformers, puzzles,
  and match-three** style games."_ It names the two standard ways to guarantee completability: a **"generate-
  and-test" approach, where… levels… are evaluated or filtered for completability… often done by a
  gameplaying agent**, and the prior Sturgeon's constraint that _"there is a path between the start and goal of
  generated levels **for a variety of player movement types**."_ → **The generalizing principle: a level is
  only valid if there exists a playthrough from start state to win state using the documented player actions.
  "Path from start to goal under the player's movement model" is the archetype-agnostic form of "jump arc
  reaches the platform" — and it covers grid/puzzle (solution exists), TD (a defense survives), card/UI (a
  win line exists), not just platformers.** This is exactly our W5 verb: drive real input, assert the win.

- **[E] The Level Design Book — "Pacing" / critical path** — https://book.leveldesignbook.com/process/preproduction/pacing —
  _"The **critical path** is the core progression of beats that every player must experience to 'complete' the
  game… For encounters, a critical path might be the ideal strategy to defeat an enemy. For puzzles, the
  critical path is the solution to the puzzle… For movement, the critical path is the ideal route to complete
  the level."_ → **One archetype-agnostic concept ("the critical path / win-path") with a per-archetype
  instantiation — the precise shape W1 should author.**

- **[Y] GMTK, "How Games Do Destruction"** (yt_game_feel_ui, 2025-10-02, 16:52) https://youtu.be/JZ9GRFD-mSc?t=1012
  (quoting Takahashi): _"In most games, level design is a bit like designing a course… you want players to
  follow, and you build paths to guide them along it."_ → level design = authoring a path, not scattering
  parts.

- **[R] AirConsole reviewer, "Common Gamedev Mistakes" (r/gamedev, 824↑)** + **"Playtest Like a Pro"
  (r/gamedesign)** + **"2 non-gamers on my game" (r/gamedev, 495↑)** — a professional playtester who reviews
  ~50 games confirms the **observable basics (it boots, you can do the core action, win/lose works) are
  exactly what a first gate should assert**; playtesting _"ensures your game ideas make sense and that the game
  actually works as intended."_ → corroborates that **the human eye on a real playthrough is the irreplaceable
  confirmation** (already our CLAUDE.md doctrine: "the human is the eye"), and that an automated win-path
  assertion is the cheap pre-filter for it.

### Gap 2 — PLAYER LEGIBILITY / readability (can the player perceive goal / interactables / threats)
Our records cover *feedback on the verb* but not *perception before acting*.

- **[E] gamedeveloper.com, "6 elements of visual guidance" (2025-01)** —
  https://www.gamedeveloper.com/design/6-elements-of-visual-guidance — the archetype-agnostic readability
  vocabulary: **signifiers** (_"arrows, signs… a glowing object may indicate an interactive element"_),
  **affordance** (_"elements… inherently suggest how they should be interacted with"_), **signal-to-noise
  ratio** (_"regions that require player attention should be rich in information, while less critical areas…
  minimal"_), and **contrast/saturation to mark interactables** (_"collectable plants… have a higher
  saturation, making it easier to be noticed"_) + **motion as the strongest attention cue** (_"dynamic events
  are much more effective at capturing players' attention"_). → **Legibility = the player can DISTINGUISH the
  goal, the interactive objects, and the threats from the background, before acting.** This holds for any
  archetype (a TD path/build-slot, a card's playability, a grid's goal tile, a platformer's exit).

- **[R] "2 non-gamers on my game" (r/gamedev, 495↑)** — https://www.reddit.com/r/gamedev/ — players _"weren't
  using half of the possibility offered by the game"_ until the dev added **reaction animations** (hit-shake,
  cards merging, deck refill, craft explosion): _"I don't mean super cool animation. I mean reaction's
  animation."_ → **Missing legibility/feedback makes a mechanically-complete game effectively unplayable** —
  the player can't see what's possible. Connects legibility to the existing "don't cut the juice" rule.

### Gap 3 — ONBOARDING / teaching the controls in the first moments
Our records say "M1 = the loop plays" but never "M1 teaches the verb safely." Strong, convergent, archetype-
agnostic evidence:

- **[E] GMTK / Hayashida — "4-step level design" (kishōtenketsu)** —
  https://www.youtube.com/watch?v=dBmIkEvEBtA — _"stages are four-part self-contained showcases… a mechanic
  can be successfully **taught, developed, twisted, and then thrown away**… Each level starts by introducing
  its concept **in a safe environment**… The first batch… are hovering over a lower level so if you fall you
  don't lose a life."_
- **[E] The Level Design Book — "Teach, test, twist"** — https://book.leveldesignbook.com/process/preproduction/pacing
  — _"Teach: teach the player about a game activity… Test: test whether the player can repeat… Twist: twist the
  frame."_ + _"Start slow and quiet… even high action shooters… begin with quiet rooms where players can test
  their controls and 'warm up'."_
- **[E] gamedeveloper.com, "Examining Organic Tutorials" + Pause Button, "How Video Games Introduce Their
  Mechanics"** — https://www.gamedeveloper.com/design/examining-organic-tutorials ,
  https://pausebutton.substack.com/p/how-video-games-introduce-their-mechanics — the **Isolation Principle**:
  _"New mechanics are presented first in the form of just the new mechanic in an open area without any
  obstacles or enemies… Then the mechanic is repeated… Finally the player is tested… where they can be hurt or
  killed if they fail."_ + _"Introduce new elements in isolation; show players instead of telling them; teach
  through repetition."_ The organic-tutorial author explicitly generalizes it past platformers: _"the
  philosophy of teaching the player over the course of playing a game can be applied to [strategy/RPG] genres…
  by having a starting area with the mechanics condensed down."_
- **[Y] Chong-U, "Vibe Code Your First Game"** (yt_ai_game_generation, 2026-04-10, 11:39/13:10)
  https://youtu.be/yKyjcbQiar4?t=699 — the **"gym level"** with **debug bounding-box overlays** is the
  AI-codegen form of "teach the verb in a safe space," and it caught *our exact bug class*: _"you will see that
  **no matter how high I jump, I'm never going to be able to reach this platform**… the bounding box that it
  calculated was wrong."_ → the design (reachable spacing) AND the debug visualization that exposes
  unreachability are both established AI-codegen practice.

→ **The generalizing onboarding principle: M1 introduces the core verb in a SAFE, low-stakes setting where the
verb is exercised before any threat or fail-state — the "teach" beat. ("4-step" / "teach-test-twist" /
"isolation principle" all reduce to: teach the verb safely first.)**

---

## (c) Proposed MINIMAL, de-hardcoded edit to `packages/skills/write-gdd/SKILL.md`

Two small, durable insertions. **No schema change** (the existing `event` input + `status`/`moveCount`/`status`
observables already express everything). The edit (1) adds one short *design-for-the-player* sub-step and
(2) strengthens the assertion-authoring rules to REQUIRE a win-path assertion and a legibility/onboarding
assertion — generically, per archetype, asserting only observable state.

### Edit 1 — add §3.5 "Design the PLAYABLE SPACE (reachability · legibility · onboarding)"
**Insertion point:** end of `## 3. FILL THE SLIM GDD FIELDS` (after the `assetList[]` bullet, before
`## 4. DECOMPOSE INTO 2-5 PLAYABLE MILESTONES`). New sub-section, ~14 lines:

> **3.5 Design the PLAYABLE SPACE — a real player must be able to PLAY and WIN this (not just trigger
> mechanics in isolation).** Filling entities/mechanics/controls is necessary but NOT sufficient: the parts
> must compose into an experience a real player can actually complete via the documented `controls[]`. Before
> writing milestones, decide three things and record them in `PLAN.md` (under a new `## Playability` heading):
> 1. **WIN-PATH (reachability).** Name the concrete path from the start state to `winCondition.observable`,
>    expressed ONLY in the player's documented actions — there must EXIST a sequence of `controls[]` inputs
>    that reaches the win. The goal/required affordances must sit **within the player's actual reach/ability**
>    (a platformer goal reachable by the jump the player has; a grid goal reachable within `maxMoves`; a TD
>    win survivable with the towers/gold the player starts with; a card win achievable from the opening hand).
>    _Never encode a genre constant_ — encode the relation "objective reachable by the documented verb."
>    There is **no soft-lock**: every required element is acquirable before it is needed.
>    _([E] Sturgeon-MKIII "generate an example playthrough demonstrating completability… path from start to
>    goal for a variety of player movement types"; [E] Level Design Book "critical path… the solution / the
>    route to complete the level"; [Y] GMTK "build paths to guide them along it".)_
> 2. **LEGIBILITY.** The player can perceive, before acting, **where the goal is, what is interactive, and
>    what is a threat** — they are visually distinguishable from the background and from each other (the goal
>    entity exists and is on-screen/locatable; interactables and hazards are distinct). Fold this into
>    `assetList[]` descriptions + entity roles; do not invent a HUD the template lacks.
>    _([E] gamedeveloper "6 elements of visual guidance" — signifiers/affordance/signal-to-noise/contrast;
>    [R] r/gamedev "non-gamers weren't using half the game" until reactions were legible.)_
> 3. **ONBOARDING (teach the verb safely).** M1 exercises `coreVerb` in a **safe, low-stakes** setting — the
>    verb is usable and observable BEFORE any threat or fail-state (the "teach" beat). The first thing the
>    player meets is the core action with no penalty, not the obstacle.
>    _([E] GMTK 4-step "introduce the concept in a safe environment… so if you fall you don't lose a life";
>    [E] Level Design Book "teach, test, twist" + "start slow and quiet"; [E] "Isolation Principle"; [Y]
>    Chong-U "gym level" with debug bounds — which catches the unreachable-platform bug directly.)_

### Edit 2 — strengthen the assertion-authoring rules (§5) to assert the experience, generically
**Insertion point:** in `## 5. AUTHOR EXECUTABLE RUNTIME ASSERTIONS`, the **Authoring rules** numbered list.
Rule 5 today reads:

> _5. **M1's assertion exercises the core verb.** The final milestone's assertions include the win and/or lose
> `observable` from §3._

**Replace** with (the change is the bolded clauses — promoting "exercises the verb" to "the win-path is
exercised through the documented controls", and adding the legibility/onboarding observables):

> _5. **The win-path is asserted end-to-end, through the documented controls — not just per-mechanic in
> isolation.** Beyond the per-mechanic assertions, the FINAL milestone MUST carry a **REACHABILITY assertion**:
> fire the player's own `controls[]` (an `input.type:"event"` that drives real held input toward the goal, or a
> bounded sequence of `keyHold`/`keyPress`/`click` the player would actually use) and assert the win observable
> becomes true — e.g. `observe:"status", expect:{equals:"won"}` (grid: also `moveCount atMost maxMoves`; TD:
> `lives atLeast 1` at win; ui_heavy: `enemyHP atMost 0`). This proves a real player can WIN via the verb, not
> merely that the verb moves a number. **It asserts OBSERVABLE state only and is satisfiable ONLY by a genuinely
> completable level — it is un-fakeable (W5 §7) and de-hardcoded (it names the player's actions + the win
> signal, never a genre constant like a jump height).** **M1 additionally asserts the core verb is usable in
> the safe onboarding setting** (the verb's observable changes with no fail-state triggered — the "teach"
> beat). When the goal/affordance the win-path needs cannot be reached by the documented controls, the
> milestone is mis-scoped: fix the DESIGN (placement/reach in §3.5), never weaken the assertion._
> _([E] Sturgeon-MKIII completability-by-playthrough; [E] Level Design Book critical path; [repo]
> assertion-execution-grammar §2.4 `event` = "the event must happen for real".)_

Also add one bullet to §7 (EDGE & FAILURE HANDLING):

> - **The win-path assertion can't be authored from the documented controls** (no sequence of `controls[]`
>   reaches `winCondition.observable`). The level is **unwinnable as designed** — that is the bug Bucket 3
>   names. Re-place the goal/required affordances within the player's reach (§3.5 WIN-PATH); do NOT drop the
>   assertion or relax `winCondition`. A level with no authorable win-path must not ship.

---

## (d) Companion change to `packages/skills/implement-milestone/SKILL.md`

W4 "assembles parts, not an experience." A small companion note (NOT the primary fix — W1 owns design) so W4
*builds the designed space* and surfaces unreachability rather than silently shipping it. Add one bullet to
**§3.3 Wiring** (or §5 per-archetype notes), ~5 lines:

> - **Place entities to honor the GDD's WIN-PATH (`PLAN.md` §Playability) — build the reachable, legible
>   space, not scattered parts.** When you place the goal + required affordances, they must sit within the
>   player's actual reach/ability as the config defines it (jump arc from `gravityY`/`jumpPower`; `maxMoves`;
>   starting `gold`/towers; opening hand) and be visually distinguishable (use the asset slots' roles). If,
>   while building, the goal is **not reachable via the documented controls**, that is a design soft-lock —
>   record it in `MEMORY.md` as `[Mk] reachability: <goal> unreachable via <verb> under <config>` for W1/W5;
>   implement the nearest faithful reachable placement, never fake the win. _([repo] Sturgeon-MKIII
>   completability; W1 §3.5; the Chong-U "gym level" debug-bounds practice exposes exactly this.)_

W4's existing anti-reward-hack rule (§6) already forbids faking `status` — so the win-path stays honest by
construction. No change to the immutable `__GAME__` hook or the verify harness is needed.

---

## (e) Generalizes across all 5 archetypes — why, per archetype + anti-reward-hack note

The principle is stated as a **relation** ("the objective is reachable via the documented core verb; goal /
interactables / threats are legible; the verb is taught safely first"), never a genre constant. Per archetype:

| Archetype | WIN-PATH (reachability) — observable | LEGIBILITY | ONBOARDING (teach verb safely) |
|---|---|---|---|
| **platformer** | a jump/move sequence reaches the exit → `status=="won"`; goal within the jump arc the config gives | exit vs hazard vs platform distinct | M1: move+jump with no pit/spike present |
| **top_down** | a move/attack sequence reaches the goal/clears the arena → `status=="won"` | goal vs enemy vs wall distinct | M1: free-move in a safe room before enemies |
| **grid_logic** | a legal move sequence solves it within budget → `status=="won"` ∧ `moveCount atMost maxMoves` | goal tile vs blocker vs movable distinct | M1: one move type in a trivially-solvable board |
| **tower_defense** | a buildable defense survives a wave → `status=="won"` ∧ `lives atLeast 1` | path vs build-slot vs enemy distinct | M1: place one tower, no wave pressure yet |
| **ui_heavy** | a playable line from the opening hand wins → `status=="won"` ∨ `enemyHP atMost 0` | playable card vs locked vs target distinct | M1: play one card, no lose pressure yet |

Every cell asserts an **observable `__GAME__` field already in the grammar** (`status`, `moveCount`, `lives`,
`enemyHP`) driven by the player's **documented `controls[]`** — zero genre constants, zero new schema. The same
SKILL text produces the right assertion for any archetype because it instructs W1 to derive the win-path from
*this game's* controls + winCondition.

**Anti-reward-hack (we STRENGTHEN the oracle, never weaken it):**
- The new assertion reads **observable state only** (`status`/`moveCount`/`lives`/`enemyHP`) after firing the
  player's **real** documented inputs (`assertion-execution-grammar.md` §2.4: _"the event must happen for
  real"_). It can pass **only if the game is genuinely completable** — there is nothing to fake (W5 §7;
  W4 §6: faking `status` is forbidden and pointless).
- The oracle (assertions + `gdd.json` + the `__GAME__` hook + the verify harness) **remains immutable** and
  outside the W5 fix edit set. We are **adding a stronger observable check**, not relaxing one — this makes the
  silent false-pass ("platforms exceed the jump arc but it passed") **impossible**, because the win-path
  assertion fails loudly when the level is unwinnable.
- The fix changes real `src/**` behavior (W4 places a reachable, legible space) and the DESIGN (W1 authors a
  win-path), **never the test**. The human remains the eye for the playable artifact; this assertion is the
  cheap automated pre-filter that turns "unplayable but green" into a loud `VALIDATION_FAILED`.

---

## Sources index (for reuse)
**Exa [E]:** Sturgeon-MKIII (Cooper, FDG 2023) https://dl.acm.org/doi/fullHtml/10.1145/3582437.3587205 ·
Level Design Book "Pacing/critical path/teach-test-twist" https://book.leveldesignbook.com/process/preproduction/pacing ·
GMTK "Super Mario 3D World's 4-Step Level Design" https://www.youtube.com/watch?v=dBmIkEvEBtA ·
gamedeveloper "6 elements of visual guidance" https://www.gamedeveloper.com/design/6-elements-of-visual-guidance ·
gamedeveloper "Examining Organic Tutorials" https://www.gamedeveloper.com/design/examining-organic-tutorials ·
Pause Button "How Video Games Introduce Their Mechanics" https://pausebutton.substack.com/p/how-video-games-introduce-their-mechanics ·
Celia Wagar "Phases of Level Design" https://critpoints.net/2015/04/02/phases-of-level-design/

**YouTube (yt-rag) [Y]:** GMTK "How Games Do Destruction" https://youtu.be/JZ9GRFD-mSc?t=1012 (level design = build the path) ·
GMTK "100 Games That Taught Me Game Design" https://youtu.be/gWNXGfXOrro?t=2758 (Portal: constrained teaching) ·
Chong-U "Vibe Code Your First Game" https://youtu.be/yKyjcbQiar4?t=699 (gym level + debug bounds catch the unreachable-platform bug)

**Reddit [R]:** "Common Gamedev Mistakes" (AirConsole reviewer, r/gamedev) · "Playtest Like a Pro" (r/gamedesign) ·
"2 non-gamers on my game" (r/gamedev, 495↑ — legibility via reaction-feedback)

**Repo (already on disk) [repo]:** `research/skills/w1-spec-research.md` §3.3 · `research/skills/w4-implement-research.md` §3 ·
`packages/skills/verify/assertion-execution-grammar.md` §2.4, §3.4, §7 · `packages/skills/write-gdd/SKILL.md` §3,§5,§6,§7
