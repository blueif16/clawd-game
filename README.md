# game-omni

An AI **game-generation engine**: one text prompt → a **verified, playable Phaser 2D web game** in one pass.

It is a **workflow that orchestrates a skill system** — six nodes, each loading one evidence-grounded skill,
coordinating only through on-disk files. The single source of truth is `.claude/workflows/game-omni.js`, and it
runs identically on Claude (the `game-omni` Workflow) or cheaply on **pi** (`pi-runner/`).

```
W0 Classify → W1 Spec → W2 Scaffold → W3 Assets → (per milestone: W4 Implement → W5 Verify+Fix)
prompt ─────► spec ───► gdd+milestones ─► empty game ─► art ─► code ─► VALIDATION_PASSED
```

![game-omni pipeline](docs/diagrams/pipeline.png)

Success = the **verify** node passes: the game builds, boots headless, and every milestone's runtime assertions
(against `window.__GAME__`) emit `VALIDATION_PASSED` — with zero human edits.

## Run it
```bash
# free: print the realized 10-stage DAG (no model called)
node pi-runner/extract.mjs

# on pi (cheap), in the background; status → out/<id>/run-status.json
node pi-runner/run.mjs --run myrun --arg prompt="a coin-collecting platformer" --arg projectDir=out/game --debug
```
On Claude, invoke the `game-omni` Workflow with `args.prompt`. What each node does + how to improve it: **`CLAUDE.md`**.

## Architecture

The pipeline above is the runtime spine; its edge labels are the **on-disk artifacts** that are the *only*
channel through which nodes coordinate (node color = role). Two contracts make it work:

### The load-bearing cross-node contract — `window.__GAME__`

![window.__GAME__ contract](docs/diagrams/game-hook-contract.png)

The test hook is the linchpin: **W1 drafts** assertions over it → **W2 finalizes & exposes** the canonical
accessor → **W4 populates** it from real state → **W5 reads** it to assert. The oracle (assertions /
`gdd.json` / the hook / the harness) is **immutable** — the anti-reward-hack spine.

### W5 Verify+Fix — the bounded ≤3 self-fix loop

![W5 verify+fix state machine](docs/diagrams/verify-fix-state.png)

The harness owns a persistent per-milestone counter; past 3 attempts it refuses **before** booting Chromium
(cost-capped). An honest `VALIDATION_FAILED` at the bound is the correct output, not a defeat.

> Diagram sources + SVG/PNG exports live in [`docs/diagrams/`](docs/diagrams/); regenerate with
> `mmdc -i <f>.mmd -o <f>.png -w 2048 --backgroundColor white`.

## The chain's constitution (cross-cutting design philosophy)

Encoded once in `game-omni.js`, never copied into the skills:

- **The filesystem IS the contract.** Nodes coordinate ONLY through on-disk artifacts. A node's JSON output
  is merely the orchestrator's *receipt*; the durable truth is the file it wrote. This forces clean hand-off
  boundaries and makes the pipeline resumable and **Pi-portable**.
- **One `agent()` call per node, with a forced-JSON `schema`** — deterministic and statically extractable;
  the Pi extractor sees fixed lanes, never model-invented control flow.
- **A shared `PREAMBLE` is injected into every node:** _filesystem-is-contract · load your SKILL · generalize ·
  stay in your lane_. The chain's discipline lives in the workflow; each skill carries only its craft.
- **Evidence-grounded skills.** Each node loads `packages/skills/<name>/SKILL.md`, authored by its own research
  sub-agent; every practice cites its provenance — no rule rests on a guess.
- **Pi-portability by construction.** Fan-outs are discovered-once lists with **static defaults** (milestones
  default to 3) — never extractor-invisible, data-dependent branching.
- **The 4-layer contract per node:** ① `PREAMBLE` (discipline) ② `SKILL` (craft) ③ `schema` (the forced JSON
  shape Claude validates) ④ the **OUTPUT CONTRACT** (`DRIVER-ARTIFACTS:` / `DRIVER-OWNS:` markers the Pi driver
  verifies **on disk, independent of the self-report** — a missing required artifact ⇒ `blocked`).
- **Anti-reward-hack is absolute.** Assert **observable** state only. The oracle — the assertions, `gdd.json`,
  the `window.__GAME__` hook, and the verify harness — is **immutable**. A fix changes real `src/**` behavior,
  never the test.
- **Green ≠ good. The human is the eye.** A green W5 means "the mechanics fire," never "the game is good."
  Fun, legibility, and tension are judged by a person — we deliberately do **not** add reward-hackable
  "fun" assertions.
