# W0 Classify — research record

_Node: W0 Classify (Designer, first node, no upstream). Pipeline: game-omni (`design/pipeline-design-v1.md` §3, wave W0). Generated 2026-06-08 by the W0 design sub-agent._

This is the reusable evidence base for the W0 node. It records exactly **what was read/retrieved**, **what we take from each**, the **synthesis** that justifies the committed design, and **open questions** for later tuning. Source tags: `[repo]` = reference-repo path read in full; `[E]` = Exa web result; `[Y]` = YouTube transcript via yt-rag; `[R]` = Reddit via Apify scraper. Every best-practice in the SKILL traces to a row here.

---

## 1. Questions investigated

1. How do AI game-generation tools (and game designers) classify a raw idea into a genre/archetype?
2. What makes a robust, *physics-first / mechanics-first* game taxonomy (vs classifying by genre name)?
3. How do practitioners cut scope on small / LLM-generated games to avoid slop?
4. What is a good one-line "core loop" statement, and what fields anchor it?
5. What should a classify step instruct the model to think *toward* (the reasoning the node must force)?
6. What is the leanest artifact W0 can write that genuinely serves the downstream W1 Spec node, and is Pi-portable (single forced-JSON `agent()` output)?

---

## 2. What the reference repos do (per path → what we take)

### 2.1 `OpenGame/packages/core/src/tools/game-type-classifier.ts` — PRIMARY SOURCE
The shipped, physics-first archetype classifier. Read in full. Key extractions:

- **The taxonomy is the five-archetype set, keyed on PHYSICS + PERSPECTIVE, not genre name.** System prompt opens: _"You are a game physics analyzer. Your job is to classify games based on their PHYSICS and PERSPECTIVE, not their genre name."_ The five archetypes and their one discriminating question:
  - `platformer` — Side view + Y-gravity. **Key question: "Does the character FALL if there's no ground beneath them?"** (Mario, Terraria, Angry Birds, Street Fighter, Flappy Bird).
  - `top_down` — Top-down/iso, no gravity, free 8-dir. **Key question: "Can the character move UP without jumping?"** (Zelda, Isaac, Vampire Survivors, Asteroids, Hotline Miami).
  - `grid_logic` — Snap-to-grid, discrete steps. **Key question: "Does movement happen in discrete grid steps?"** (Sokoban, Fire Emblem, Chess, Tetris, Match-3, Minesweeper, Snake).
  - `tower_defense` — Enemies on fixed paths + waves; point-and-click towers. **Key question: "Do enemies follow a fixed path while player places defenses?"** (Kingdom Rush, Bloons TD, PvZ).
  - `ui_heavy` — UI panels + state changes, almost no arcade physics. **Key question: "Is the game primarily UI panels and state changes?"** (Slay the Spire, visual novels, idle/clickers, rhythm note-highways).
