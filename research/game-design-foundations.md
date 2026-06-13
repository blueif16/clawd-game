# Game-Design Foundations — a grounding reference for the DESIGN nodes

_A deeply-grounded, highly-actionable reference for the `game-omni` engine's **design nodes** —
W0 (classify-game), W1 (write-gdd), VERIFY-1 (verify-design). This is the GROUNDING phase: it
researches and synthesizes the design philosophies these nodes must encode. A **later** task
encodes them into the skills; this doc edits no SKILL._

_Generated 2026-06-12. Source tags: **[E]** = external web (game-design literature, cited inline
with URL) · **[repo]** = on-disk artifact in this repo · **[case]** = the illustrating `out/cw1`
run. Every external claim carries its source so a steward can re-trace it. Where a claim is my
synthesis rather than established theory, it is marked **(synthesis)**._

---

## Why this document exists — the two concrete flaws it must answer

The pipeline currently ships games that are (1) **TOO SIMPLE / tutorial-grade** and (2) have
**MEANINGLESS scoring**. The illustrating case is `out/cw1` (a gnome-waters-sunflowers
platformer) — used ONLY to make the abstract concrete; **every principle below must hold for ALL
archetypes and is stated as a relation, never a `cw1` constant** (Hermes law: a rule that only
helps one game is a bug).

- **Too simple.** `out/cw1` is one trivial level: hop right, water 3 sunflowers, reach a door.
  It reads like "telling kids to play," not a real round-one game. [case]
- **Meaningless score.** The human reports the score keeps accumulating and that after a
  respawn/restart the player can re-collect rewards and farm points; there is no MAX and rewards
  are not idempotent. **Note (synthesis):** in `cw1`'s *actual* code the per-sunflower
  `sunflower.collected` guard happens to block re-watering the SAME flower
  (`out/cw1/src/scenes/Level1Scene.ts:159`), and `_softReset()` does not re-credit. So the bug is
  not (only) a coding slip — it is a **design-and-verification gap**: idempotency is described in
  prose but never **declared as a bounded contract** nor **asserted**, and **no `maxScore`
  exists anywhere** in the schema, GDD, blueprint, or code (`grep maxScore` → nothing but a
  comment). The score is therefore *accidentally* bounded, not *provably* bounded — exactly the
  kind of "green ≠ good" silent gap this engine's separation-of-powers is meant to close. [case][repo]

The human's two design intuitions this research validates and sharpens:
1. **Start higher + scaffold-then-layer.** The pipeline should build a SCAFFOLD (a reusable
   engine) once, then make later difficulty CHEAP to add — reuse the engine, layer difficulty via
   config + small added capabilities. **Round one should already be a real, interesting game**,
   not a tutorial.
2. **Scoring is game-type-dependent.** Some games need a score (players find satisfaction in
   performance); some (puzzle/narrative) don't. When a game DOES score, there must be a
   **MAXIMUM** and the total must **MEAN** something. "It comes down to the title/type of the game."

This doc grounds both in the literature and turns them into observable, un-gameable design rules.

---

## How this builds on what we already have (cite, don't duplicate)

This reference sits **above** the per-node records and the prior playability brief; it does not
re-derive them. It assumes and extends:

- **`research/ai-game-generation-2026-06-08.md`** — the harness thesis (templates + skills +
  spec-driven milestones + runtime verify). This doc is the *design-content* layer that the §7
  harness carries. [repo]
- **`research/skills/w0-classify-research.md`** — physics-first 5-archetype taxonomy, the
  win/obstacle/fail/verb core-loop frame, scope-cut as an OUT list. This doc adds the
  **scope-*preserve*** counter-pressure and the per-archetype design-needs taxonomy (§A). [repo]
- **`research/skills/w1-spec-research.md`** — slim GDD field set, outcome-based playable
  milestones, the Given→When→Then runtime-assertion schema. This doc adds **what to *declare***
  (maxScore, idempotent rewards, difficulty floor, level ladder) so those assertions have
  meaningful targets (§B, §G). [repo]
- **`docs/bucket3-playability-research.md`** — reachability · legibility · onboarding · the
  win-path assertion. Already encoded as `write-gdd/SKILL.md` **§3.5 "Design the PLAYABLE
  SPACE"** and the VERIFY-1 kinematic-feasibility gate. This doc extends §3.5's CHALLENGE pillar
  toward **interestingness + difficulty-floor + scoring-meaning** (§B, §C, §E). [repo]
- **The current design skills** already encode a lot — so this doc targets the **gaps**:
  - `classify-game/SKILL.md` routes + cuts scope, but has **no "scope-preserve / start-higher"
    pressure** and **no scoring-need signal** to W1. [repo]
  - `write-gdd/SKILL.md` §3.5 designs reachability/legibility/onboarding/challenge and §5 asserts
    the win-path, and `loseCondition`/`failModel` are status-coherent — but there is **no
    `maxScore` declaration, no idempotency contract, no difficulty-floor, and no level-ladder**.
    Score is a bare registry counter the gate happens to read. [repo]
  - `verify-design/SKILL.md` proves winnable + threat-on-path + completeness — but it has **no
    "score is bounded and idempotent" check, no "round one is not a tutorial" check, and no
    "engine is reused across the ladder" check**. [repo]

**Net gap this doc fills:** the three design nodes already make a game *reachable, fair, and
winnable*. They do not yet make it *worth playing* (a real round-one game, not a chore) or make
its *score mean something* (bounded, idempotent, legible). That is the content below.

---

## Table of contents

- **A.** Game-type → design-needs taxonomy (does THIS type need a score? levels? a ladder? a timer?)
- **B.** Scoring philosophy — the score-meaning fix (when to score, MAX-score, IDEMPOTENT rewards)
- **C.** Difficulty & "start higher, not a tutorial" (flow channel, teach-test-twist as ONE beat, media res)
- **D.** Scaffold-then-layer progression (build the engine once; add harder levels cheaply)
- **E.** Interestingness / the core of fun (interesting decisions, risk-vs-reward, threat-on-path)
- **F.** Win/lose & progression integrity (reachable end-states, multi-level flow, no soft-locks)
- **G.** APPLICATION MAP — how each principle changes W0, W1, VERIFY-1 (the bridge to encoding)
- **Core Principles** (the actionable distilled list)
- **Sources index**

---

## A. Game-type → design-needs taxonomy