- **Hermes stewardship.** Improve a *wave* by editing its SKILL; improve the *chain* by editing `game-omni.js`.
  One canonical home, smallest durable edit, generalize or don't ship.

## Per-node design philosophy

### W0 · Classify — Designer · `classify-game`
`args.prompt` → `spec/classification.json` (archetype · coreLoop · coreVerb · physicsProfile · **scopeCut**).
- **Physics-first routing:** route by **physics and perspective, never the genre word.** Three physics
  key-questions collapse any prompt onto one archetype from the closed set `{platformer, top_down, grid_logic,
  tower_defense, ui_heavy}`. Physics is the invariant that survives the genre label, and the archetype selects
  the W2 template — so the routing key must be physical, not lexical.
- **The `scopeCut` (4–8 items) is the anti-slop guardrail.** Over-scope is the #1 failure mode of one-pass
  generation, so W0 commits *what is deliberately OUT of v1* up front. Cut anything not serving the core loop;
  **never cut the juice / game-feel.**
- The one-line **core loop** (verb + goal + obstacle + fail) and single **coreVerb** are the spine everything
  else serves. Deterministic; gibberish → `platformer` default; no-fit → closest + `confidence:"low"`.

### W1 · Spec — Designer · `write-gdd`
`spec/classification.json` → `spec/gdd.json` (slim gameDNA + **2–5 milestones**) + `spec/PLAN.md`.
- **Slim GDD, constrained to the template.** Never invent a capability the template lacks — the GDD is a
  *composition* of template hooks, not a wishlist.
- **Milestones are playable vertical slices, not tasks.** Default 3: **M1 = the core loop plays at all**; the
  final milestone carries a win/lose **end-state**. Build order is playability order.
- **Executable runtime assertions** — the defining idea. Each milestone gets assertions in _Given setup → When
  input → Then observe + expect_ form over `window.__GAME__`, **1:1 with the acceptance criteria**, asserting
  **observable behavior, never implementation**. W1 *invents* this hook contract shape; downstream absorbs it.
- **§3.5 — design the PLAYABLE SPACE** (added by Hermes from real-run findings): **reachability** (objective
  reachable via the documented verb, enforced by a required final-milestone reachability assertion — an
  un-fakeable win-path), **legibility**, **onboarding**, and **CHALLENGE** (the threat must lie *on/astride* the
  reward path so the loop is a real risk decision — tension stays human-judged, not a brittle assertion).

### W2 · Scaffold — Coder · `scaffold` (+ `template-contract.md`)
`spec/gdd.json` → a running **empty** project + `STRUCTURE.md` + `index.json`; exposes `window.__GAME__`.
- **Two-step template merge:** copy `templates/core/` (shared engine), then **overlay**
  `templates/modules/<archetype>` so the module *wins*. No-clobber only for this-run artifacts.
- **Prove the skeleton before any logic.** W2 yields a project that **builds green and boots** with *no* game
  logic — separating "does the skeleton compile and run" from "does the milestone work." The BUILD-HEALTH gate
  is hard: `npm run build` MUST exit 0; never report success on a red build; never loosen `tsconfig`.
- **Finalizes the canonical `window.__GAME__` accessor** (`template-contract.md §3`) — a verified *superset* of
  W1's draft — and the template must expose it.
- **Freezes the asset work-list** (`index.json` from `gdd.assetList ∪ entities.assetSlot`), merges `gdd.config`
  into `gameConfig.json` (infra groups untouched), and surfaces `gdd.controls[]` into a `controlsHelp` group
  the `TitleScreen` renders as "HOW TO PLAY" (a legibility fix — controls must reach the bundled runtime).

### W3 · Assets — Artist · `assets`
`index.json` (frozen slots) + `spec/gdd.json` → `public/assets/*` + `ASSETS.md`; writes back `path`+`status`.
- **Placeholder-first** is the v1 default (zero external key); `gemini` real-sprite generation is a toggle that
  **degrades gracefully** to placeholder. Placeholders are *legible greyboxes* — deterministic color + label +
  dims, **role-distinct** so the enemy reads differently from the player.
- **Depends ONLY on `index.json`, never on game code** — the asset lane is fully decoupled from `src/**`.
- **Runs serially before the milestone loop** (not `∥ W4-M1` as first specced) because W3 and W4 both append
  `MEMORY.md`, and concurrent whole-file rewrites would lose notes. Placeholder mode is fast, so the lost
  overlap is marginal — revisit once `MEMORY.md` writes are per-node / concurrency-safe.

