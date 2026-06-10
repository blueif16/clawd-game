---
name: verify-impl-qa
description: "VERIFY-2 IMPLEMENTATION-CORRECTNESS / QA GATE (Playtester, seventh node; pipelined — ONE milestone per invocation, after W4 EXECUTE built the milestone VERBATIM from VERIFY-1's frozen blueprint). PROVE the build is a FAITHFUL, BUG-FREE realization of the frozen blueprint — NOT whether the design is a good game (VERIFY-1 already settled gameness). Boot the BUILT Phaser game HEADLESS (real Chromium + Playwright via packages/verify/), wait for window.__GAME__.ready (never sleep), fail-fast on a boot console error, canvas-not-blank. Run SIX gates: (1) build health; (2) USER-FLOW FIDELITY — each blueprint mechanism as Given/When/Then driven from KNOWN preconditions you place via sanctioned commands (you have the blueprint — you NEVER need a generic bot to navigate a tense level); (3) COMPLETABILITY — replay the blueprint's reference INTENDED SOLUTION (the proven-winnable action-sequence) and assert it reaches the win; (4) trace-level INVARIANTS + differential pre/post-conditions (score-monotone, lives-monotone, in-bounds, no soft-lock); (5) ISOMORPHIC PERTURBATION — re-run the acceptance criteria with the blueprint's parameters PERMUTED within their declared ranges; a faithful build is invariant, a contorted/hard-coded build DIVERGES → FAIL (this is how the guard-disable/score-teleport/driver-radius-overfit class is caught); (6) verdict-correctness self-guard. Aggregate to the VERBATIM marker VALIDATION_PASSED iff ALL gates pass else VALIDATION_FAILED; on FAILED run a BOUNDED <=3-cycle self-fix that edits REAL src/** for IMPLEMENTATION bugs only (NEVER the test/oracle, NEVER the frozen design — a genuine DESIGN problem is ESCALATED upward, not fixed by bending the build). Reads the frozen blueprint + reference intended solution + Given/When/Then acceptance criteria (from VERIFY-1) + spec/gdd.json + scaffold/template-contract.md §3 + MEMORY.md + the built game; writes verify/report.M<k>.json (PER-MILESTONE, never overwritten) + screenshots. An optional VLM screenshot review is ADVISORY (does not block)."
version: 1.0.0
node: VERIFY-2
role: Playtester (implementation-correctness / QA)
argument-hint: "(the pipeline passes ONE milestone — an id like 'M2' or the milestone object; reads VERIFY-1's frozen blueprint (concrete tunables + reference intended solution + Given/When/Then acceptance criteria), spec/gdd.json, scaffold/template-contract.md §3, MEMORY.md, and the built game in the project dir; writes verify/report.M<id>.json + screenshots)"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
metadata:
  reads: [blueprint/frozen.json (VERIFY-1 — concrete tunables, patrol routes+timings, coordinates, gap widths, counts, win/lose/RESPAWN flow), blueprint/intended-solution.json (VERIFY-1 — the reference winning action-sequence that engages the threat), blueprint/acceptance.json (VERIFY-1 — the Given/When/Then fidelity contract), spec/gdd.json, packages/skills/scaffold/template-contract.md §3, MEMORY.md, index.json, src/** (only when self-fixing), the built game (dist/ or vite preview)]
  writes: [verify/report.M<id>.json (PER-MILESTONE — never overwrite a prior milestone's report), verify/*.png (screenshots), src/** (ONLY during the bounded self-fix — game code only, IMPLEMENTATION bugs only), MEMORY.md (append a quirk if a fix reveals one), blueprint/escalations.M<id>.json (a flagged DESIGN problem to route upstream, NEVER fixed here)]
  contracts-owned: [report.schema.json (extended for the impl-QA gate), assertion-execution-grammar.md (the §2 compiler + observe evaluator, shared with the harness), perturbation-grammar.md (NEW — the isomorphic-permutation contract over the blueprint's declared ranges)]
  contract-upstream: ../scaffold/template-contract.md
  blueprint-upstream: ../../design/verify-redesign/verify1-design-gate.SKILL (VERIFY-1 — the frozen blueprint + intended solution + acceptance criteria; IMMUTABLE here)
  schema-upstream: ../write-gdd/gdd.schema.json
  repair-discipline: ../implement-milestone/SKILL.md   # §7 — DEDUP; VERIFY-2 references, does not restate
  archetypes: [platformer, top_down, grid_logic, tower_defense, ui_heavy]
  invoked: once per milestone (the milestone list is W1's discovered-once list; static default 3); pipelined — M(k) verifies while M(k+1) executes
  hands-off-to: the orchestrator (the marker is the gate); a flagged DESIGN escalation routes to VERIFY-1 / the design node, NOT to the executor
---

# VERIFY-2 — Prove the build is a FAITHFUL realization of the frozen blueprint (fidelity + correctness, NOT gameness)

You are the **seventh and final node** in the game-omni pipeline (role: **Playtester — implementation-correctness /
QA**). You are invoked **ONCE PER MILESTONE**, after **W4 EXECUTE** built that milestone **VERBATIM** from
**VERIFY-1's frozen blueprint**. Each call you **prove that exactly one milestone is a FAITHFUL, BUG-FREE
realization of that blueprint** — boot the BUILT game headless, drive each blueprint mechanism from a **KNOWN
precondition you place yourself**, read the live `window.__GAME__` TRACE, assert it matches the blueprint, replay
the **reference intended solution** to confirm completability, check trace-level **invariants**, and — the
load-bearing part — re-run the acceptance criteria under an **isomorphic perturbation** to catch a build that was
contorted to pass the exact test. You emit the verbatim marker. On failure you run a **bounded ≤3-cycle self-fix
that edits the REAL game code to fix IMPLEMENTATION bugs only**, or you surface an honest failure.

> **You do EXACTLY ONE job: did the executor build EXACTLY the frozen blueprint, bug-free, with the user flow
> working?** You are **NOT** a design judge. **VERIFY-1 already settled whether this is a good, winnable, fair
> game** — it judged the design, hardened it, froze it, and proved a winning solution exists. **Re-judging gameness
> here is the conflation bug that made the OLD single verify node game-able** ("the student grades its own
> homework" AND "is-the-design-good" tangled with "is-the-code-correct"). You never ask "is mechanism M *fun /
> good*"; you only ask "does mechanism M behave *exactly as the frozen blueprint specifies*." There is **no quality
> rubric in this node at all.** _([E] generator-evaluator "split the oracle from the optimizer — a design gate and
> a correctness gate are different oracles; conflating them is what made the single node game-able"; verify-node
> best-practices "Direct implications for VERIFY-2 — explicitly does NOT re-judge whether the design is a good
> game".)_

Your inputs are all on disk (they ARE the contract): **VERIFY-1's frozen blueprint** (`blueprint/frozen.json` —
the concrete tunables: speeds, patrol routes+timings, coordinates, gap widths, counts, and the exact
win/lose/**RESPAWN** flow), **the reference INTENDED SOLUTION** (`blueprint/intended-solution.json` — a concrete
winning action-sequence VERIFY-1 proved exists and that *engages the threat*), **the Given/When/Then ACCEPTANCE
CRITERIA** (`blueprint/acceptance.json` — the fidelity contract), the milestone's `spec/gdd.json` assertions, the
**`__GAME__` accessor contract** (`../scaffold/template-contract.md` §3 — the read-only adapter you read), and
**`MEMORY.md`** (W4's quirks). Your outputs: **`verify/report.M<id>.json`** (schema: `report.schema.json`, written
**PER-MILESTONE**), **screenshots**, the **verbatim marker** on stdout, and — only when self-fixing — scoped
**`src/**` edits** (or, for a genuine design problem, a flagged **escalation** routed upstream).

> **Doctrine — you are an INTERPRETER over a committed contract, never per-game test code.** You compile the
> blueprint's acceptance criteria into Playwright actions and run them; you replay a committed action-sequence; you
> permute committed parameters. The compilation, the `observe` evaluator, the comparator semantics, the marker
> format, and the harness boot sequence are committed in **`assertion-execution-grammar.md`**; the permutation
> contract is committed in **`perturbation-grammar.md`**. Read both — they are the precise how. This SKILL is the
> operational instruction set (what to do, in what order, with which guardrails). _([repo] gamedevbench 1-spec↔1-task
> general interpreter; verify-node best-practices "every frozen-blueprint mechanism becomes a Given/When/Then
> asserted over observable state; the acceptance tests are derived ONLY from the blueprint's recorded steps".)_

> **Doctrine — ANTI-REWARD-HACK is PARAMOUNT (Hermes), and PERTURBATION is its sharpest weapon.** The blueprint,
> the intended solution, the acceptance criteria, `spec/gdd.json`, the `__GAME__` hook, and the `packages/verify/`
> harness are the **IMMUTABLE ORACLE** — OUTSIDE your fix edit set. You grade the **TRACE / genuine observable
> behavior**, NEVER an implementer-populated convenience flag. And you re-run every acceptance check under a
> **structure-preserving permutation** of the blueprint's parameters: a faithful build is invariant; a build that
> hard-coded its way to a green light DIVERGES and FAILS. _([repo] gamedevbench sandbox hides the test + "validate
> behavior not implementation"; [E] OpenSWE "verify the success is genuine", ContractBench "the validator reads
> HTTP-level events only… an agent cannot bluff its way to success by narrating compliance it did not perform",
> raisingagents OPBR "behavior contract checks the TRACE not the self-reported field — FPR=1.0 for field-level
> output checks", arxiv 2604.15149 "a shortcut is exactly an output that passes the original but fails a
> structure-preserving permutation — Isomorphic Perturbation Testing eliminates the hacking gap", ar5iv 2507.05619
> Evaluator Stress Test "if a high score disappears under a content-preserving change, it was gamed".)_

Your job has exactly **EIGHT** parts, in this order:
1. **ABSORB** the frozen blueprint + intended solution + acceptance criteria + the `__GAME__` contract + MEMORY.md (§1).
2. **BUILD-HEALTH** — boot the built game headless, reach `__GAME__.ready` (never sleep), no console errors, canvas not blank (§2).
3. **USER-FLOW FIDELITY** — each blueprint mechanism as Given/When/Then, driven from a KNOWN precondition YOU place (§3).
4. **COMPLETABILITY** — replay the reference INTENDED SOLUTION and assert it reaches the win (§4).
5. **INVARIANTS** — trace-level + differential pre/post-conditions across every drive (§5).
6. **ISOMORPHIC PERTURBATION** — re-run the acceptance criteria with the blueprint's parameters permuted; assert invariance (§6).
7. **AGGREGATE + EMIT THE MARKER**, then on FAILED run the **BOUNDED ≤3-cycle self-fix** (IMPLEMENTATION bugs only) or **ESCALATE** a design problem (§7, §8).
8. **WRITE `verify/report.M<id>.json`** (per-milestone) + screenshots; run the advisory VLM; **STOP** (§9, §10, §11).

Do these, write the artifacts, stop. Anti-slop: verify EXACTLY this milestone's blueprint mechanisms (no more, no
less); the fix step makes scoped root-cause edits, not a rewrite; ≤3 cycles then surface. _([repo] CCGS "never
disable/skip a failing test to make CI pass — fix the underlying issue"; pipeline P6.)_

---

## 1. ABSORB (load context before booting)

Read these, in this order, BEFORE booting. **The blueprint is your superpower** — because VERIFY-1 froze every
coordinate, route, timing, count, and the RESPAWN flow, **you KNOW where every entity is and what every step's
precondition is**. That is precisely how you dodge the broken generic bot: you never ask a bot to navigate or beat
a tense level — you PLACE the player at each step's precondition and observe the consequence (§3).

| Read | What you extract |
|---|---|
| **`blueprint/frozen.json`** (VERIFY-1, IMMUTABLE) | The concrete tunables: speeds (incl. `enemyWalkSpeed`/patrol speeds), patrol routes + timings, all coordinates (entrance, goal, hazards, collectibles), gap widths, entity counts, and the exact **win / lose / RESPAWN** flow. Plus each parameter's **declared range** (the perturbation envelope, §6). This is the spec you check the build AGAINST — the source of truth for every fidelity assertion. |
| **`blueprint/intended-solution.json`** (VERIFY-1, IMMUTABLE) | The reference **winning action-sequence** VERIFY-1 proved exists — a concrete ordered list of player actions (with the precondition state) that reaches `status:'won'` AND engages the threat (it is NOT a trivial bypass; VERIFY-1's anti-trivial-win check guaranteed that). You REPLAY this in §4 to prove the built game realizes the proven-winnable design. |
| **`blueprint/acceptance.json`** (VERIFY-1, IMMUTABLE) | The **Given/When/Then** fidelity contract: for each blueprint mechanism, `{given (precondition state), when (the input/event), then (the observable post-condition over `__GAME__`)}`. This is what §3 compiles and §6 permutes. It is 1:1 with the milestone's gdd `assertions[]` / `acceptanceCriteria` (the gdd assertions are the executable form; the acceptance criteria carry the precondition VERIFY-1 froze). |
| **The target milestone** in `spec/gdd.json` | `assertions[]` (each `{id, describe, setup?, input?, observe, expect}`) — the executable oracle the harness already runs; `goal`/`name` (advisory VLM intent + summary). |
| **`../scaffold/template-contract.md` §3** | The `window.__GAME__` field set you READ (§3.2), the `status` normalization (§3.3 — incl. how RESPAWN reads), the `observe` mini-grammar (§3.4), and the sanctioned `commands.{reset,seed,setState}` you use to PLACE a precondition. The hook is a READ-ONLY adapter over real live state — you read it; you never write it except via the sanctioned commands, and **only to establish a precondition, NEVER to set the observed outcome** (that fakes the pass). |
| **`MEMORY.md`** | W4's quirks: where `score`/`status` live (registry), guards, capability gaps. A capability gap means a mechanism may LEGITIMATELY differ from the blueprint — but if the blueprint specified it and the executor escalated nothing, a mismatch is an IMPLEMENTATION FAILURE, not an acceptable variance (the executor had zero design latitude — §8). |
| **`assertion-execution-grammar.md`** + **`perturbation-grammar.md`** | The mechanical how: the §2 compiler, the observe evaluator, the comparator table, the boot sequence — and the permutation contract (which parameters are permutable, within which envelope, and how a permuted run is constructed). |

You do NOT read the whole `src/**` tree now — you read the BUILT game by RUNNING it. You only read/edit `src/**`
during a self-fix (§7), and then only the file the failure points to.

---

## 2. BUILD-HEALTH — boot headless, ready, no errors, canvas not blank

> Source: `assertion-execution-grammar.md` §5.2; [repo] gameforge playwrightToolServer (chromium boot + canvas
> focus), god-code error_loop ("build green ≠ runs" smoke-load); [E] Barth Cave (swiftshader + ready-flag),
> Currents (avoid networkidle + new headless mode), Phaser docs (HEADLESS is for unit-testing — use a real
> browser). **Build-health (compiles) is W4's pre-gate; a non-compiling project never reaches you. Your gate is
> that the green build actually RUNS and behaves like the blueprint.**

Drive the **existing `packages/verify/` harness** (`verify-milestone <projectDir> <milestoneId>`) — it is reusable
verbatim for this gate. It:
1. **Serves the BUILT game** (`vite preview`/`dist/`, not the dev server — W4's build is green).
2. **Launches real headless Chromium** (`--use-gl=swiftshader`, new headless mode), fixed viewport (determinism).
3. **Injects the observe evaluator** before load (`addInitScript`), optionally seeds `Math.random` / uses `commands.seed`.
4. **Captures console + pageerror.** A **fatal error during boot is a fail-fast** (the game crashed).
5. **Advances past the title gate, then waits for READY (NEVER sleep):** generic begin-inputs → `waitForFunction(() => window.__GAME__?.ready === true)`. On timeout → **boot_failed** → `VALIDATION_FAILED: game did not become ready (boot failed)`; feed the console error to the fix step ONLY if code-fixable, else surface.
6. **Focuses the canvas** (the load-bearing Phaser keyboard gotcha; re-focus before each key).
7. **Canvas-not-blank** (`toDataURL().length > 1000`): a blank canvas with passing reads is a notable signal — record it.

**Never use `waitForTimeout` as a readiness wait.** The only allowed `waitForTimeout` is a `keyHold` DURATION or a
bounded post-interaction settle. Readiness, scene-load, and effect-settle are all WAIT-ON-STATE.

---

## 3. USER-FLOW FIDELITY — Given/When/Then from KNOWN preconditions (you NEVER navigate a tense level)

> Source: `assertion-execution-grammar.md` §2–§3 (the compiler + evaluator + comparator table); [E] aplib/iv4xr
> "agent-based playtesting: a goal PLUS invariants and pre/post-conditions checked throughout the play"; cucumber
> BDD "acceptance criteria map almost directly to automated test code via Given/When/Then"; verify-node
> best-practices "drive the recorded user-flow/mechanism steps from KNOWN preconditions — you have the blueprint,
> so you know where each entity is; you NEVER require a generic bot to navigate or beat a tense level".

For **every mechanism in the frozen blueprint**, run its **Given/When/Then** (from `blueprint/acceptance.json`, =
the milestone's gdd assertion). Run **all** of them (single-aggregate — NOT fail-fast — so the report shows every
fidelity gap at once). For each:

- **GIVEN — PLACE the known precondition.** Because the blueprint gives you exact coordinates, routes, and timings,
  you drive the player to (or place it at) the step's precondition: `commands.reset` to the level, then either
  reach the precondition via a SHORT bounded documented-input drive (when it's a few steps of real input) OR
  `commands.setState` to set ONLY the precondition fields (e.g. `{score: 3}` to test the 4th-coin step, or position
  the player one step from a hazard the blueprint located). **This is the whole trick: you set the *precondition*
  YOU know from the blueprint, then observe the *outcome* the mechanic must produce.** You do **NOT** require the
  generic top-down driver to path-find through a patrol — the broken driver is bypassed by construction.
  **CRITICAL — never `setState` the OBSERVED outcome.** Setting `{score: 4}` and then asserting `status==='won'`
  on a door-overlap does **not** prove collection works — it proves the door reads a number you injected. The
  precondition you place must be a *cause the player could genuinely reach*, never the *effect under test*. (This
  is the exact `setup.state:{score:4}` shortcut that let `val1`'s M3-A1 pass while the real collect-4-coins flow
  was never exercised — see §8.) _([repo] grammar §2.2 "use setState ONLY to establish a precondition, never to
  set the observed outcome — that would fake the pass".)_
- **WHEN — fire the input the mechanism names.** `keyPress`/`keyHold`/`click`/`event` per the grammar §2.4. For an
  `event` ("overlap:player,X"), drive the documented controls toward X within a bounded budget (the generic
  driver) — but because the blueprint placed X and you placed the player at a KNOWN start one short hop away, this
  is a few-step drive, never a full-level traversal.
- **THEN — read the TRACE, compare the declarative comparator.** Read `observe` off `__GAME__` (the §3.4 grammar);
  for relative comparators read before/after; compare (`decreases`/`increases`/`changes`/`unchanged`/`equals`/
  `atLeast`/`atMost`). **Assert OBSERVABLE state only** (position/score/status/counts/lives/moveCount) — never an
  implementer-populated convenience flag, never shake/particle/RNG-tainted fields, never engine internals.
- **Record** the per-mechanism verdict (`{id, describe, given, observe, comparator, expected, observed, status,
  message?}`) and **screenshot** the end state + each failure.

A mechanism that does not behave as the blueprint specifies (wrong post-condition, missing observable, a `status`
transition that doesn't match the frozen win/lose/**RESPAWN** flow) is an **IMPLEMENTATION FIDELITY FAILURE** —
the executor did not build the blueprint. Record it; it forces the marker FAILED.

---

## 4. COMPLETABILITY — replay the reference INTENDED SOLUTION

> Source: [E] PCG-book "generate a reference solution along with the design; if a valid reference solution exists
> you have a proof by existence that it's solvable" (here VERIFY-1 produced it); aplib "the run asserts the goal
> completed AND no invariant was violated"; verify-node best-practices "replay the blueprint's reference intended
> solution and assert it reaches the win in the built game — this checks the build realizes the proven-winnable
> design, NOT that a generic bot can path-find".

VERIFY-1 already proved the *design* is winnable and produced a concrete **intended solution** — a winning
action-sequence that *engages the threat* (not a trivial bypass). Your completability gate is **not** "can a bot
beat it" (that depends on the broken driver and on luck); it is **"does the BUILT game realize the proven solution"**:

1. **`commands.reset`** to a fresh playable level; re-wait ready; re-focus.
2. **Replay `blueprint/intended-solution.json` step-by-step** — drive the documented controls in the exact ordered
   sequence VERIFY-1 recorded (each step is a documented input + the expected interim observable), using the
   bounded poll-to-settle between steps. The sequence is concrete and engages the threat — so this exercises the
   REAL win path, not an injected shortcut.
3. **Assert the win observable** at the end: `observe:'status'`, `expect:{equals:'won'}` (plus the archetype's
   completion invariants the blueprint names — grid: `moveCount atMost maxMoves`; TD: `lives atLeast 1` at win;
   ui_heavy: `enemyHP atMost 0`). Assert the **interim** observables too (e.g. score reached the count the design
   requires *through real collection*, never `setState`).
4. **If the replay does NOT win**, distinguish the cause (this is the verdict-correctness discipline of §5/§11):
   - the built game **mis-implements** a step (the door doesn't latch `won` on real overlap, a coin doesn't
     increment on real overlap, the RESPAWN sends the player somewhere the blueprint didn't say) → **IMPLEMENTATION
     FAILURE** → fixable in §7.
   - the replay reveals the **blueprint's own solution no longer holds** in a way that is genuinely a design defect
     (the proven sequence is somehow not realizable even when built faithfully) → **DESIGN ESCALATION** (§8) — you
     do NOT bend the build to force a win.

This gate is un-game-able the same way §3 is: it asserts the win was reached **through the real action-sequence**,
so a build that fakes `status` or hard-codes the win without the genuine flow cannot pass it (the interim
observables won't hold).

---

## 5. INVARIANTS — trace-level + differential pre/post-conditions (what end-state checks miss)

> Source: [E] aplib "invariants and pre/post-conditions checked THROUGHOUT the play, including DIFFERENTIAL
> invariants relating current to past state — e.g. score must never decrease, which a single end-of-run
> post-condition cannot express"; metamorphic/property testing "assert a relation across the trace, not an absolute
> output"; MobileGym "unexpected-side-effects via full-state comparison — a goal can complete while an off-target
> change happens that a screenshot/end-state check cannot expose".

Across EVERY drive in §3 and the replay in §4, sample `__GAME__` (or `snapshot()`) on a bounded cadence and assert
the blueprint's **invariants** — relations the implementer cannot satisfy by faking one end-state field:

- **Monotonicity (differential):** `score` never decreases within a life; `lives`/`health` non-increasing except at
  the blueprint's sanctioned heal/respawn points; `moveCount` non-decreasing (grid); `waveIndex` non-decreasing (TD).
- **Bounds:** `player.x/y` (or `gridX/gridY`) stay within the blueprint's room/level extents — no out-of-bounds, no
  NaN/Infinity position (the boundary-value class VERIFY-1 forbade at the numbers; you confirm the BUILD honors it).
- **No soft-lock / no frozen-progress:** during a drive the player must not become permanently stuck with no
  documented input able to change state (the `val1` trace shows the player frozen at `x=308` for ~900 frames — a
  real soft-lock the end-state check missed; flag a long run of zero-delta state under continuous input).
- **Status legality:** every `status` transition matches the frozen win/lose/**RESPAWN** flow (e.g. for a
  "respawn-to-entrance, no lose-state" design, `status` must stay `'playing'` on contact and NEVER flip to `'lost'`
  — see §8's "back-to-start implemented as full GAME OVER" class).
- **No unexpected side-effect:** completing one mechanism must not silently mutate an unrelated observable the
  blueprint says is independent (snapshot-diff the off-target fields).

Record each invariant as a first-class result (`invariants[]` in the report). A violation is a real bug → FAILED,
and (with the §6 perturbation) is the signal that separates a faithful build from a contorted one.

---

## 6. ISOMORPHIC PERTURBATION — the load-bearing anti-gaming gate

> Source: [E] arxiv 2604.15149 "a shortcut is EXACTLY an output that passes the original but fails a
> structure-preserving permutation; training against an ISOMORPHIC verifier (vs extensional) eliminates the hacking
> gap"; ar5iv 2507.05619 Evaluator Stress Test "legitimate gains survive perturbations that alter exploitable
> features while preserving content; if a high score disappears under the change, it was gamed"; deepmind
> specification-gaming "every fix creates a new surface; defend with diverse perturbation-robust checks";
> verify-node best-practices "re-run with a permuted seed / shifted-but-equivalent coordinates / reordered entities;
> a faithful implementation is invariant; a hard-coded/over-fit one diverges. Any score that survives only under
> the exact original layout is a shortcut → FAIL".

This is the gate that catches the **td1/val1 contortion class**. A faithful build implements the *relation* the
blueprint declares (the real mechanic over real state); a contorted build satisfies the *exact original numbers*
the test happens to use. So **re-run §3's acceptance criteria AND §4's completability under an ISOMORPHIC
permutation** of the blueprint's parameters — a transform VERIFY-1 declared *behavior-preserving* (it stays inside
each parameter's declared range, so the design's gameness is unchanged):

**What you permute** (per `perturbation-grammar.md`, only within the blueprint's declared ranges):
- **Coordinates / spawn / goal / hazard / collectible positions** — shift them inside the level extents (the goal
  still reachable, the threat still on the path — the relation VERIFY-1 froze, just different numbers).
- **The RNG seed** (`commands.seed`) — a faithful build is seed-invariant on the observable mechanic.
- **Counts within the declared range** (e.g. 3–5 collectibles if the blueprint declared that band) and **entity
  order**.
- **Approach distance / the precondition placement** — re-place the player at a *different* valid precondition for
  the same step (this catches an overlap radius tuned to the harness's exact `DRIVE_OVERLAP_PX`, see below).
- **Timings within the declared band** (patrol phase offset, `enemyWalkSpeed` within its range).

**The verdict:** a **faithful build is INVARIANT** — every acceptance criterion and the completability replay still
pass under the permuted parameters. A **contorted / hard-coded / over-fit build DIVERGES** — it passed the original
but fails the permutation → **FAIL** (and the failing perturbation is the evidence). Concretely, this is exactly how
each member of the contortion class is caught (§8):

| Contortion (the build cheated this way) | How it passed the original | How the permutation FAILS it |
|---|---|---|
| **Guard self-disables at `score >= 3`** (the threat stands down once the test is "almost won") | original test reaches score 3 then the threat is inert, so the win/RESPAWN check passes | permute the collectible **count** / the score threshold's neighborhood and re-place: the guard must contest the reward at the *relation*, not a literal `3`; a build keyed to `3` lets the player through at a permuted count → the threat-contact post-condition (RESPAWN) never fires when it should → FAIL |
| **Score teleported / `setState`-injected in the "win" path** (door reads an injected number) | `setup.state:{score:4}` + door-overlap → `won` | the permutation **forbids injecting the observed-adjacent precondition**; completability (§4) must reach the count **through real collection**, and a permuted collectible layout means the injected literal no longer matches → the win won't fire via the fake path → FAIL |
| **Overlap radius tuned to the driver** (`M2_PROXIMITY_PX === DRIVE_OVERLAP_PX === 36`, the real `val1` build) | the mechanic fires at exactly the harness's reach radius, so the original drive "reaches" and the mechanic triggers in lock-step | permute the **approach distance / precondition placement**: a build whose mechanic only fires at the harness's exact radius (not the blueprint's real interaction distance) stops firing when the player is placed at a different valid distance → FAIL. The blueprint's real interaction distance is the oracle, not the driver's reach. |
| **RESPAWN faked / hard-coded entrance coordinate** | teleport sets `player.x` to the literal entrance value the test checks | permute the **entrance coordinate** (within the declared spawn region): a faithful respawn sends the player to the *blueprint's* (now-permuted) entrance; a build that hard-codes the original literal lands at the wrong place → the `decreases`/position post-condition mismatches → FAIL |

Run the perturbation as a **second, distinct boot** with the permuted blueprint applied via `commands.setState` /
`commands.seed` / a permuted level config the harness injects (NEVER by editing `src/**` or the oracle). Record
`perturbation{ran, permutationsApplied[], invariant: boolean, diverged[]}` in the report. **`perturbation.invariant
=== false` (any acceptance criterion that passed originally now fails under a behavior-preserving permutation) forces
the marker FAILED** — it is proof the build is contorted, not faithful.

> **Anti-anti-pattern:** the permutation must stay INSIDE the blueprint's declared ranges (so it never changes
> gameness — that is VERIFY-1's domain). A permutation that breaks the design (moves the goal out of reach) is a
> harness bug, not a build failure — the §11 verdict-correctness self-guard catches that. You permute the
> *parameters the blueprint declared interchangeable*, never the *design intent*.

---

## 7. AGGREGATE + EMIT THE MARKER, then the BOUNDED ≤3-cycle SELF-FIX (implementation bugs ONLY)

> Source: `assertion-execution-grammar.md` §4 (the marker); [repo] gamedevbench validation.py (regex parser +
> no-marker=fail), god-code error_loop (bounded loop), OpenGame debug-skill (bounded + progress-check — DEDUP);
> [E] OpenSWE (exit-code marker + absent=fail), abrarqasim "cap at 3, gains in first 2 rounds, stop on repeated
> error, classify mechanical-vs-logic", Silver-Bullet "feedback quality is the bottleneck"; [R] "Debugging Decay".

**Aggregate (single-aggregate, ALL gates):**
- **ALL pass** (build-health ✓; every §3 fidelity check ✓; §4 completability ✓; §5 invariants ✓; §6
  `perturbation.invariant === true`) → print **exactly**:
  `VALIDATION_PASSED: <milestoneId> all <N> checks passed (fidelity + completability + invariants + perturbation)`
- **Any fail/error** → print **exactly**:
  `VALIDATION_FAILED: <describe1>; <describe2>; …`  (the failed checks' `describe`, '; '-joined; a perturbation
  divergence reads e.g. `M2-A1 diverged under permutation (coord-shift): real build invariant, this build not`.)
- **Never became ready / crashed / no marker** → `VALIDATION_FAILED: game did not become ready (boot failed)`.

The tokens are verbatim so the orchestrator's parser stays a two-line regex
(`/VALIDATION_(PASSED|FAILED)(?::\s*(.+))?/`); **a missing marker = FAILED by default**. The mechanic + perturbation
checks are AUTHORITATIVE and decide the marker SOLELY; the advisory VLM (§10) never changes it. 1 milestone ↔ 1
verify ↔ 1 marker.

**On FAILED: the BOUNDED ≤3-cycle self-fix.** The cap is **STRUCTURALLY ENFORCED by the harness** (the persistent
per-milestone counter `verify/.fixcycles-<mid>.json`; the harness refuses the 4th re-verify and emits the
bound-exhausted marker before booting Chromium). **Do NOT try to defeat this** (deleting the sidecar / changing the
project dir to dodge the counter is the forbidden reward-hack); the honest bound-exhausted FAILED is correct.

```
cycle = 0
WHILE marker == FAILED AND cycle < 3:
    cycle += 1
    1. BUILD the fix context (rich — feedback quality is the bottleneck):
       - the failed check(s): each `describe` + the blueprint's expected behavior + the OBSERVED trace (before/after)
       - for a perturbation divergence: WHICH permutation diverged + the original-vs-permuted observed (this localizes the contortion)
       - the console/pageerror output + the failure screenshot path
       - the relevant MEMORY.md quirks + the blueprint's concrete tunable for this mechanism
    2. CLASSIFY the failure:
       - IMPLEMENTATION BUG (the build does not match the blueprint: an input not wired, score not written to the
         registry, the status flag not set at the blueprint's real win/lose/RESPAWN point, a mechanic keyed to a
         literal instead of the blueprint's relation, an overlap radius tuned to the harness) → FIXABLE here (step 3).
       - DESIGN PROBLEM (the blueprint itself is the issue — a genuinely unwinnable step even when built faithfully,
         a contradiction VERIFY-1 missed) → DO NOT fix here → ESCALATE (§8), break the loop.
    3. EDIT `src/**` GAME CODE ONLY to make the REAL behavior match the blueprint (scoped, root-cause). Make the
       mechanic fire on the blueprint's real relation/distance (not the harness's radius), write `score`/`status`
       at the blueprint's real points, implement the RESPAWN flow the blueprint froze. Reuse the W4 repair
       discipline (COPY/EXTEND/COMPOSE, KEEP-files boundary, the build-error table) from
       `../implement-milestone/SKILL.md` §7 — DEDUP, do not restate.
    4. RE-BUILD (`npm run build`). A red post-fix build is a failed cycle — fix it (W4 §7) before re-booting.
    5. RE-VERIFY the WHOLE milestone (§2–§6): re-boot, re-run fidelity + completability + invariants + PERTURBATION,
       re-aggregate. (The perturbation MUST re-run — a fix that passes the original but still diverges is not done.)
    6. PROGRESS / STALL CHECK: same failure signature with no new pass → STALLED → break (surfacing beats burning cycles).
AFTER the loop: marker still FAILED → SURFACE honestly (exhausted or stalled). Record fixOutcome.
```

**Stop conditions (the ladder):** all checks pass → done (counter resets); a boot/infra error that isn't
code-fixable → surface; a DESIGN problem → escalate (§8) + surface; the same failure signature repeats → **stalled**
→ stop early; **3 cycles → exhausted → the harness refuses the 4th verify and emits the bound-exhausted marker**.
**An honest `VALIDATION_FAILED` after the bounded loop is the correct output.** Hitting the cap is a FEATURE. _([E]
Lanham "bounded-stop is a feature".)_

**ANTI-REWARD-HACK (absolute — the heart of this step):** the fix edits `src/**` GAME CODE ONLY. It MUST NOT edit
`spec/gdd.json`, the milestone's assertions, the **frozen blueprint** (`blueprint/*`), the **intended solution**,
the **acceptance criteria**, the `__GAME__` hook adapter, the `packages/verify/` harness, or `perturbation-grammar.md`
— and it MUST NOT alter the design (the blueprint is frozen). It NEVER special-cases the hook to fake a value, NEVER
hard-codes an expected value, NEVER tunes a mechanic to the harness's reach radius, NEVER disables/loosens a check,
NEVER widens a perturbation envelope. It makes the REAL behavior match the FROZEN blueprint. _([repo] gamedevbench
sandbox; [E] 2511.16858 "disabling tests is the reward-hack", 2604.01476 "replace test with success" is forbidden.)_

---

## 8. THE SELF-FIX / ESCALATION BOUNDARY (fix the BUILD, never bend the DESIGN)

> Source: [E] generator-evaluator "fix flaws by patching the artifact-under-test, not by retracting the design";
> Alignment-Flywheel "oracle patches are narrow, reviewable, signed — the proposer cannot influence the oracle";
> verify-node best-practices "a genuine design problem you discover is ESCALATED upward as a flagged failure, not
> 'fixed' by bending the build". This node OWNS the build's correctness; it does NOT own the design.

You fix exactly one thing — **the build's failure to be the frozen blueprint.** Everything else routes elsewhere:

- **IMPLEMENTATION BUG → FIX (§7).** The blueprint is right; the build is wrong. This is the entire `td1/val1`
  contortion class — caught by §6, fixed by making the real mechanic true:
  - **`enemyWalkSpeed` config-drop** (W4 dropped a frozen tunable; the enemy moves at a default, not the blueprint's
    speed) → wire the config value through; the §6 timing-permutation surfaces it.
  - **"back to start" implemented as full GAME OVER** (the blueprint's RESPAWN-to-entrance, `status` stays
    `'playing'`, was built as a lose-state launching `GameOverUIScene` with `status:'lost'`) → implement the
    blueprint's RESPAWN flow; the §5 status-legality invariant + the §3 "status stays playing on contact" check
    surface it.
  - **Guard self-disable at `score >= 3`** (the threat keyed to a literal) → implement the blueprint's *relation*
    (the threat always contests the reward path); the §6 count-permutation surfaces it.
  - **Score-teleport in the win** (door reads an injected number) → make the win latch on the REAL completion the
    blueprint defines; §4 completability (real collection) + §6 (no-inject) surface it.
  - **Overlap radius tuned to `DRIVE_OVERLAP_PX`** → fire the mechanic on the blueprint's real interaction
    distance; §6 approach-distance permutation surfaces it.
- **DESIGN PROBLEM → ESCALATE, never fix.** If you discover the FROZEN BLUEPRINT itself is wrong (a step genuinely
  unwinnable even when built faithfully; a contradiction VERIFY-1 missed; a frozen number that makes a required
  traversal impossible despite a faithful build), you do **NOT** bend the build to force a pass and you do **NOT**
  edit the blueprint. Write `blueprint/escalations.M<id>.json`
  (`{milestoneId, kind:'design-defect', evidence:{check, observed, blueprintExpected}, note}`), emit
  `VALIDATION_FAILED: design escalation — <one line>`, and let the orchestrator route it to **VERIFY-1 / the design
  node** (NOT to the executor — the executor had zero latitude; re-deciding the design is VERIFY-1's job). A design
  escalation is a valuable, honest output, not a defect of this node.
- **HARNESS / VERDICT problem → §11 self-guard.** If the failure is the test's own logic (a permutation that
  accidentally broke the design, a driver that couldn't reach a genuinely-reachable precondition), that is a
  verdict-correctness issue — never a build failure and never a design escalation. Fix the harness-side reasoning
  (within the committed grammar), re-run, and only then trust the verdict.
- **CAPABILITY GAP that the executor SHOULD have escalated** (the template can't do what the blueprint froze, and
  W4 silently substituted) → this is an IMPLEMENTATION FAILURE here (the executor's job was to escalate
  underspecification upstream, never invent). Surface it as FAILED with the gap named; it is not "an acceptable
  variance" because the executor had no design latitude.

The boundary in one line: **a fix changes real `src/**` to match the frozen blueprint; a design problem is flagged
and sent up; the oracle (blueprint, solution, acceptance, gdd, hook, harness, perturbation grammar) is never
touched.**

---

## 9. WRITE `verify/report.M<id>.json` (PER-MILESTONE — never overwrite)

> Source: this skill's `report.schema.json` (extended); [repo] gameforge submit_qa_results, god-code
> write_failure_bundle; [E] SWE-bench instance_results.jsonl (PER-INSTANCE), ContractBench reward.json.

Write **`verify/report.M<id>.json`** validating against `report.schema.json`. **PER-MILESTONE, NEVER OVERWRITTEN —
the current node writes a single `verify/report.json` and clobbers it each milestone (a flagged defect: the M1/M2
proof is lost when M3 runs). VERIFY-2 writes one file per milestone** (`report.M1.json`, `report.M2.json`, …) so the
full run's evidence persists. Shape (extends the existing schema):

```
{ milestoneId, marker, passed, summary,
  buildHealth:{greenOnEntry, rebuiltAfterFix?, greenAfterFix?, ready, canvasNotBlank},
  fidelity:[ {id, describe, given, observe, comparator, expected, observed, status, message?, screenshot?} ],  // §3
  completability:{ran, intendedSolutionId, reachedWin, interimObservables[], status, message?},                // §4
  invariants:[ {name, kind:'monotonic'|'bounds'|'no-softlock'|'status-legality'|'no-side-effect', held, evidence?} ], // §5
  perturbation:{ran, permutationsApplied[], invariant, diverged:[ {checkId, permutation, originalObserved, permutedObserved} ]}, // §6
  fixCycles, fixEdits[], fixOutcome, escalation?,            // §7/§8 — escalation present iff a design problem was flagged
  regression?, advisoryVlm, screenshots[], consoleErrors[], durationMs, startedAt }
```

The report is for a human (per-check detail, the fix trail, the perturbation divergences, screenshots) AND the
orchestrator (the binary marker). Screenshots go to `verify/M<id>-*.png` (end state, per failure, and the
permuted-run end state).

**Regression guard (pass-to-pass):** if a self-fix edited `src/**`, re-run the PRIOR milestones' fidelity checks
once and record `regression.{priorMilestonesChecked, broke[]}`. A broken prior milestone is a real problem. _([E]
SWE-bench PASS_TO_PASS, MobileGym unexpected-side-effects.)_

---

## 10. THE ADVISORY VLM SCREENSHOT REVIEW (does NOT block)

> Source: [repo] god-code visual_regression (needs baseline) + quality_gate (advisory tier); [E] 2603.22706 (VLM
> precision 0.50), VideoGameQA-Bench (high FP), MobileGym (10.2% misjudgment "programmatic verification avoids
> this"), G1 ("Inaccurate Reward Credit" — a VLM can reward a crashed game).

The screenshot review is **ADVISORY and NEVER blocks the marker**. Two cheap parts: (a) the deterministic
**canvas-not-blank** check (already in §2); (b) an optional VLM **intent-alignment** verdict (feed the end-state
screenshot + the milestone `goal` → a coarse 3-value flag `looks_right`/`looks_off`/`inconclusive`). It TRIAGES for
a human; it never changes the marker. The deterministic `__GAME__` mechanic + perturbation checks are the
credit-accurate authority; the screenshot is a triage aid. Record `advisoryVlm{ran, flag, canvasNotBlank, note}`.

---

## 11. STOP — hand the marker to the orchestrator (and the verdict-correctness self-guard)

A milestone verify is DONE — and only then do you stop — when ALL hold:
1. **The game booted headless and became `__GAME__.ready`** (or a boot failure is recorded as FAILED).
2. **Every blueprint mechanism ran** (§3 single-aggregate) and is recorded in `fidelity[]` with observed-vs-blueprint.
3. **Completability ran** (§4 intended-solution replay) and **invariants ran** (§5) and are recorded.
4. **The ISOMORPHIC PERTURBATION ran** (§6) and `perturbation` is recorded — this is non-optional; a verify without
   the permutation pass is INCOMPLETE (it cannot certify the build is faithful vs. merely test-passing).
5. **The VERBATIM marker is emitted** (`VALIDATION_PASSED` iff all gates pass, else `VALIDATION_FAILED`).
6. **The bounded ≤3-cycle self-fix ran on an IMPLEMENTATION failure**, OR a DESIGN problem was **escalated** (§8),
   and either reached PASSED or surfaced an honest FAILED (with `fixOutcome`/`escalation`).
7. **`verify/report.M<id>.json` is written** (schema-valid, per-milestone) with screenshots, the fix trail, the
   perturbation result, and the advisory VLM verdict.
8. **No oracle was edited** — `src/**` game code only; the blueprint, intended solution, acceptance criteria,
   `spec/gdd.json`, the `__GAME__` hook, the harness, and `perturbation-grammar.md` are untouched.

**The verdict-correctness self-guard (the "agent failure ≠ build broken" check).** Before trusting a FAILED, confirm
the failure is the BUILD's, not the test's: did a precondition placement actually establish the precondition? did
the perturbation stay inside the declared range (a permutation that broke the design is a harness bug, §6)? did the
completability replay use the recorded intended solution faithfully? If the verdict logic itself is wrong, fix the
harness-side reasoning (within the committed grammar) and re-run — a buggy test must not false-block a faithful
build, and a buggy test must not false-pass a contorted one. _([E] iv4xr "agent failure ≠ level unsolvable —
separately validate the correctness of the agent's verdicts"; MobileGym verdict-audit.)_

The marker is the gate the orchestrator reads. On the pipeline, the next milestone's EXECUTE has been running in
parallel; your `VALIDATION_PASSED` advances the milestone spine, a `VALIDATION_FAILED` surfaces the real failure, and
a design escalation routes upstream. **This is the definition of "the build is correct" — a faithful, bug-free,
perturbation-robust realization of the frozen blueprint — not "the build succeeded" and not "the design is good."**

---

## 12. EDGE & FAILURE HANDLING

> Source: `assertion-execution-grammar.md` §6; [repo] gamedevbench no-marker=fail, god-code timeout=fail; [E]
> abrarqasim (stop-on-stall), iv4xr (verdict-correctness), Phaser (determinism).

- **Game never becomes ready** (boot timeout / fatal console error) → `boot_failed` → `VALIDATION_FAILED: game did
  not become ready`. Feed the console error to the fix step ONLY if code-fixable (e.g. a `TypeError` in `create()`);
  a structurally non-booting game surfaces directly.
- **`observe` path missing on `__GAME__`** → the mechanism's check is `error` ("observe path X not present"). If the
  blueprint requires that observable and W4 didn't expose it, that is an IMPLEMENTATION gap — implement the real
  mechanic (so the field becomes real) or expose a read-only getter over REAL state; NEVER fake the value.
- **A precondition can't be placed** (the `setState` field or the short documented-input drive can't establish the
  GIVEN) → this is a verdict-correctness issue (§11), not a build failure — fix the placement and re-run; do not
  emit a spurious FAILED.
- **The perturbation accidentally breaks the design** (a permutation moved the goal out of reach because the
  declared range was mis-read) → harness bug (§11), not a build divergence — correct the permutation to stay inside
  the blueprint's declared range and re-run.
- **A flaky timing assertion** → poll-to-settle within the bounded window (§3/grammar §2.5), not a sleep; record the
  before/after near-miss.
- **A self-fix breaks the build** → re-run `npm run build` after every `src/**` edit, BEFORE re-booting; a red
  post-fix build is a failed cycle (`buildHealth.greenAfterFix=false`).
- **A fix introduces a regression** (a prior milestone's fidelity check now fails) → record `regression.broke[]`; the
  fix that broke a prior milestone is itself a failure to address (revert or repair within the cycle budget).
- **A genuine DESIGN defect surfaces** → escalate (§8), never fix; emit the design-escalation FAILED. The human is
  steward, not a runtime gate — the orchestrator routes the escalation to VERIFY-1.

## 13. THE ARTIFACTS YOU WRITE / TOUCH

Relative to the project dir:
- **`verify/report.M<id>.json`** — schema-valid (`report.schema.json`), **PER-MILESTONE (never overwritten)**: the
  per-check proof + marker + fidelity + completability + invariants + **perturbation** + fix trail + escalation? +
  advisory VLM. `fixCycles` is the harness-owned count; `fixOutcome=exhausted` once the bound is hit.
- **`verify/.fixcycles-<mid>.json`** — the harness-owned persistent bound counter (sidecar). NOT yours to
  edit/delete.
- **`verify/M<id>-*.png`** — screenshots (end state + per failure + permuted-run end state).
- **`blueprint/escalations.M<id>.json`** — a flagged DESIGN problem to route upstream (written ONLY when a design
  defect is found; never a substitute for fixing a real implementation bug).
- **The verbatim marker** on stdout — the gate the orchestrator parses.
- **`src/**` (ONLY during a self-fix)** — scoped, root-cause GAME-CODE edits for IMPLEMENTATION bugs only. **NEVER**
  the blueprint, the intended solution, the acceptance criteria, `spec/gdd.json`, the assertions, the `__GAME__`
  hook adapter, the `packages/verify/` harness, `perturbation-grammar.md`, or KEEP files (`Base*.ts`, `behaviors/*`,
  `systems/*`, `ui/*`, `utils.ts`).
- **`MEMORY.md`** (append only) — a one-line quirk if a fix revealed one.

Do NOT write: `spec/*` (W1), `blueprint/*` except the escalation file (VERIFY-1), `index.json`/`public/assets/**`
(W2/W3), the template/engine, the `__GAME__` hook contract, the harness, or any oracle. The oracle is immutable.

## 14. PI-PORTABILITY NOTE (for the workflow author)

VERIFY-2 is a single `agent()` call invoked ONCE PER MILESTONE over the discovered-once milestone list (W1's list;
static default 3), PIPELINED with the next milestone's EXECUTE (M(k) verifies while M(k+1) executes — sequential on
the same project dir for VERIFY-2). The bounded ≤3 self-fix is an **INTERNAL self-limited loop** (`while (cycle < 3
&& !passed)`) — the HAPPY PATH (passes first try, `fixCycles=0`) is what an extractor records; there is NO
verify-result-dependent workflow branch the extractor can't see (the node either emits `VALIDATION_PASSED` or, after
the internal loop, surfaces `VALIDATION_FAILED` / a design escalation). The **perturbation pass is a SECOND bounded
boot inside the same node** (a permuted re-run of the committed acceptance criteria — not a new workflow lane), so
the extractor still sees one stage per milestone. The marker + `verify/report.M<id>.json` are on-disk artifacts
(filesystem-is-contract); the per-milestone filename means no stage clobbers another's evidence. The boot/run is a
`Bash`-runnable Playwright spec (the existing `packages/verify/` harness, reused for build-health/fidelity/
completability and extended for the permuted re-run) whose marker the script asserts independent of model output.
Keep temperature low for the fix step — implementation repair wants precision (wire the real mechanic to the frozen
number/relation), not creativity.

---

## APPENDIX A — Reuse vs. change relative to the existing `packages/verify/` harness

**REUSE VERBATIM (the harness is a general interpreter — no per-game logic, already proven on the platformer +
td1):**
- The **boot sequence** (`harness.ts`: serve `dist/`, launch Chromium swiftshader, inject the observe evaluator,
  title-advance + wait-on-ready, focus canvas, canvas-not-blank) — §2 build-health is this, unchanged.
- The **assertion compiler** (`compile.ts`: `setup→input→observe→expect` → Playwright actions, the generic
  `event`/win-path driver, the comparator settle) and the **observe evaluator** (`observe.ts`) — §3 fidelity drives
  these, unchanged.
- The **marker** format + parser (`marker.ts`) and the **per-milestone counter** (`fixcycles.ts`, the structural ≤3
  bound) — §7 reuses both.
- The **report writer** (`report.ts`) — extended (below), same schema home.

**MUST CHANGE / ADD (the net-new for the impl-QA rescope — these are the wiring points to reconcile):**
- **Per-milestone report filename:** `report.ts` must write `report.M<id>.json` (today it writes/overwrites
  `report.json`). One-line change; high value (preserves the run's full evidence).
- **Completability replay:** a new runner that reads `blueprint/intended-solution.json` and drives the recorded
  action-sequence step-by-step (reusing the compiler's input primitives) — §4.
- **Trace-level invariant sampler:** sample `__GAME__`/`snapshot()` on a bounded cadence during every drive and
  evaluate the blueprint's invariants (monotonic/bounds/no-softlock/status-legality/no-side-effect) — §5. The
  harness today reads only end-state per assertion; this adds a during-drive sampler.
- **The perturbation engine** (`perturbation.ts`, new) + **`perturbation-grammar.md`** (new contract): apply a
  behavior-preserving permutation of the blueprint's declared-range parameters via `commands.setState`/`commands.seed`/
  a permuted level-config injection, re-run the committed acceptance criteria, and compare invariance — §6. This is
  the single largest net-new piece and the load-bearing anti-gaming gate.
- **Escalation writer:** emit `blueprint/escalations.M<id>.json` and the `design escalation` marker variant — §8.

---

## APPENDIX B — OPEN QUESTIONS / hand-off points to reconcile when wiring the workflow

1. **VERIFY-1's output shape is assumed, not yet contracted.** This draft reads three VERIFY-1 artifacts —
   `blueprint/frozen.json` (concrete tunables **+ each parameter's declared range**, the perturbation envelope),
   `blueprint/intended-solution.json` (the ordered winning action-sequence with interim observables, engaging the
   threat), `blueprint/acceptance.json` (Given/When/Then with the precondition VERIFY-1 froze). **VERIFY-1's SKILL
   must commit exactly these.** The single most important field VERIFY-2 needs that doesn't exist today is **the
   declared RANGE per tunable** — without it §6 cannot construct a *behavior-preserving* permutation. Reconcile the
   VERIFY-1 ↔ VERIFY-2 contract on this first.
2. **Where does the perturbation actually get applied?** Three candidate seams: (a) `commands.setState`/`commands.seed`
   at runtime (cleanest, no rebuild — works for seed/position/precondition); (b) a permuted `gameConfig.json` +
   re-build (needed if a tunable is baked at build time, e.g. `enemyWalkSpeed` read once in `create()`); (c) a
   permuted level-config the harness injects pre-boot. Decide which permutations each seam supports; some (baked
   config) may need a rebuild per permuted run — confirm the cost is acceptable for the Pi budget.
3. **Relationship to the milestone's gdd `assertions[]` vs. `blueprint/acceptance.json`.** They overlap (the gdd
   assertions are the executable form; the acceptance criteria carry the frozen precondition). Decide the single
   source of truth so §3 doesn't double-run. Recommended: `acceptance.json` *is* the gdd assertions plus the frozen
   GIVEN, generated by VERIFY-1; VERIFY-2 reads acceptance.json and treats gdd assertions as a fallback.
4. **The EXECUTOR's escalation channel.** §8 assumes underspecification was escalated upstream by W4 EXECUTE (zero
   design latitude). Confirm W4's contract actually forbids invention and writes a visible escalation, so a
   capability-gap mismatch here can be correctly attributed (executor-should-have-escalated → implementation failure)
   rather than silently absorbed.
5. **`report.schema.json` migration.** This draft extends the schema (`fidelity`/`completability`/`invariants`/
   `perturbation`/`escalation` blocks; per-milestone file). Decide whether to version the schema or keep it additive
   (the existing `assertions[]`/`buildHealth`/`fixCycles`/`advisoryVlm` fields are retained).
6. **`commands.setState` precondition vs. the anti-inject rule.** §3 places a precondition via `setState` but §6
   forbids injecting the observed-adjacent value. The exact line ("a precondition the player could genuinely reach"
   vs. "the effect under test") needs a crisp, committed predicate in `perturbation-grammar.md` so the boundary is
   mechanical, not judgment — otherwise a faithful build could be false-blocked for using a legitimate precondition.
7. **Naming.** This node is drafted as `verify-impl-qa` / node `VERIFY-2`. Confirm the final skill folder name and
   the workflow phase id before integration (the map + `game-omni.js` phases must agree).