> **The thesis (validates the human's "it comes down to the title/type of the game").** Different
> game *types* have different *needs*. A score, a level ladder, a timer, a fail-state — none are
> universal; each is *appropriate for some types and noise for others*. The job of W0/W1 is to
> route the prompt to the right **bundle of needs**, not to bolt the same skeleton (score counter
> + win door) onto every game.

### A.1 The deep division: performance games vs completion games

Two foundational sources draw the same line.

- **Keith Burgun, "Against score systems"** [E http://keithburgun.net/against-score-systems-and-for-success-and-failure/ ;
  mirror https://www.gamedeveloper.com/design/against-score-systems-and-for-success-and-failure- ]
  splits goal-systems into three categories: **(1) completion systems** (a binary goal — "beat
  the game"; Mario, puzzles, story); **(2) high-score systems** (an open-ended number you push as
  high as you can — Pac-Man, Tetris); **(3) score-*tests*** (a target/threshold — football, Go:
  "more than the opponent"). His core claim: *"Completion is different from a score, in that it's
  binary… completed, or not completed."* Crucially, **a game can have BOTH a score and a
  completion goal, and when it does, players overwhelmingly pursue completion** — "videogames have
  trained most people to think along the lines of completion… so if a system has both a score and
  completion, people will tend to go for the completion." → **A score layered on top of a
  completion game is usually ignored** (this is exactly the `cw1`/Mario case).
- **Jesper Juul, "Without a Goal"** [E https://jesperjuul.net/text/withoutagoal/ ] formalizes the
  same: a goal can be *completion* ("reach the end") or *optimization* ("achieve as high a score
  as possible — the standard type of goal in the arcade game"). The presence or absence of a
  *scorekeeping payoff* is a design choice that defines the game's shape.

**The synthesis for `game-omni`:** classify each game's **goal-type** first, because it dictates
the rest of the needs:

| Goal-type | What the player is doing | Needs a score? | Needs a fail/lose? | Needs a ladder of levels? |
|---|---|---|---|---|
| **Completion** (reach an end-state) | solve / traverse / clear | **No** — or score is an *optional* skill layer (§B.5) | usually a soft/recoverable fail or none | yes, if the experience is level-based |
| **Performance / score-attack** (maximize a number) | survive / chain / optimize | **Yes** — the score IS the goal | yes — the run ends, the number is final | often a single escalating arena, not discrete levels |
| **Score-test** (hit a threshold) | beat a target / an opponent | **Yes, but bounded** — the target is the point | yes — miss the target = lose | depends |

### A.2 Mapping to the repo's five archetypes

The five physics-first archetypes (`platformer`, `top_down`, `grid_logic`, `tower_defense`,
`ui_heavy`) are **not** the same as goal-type — most archetypes can host *either* a completion
or a performance framing depending on the prompt. The needs follow from the **goal-type the
prompt implies**, with the archetype's native capabilities as the menu. Default mapping
**(synthesis, grounded in the archetype capability fingerprints in
`research/skills/w0-classify-research.md` §2.2)**:

| Archetype | Most common goal-type | Score need (default) | Level/ladder need | Timer need | Lose-model default |
|---|---|---|---|---|---|
| `platformer` | **completion** (reach the exit) | optional skill-layer; **bounded if present** (coins are finite) | yes — a short ladder of stages reusing move/jump | rarely (unless speed-run framing) | recoverable respawn or lives |
| `top_down` | completion *or* performance | **performance framing → score is core** (Vampire-Survivors/arena); completion framing → optional | arena escalation *or* room ladder | sometimes (survive-for-time) | health/lives |
| `grid_logic` | **completion** (solve the board) | usually **none**, or a **bounded efficiency score** (par/stars) — never an open counter | yes — a ladder of puzzles escalating one rule | move-budget acts as the "timer" | none / restart |
| `tower_defense` | **score-test** (survive N waves) | **bounded** — survive the declared wave count; "score" = waves cleared / lives kept | yes — wave ladder | wave cadence is the clock | lives → terminal |
| `ui_heavy` | completion (win the encounter) *or* performance (combo) | depends — card/encounter = completion; clicker/score-attack = performance | encounter ladder | turn/round budget | HP → terminal |

**The load-bearing rule (synthesis):** **the prompt's goal-type — not the archetype — decides the
score/timer/ladder needs.** A "puzzle" prompt in `grid_logic` needs *no open score*; a "how long
can you survive" prompt in `top_down` needs *a score as its whole point*. W0 should pass a
**`scoringModel` signal** down to W1 so W1 doesn't reflexively add a counter (§G).

### A.3 The danger this taxonomy prevents

Bolting an **open-ended score counter** onto a **completion game** produces the `cw1` symptom: a
number that climbs, that nobody uses (the win is the door, not the number), that has no maximum,
and that can be farmed. The Redbrick analysis of Mario [E https://www.redbrick.me/are-scoring-mechanics-outdated/ ]
nails it: *"In games like Pac-Man… where you play until you lose, score serves as a well-rounded
measure of performance. Meanwhile, Super Mario Bros. is a finite game by design"* — and the score
"never actually contributes to the game." (Nintendo agreed: **Super Mario Wonder strips score
entirely.**) → **A completion game should either have NO score or a bounded, meaningful one — never
a bare open counter.** This is the bridge into §B.

---

## B. Scoring philosophy — the score-meaning fix

> **The two rules that fix the `cw1` bug, stated as observable contracts (synthesis, grounded
> below):**
> **(B-MAX)** If a game scores, it declares a **knowable MAXIMUM** (`maxScore`) — a bounded,
> reachable total the score can never exceed.
> **(B-IDEM)** Every reward is **IDEMPOTENT** — it counts **exactly once**, ever: no double-count,
> and **no re-credit after respawn/restart**. `score` is **monotonic up to `maxScore`** and never
> exceeds it.

### B.1 When to score, and when NOT to

- **Don't score a pure completion or narrative game.** Burgun [E keithburgun.net]: completion is
  binary; a score on top is ignored. Schell's reward taxonomy (below) lists *Completion* ("closure
  in the game") as a first-class reward in its own right — a completion game's "score" is *finishing*.
- **Do score a performance game** — there the number *is* the goal (Juul's "optimization" goal;
  the arcade lineage). GMTK, *"Are Score Systems Still Relevant?"*
  [E https://www.youtube.com/watch?v=K6y9PJipfpk ]: arcade classics "couldn't be finished… so the
  challenge was to see how high of a score you could rack up." Modern use: score as an **optional
  challenge layer** on top of a completable game (Assault Android Cactus: "totally possible to
  progress simply by killing all enemies… but you can also aim to win enough points to finish with
  a higher rank").
- **The decision rule (synthesis):** score iff the prompt's goal-type is performance/score-test,
  OR the designer is *deliberately* adding an optional skill layer (§B.5). Otherwise: **no score**,
  and the win is the readout. Never add a counter "because games have scores."

### B.2 The MAXIMUM-score principle — bounded, knowable, reachable

The single most-cited failure of points systems is **unbounded accumulation**.

- **gamedeveloper, "Just Make My Numbers Go Up: Breaking Our Addiction to Points"**
  [E https://www.gamedeveloper.com/design/just-make-my-numbers-go-up-breaking-our-addiction-to-points ]:
  *"Most games either let you increase your numbers up to a theoretically infinite amount, or have
  a hard cap at which there is no downside… Introduce **terminuses** for point value systems."*
  A bounded total transforms "mindless grinding" into "looking at the game holistically."
- **eventXgames, "Points Are Dead, Progress Is Everything"**
  [E https://eventxgames.com/blog/points-are-dead-progress-is-everything/ ]: *"Without a finish
  line, without a sense of 'done,' there's no psychological closure… Each point becomes
  proportionally less meaningful as your total grows."* The fix is a **denominator**:
  *"The denominator transforms accumulation into progress"* — show `8,450 / 10,000`, not `8,450`.
- **Burgun** [E keithburgun.net] goes further for designed games: *if there is a target score it
  should be something very low — more like 3, or 6 — something discrete and less continuous,*
  because a continuous open number pushes a designer toward toy-thinking.

**→ The rule (synthesis):** a scoring game declares **`maxScore`** (a finite, reachable number =
the sum of all idempotent reward values), and the HUD/readout expresses score **against that max**
(`X / maxScore` or a progress fraction). This is also *directly observable*: VERIFY-1 can prove
`maxScore == Σ(reward values)` from the layout, and VERIFY-2 can assert `score ≤ maxScore` always.

### B.3 IDEMPOTENT rewards — the root of the farming bug

This is the precise fix for the `cw1` score bug, generalized.

- The failure is described almost verbatim by a practitioner: David Strachan, *"Dave's Overly
  Detailed Analysis… Scores"* [E https://medium.com/@davesinhispants/daves-overly-detailed-analysis-of-a-game-system-part-1-scores-fbc0437ee950 ]:
  *"I worry there would be situations where players would get into an endless loop of **farming
  points and not progressing** towards the end of the game."* That endless farm loop is exactly
  what an open, non-idempotent reward + a respawn enables.
- The deeper principle is **endogenous, earned value**. Yu-kai Chou, *"Why Badges and Points
  Fail"* [E https://yukaichou.com/gamification-analysis/core-drive-2-accomplishment-progression/ ]:
  *"showing accomplishment and creating the feeling of accomplishment are different things… When
  you award a badge for logging in… you're not rewarding accomplishment, you're rewarding
  compliance."* A re-collectible reward rewards *repetition*, not *accomplishment*. Idempotency is
  what keeps a reward tied to a real first-time achievement.

**→ The rule (synthesis), as three observable invariants:**
1. **Count-once:** each reward instance flips a one-shot flag on first acquisition; subsequent
   overlaps/interactions do nothing. (`cw1` does this for the SAME flower via `collected` — the
   principle is to make it *mandatory and asserted*, for ALL reward types, ALL archetypes.)
2. **Respawn-safe:** a respawn/soft-reset/checkpoint **never re-credits** an already-counted
   reward (and never resets the count downward to allow re-farming). The collected-set persists
   across respawns within a run.
3. **Monotone-bounded:** `0 ≤ score ≤ maxScore`, and `score` only increases (within a run), one
   reward at a time, until it reaches `maxScore`.

These three are checkable with **no new schema and no engine internals** — they read the
observable `__GAME__.score`. The anti-reward-hack stance holds: the fix changes real reward-credit
behavior, never the test.

### B.4 Score as a LEGIBLE signal of mastery/progress, not a bare counter

Even a bounded score is weak if it doesn't *mean* anything to the player in the moment.

- **eventXgames** [E]: convert points to **progress** with a denominator and milestones — "Before:
  'You have 8,450 points.' After: 'You've completed 84.5% of the Bronze level (8,450/10,000).'"
- **gamificationsummit / "From Points to Progression"** [E https://gamificationsummit.com/2026/03/16/from-points-to-progression-designing-systems-that-motivate-users/ ]:
  *"points quickly lose meaning when they fail to connect to a larger structure… without context,
  points become background noise."* Tie each point to **a threshold, a milestone, or the win-gate**.
- **Schell's *Lens of Visible Progress* (#49)** and **Burgun's score-test** both say the same
  thing from opposite ends: progress must be *perceivable* (a fraction, a bar, a rank), and the
  best "score" is often a **coarse, discrete** readout (waves cleared, stars earned, % complete)
  rather than a fine continuous number a player goes blind to (Strachan: Mario's score "has now
  basically become zoned out to every player").

**→ The rule (synthesis):** prefer a **legible, coarse progress readout** (`X / N collected`,
`% to goal`, `wave K of W`, `★★☆`) over a raw counter; and **tie the score to the win** so it
*matters* — the most robust meaning is when the score **gates** the end-state.

### B.5 How score interacts with win/lose (the strongest meaning: gating)

The cleanest way to make a score *mean something* in a completion game is to make it a **gate** on
the win — which `cw1` actually does well: the greenhouse door only wins at `score === 3`.

- This is the **endogenous-value** move (Schell, *Lens of Endogenous Value #5*): the score is
  valuable *because it gates the goal*, not because it's a number. The reward "changes the player's
  situation" (it unlocks the win) rather than just incrementing a counter — which the engine's own
  VERIFY-1 §6 already demands: *"does collecting MATTER beyond a counter (it changes the player's
  situation, gates the win, or buys safety)?"* [repo verify-design/SKILL.md §6]
- **Performance-game interaction:** in a score-attack game the score *is* the end-state — the run
  ends (death/timer) and the number is final and compared. There, `maxScore` may be the
  theoretical ceiling of a finite arena, or the design accepts an open number but **bounds the run**
  (a timer / finite enemy pool — the shmup "total enemies per level is limited"
  [E https://yewtu.be/watch?v=hbIrPeuOhlI ]).

**→ The rule (synthesis):** in a **completion** game, the score (if present) should **gate or
measure progress toward the win** (collect-N-to-open-goal, par/stars). In a **performance** game,
the score **is** the goal and the run must be **bounded by a fail/timer** so the number terminates
and means "this run's performance."

### B.6 Schell's reward taxonomy (so "reward" isn't reflexively "points")

Jesse Schell, *The Art of Game Design* — the *Lens of Reward (#40)* and its reward types
[E https://research.tedneward.com/gamedev/art-of-game-design/index.html ;
https://medium.com/@sherrichan/the-art-of-game-design-jesse-schell-11927c64827d ] list the common
reward kinds: **Completion** (closure), **Resources**, **Powers**, **Expression**, **Spectacle**,
**A Gateway** (new areas/abilities), **Prolonged Play**, **Points** (high scores/leaderboards),
**Praise**. The lens questions: *"Are players excited when they get rewards, or bored? … Getting a
reward you don't understand is like getting no reward at all… How are my rewards building — too
fast, too slow, just right?"* → **Points are ONE of nine reward kinds.** A completion game often
rewards better with a *Gateway* (the goal opens), *Spectacle* (the bloom/juice), or *Completion*
itself — the engine should not assume "reward == score." (synthesis from Schell's taxonomy)

---

## C. Difficulty & the "start higher, not a tutorial" principle

> **The thesis (validates "round one should start higher").** The first level is not a place to be
> *easy* — it is a place to be **a real game immediately**, while teaching the verb *through play*.
> "Teach-test-twist" is ONE early beat, not the whole game. Over-applying "safe onboarding" is the
> cause of the tutorial-grade feel.

### C.1 The flow channel — the shape difficulty must follow

Csikszentmihalyi's **Flow** is the spine of all difficulty literature: challenge and skill must
stay *roughly proportional* — too-hard → anxiety, too-easy → boredom; the **flow channel** is the
band between them.

- **gamedeveloper, "The Flow Channel"** [E https://www.gamedeveloper.com/design/game-design-theory-applied-the-flow-channel ]
  and **"Difficulty curves: how to get the right balance"** [E https://www.gamedeveloper.com/design/difficulty-curves-how-to-get-the-right-balance- ]:
  *"The optimal difficulty curve puts your players into a flow state, where the difficulty starts
  slightly **above** the player's skill, but not so tough as to feel insurmountable."* Where skill
  exceeds challenge = boredom zone; where challenge exceeds skill = frustration zone.
- The **WAVED / fractal flow channel** (gamedeveloper "Flow Channel"; What's-in-a-Game
  [E http://whats-in-a-game.com/controlling-flow/ ]): difficulty rises overall but **oscillates** —
  each new level/world starts a little *easier* than the previous ended, then climbs past it.
  Schell (quoted there): *"This cycle of 'tense and release, tense and release' comes up again and
  again… Too much tension and we wear out; too much relaxation and we grow bored."*
- **The non-obvious warning** (gamedeveloper "The flow applied to game design"
  [E https://www.gamedeveloper.com/design/the-flow-applied-to-game-design ]): reflexively
  *lowering* difficulty after playtests "increases the potential boredom zone… we deliberately
  create a boring game experience." **A too-easy round one is a *flow failure*, not a safe choice.**

**→ The rule (synthesis):** difficulty should sit **slightly above current skill** and **rise**;
the engine's danger is the *bottom* of the channel (boredom), which is the tutorial-grade `cw1`
problem. The DIFFICULTY-FLOOR principle (below) is the observable guard.

### C.2 The opening should be a real game, "in media res"

The strongest, most repeated lesson in the onboarding literature: **the first minutes are a
*promise*, not a lecture.**

- **game-changr, "Stop Teaching, Start Seducing"** [E https://www.game-changr.com/post/stop-teaching-start-seducing-how-to-make-players-fall-in-love-in-10-minutes ]:
  *"Your first 10 minutes are NOT a tutorial… The opening isn't a separate design problem to solve.
  It's your game's thesis. It's your contract."* The litmus test: *"if players only experience the
  first 10 minutes, will they understand exactly what makes it special?"*
- **Sense Central, "How to Build a Good First Level That Hooks Players"**
  [E https://sensecentral.com/how-to-build-a-good-first-level-that-hooks-players/ ]: *"The first
  level is a promise… A powerful first level opens with a strong visual, a short interactive beat,
  or a clear situation — not a wall of explanation… let the player touch something meaningful
  quickly… end on payoff."*
- **Filament Games, "How to Design the First Five Minutes"** [E https://www.filamentgames.com/blog/how-design-first-five-minutes-your-game/ ]:
  *"There is a lot of over-tutorializing out of fear of the player getting stuck… A player's first
  experience does not have to be a tutorial… give players a taste of the fun that awaits as quickly
  as possible."*
- **The canonical proof — Super Mario Bros. 1-1** [E https://www.toy-people.com/en/?p=103730 ]:
  1-1 is *both* a real, exciting level *and* a complete invisible tutorial — it teaches enemies,
  rewards, growth, and the running jump **through play, with no manual**, inside a level that is
  already fun. The key Miyamoto detail: **"course design is often crafted *after* the more complex
  later levels are finished"** — you build the hard content first, then design the opening to teach
  exactly the skills it needs. (Directly mirrors §D's "build the engine, then layer.")

**→ The rule (synthesis):** **round one must already be a real, interesting game** (a genuine
risk-decision per §E), that *teaches the verb through play* (per the engine's existing onboarding
rule), not a stripped exercise. "Safe onboarding" governs the **first beat** (the teach), not the
whole level.

### C.3 Teach-test-twist is ONE early beat, not the whole game

The reusable level-structure that reconciles "teach safely" with "be a real game from the start":

- **The Level Design Book, "Pacing → Teach, test, twist"** [E https://book.leveldesignbook.com/process/preproduction/pacing ]:
  *"Teach: teach the player about a game activity. Test: test whether the player can repeat and
  recognize it. Twist: twist the frame of the activity."* And the pacing advice: *"Start slow and
  quiet"* — but note even Half-Life's famous quiet opening is *one beat*, then the game begins.
- **GMTK's four-step (kishōtenketsu)** [E https://www.youtube.com/watch?v=dBmIkEvEBtA ]:
  *introduction (safe) → development (dangerous) → twist → conclusion* — "a mechanic taught,
  developed, twisted, and thrown away **in about five minutes flat**." The *teach* is a fraction of
  the level; the rest is real challenge.
- **Celia Wagar, "Phases of Level Design"** [E https://critpoints.net/2015/04/02/phases-of-level-design/ ]:
  *teach → challenge → subvert* — "the player must learn… but the other stages must exist."

**→ The rule (synthesis):** structure round one as **teach (one safe beat) → test (real challenge,
the genuine decision) → (optional) twist** — the teach is the *opening fraction*, after which the
level is a real game. M1 owns the *teach*; the level as a whole must reach *test* (a contested
decision), or it is tutorial-grade.

### C.4 Over-onboarding is the diagnosed disease

Multiple sources independently warn against the exact failure mode the engine exhibits:

- gamedeveloper, "No More Tutorials!" [E https://www.gamedeveloper.com/audio/no-more-tutorials-how-to-convey-information-through-design ]:
  standard tutorial levels "are often some of the least fun parts of the entire game."
- Sense Central, "Better Tutorials" [E https://sensecentral.com/how-to-design-better-tutorials-for-new-players/ ]:
  the anti-patterns include "teaching advanced systems before the player understands the basic
  loop" and "tutorial sections that feel disconnected from the real game."

**→ The rule (synthesis):** **the DIFFICULTY-FLOOR** — round one must contain at least one
*genuine, contestable challenge on the critical path* (a real decision per §E), reachable by a
real player. A level that is *only* a safe teach (verb exercised with no contest, win trivially
reachable) **fails the floor**. This is the observable test that catches "too simple."

---

## D. Scaffold-then-layer progression (validates the human's architecture intuition)

> **The thesis (validates "build a scaffold, then layering is cheap").** Real level design *is*
> "build a reusable mechanic once, then escalate its complexity cheaply across levels." The
> literature strongly supports the human's intuition — and the repo's scaffold **already ships the
> machinery** (a `LevelManager` + `_TemplateLevel` + multi-level end-screens) that currently goes
> **unused**. The fix is to *use* the engine across a short ladder, layering difficulty via config
> + small added capabilities, not via more code.

### D.1 The literature: reuse one mechanic, escalate it across levels

- **GMTK, "Super Mario 3D World's 4-Step Level Design"** [E https://www.youtube.com/watch?v=dBmIkEvEBtA ]:
  Nintendo built *"a reusable level design structure that allows for ideas to be properly taught
  and established in about five minutes flat."* Each stage takes **one** mechanic and runs it
  through introduce → develop → twist → conclude. The mechanic is the reusable unit; the levels are
  cheap variations.
- **GMTK, "Analysing Mario to Master Super Mario Maker"** [E https://www.youtube.com/watch?v=e0c5Le1vGp4 ]:
  *"A typical Mario level will only have one or two ideas, and then iterate upon them to make it
  increasingly challenging — bumping up the gap between jumps, making the timing harder, increasing
  the distance between safe zones, placing enemies as interceptors."* **This is "layer difficulty
  via config" stated in level-design terms** — the same engine, harder numbers/placement.
- **Celeste / Tadeas Jun, "design breathtaking 2D platformer levels"** [E https://www.tadeasjun.com/blog/2d-level-design/ ]:
  *"Each new mechanic is introduced in a safe space → first challenge → harder challenges (faster,
  smaller timing window, multiple instances) → combined with existing mechanics for maximum
  challenge."* Madeline "can do only three basic moves" — the *engine* is tiny and fixed; the 40+
  mechanics are *layered* on top.
- **The Level Design Book, "pile of beats"** [E https://book.leveldesignbook.com/process/preproduction/pacing ]:
  build many small encounters/puzzles, then arrange the best into a teach-test-twist ladder. Portal
  was built this way. → **levels are composed from reusable beats, not authored monolithically.**
- **Miyamoto's "design the opening last"** [E https://www.toy-people.com/en/?p=103730 ] — build the
  hard later content (which exercises the full engine), then design level 1 to teach exactly its
  skills. **The engine precedes the level ladder.**

### D.2 What this means for the repo (the architecture validation)

The human's intuition maps **exactly** onto established practice and onto machinery the repo
already has:

- The scaffold **already ships** `templates/core/src/LevelManager.ts` with a `LEVEL_ORDER` array
  and `getNextLevelScene()/isLastLevel()`, plus `VictoryUIScene`/`GameCompleteUIScene` that
  navigate "next level vs you-beat-the-game." [repo]
- `cw1` uses **exactly one** level (`LEVEL_ORDER = ['Level1Scene']`), so all the multi-level UI and
  the LevelManager navigation **go unused**. [case]
- The platformer module ships a `_TemplateLevel.ts` (a reusable empty level skeleton) — the
  "reusable mechanic" primitive is already present. [repo]

**→ The rule (synthesis):** a level-based completion game should ship a **short LADDER of levels
(≈2–4) that REUSE the same engine** (the scaffold's `LevelManager` + level scenes), where each
later level **escalates difficulty via config + placement + at most one small added capability** —
*not* via a pile of new code. Concretely, escalation levers are the cheap ones from the literature:
wider gaps / tighter timing windows (config), more/faster threats on the path (placement +
existing PatrolAI), one new mechanic introduced teach-test-twist. The **engine is built once**
(W2 scaffold), and **W1 declares the ladder**; W4 fills cheap level variations.

> **Caveat — respect the scope-cut and the milestone ceiling.** "A ladder of levels" is NOT a
> license to sprawl. The existing scope discipline (milestone ceiling 5; "more than N playable
> slices ⇒ cut, don't grow") still binds. The ladder is the *cheap difficulty layer on a fixed
> engine* (2–4 levels reusing one engine), not a content explosion. The engine-reuse is precisely
> what keeps the extra levels *cheap* (the human's point): a second level that reuses the engine is
> a config + placement diff, not a new build. (synthesis; reconciles with
> `design/pipeline-design-v1.md` §3b and `classify-game/SKILL.md` §3)

### D.3 Why "start higher" and "scaffold-then-layer" are the SAME principle

Round one being a real game (§C) and the engine-then-ladder architecture (§D) are two faces of one
idea: **the engine carries the interestingness; the levels are cheap escalations of it.** If the
engine (the core loop + the contested decision) is real, then *level 1 is already a real game*
(start higher) AND *levels 2–4 are cheap* (layer). If the engine is just "trigger a mechanic in
isolation," then level 1 is a tutorial AND every later level needs new code to become interesting.
**Investing the design in the engine's core decision (§E) is what makes both the human's
intuitions true at once.** (synthesis)

---

## E. Interestingness / the core of fun

> **The thesis.** What separates a real game from a mechanic demo is an **interesting decision** on
> the critical path — a risk weighed against a reward. The engine already PROVES "threat contests
> the reward path" (VERIFY-1 §4); this section is the *design-content* grounding for why that check
> is the heart of fun, and how to make the decision genuinely interesting.

### E.1 "A game is a series of interesting decisions"

- **Sid Meier**, GDC 2012/2018 [E https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions ;
  https://www.youtube.com/watch?v=WggIdtrqgKg ]: *"It's easier to look at what is NOT an
  interesting decision. If a player always chooses [the same option], it's probably not an
  interesting choice; nor is a random selection."* Interesting decisions involve a **tradeoff**
  ("the fastest car has poorer handling"), are **situational**, and let the player **express a
  playstyle**. (Meier explicitly carves out rhythm/puzzle games as where this is "not front and
  center" — reinforcing §A's type-dependence.)
- **The formal definition** (Rollings & Morris, via Critical-Gaming
  [E https://critical-gaming.com/blog/2011/4/12/interesting-choices-interesting-gameplay-pt1.html ]):
  an interesting choice has **(a) no option clearly better**, **(b) options not equally
  attractive** (they differ), and **(c) the player is informed** (understands the rules/state).
- **gamedeveloper, "Designing Interesting Decisions… (And When Not To)"**
  [E https://www.gamedeveloper.com/design/designing-interesting-decisions-in-games-and-when-not-to- ]:
  decisions need **consequences**, **predictability** (the player can foresee the effect at least
  partly), and **non-obviousness** (the "Big Burn vs Bad Burn" anti-example: a strictly-dominant
  option is no decision). Beware **analysis paralysis** (too many choices).

### E.2 Risk vs reward is the most reusable interesting-decision

For small arcade-style games (the engine's wheelhouse), the canonical interesting decision is
**risk vs reward on the critical path**:

- **gamedeveloper, "The More You Know"** [E https://www.gamedeveloper.com/design/the-more-you-know-making-decisions-interesting-in-games ]:
  *"The goal is to require some form of trade-off with every decision. One example is choosing
  between a smaller but safer bonus, and a riskier but much more powerful one."*
- **The Level Design Book** "risk vs reward" and the **threat-on-the-critical-path** idea — already
  the engine's VERIFY-1 §4 ("undesirable solution" check): if a reward/goal is reachable *without*
  engaging the threat, there is **no decision** → the loop is a chore.
- **GMTK Mario Maker** [E https://www.youtube.com/watch?v=e0c5Le1vGp4 ]: *"here you get a choice —
  the easy route and keep moving, or the risky option up through these spikes"* with a payoff at the
  end. The interesting decision is *built into the level geometry*.

**→ The rule (synthesis):** the core loop must contain **at least one genuine risk-vs-reward
decision on the critical path** — the reward (that gates/advances the win) sits where taking it
means entering the threat's space. This is the engine's existing "threat contests reward" relation
(VERIFY-1 §4 / write-gdd §3.5 CHALLENGE) — this section grounds *why it is the core of fun* and is
the design-side of the DIFFICULTY-FLOOR (§C.4): a level with no contested decision is a demo, not a
game.

### E.3 Loops vs arcs — what to invest the design in

Daniel Cook's **loops and arcs** [E https://lostgarden.com/2012/04/30/loops-and-arcs/ ] is the
sharpest tool for "what makes the engine the engine":

- A **loop** is "a structure built for repeated usage… loops deliver value through the act of being
  exercised… well suited for mastery tasks." An **arc** is "a broken loop you exit immediately"
  (a cutscene, a one-time reveal — "the movie is watched, the book consumed").
- Cook's diagnostic: *"identify loops and arcs… and then remove the arcs to see if what is left
  stands on its own. Arcs are almost never critical game elements. You can remove them and still
  have a playable game."*

**→ The rule (synthesis):** the engine's *fun* lives in the **core LOOP** (the repeated risk-vs-
reward decision), not in arcs (a one-time win cutscene, a static reward). The design investment
goes into making the **loop's decision interesting and re-exercisable** — which is precisely what
makes round one a real game (§C) AND makes the level ladder cheap (§D, since each level re-exercises
the same loop at higher difficulty). For `game-omni`'s small games, **the loop is almost the whole
game** — invest there.

### E.4 Scoring as an interesting-decision amplifier (ties §B to §E)

A well-designed score *creates* interesting decisions; a bare counter does not.

- **Peggle** (Redbrick [E]): score-boosting pegs turn "from fun to necessary," switching score
  "from motivator to resource" and creating real targeting decisions.
- **itch.io, "What Makes a Great Scoring System? Lessons from the Arcade"**
  [E https://itch.io/blog/810141/what-makes-a-great-scoring-system-lessons-from-the-arcade ]:
  *"Tie scoring to skillful play… Balance risk and reward… encourage players to [take risks for
  bigger payoffs]."*
- **gamedeveloper "Just Make My Numbers Go Up"** [E]: *"Remove the stigma from penalties and use
  them. If players have a limited amount of points they can acquire, then point-reducing penalties
  become a very compelling mechanic"* — bounded score makes risk decisions meaningful.

**→ The rule (synthesis):** if a game scores, the score should *create* the interesting decision
(a risky-but-higher-value reward, a chain you can break, a bounded total you weigh), not just count.
A bounded, idempotent, gating score (§B) is what makes this possible — an open counter cannot.

---

## F. Win/lose & progression integrity

> **The thesis.** A real game has **reachable, meaningful end-states**, a **coherent fail model**,
> and **no soft-locks** — across a multi-level flow. The engine already enforces much of this
> (VERIFY-1 winnability + status-coherence; write-gdd §3.5 reachability + `failModel`). This section
> grounds the *progression-integrity* additions: multi-level end-states and the "score gates a
> reachable win" coherence.

### F.1 Reachable, meaningful end-states

- The engine already requires a **reachable** end-state (VERIFY-1 §3 reference solution;
  write-gdd §4 invariant 2 "the win, once met, makes the game END") — grounded in
  **Sturgeon-MKIII** completability-by-playthrough (`docs/bucket3-playability-research.md`). [repo]
- **The Level Design Book** "Avoid maximum-intensity final encounters"
  [E https://book.leveldesignbook.com/process/preproduction/pacing ]: the final beat should be an
  *earned conclusion* (a "denouement"), often *not* the hardest thing in the game — "the final boss
  of Dark Souls has lots of health but a relatively simple combat style." → the end-state should
  feel like a *payoff for mastery shown*, not a difficulty spike.

**→ The rule (synthesis):** the win must be **reachable by the documented verb** (already enforced)
AND **earned** — the final beat is the conclusion of the teach-test-twist arc (§C.3), a
demonstration of the skill the level built, not a trivial touch nor an unfair spike.

### F.2 Coherent fail model + no soft-locks (already strong; reinforced)

The engine already handles this rigorously and this doc does **not** alter it — it reinforces it:
- **Status-model coherence:** `status` `'won'`/`'lost'` are terminal sinks; a recoverable fail
  (respawn) stays `'playing'` on a distinct observable. [repo write-gdd §3 / verify-design §5]
- **`failModel ∈ {health, lives, respawn, none}`** chosen explicitly and matched to
  `loseCondition.observable`. [repo write-gdd §3]
- **No soft-lock:** every required element acquirable before needed; BFS/kinematic reachability.
  [repo verify-design §3]

**→ The progression-integrity addition (synthesis):** in a **multi-level** flow (§D), these
invariants must hold **per level AND across the ladder** — each level is independently completable,
the ladder advances on win (the `LevelManager` already does this), and the *final* level's win is
the game-complete end-state. No level in the ladder may soft-lock the run.

### F.3 The score↔win coherence (closes the loop with §B)

The most common progression-integrity bug for *scored completion games* is a score that doesn't
cohere with the win:
- If the win is gated on `score == N` (like `cw1`'s door), then **`maxScore` must be reachable**
  (all N rewards reachable per the reachability gate) AND **`maxScore == N`** (or `≥ N` with the
  gate at N) — otherwise the gate is unreachable (soft-lock) or trivially padded. [synthesis]
- The score must be **monotone-bounded and idempotent** (§B) so the gate condition is *stable* —
  a farmable score makes "score == N" reachable trivially and "score meaningful" false.

**→ The rule (synthesis):** for a score-gated win, VERIFY-1 should prove **`maxScore` is reachable
AND the gate threshold ≤ maxScore AND every reward counts once** — i.e. the score, the rewards, and
the win are mutually coherent. This unifies §B (bounded/idempotent) with §F (reachable end-state).

---

## G. APPLICATION MAP — how each principle changes the three design nodes

> **This is the bridge the next task uses to encode the doc into the skills.** For each principle,
> it states concretely what W0 classifies, what W1 declares, and what VERIFY-1 must PROVE — phrased
> as **observable, un-gameable** rules (the repo forbids reward-hackable tests and asserts only
> observable `__GAME__` state). None of these require a new `__GAME__` field; they declare/prove
> over `score`, `status`, reward counts, and the layout the design already produces.

### G.1 Scoring-need + scoring-model (§A, §B)

- **W0 (classify-game):** emit a **`scoringModel` signal** alongside the archetype:
  `∈ {none, bounded-collectible, bounded-threshold, performance}` — derived from the prompt's
  **goal-type** (completion → `none` or `bounded-*`; performance/survival → `performance`). This
  tells W1 *whether to score at all and how*, so W1 stops reflexively adding a counter. Default for
  a completion prompt is **`none` or `bounded-collectible`**, never an open counter.
- **W1 (write-gdd):** if `scoringModel != none`, **declare `meta.maxScore`** (a finite reachable
  total = Σ reward values) and mark every reward **idempotent (one-shot, respawn-safe)** in its
  mechanic description AND in an assertion. Add a milestone assertion that **score is bounded and
  idempotent**: e.g. *"collecting the same reward twice (incl. after a respawn) does not increment
  score"* (`observe: score`, `expect: unchanged` on a second overlap / post-respawn re-overlap) and
  *"score never exceeds maxScore"* (`observe: score`, `expect: atMost: maxScore`). Prefer a
  **legible progress readout** (`X / maxScore`) over a raw counter. If `scoringModel == none`, the
  GDD declares **no score** and the win is the readout.
- **VERIFY-1 (verify-design):** add rubric checks — **(score-bounded)** prove `maxScore` is finite,
  reachable, and `== Σ(reward values)`; **(score-idempotent)** confirm the design's reward-credit
  is one-shot + respawn-safe (no `respawn → re-credit` edge — the *score* analogue of the existing
  *status* monotonicity check); **(score-coheres)** if the win is score-gated, prove
  `gate-threshold ≤ maxScore` and the threshold reward-set is reachable. Author these as
  Given/When/Then ACs over `score` so VERIFY-2 replays them. If `scoringModel == none`, assert **no
  score field is surfaced** (so a vestigial counter can't leak in).

### G.2 Difficulty-floor / "start higher, not a tutorial" (§C, §E)

- **W0:** in the **scope-cut**, add a **scope-*preserve* counter-note** — the cut removes *systems*,
  but must **NOT** reduce round one below "a real game with one contested decision." Record a
  `mustPreserve` of the core contested decision so W1 can't cut the game down to a teach.
- **W1:** under `## Playability` (§3.5), the **CHALLENGE** pillar already requires a threat on the
  reward path — strengthen it to a **DIFFICULTY-FLOOR**: round one must reach the *test* beat (a
  genuine risk-vs-reward decision per §E), not stop at *teach*. Structure the level as **teach (M1,
  one safe beat) → test (the contested decision) → (optional) twist**. The win must be **earned**
  (the conclusion of the arc), not a trivial touch.
- **VERIFY-1:** add a **DIFFICULTY-FLOOR check** — prove that **at least one reward/goal on the
  critical path is contested by a threat** (it already does this via §4 "no threat-free path") AND
  that the level is **not trivially winnable** (the reference solution must pass through ≥1 contested
  decision; a solution that reaches the win with zero threat engagement FAILS the floor — the design
  is a chore/tutorial). This is the observable form of "too simple": *a winnable path that engages
  no threat ⇒ FAIL, re-place the threat onto the path.* (Strengthens the existing §2 "interesting
  decision" criterion from "stated" to "the reference solution must demonstrate it.")

### G.3 Scaffold-then-layer level ladder (§D)

- **W0:** unchanged in routing, but the scope-cut should distinguish **"more SYSTEMS"** (cut) from
  **"more LEVELS reusing the engine"** (allowed, bounded) — so a short ladder isn't reflexively cut
  as scope creep.
- **W1:** for a level-based completion game, **declare a short level LADDER (≈2–4 levels) in the
  GDD/PLAN** that **reuses the engine**, where each later level escalates difficulty via
  **config + placement + ≤1 small added capability** (wider gaps, tighter windows, more/faster
  threats on the path, one new teach-test-twist mechanic). Each level is its own playable milestone
  with its own win; the ladder maps onto the scaffold's `LevelManager.LEVEL_ORDER`. Keep within the
  milestone ceiling (the engine-reuse is what keeps the extra levels cheap). The first level is
  *already a real game* (G.2); later levels are *cheap escalations*.
- **VERIFY-1:** add an **engine-reuse check** — prove each ladder level **reuses the shared engine**
  (the blueprint's later levels are *config/placement diffs* over the same scenes/behaviors, not new
  bespoke systems) and **each level is independently completable** (per-level reference solution) and
  **the ladder advances on win** to a final game-complete end-state (no inter-level soft-lock). This
  is the design-side guard that the `LevelManager`/multi-level machinery is actually used and that
  "layering" stayed cheap (config-not-code).

### G.4 Win/lose & progression integrity (§F) — mostly reinforcement

- **W0/W1/VERIFY-1:** the existing status-coherence, `failModel`, reachability, and no-soft-lock
  rules are **kept verbatim**. The *additions* are: (a) the **score↔win coherence** check (G.1);
  (b) the **per-level + across-ladder** completability check (G.3); (c) the **earned end-state**
  framing (the final beat is a conclusion, not a spike — VERIFY-1 records it under the
  pacing/onboarding criterion §6).

### G.5 Summary table — principle → node responsibilities

| Principle (§) | W0 classify | W1 write-gdd (DECLARE) | VERIFY-1 (PROVE) |
|---|---|---|---|
| Score-need is type-dependent (A,B.1) | emit `scoringModel` from goal-type | score ONLY if model≠none; else win is the readout | assert no vestigial counter if model=none |
| MAX score (B.2) | — | `meta.maxScore` = Σ reward values, finite+reachable | `maxScore` finite, reachable, `==Σ`; `score ≤ maxScore` |
| Idempotent rewards (B.3) | — | each reward one-shot + respawn-safe (mechanic + assertion) | no `respawn→re-credit`; second overlap = `score unchanged` |
| Legible/gating score (B.4,B.5) | — | `X/maxScore` readout; score gates/measures the win | score-gated win: threshold ≤ maxScore, set reachable |
| Difficulty-floor / start-higher (C,E) | scope-*preserve* the contested decision | teach→test→twist; round one reaches a real decision | reference solution engages ≥1 contested threat; not trivially winnable |
| Scaffold-then-layer ladder (D) | distinguish "more systems"(cut) vs "more levels"(ok) | declare a 2–4 level ladder reusing the engine (config-not-code) | each level reuses engine + independently completable; ladder advances to final end-state |
| Interesting decision = core loop (E) | (carried by scope-preserve) | the core loop = a risk-vs-reward decision; invest the loop | §2/§4 already; strengthen to "reference solution demonstrates the decision" |
| End-state integrity (F) | — | earned, reachable end-state; status/failModel coherent (kept) | reachable+earned; per-level+ladder no soft-lock; score↔win coherent |

---

## Core Principles (the actionable distilled list)

The 8–15 generalizing, observable rules this research distills. Each holds for ALL archetypes,
asserts only observable `__GAME__` state, and is phrased as a relation (never a `cw1` constant).

1. **Score-need is game-TYPE-dependent.** Score iff the goal-type is performance/score-test (or a
   *deliberate* optional skill layer); a **completion** game gets **no score or a bounded one** —
   never a reflexive open counter. (the win is the readout). *[§A, §B.1]*
2. **MAX-SCORE.** A scoring game declares a finite, knowable, **reachable `maxScore`** (= Σ of all
   idempotent reward values); `score` is bounded by it and expressed **against** it (`X / maxScore`).
   *[§B.2 — the human's "there must be a maximum"]*
3. **IDEMPOTENT rewards.** Every reward counts **exactly once, ever** — one-shot, and **never
   re-credited after respawn/restart**; `score` is **monotone up to `maxScore`**. This is the root
   fix for the farming bug. *[§B.3 — the human's "rewards aren't idempotent"]*
4. **Score must MEAN something (legible + gating).** Prefer a coarse progress readout over a bare
   counter, and **tie the score to the win** (gate or measure progress) so it isn't background
   noise. *[§B.4, §B.5]*
5. **"Reward" ≠ "points."** Points are one of nine reward kinds (Schell); a completion game often
   rewards better via a Gateway (goal opens), Spectacle (juice), or Completion itself. *[§B.6]*
6. **START HIGHER — round one is a real game, not a tutorial.** The first level is a *promise*; it
   teaches the verb *through play* while already being interesting. *[§C.2 — the human's "start
   higher"]*
7. **Teach-test-twist is ONE early beat.** The *teach* is the opening fraction (M1); the level must
   reach the *test* (a genuine contested decision). Over-onboarding is the diagnosed disease. *[§C.3, §C.4]*
8. **DIFFICULTY-FLOOR (the observable "not too simple" guard).** Round one must contain ≥1 genuine
   risk-vs-reward decision **on the critical path**; a winnable path that engages no threat is a
   chore → FAIL, re-place the threat. *[§C.4, §E.2, §G.2]*
9. **Difficulty follows the FLOW CHANNEL.** Sit slightly above current skill and rise (waved/fractal);
   a too-easy round one is a *flow failure* (boredom), not a safe choice. *[§C.1]*
10. **SCAFFOLD-THEN-LAYER.** Build the engine once; add a short ladder (≈2–4 levels) that **reuses
    it**, escalating difficulty via **config + placement + ≤1 small capability** — not new code.
    The repo's `LevelManager`/multi-level UI already exist; *use* them. *[§D — the human's
    architecture intuition]*
11. **Invest the design in the LOOP, not arcs.** Fun lives in the repeated risk-vs-reward decision
    (the loop); arcs (win cutscene, static reward) are removable. Investing the loop makes "start
    higher" AND "layer cheaply" true at once. *[§E.1, §E.3, §D.3]*
12. **Interesting decision = a tradeoff with consequences, predictable, non-obvious, on the path.**
    No dominant option; the reward that advances the win sits in the threat's space. *[§E]*
13. **Reachable + EARNED end-states.** The win is reachable by the documented verb (kept) and is the
    *conclusion of the arc* (a payoff for mastery shown), not a trivial touch nor an unfair spike. *[§F.1]*
14. **Progression integrity across the ladder.** Status/`failModel` coherence and no-soft-lock hold
    **per level and across the ladder**; the ladder advances on win to a final game-complete end-state. *[§F.2]*
15. **Score↔win coherence.** For a score-gated win, prove `gate-threshold ≤ maxScore`, the threshold
    reward-set is reachable, and rewards are idempotent — score, rewards, and win are mutually
    coherent. *[§F.3, §G.1]*

---

## Sources index (for reuse)

### External — game-design literature [E]
**Scoring / rewards / meaning:**
- Keith Burgun, "Against score systems (and for success and failure)" — http://keithburgun.net/against-score-systems-and-for-success-and-failure/ (mirror: https://www.gamedeveloper.com/design/against-score-systems-and-for-success-and-failure-) — completion vs high-score vs score-test; "if a target score, keep it low/discrete."
- gamedeveloper, "Just Make My Numbers Go Up: Breaking Our Addiction to Points" — https://www.gamedeveloper.com/design/just-make-my-numbers-go-up-breaking-our-addiction-to-points — terminuses/caps; penalties; multi-axis ranking.
- eventXgames, "Points Are Dead, Progress Is Everything" — https://eventxgames.com/blog/points-are-dead-progress-is-everything/ — denominator turns accumulation into progress; closure needs a finish line.
- gamificationsummit, "From Points to Progression" — https://gamificationsummit.com/2026/03/16/from-points-to-progression-designing-systems-that-motivate-users/ — points without structure = background noise.
- Yu-kai Chou, "Why Badges and Points Fail" — https://yukaichou.com/gamification-analysis/core-drive-2-accomplishment-progression/ — accomplishment vs compliance; real, visible, earned progress.
- David Strachan, "Dave's Overly Detailed Analysis… Scores" — https://medium.com/@davesinhispants/daves-overly-detailed-analysis-of-a-game-system-part-1-scores-fbc0437ee950 — the "farming points instead of progressing" failure; hidden/coarse scores.
- Redbrick, "Are Scoring Mechanics Outdated?" — https://www.redbrick.me/are-scoring-mechanics-outdated/ — Mario's vestigial score; Mario Wonder strips it; Peggle/DMC re-contextualize score.
- itch.io, "What Makes a Great Scoring System? Lessons from the Arcade" — https://itch.io/blog/810141/what-makes-a-great-scoring-system-lessons-from-the-arcade — tie to skill, risk/reward, progression.
- GMTK, "Are Score Systems Still Relevant?" — https://www.youtube.com/watch?v=K6y9PJipfpk — score as optional challenge layer (Assault Android Cactus), arcade lineage.
- Jesper Juul, "Without a Goal" — https://jesperjuul.net/text/withoutagoal/ — completion vs optimization goals; games without goals.
- Jesse Schell, *The Art of Game Design* — Lens of Goals (#25), Lens of Reward (#40), Lens of Endogenous Value (#5), reward taxonomy, Lens of Visible Progress (#49) — https://research.tedneward.com/gamedev/art-of-game-design/index.html ; https://schellgames.com/blog/lens-of-goals ; https://medium.com/@sherrichan/the-art-of-game-design-jesse-schell-11927c64827d
- shmup scoring (yewtu mirror) — https://yewtu.be/watch?v=hbIrPeuOhlI — bounded runs (finite enemy pools), risk for score.

**Difficulty / flow / onboarding / media res:**
- gamedeveloper, "The Flow Channel" — https://www.gamedeveloper.com/design/game-design-theory-applied-the-flow-channel — waved/fractal flow channel.
- gamedeveloper, "Difficulty curves: how to get the right balance" — https://www.gamedeveloper.com/design/difficulty-curves-how-to-get-the-right-balance- — start slightly above skill; per-genre.
- gamedeveloper, "The flow applied to game design" — https://www.gamedeveloper.com/design/the-flow-applied-to-game-design — lowering difficulty grows the boredom zone (the key warning).
- What's-in-a-Game, "How to Keep Players in Their Flow Channel" — http://whats-in-a-game.com/controlling-flow/ — fractal flow curve; Schell's tense/release.
- Csikszentmihalyi flow (applied): Jenova Chen, "Flow in Games" — https://jenovachen.com/flowingames/Flow_in_games_final.pdf
- game-changr, "Stop Teaching, Start Seducing" — https://www.game-changr.com/post/stop-teaching-start-seducing-how-to-make-players-fall-in-love-in-10-minutes — first 10 min are the thesis/contract, not a tutorial.
- Sense Central, "Build a Good First Level That Hooks Players" — https://sensecentral.com/how-to-build-a-good-first-level-that-hooks-players/ — first level is a promise; end on payoff.
- Filament Games, "Design the First Five Minutes" — https://www.filamentgames.com/blog/how-design-first-five-minutes-your-game/ — over-tutorializing; give a taste of fun fast.
- gamedeveloper, "No More Tutorials!" — https://www.gamedeveloper.com/audio/no-more-tutorials-how-to-convey-information-through-design — standard tutorial levels are the least-fun parts.
- Sense Central, "Better Tutorials for New Players" — https://sensecentral.com/how-to-design-better-tutorials-for-new-players/ — anti-patterns (teach advanced before the loop).
- Super Mario Bros. 1-1 (Miyamoto) — https://www.toy-people.com/en/?p=103730 — level that is a real game AND an invisible tutorial; "design the opening last."

**Level-design reuse / teach-test-twist / pacing:**
- The Level Design Book, "Pacing" (teach-test-twist, critical path, pile-of-beats, start slow, avoid max-intensity finale) — https://book.leveldesignbook.com/process/preproduction/pacing
- GMTK, "Super Mario 3D World's 4-Step Level Design" (kishōtenketsu; reusable structure) — https://www.youtube.com/watch?v=dBmIkEvEBtA
- GMTK, "Analysing Mario to Master Super Mario Maker" (one-two ideas, iterate to escalate; built-in risk choices) — https://www.youtube.com/watch?v=e0c5Le1vGp4
- Celia Wagar, "Phases of Level Design" (teach/challenge/subvert) — https://critpoints.net/2015/04/02/phases-of-level-design/
- Tadeas Jun, "design breathtaking 2D platformer levels" (Celeste: tiny engine, layered mechanics) — https://www.tadeasjun.com/blog/2d-level-design/

**Interesting decisions / fun / loops & arcs:**
- Sid Meier, "Interesting Decisions" — https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions ; https://www.youtube.com/watch?v=WggIdtrqgKg
- Critical-Gaming, "Interesting Choices pt.1" (Rollings & Morris: no-dominant / not-equal / informed) — https://critical-gaming.com/blog/2011/4/12/interesting-choices-interesting-gameplay-pt1.html
- gamedeveloper, "Designing Interesting Decisions… (And When Not To)" — https://www.gamedeveloper.com/design/designing-interesting-decisions-in-games-and-when-not-to-
- gamedeveloper, "The More You Know: Making Decisions Interesting" (risk/reward tradeoff) — https://www.gamedeveloper.com/design/the-more-you-know-making-decisions-interesting-in-games
- Daniel Cook, "Loops and Arcs" — https://lostgarden.com/2012/04/30/loops-and-arcs/ — loops (repeatable mastery) vs arcs (one-time); remove arcs and the game stands.
- Daniel Cook, "The Chemistry of Game Design" (skill atoms; grind = re-doing the known) — https://lostgarden.com/2007/07/19/the-chemistry-of-game-design/

### On-disk (already in this repo) [repo]
- `research/ai-game-generation-2026-06-08.md` — harness thesis (the layer this content rides on).
- `research/skills/w0-classify-research.md`, `research/skills/w1-spec-research.md` — node evidence bases.
- `docs/bucket3-playability-research.md` — reachability/legibility/onboarding/win-path (the prior playability brief this extends).
- `packages/skills/classify-game/SKILL.md`, `packages/skills/write-gdd/SKILL.md` (§3.5, §5), `packages/skills/verify-design/SKILL.md` — the current design skills (the GAPS this doc targets).
- `templates/core/src/LevelManager.ts`, `templates/modules/platformer/src/scenes/_TemplateLevel.ts` — the unused multi-level machinery §D builds on.
- `design/pipeline-design-v1.md` §3b — milestone policy / scope ceiling the level-ladder must respect.

### Illustrating case [case]
- `out/cw1/` — gnome-waters-sunflowers platformer: one trivial level; gated-but-unbounded, prose-only-idempotent score (`spec/gdd.json`, `spec/blueprint.json`, `src/scenes/Level1Scene.ts`, `MEMORY.md`). The concrete instance of both flaws — used only to illustrate; every rule above generalizes.