- **A structured `physicsProfile` is emitted alongside the archetype:** `{ hasGravity: bool, perspective: 'side'|'top_down'|'none', movementType: 'continuous'|'grid'|'path'|'ui_only' }`. This is the *mechanism* that makes the choice auditable — the archetype is a label, the physics profile is the reasoning made concrete. **We adopt both.**
- **A `reasoning` string is required** ("Brief explanation of why this archetype was chosen based on physics"). **We adopt** (renamed for clarity but kept).
- **"Common Mistakes to Avoid" disambiguation block** — the highest-value, least-obvious part. Concrete genre-name traps: _Terraria is NOT top_down (has gravity → platformer); Angry Birds is NOT puzzle (gravity physics → platformer); Hill Climb Racing is NOT top_down (gravity → platformer); SimCity/Factorio are grid_logic (grid building), not top_down; racing: side+gravity → platformer, top-down → top_down._ **We adopt this verbatim as the disambiguation heuristic set** — it's the anti-misclassification guardrail and generalizes (it teaches the *rule* "physics overrides the genre word in the prompt", not just the examples).
- **Low temperature (0.3), max_tokens 500, JSON-only output.** Classification is a low-creativity, high-precision task. **We adopt the doctrine:** force JSON, keep it terse, don't let the model wax.
- **Robust parse with fallback** (strip ``` fences; on parse failure scan text for an archetype substring; ultimate default = `platformer`). Pi note: the workflow's forced-JSON schema handles most of this, but **a deterministic default matters** for the no-fit edge.
- **The classifier runs FIRST**, before scaffolding and before GDD: tool description says _"Call this FIRST before scaffolding templates."_ This is exactly W0's position. The `formatLLMContent` even tells the next step to scaffold `templates/modules/${archetype}` — i.e. **the archetype string is a direct routing key into a template directory.** Confirms W0's single job: pick the routing key + justify it.

What we explicitly do NOT take: the OpenAI-compatible HTTP call machinery, provider-config resolution, the `cp -r templates/...` scaffold instructions embedded in the tool output (that's W2's job in our pipeline, not W0's).

### 2.2 `OpenGame/agent-test/templates/modules/*/src/gameConfig.json` (all 5) — what each archetype IS
Read all five configs to ground the archetypes in their actual tunable surface (so W0's disambiguation matches what the templates can actually deliver). The config "shape" is the fingerprint of each archetype:

- **platformer**: `playerConfig.gravityY: 1200`, `jumpPower: 620`, `walkSpeed`, health/attack, `enemyConfig`, `bossConfig`. → gravity + jump + side combat. Gravity is the literal discriminator (a `gravityY` field exists only here).
- **top_down**: `walkSpeed` + `dashSpeed`/`dashDuration`/`dashCooldown`, `enemyConfig` — NO gravity field, NO jump. → free movement + dash/i-frame combat.
- **grid_logic**: `gridConfig.cellSize`/`gridWidth`/`gridHeight`/`maxMoves`/`inputDebounceMs`. → discrete tile board, move budget, debounced stepping.
- **tower_defense**: `towerDefenseConfig.startingGold`/`startingLives`/`timeBetweenWaves`/`sellRefundRate`/`cellSize`. → economy + waves + lives + path grid.
- **ui_heavy**: `gameplayConfig.textSpeed`, `battleConfig.handSize`/`comboTiers`, `dialogueConfig`, `audioConfig`, `characterSelectConfig`, `dualPlayerConfig`. → cards/dialogue/turns/UI state, zero arcade physics.

Takeaway used in the SKILL: each archetype carries an implicit **mechanical capability set** the template already provides (gravity+jump; free-move+dash; grid-step+move-budget; path+waves+economy; cards/dialogue/turns). W0 should pick the archetype whose *native* mechanics best fit the prompt's core verb — and the scope-cut should drop verbs the chosen template doesn't natively support.

### 2.3 `OpenGame/agent-test/prompts/custom.md` — the end-to-end gen protocol (CLASSIFY portion)
The shipped autonomous "CODE-FIRST MODE" protocol. CLASSIFY portion = Phase 1 step 1: _"Classify: Call `classify-game-type` tool with user's game idea"_, using the same physics-first table (Module / Physics / Key Question / Examples). Confirms:

- **Classify is step 1 of the whole pipeline**, and its output (the archetype) is a hard routing key consumed immediately by scaffolding.
- **Scope framing in this protocol is implicit, not a first-class artifact** — the protocol relies on the template+GDD to bound scope, and on "do NOT read template source yet / reading now wastes context" discipline. Gap: OpenGame does *not* produce an explicit scope-cut artifact. Our pipeline's P8 (anti-slop) requires one; the online research (§3) supplies the proven pattern OpenGame lacks. **This is where W0 adds value beyond OpenGame.**

### 2.4 `Claude-Code-Game-Studios/.claude/skills/brainstorm/SKILL.md` + `docs/skills-reference.md` — SKILL.md format & design-intake style
- **SKILL.md format convention (adopted for our skill):** YAML frontmatter with `name`, `description` (a one-paragraph "use when…" string), optional `argument-hint`, `user-invocable`, `allowed-tools`, `model`; then an operational body written as numbered/sectioned instructions to the agent ("When this skill is invoked: 1… 2…"). Body is *operational*, not an essay. We mirror this exactly, trimmed to a runtime node (no interactive `AskUserQuestion` loops — W0 is autonomous and one-shot).
- **Design-intake substance to borrow (not the interactivity):** brainstorm's atoms are directly reusable as the *thinking targets* W0 must hit even though W0 infers rather than asks:
  - **Verb-First Design** — _"Start with the core player verb (build, fight, explore, solve, survive, create, manage, discover)… The verb IS the game."_ → W0's core-loop one-liner is verb-anchored.
  - **Elevator pitch "10-second test"** and **Core Fantasy** → the one-line core loop must be graspable instantly.
  - **Anti-pillars / boundaries**: _"define 3+ anti-pillars (what this game is NOT)… prevent the most common form of scope creep: 'wouldn't it be cool if…' features."_ → this is the **scope-cut**, framed as a studio practice. CCGS calls it anti-pillars; we call it `scope_cut`. Same mechanism.
  - **MVP definition**: _"the absolute minimum build that tests 'is the core loop fun?'"_ → aligns the scope-cut to "keep only what serves the core loop."
- We deliberately strip: the 6 interactive phases, director-gate subagents, `AskUserQuestion`, model-tier ceremony. W0 is a single non-interactive `agent()` call.

---

## 3. What practitioners / online sources say (per source → takeaway + link)

### 3.1 Exa web (10 results reviewed; all 2025–2026, mostly indie-dev / MVP guides)
A remarkably consistent cross-source consensus emerged — the **one-sentence pitch + one-paragraph/one-line core loop + explicit OUT-of-scope list** triad appears in nearly every source independently.

- **`[E]` Ziva — "How to Write a Game Design Document That You Will Actually Use"** (ziva.sh/blogs/game-design-document). The single best source for our artifact shape. A solo-indie GDD _"needs five [sections]"_: **(1) Elevator pitch (2 sentences)**, **(2) Core loop (1 paragraph): 'What does the player do every 30 seconds? What is the reward cycle?… If the core loop is not fun with placeholder art, no amount of polish will save the game.'**, **(3) Scope boundary — a list of what is OUT: 'Write down the features you will NOT build. "No multiplayer. No procedural generation. No crafting system. Five levels maximum." Every feature idea that comes up during development gets checked against this list.'** _"That is the whole document. Five sections. One page."_ → **Directly justifies our three core fields: pitch → core_loop, scope_cut (what is OUT), and the "checked against this list" enforcement role.** Brotato example: pitch = _"A roguelike where you play as a potato with six weapon slots. Runs last 10 minutes. The hook is absurd build variety."_
- **`[E]` Sense Central — "How to Write a Simple GDD That Actually Works"** + **"How to Avoid Feature Creep"** + **"How to Scope a Game Project"** (sensecentral.com, 3 articles, 2026-03). Convergent framework: _"1. Define the non-negotiable core loop… If a feature does not strengthen the core loop, it is already under suspicion."_; _"Create a 'Not Now' list… protects good future ideas without polluting the present build"_; _"Tie every feature to a milestone outcome."_ Three-bucket cut list: **Launch-critical (core loop, onboarding, win/lose, core progression) | Strong additions (post-stable) | Risky extras (multiplayer, procedural, UGC — exclude unless proven)**. → Justifies framing the scope-cut as a guardrail the downstream pipeline checks against, and the bucket idea (we keep it simple: just the OUT list for v1).
- **`[E]` Easton / BetterLink — "Validate Gameplay First, Build Systems Later"** (eastondev.com, 2026-05). _"After identifying the core loop, write it down in one sentence… many developers find they actually can't articulate 'what players are looping through.' If you can't articulate it, the core gameplay hasn't taken shape yet."_ _"This loop must be self-enclosed. When the loop ends, it must return to the starting point, giving players motivation to continue."_ Flappy Bird = _"tap-fly-crash, fun from day one."_ → Justifies the **"if you can't state the loop in one sentence, the design isn't ready" test**, and the **self-enclosed / returns-to-start** property of a good loop.
- **`[E]` Mind Studios — "How to Build an MVP Game"** (games.themindstudios.com, 2025-12). _"1. Identify your core gameplay loop. What is the repeatable mechanic? 2. Define the minimum feature set. 3. Set must-haves vs nice-to-haves… Write a 'not-in-MVP' list to avoid scope creep."_ → Independent corroboration of core-loop-first + explicit not-in-list.
- **`[E]` videogame.link — "Minimum Viable Mobile Game 2026"**. _"If your game cannot be explained in one sentence and played in under 10 seconds, it is not yet a minimum viable game."_ _"A strong loop should have ONE central verb. Tap, swipe, rotate, draw, match, dodge, stack, merge, or time… The moment you add a second or third core verb, the learning curve rises sharply and the game becomes harder to balance."_ Loop template: **start → act → get feedback → score/progress → fail or finish → restart.** _"feature ceiling, not feature wishlist: if a feature does not improve the core loop, it should be removed or postponed."_ → Justifies **one-central-verb discipline** and the canonical loop skeleton.
- **`[E]` gammer.us — "From Zero to Playable in 7 Days"**. _"Set your non-negotiable scope cuts… Write down what you will not build. This is the most important document in the sprint. No accounts, no purchases, no online leaderboard, no narrative cutscenes, no procedurally generated worlds, no multiple characters, no custom level editor."_ One-page brief fields: **game name, platform, core loop, controls, fail state, win state, art style, launch criteria.** _"If you can't describe the game in one sentence, it is too large."_ → Justifies the scope-cut as the *most important* artifact and the brief field set (subset of which W0 owns; rest is W1).
- **`[E]` mojolabs.nz — "What Makes a Small Game Actually Finishable?"**. _"Define 'Finished' in One Clear Sentence… explicitly exclude things ('no multiplayer', 'no story cutscenes')."_ Loop examples: action = _"Move → avoid enemy patterns → attack when safe → collect score pickups → survive to next wave"_; puzzle = _"Observe layout → make a move → see result → adjust plan → repeat until solved or stuck."_ Mark each feature **Core / Nice / Extra**. → Concrete loop phrasings per archetype family + the Core/Nice/Extra triage we fold into scope-cut.
- **`[E]` Wayline — "Ruthlessly Cut Features for a Killer Core Loop"**. _"80% of your game's appeal comes from 20% of its features."_ Stardew core loop = _"plant, water, harvest — everything else is icing."_ Worked cut examples (Celeste, Darkest Dungeon simplified crafting, Factorio cut RPG/story to focus on the factory loop). → Justifies "obsess over the 20% that is the core loop; cut the rest" as the scope-cut rationale.

### 3.2 YouTube (yt-rag, namespaces `yt_ai_game_generation` (48 vids) + `yt_game_feel_ui` (46 vids))

- **`[Y]` Game Maker's Toolkit (Mark Brown) — "How to find amazing game ideas"** (2025-02-25, youtu.be/0m60QbT85Tc?t=827). The most precise, citable core-loop decomposition. The atomic question set: **"What is the player's goal / win state? What is the obstacle (getting in the way)? What is the fail state? What are the player's actions (verbs)?"** Worked example — **Crazy Taxi**: _"win by delivering passengers to their destination; the obstacle is a persistent ticking timer; the fail state is running out of time before making money; the player's actions are driving fast, exciting and reckless."_ → **This is the exact reasoning frame W0 must force**: win-state + obstacle + fail-state + verbs. It composes the one-line core loop AND seeds W1's win/lose. Also: _"break ideas down to their smallest elements, almost to the atomic level"_; the **hook vs anchor** point — _"if a hook is something new and different, [an anchor makes] your game feel familiar or safe… in our case it's a familiar [genre] so players understand how your game will even be played"_ — supports archetype routing: the archetype IS the anchor (the familiar frame), the prompt's twist is the hook.
- **`[Y]` Game Maker's Toolkit — "What's the Point of Prototyping?"** (2025-11-05, youtu.be/8tHJgtbj6rs). _"Keep prototypes small and specific… It's not supposed to contain every system. Instead, it's a tiny sample of a specific feature."_ The ONE caveat for cutting: _"when it comes to game feel and juice… if it's a visceral game [you can't have] no feedback — part of what's going to help it be fun"_ (Fruit Ninja's splatters were in the prototype). → Supports: scope-cut may strip systems, but **do not cut the juice that makes the core verb feel good** (aligns with pipeline P7 "juice in templates").
- **`[Y]` GMTK — "What it's like to release a game on Steam"** (2024-12-06). The prototyping question set: _"What is this game? What does the player do? What does a level look like? What is the overarching structure? What's the core loop?"_ → corroborates "core loop" as a first-class up-front question.
- **`[Y]` Chong-U — "How To Vibe Code Your First Game for levelsio's Vibe Jam"** (2026-04-10, youtu.be/yKyjcbQiar4). The clearest AI-codegen intake practice: _"figure out your game idea and don't spend too long… Just think of a simple one-liner. It could be 'this game but with something else.' For example I said 'I want it to be like Super Crate Box but with ninjas.'"_ Then hard scope rules: _"keep the scope down… the biggest trap is thinking too big. Keep it single player, single screen, target desktop and web first. Don't think about mobile controls, VR, all that stuff."_ → Justifies the **"[familiar game] but [twist]" one-liner shorthand** and single-screen/single-mode default scope-cut for AI-generated games.
- **`[Y]` ProgrammingKnowledge2 — "How to Build Games with Claude AI (2026)"** (2026-05-10, youtu.be/5kh1w2vejIM). Shows a real AI tool's guided intake the model walks the user through: **genre (puzzle/arcade-action/trivia/word) → vibe/theme (cute-colorful / sleek-minimal / retro-pixel / spooky) → controls (click/tap/keyboard/drag-drop)**, then the model proposes a concrete game (air-traffic-control arcade) with **top-down view, spawn rules, controls, score, lives/lose conditions, difficulty curve**. → Direct evidence that the classify/intake step in shipping AI tools resolves exactly: **archetype/genre + control scheme + win/lose**, which the model then expands. Validates W0's output set.
- **`[Y]` JC BuenaVentura — "Godot MCP: Build Super Smash Bros"** (2026-02-25) and **Dog's Dream — "I Made a Game using Only AI"** (top-down bullet-hell). → Practitioners habitually name the archetype ("Smash clone" = platformer-fighter; "top-down bullet hell" = top_down) as the FIRST decision; the archetype is treated as the load-bearing frame the rest hangs off. Corroborates physics/perspective-named archetype as decision #1.

### 3.3 Reddit (Apify `macrocosmos/reddit-scraper`; r/gamedesign, r/gamedev, r/godot, r/ChatGPTCoding; 48 posts, top-sorted)

- **`[R]` "Make Small Games"** (r/godot, 737 pts, 137 comments — reddit.com/r/godot/comments/1ly0w5x). The community's scope-discipline manifesto, written as a satire of the over-scoper: _"I will go on to develop the next metroidvania hit game! Screw Hollow Knight…"_ then the cascade of half-fixes (attacks cancel jump → just disable air-attack → UI parented to player moves with it → "it's a feature"). Punchline: _"making small games isn't wasting time at all. When you make small-scoped games that you can actually finish, you learn…"_ → **Direct practitioner evidence that under-scoping discipline is THE survival skill**, and that scope rot manifests as a cascade of compromises — exactly the slop the scope-cut prevents. 945/847/705/419-pt "core gameplay loop done/look appealing?" showcase posts confirm **"core loop" is the unit practitioners build and validate first.**
- **`[R]` "I made a 1-page GDD template for smaller projects and jam games"** (r/gamedesign, 236 pts — reddit.com/r/gamedesign/comments/13w1tnt). Field set (independent of the Exa sources, same convergence): _"game name, theme, genre, audience, story, visual & audio style… a **main aim**, a **main mechanic for achieving the aim**, **enablers & blockers**, the **core loop**, **win/lose conditions** and any **additional features**."_ → Strong corroboration that a lean game spec = aim + main mechanic + core loop + win/lose, with everything else explicitly "additional." Maps cleanly: W0 owns archetype(genre) + core_loop(aim+main mechanic) + scope_cut(what's NOT in "additional"); W1 owns the rest.
- **`[R]` "20-year veteran: 5 critical design mistakes"** (r/gamedesign, 261 pts) + **"9 years experience providing in-depth critique"** (279 pts). Veteran (James Mouat, EA/Ubisoft): _"Focus on the 'Why'… understand the overall loop and spot where there are superfluous steps or things missing. Create a sense of need for the player. Find the core of the experience, find what's going to motivate."_ → Justifies the core-loop being framed around player motivation (the "why they repeat it"), and pruning superfluous steps = scope-cut.
- **`[R]` r/ChatGPTCoding — "Vibe Coding Manual", "The GOAT workflow", "$417 making a game with Claude Code"** → AI-codegen practitioners independently converge on: define-then-constrain, keep the AI on a tight spec, scope tightly or burn money/context. Reinforces the "lean forced artifact, tight scope" doctrine for the LLM context specifically.

---

## 4. Synthesis → the design decisions this justifies

1. **Adopt OpenGame's physics-first 5-archetype taxonomy verbatim** (`platformer | top_down | grid_logic | tower_defense | ui_heavy`), including the per-archetype **discriminating question** and the **"Common Mistakes" disambiguation block**. It is the only *shipped*, proven game classifier in the reference set, it routes 1:1 into our genre templates (`templates/modules/<archetype>`), and the physics/perspective basis generalizes across any prompt forever (it classifies by mechanics, which are finite, not by genre words, which are unbounded). [repo: game-type-classifier.ts; corroborated by [Y] practitioners naming archetype first]
2. **Emit a structured `physics_profile` alongside the archetype** (`has_gravity`, `perspective`, `movement_type`) — it makes the classification auditable and is the mechanism that forces physics-first reasoning rather than genre-name pattern-matching. [repo: ClassificationResult.physicsProfile]
3. **The core-loop one-liner is composed from a forced reasoning frame: win-state + obstacle + fail-state + player-verb(s).** This is GMTK's atomic decomposition (Crazy Taxi), and it doubles as a seed for W1's win/lose. The loop must be **self-enclosed (returns to start)** and built on **one central verb**. The "if you can't say it in one sentence, the design isn't ready" test is the quality bar. [Y: GMTK; E: Easton, videogame.link; R: 1-page GDD "main aim + main mechanic"]
4. **The scope-cut is a first-class artifact W0 owns — an explicit list of what is deliberately OUT.** This is the single most-cited anti-slop practice across every online source (Ziva "Scope boundary = list of what is OUT"; gammer "the most important document in the sprint"; Sense Central "Not Now list"; Mind Studios "not-in-MVP list"; Wayline "ruthlessly cut"; R: "Make Small Games"). OpenGame *lacks* this — it is precisely where W0 adds value over the donor repo and where pipeline principle P8 (scope discipline beats tooling) lands. The cut should drop: anything not serving the core verb; mechanics the chosen template doesn't natively support; and the standard AI-codegen over-scope traps (multiplayer, procedural gen, accounts/saves, multiple levels/characters, narrative branching, mobile/VR controls). [E×6, R×2]
5. **Default scope for an AI-generated game = single mode, single screen/scene where natural, desktop+web, one control scheme.** This is the explicit AI-vibe-coding consensus (Chong-U, videogame.link). W0 bakes these as default cuts unless the prompt specifically demands otherwise. [Y: Chong-U; E: gammer, videogame.link]
6. **Do not cut the juice.** The one thing scope-cutting must preserve is the game-feel/feedback on the core verb (GMTK's Fruit Ninja caveat) — aligns with pipeline P7 (juice ships in templates). So the scope-cut targets *systems and content*, not *feel*. [Y: GMTK prototyping]
7. **The artifact stays LEAN and forced-JSON, low-temperature.** W0 is a precision routing+framing step, not a creative essay. One `agent()` call, one JSON object, deterministic default to `platformer` on genuine no-fit (never block the pipeline). [repo: classifier temp 0.3 / JSON-only / fallback default; R: ChatGPTCoding tight-spec doctrine]
8. **The artifact must be exactly what W1 needs and no more.** W1 (Spec) consumes: the archetype (to load the right template capability doc), the physics profile (to set engine params), the core-loop one-liner (the spine the GDD elaborates), and the scope-cut (the boundary the GDD must respect and the milestone ceiling enforces). Fields beyond these belong to W1, not W0. [repo: custom.md Phase-2 generate-gdd consumes archetype; pipeline §3 W0→W1 handoff]

### Provenance map (repo-derived vs online-derived)
- **Repo-derived (the spine):** the 5-archetype taxonomy, discriminating questions, disambiguation block, physics_profile, JSON-only/low-temp/default-platformer doctrine, classify-runs-first position. → `game-type-classifier.ts`, `custom.md`, the 5 `gameConfig.json`.
- **Online-derived (the value-add over the donor):** scope-cut as a first-class OUT list, the win/obstacle/fail/verb core-loop frame, one-verb + self-enclosed loop properties, the "can't say it in one sentence → not ready" gate, default AI-codegen scope cuts (single-mode/screen/desktop), preserve-the-juice caveat. → Exa indie/MVP guides, GMTK, vibe-coding videos, r/godot + r/gamedesign.
- **Format-derived:** SKILL.md frontmatter+operational-body convention. → CCGS `brainstorm/SKILL.md`, `skills-reference.md`.

---

## 5. Open questions (for later tuning)

1. **No-fit handling depth.** Default is `platformer` (OpenGame's default) + a `low_confidence` flag, because platformer has the richest juice modules and a falling character is the most universally legible test game. Alternative: route ambiguous "abstract/UI" prompts to `ui_heavy` (the most permissive shell). Revisit once we see real misclassification data. The SKILL flags low-confidence rather than failing — confirm this is the right call vs. surfacing for human review.
2. **Hybrid prompts** (e.g. "Terraria-like" = platformer + building + survival; "Vampire Survivors" = top_down + horde + auto-attack). Physics-first picks the *movement substrate* correctly, but the secondary systems (building, hordes) are scope decisions. Currently handled by: classify on movement substrate, then list the un-native systems in the scope-cut (cut or defer). Confirm this is sufficient, or whether a `secondary_systems` advisory field earns its keep.
3. **Should W0 emit a tentative milestone count / control scheme?** The 1-page-GDD and AI-tool intakes resolve controls at intake time. We currently leave controls + milestones to W1 (per pipeline §3) to keep W0 lean. Open: a one-line `control_scheme` hint might cheaply de-risk W1. Deferred — add only if W1 asks for it.
4. **Confidence calibration.** Is a boolean `low_confidence` enough, or do we want the physics_profile fields to carry the uncertainty (e.g. `perspective: 'side'` with a note)? For v1, boolean + reasoning string is the lean choice.
5. **Title/name.** Practitioner briefs include a game name; we currently let W1 name it. Trivial to add to W0 if downstream wants it early.

---

## 6. Sources index (for reuse)

**Repos (read in full):**
- `reference-repos/OpenGame/packages/core/src/tools/game-type-classifier.ts` — primary classifier
- `reference-repos/OpenGame/agent-test/prompts/custom.md` — gen protocol, classify = Phase 1
- `reference-repos/OpenGame/agent-test/templates/modules/{platformer,top_down,grid_logic,tower_defense,ui_heavy}/src/gameConfig.json` — archetype fingerprints
- `reference-repos/Claude-Code-Game-Studios/.claude/skills/brainstorm/SKILL.md` — SKILL format + intake atoms
- `reference-repos/Claude-Code-Game-Studios/.claude/docs/skills-reference.md` — SKILL conventions

**Exa (web):**
- ziva.sh/blogs/game-design-document — 5-section GDD (pitch / core loop / OUT list)
- sensecentral.com/how-to-{avoid-feature-creep, scope-a-game-project, write-a-simple-game-design-document}-* — scope framework + Not-Now list + buckets
- eastondev.com/blog/en/posts/dev/20260518-indie-game-mvp-validation — core loop one-sentence test, self-enclosed loop
- games.themindstudios.com/post/how-to-build-an-mvp-game — core-loop-first + not-in-MVP list
- videogame.link/the-minimum-viable-mobile-game-* — one-verb loop, feature ceiling, loop skeleton
- gammer.us/from-zero-to-playable-in-7-days-* — scope-cut = most important doc, one-page brief fields
- mojolabs.nz/what-makes-a-small-game-actually-finishable — define-finished-in-one-sentence, Core/Nice/Extra
- wayline.io/blog/indie-devs-cut-features-core-loop — 80/20, kill darlings, worked cuts

**YouTube (yt-rag):**
- GMTK "How to find amazing game ideas" youtu.be/0m60QbT85Tc?t=827 — win/obstacle/fail/verb frame (Crazy Taxi); hook vs anchor
- GMTK "What's the Point of Prototyping?" youtu.be/8tHJgtbj6rs — keep small/specific; don't cut the juice
- GMTK "Release a game on Steam" youtu.be/5ycSvC0ZM0k?t=1756 — core-loop as up-front question
- Chong-U "Vibe Code Your First Game" youtu.be/yKyjcbQiar4 — "[familiar game] but [twist]"; single-screen scope
- ProgrammingKnowledge2 "Build Games with Claude AI" youtu.be/5kh1w2vejIM — real AI intake = genre+vibe+controls+win/lose
- JC BuenaVentura youtu.be/koblt9gQmYo; Dog's Dream youtu.be/ySqLAayNmaM — practitioners name archetype first

**Reddit:**
- r/godot "Make Small Games" /comments/1ly0w5x (737) — scope-discipline manifesto
- r/gamedesign "1-page GDD template" /comments/13w1tnt (236) — aim+mechanic+core loop+win/lose field set
- r/gamedesign "20-year veteran 5 mistakes" /comments/xev1e6 (261); "9 years critique" /comments/kzi0ls (279) — focus on the Why / core of experience
- r/godot core-loop showcase posts /comments/{1guksl6,1neaofo,ssmjtp} — "core loop" is the build-first unit