### W4 · Implement — Coder · `implement-milestone`
one `gdd` milestone + `STRUCTURE.md` + `MEMORY.md` + `index.json` keys → `src/**`; **populates `window.__GAME__`**.
- **Extend, never rebuild.** Implement ONE milestone as a playable slice on top of the existing project: COPY a
  `_Template*` scene / EXTEND a `Base*` class / COMPOSE the named template behaviors; override opt-in hooks
  (always call `super`). **Never edit KEEP files** (`Base*`, `behaviors/`, `systems/`, `ui/`, `utils.ts`).
- **Wire the juice, don't author it.** Shake + a short hit-stop + flash + a score/particle pop amplify the core
  verb — wire, don't rebuild, don't over-juice. Juice is cosmetic and is **never** a field W5 observes.
- **Populate the hook from REAL state** — score via `game.registry.set`, the status flag set at the *real*
  win/lose point. **Anti-reward-hack:** implement the real mechanic so the observable is genuinely true; never
  special-case `window.__GAME__` to satisfy an assertion.
- **Stay in lane:** fix build breakage at the root cause (bounded ~5 attempts; never stub template files or
  loosen `tsconfig`), implement exactly this milestone, build, stop — don't chase W5's pass/fail.

### W5 · Verify+Fix — Playtester · `verify` (+ `assertion-execution-grammar.md`)
the built game + that milestone's assertions + `window.__GAME__` → `verify/report.json`; **returns the marker**.
- **Run the pre-built harness, never re-implement Playwright.** `packages/verify/` boots the built game
  (headless Chromium + swiftshader), advances past the title gate, waits for `window.__GAME__.ready`, fires each
  assertion's setup/input, evaluates `observe` vs the one `expect` comparator, and prints the **verbatim**
  marker — `VALIDATION_PASSED` iff it booted clean **and** every assertion passes; a missing marker = `FAILED`.
- **Bounded ≤3-cycle self-fix.** On failure: diagnose the **real root cause**, edit `src/**` game code only,
  rebuild, re-run. Stop on all-pass / a repeated failure signature (stall) / 3 cycles. The bound is
  **structurally enforced harness-side** via a persistent counter that refuses **before** booting Chromium past
  3 attempts.
- **Anti-reward-hack (absolute):** never edit `gdd.json`, the assertions, the hook, or the harness to fake a
  pass; make the real mechanic true. An honest `VALIDATION_FAILED` at the bound is the correct output.
- **Regression guard:** if `src/**` was edited, re-run prior milestones' assertions once. The advisory
  canvas-not-blank / VLM verdict is logged but **never blocks** the marker.

## Sequencing decisions (the chain's design)
- **The milestone spine is fully sequential** (W4→W5 per milestone, each complete before the next), **not**
  `pipeline()` — because W5's self-fix writes `src/**`, which would collide with the next milestone's implement.
- **W3 runs serially before the loop** (not `∥ W4-M1`) — the `MEMORY.md` concurrency reason above.
- **No result-dependent branching the Pi extractor can't see:** every node runs unconditionally; the ≤3 self-fix
  is internal to W5; the milestone fan-out has a static default of 3. `extract.mjs` → **10 stages**
  (`W0,W1,W2,W3` + 3×`(W4,W5)`).

## Layout
```
.claude/workflows/game-omni.js   the orchestrator (single source of truth)
packages/skills/<node>/          the six node skills (+ contracts: scaffold/template-contract.md, verify/*)
packages/verify/                 the W5 headless-assertion harness (Playwright)
templates/core + modules/        the genre templates W2 copies (platformer built; 4 more via docs/handoff-*)
research/skills/                  per-node research records (the evidence behind every skill)
design/                          the pipeline design + build plan (the why)
docs/diagrams/                   the workflow diagrams (.mmd source + PNG/SVG) embedded above
.agents/skill-system-map.md      Hermes map: full wiring + responsibilities + diagnostics log
CLAUDE.md · status.md            project guide · current state
```

## Improve it (Hermes)
This system is stewarded with the `hermes-skill-system` skill: improve a **wave** by editing its SKILL; improve the
**chain** by editing `game-omni.js`. Every edit must generalize across all future runs; the human is the eye for the
playable result. See `CLAUDE.md` ("Skill-system stewardship") and `.agents/skill-system-map.md`.

**Status:** skill system + orchestrator + platformer template + verify harness are built and proven. See `status.md`.
