# game-omni — skill-system map

_Hermes INIT map. The single answer to "what is our skill system, and what workflow orchestrates it?"
Free-form, no scores. Evolves and gets more certain with every run — append responsibilities, notes, and
diagnostics as we learn them; a stale map is the one real failure mode. Last refreshed: 2026-06-09._

## What this system is
An AI **game-generation engine**: one prompt → a verified, playable Phaser 2D web game in one pass.
It is a **workflow that orchestrates a skill system** — six nodes, each loading one evidence-grounded
skill, coordinating ONLY through on-disk artifacts (the filesystem is the contract). Built one
research-grounded sub-agent per node, in runtime order; each node was designed against the previous
node's ACTUAL committed artifact, never an assumed contract.

## Orchestrator / workflow file
- **`.claude/workflows/game-omni.js`** — the single source of truth. `meta.phases` = W0..W5. Injects a
  shared discipline **PREAMBLE** into every node (filesystem-is-contract · load your skill · generalize ·
  stay in your lane). Each node = one `agent()` call with a forced-JSON `schema`.
- **Pi-portable** via `transform-workflow-to-pi` (Claude proves it; Pi runs the identical prompts).
  Sanity-check the realized DAG with:
  `node ~/.claude/skills/transform-workflow-to-pi/templates/pi-runner/extract.mjs .claude/workflows/game-omni.js`
  → 10 stages: W0,W1,W2,W3, then 3×(W4,W5) for the Pi-safe **static default of 3 milestones**.
- **Hermes rule (the one global precedence):** improve a wave by editing its SKILL; improve the **chain**
  (ordering, hand-offs, wiring) by editing **game-omni.js**.

## The nodes / waves, in order — and the wiring (which node relies on what)
Runtime spine: `W0 → W1 → W2 → W3 → (per milestone: W4 → W5)`. All six are wired and extract clean.

| Node | Role | Skill it loads | Reads (upstream artifacts) | Writes (downstream artifacts) | Structured return |
|---|---|---|---|---|---|
| **W0 Classify** | Designer | `packages/skills/classify-game/SKILL.md` (+`classification.schema.json`) | `args.prompt` | `spec/classification.json` (archetype · coreLoop · coreVerb · physicsProfile · **scopeCut**) | the classification |
| **W1 Spec** | Designer | `packages/skills/write-gdd/SKILL.md` (+`gdd.schema.json`) | `spec/classification.json` | `spec/gdd.json` (slim gameDNA + **2–5 milestones**, each with **runtime assertions**) + `spec/PLAN.md` | the gdd |
| **W2 Scaffold** | Coder | `packages/skills/scaffold/SKILL.md` (+`template-contract.md`, `index.schema.json`) | `spec/gdd.json` | empty building project + `STRUCTURE.md` + `index.json` (asset slots); exposes **`window.__GAME__`** | status receipt |
| **W3 Assets** | Artist | `packages/skills/assets/SKILL.md` (+`assets.schema.json`) | `index.json` + `spec/gdd.json` (art style) | `public/assets/*` + `ASSETS.md`; writes back `index.json` path+status | status receipt |
| **W4 Implement** | Coder | `packages/skills/implement-milestone/SKILL.md` | one `gdd` milestone + `STRUCTURE.md` + `MEMORY.md` + `index.json` keys + `template-contract.md` | `src/**` game code; ticks `STRUCTURE.md`; appends `MEMORY.md`; **populates `window.__GAME__` for real** | built/failed |
| **W5 Verify+Fix** | Playtester | `packages/skills/verify/SKILL.md` (+`assertion-execution-grammar.md`, `report.schema.json`) | the built game + that milestone's `gdd` assertions + `window.__GAME__` + `MEMORY.md` | `verify/report.json` + screenshots; bounded ≤3 self-fix edits `src/**` | `VALIDATION_PASSED/FAILED` marker |

### The load-bearing cross-node contract — `window.__GAME__`
The test hook is the linchpin: **W1** writes assertions against it → **W2** finalizes the canonical
accessor (`packages/skills/scaffold/template-contract.md` §3; a verified superset of W1's draft) and the
template must expose it → **W4** populates it from real state → **W5** reads it to assert. The emergent
contract worked: each node decided its shape from evidence and the next absorbed the real thing.

### Sequencing decisions (the chain's design, recorded here)
- **Milestone spine is fully sequential** (W4→W5 per milestone, each milestone complete before the next),
  **NOT** `pipeline()` as pipeline-design §7 first specced — because W5's self-fix WRITES `src/**`, which
  would collide with the next milestone's implement.
- **W3 runs serially before the loop**, not `∥ W4-M1` — because W3 and W4 both append `MEMORY.md`
  (W5 reads it); concurrent whole-file rewrites would lose notes. Placeholder assets are fast, so the lost
  overlap is marginal. _Revisit the parallel lane once MEMORY.md writes are per-node / concurrency-safe._
- **No result-dependent branching** the Pi extractor can't see: every node runs unconditionally; the ≤3
  self-fix is internal to the W5 agent; the milestone fan-out has a static default of 3.

## The skills (this repo)
All six node skills live under `packages/skills/<name>/`. Owners of node CRAFT; the chain is owned by
game-omni.js. Each skill cites its provenance inline (repo path or URL) — no rule rests on imagination.
- `classify-game/` · `write-gdd/` · `scaffold/` (also owns `template-contract.md` — the hook/template
  contract) · `assets/` · `implement-milestone/` · `verify/` (also owns `assertion-execution-grammar.md` —
  the assertion interpreter + Phase-2 harness spec).

## Governing docs (owners too)
- `status.md` — project entry point. `design/pipeline-design-v1.md` — the why (waves, milestone policy,
  verify node). `design/build-plan-v1.md` — the ordered build + reference index. `research/` — the landscape
  + reference-repo deep-reads. `reference-repos/` — the 9 donor snapshots each skill mined.

## Runtime observability — where a run leaves evidence (read this before any diagnosis)
- **Per-node research records (design-time evidence base, reusable):** `research/skills/w{0..5}-*-research.md`
  (index: `research/skills/README.md`). Every skill practice traces to a citation here.
- **Per-run product artifacts (in the project dir, default `out/game/`):** `spec/classification.json`,
  `spec/gdd.json`, `spec/PLAN.md`, `STRUCTURE.md`, `index.json`, `ASSETS.md`, `public/assets/*`,
  `src/**`, `MEMORY.md` (the run's quirks log — first stop for a W4/W5 diagnosis), and the proof:
  `verify/report.json` + screenshots + the `VALIDATION_PASSED/FAILED` marker on stdout.
- **The Pi/extract view:** `extract.mjs` (above) shows the realized lanes without spending a token.
- **pi runs:** `pi-runner/run.mjs --run <id>` → `out/<id>/run-status.json` (verified per-node status) +
  `out/<id>.log` (the `--debug` driver heartbeat) + per-node forensics in `out/<id>/_pi/<node>.{events.jsonl,debug.log,prompt.md}`
  + the game in `out/game/`. First **full** loop = `out/plat1/` (the platformer prompt): W0 ✓ (`classification.json`),
  W1 ✓ (`gdd.json` + `PLAN.md`), W2+ running. The `cp` provider resolves from pi's native
  `~/.pi/agent/models.json` — no per-repo credential. _(Launch lesson: never pipe the driver through `head`/a
  truncating filter — closing the pipe SIGPIPE-kills the run; redirect to a file instead.)_
  _(Stall lesson: the `cp` provider can go fully silent mid-node for ~60–90s — a transient stream pause, not a
  hang — then resume and finish. The `--debug` `⚠ STALLED` flag fires at 45s but is only a WARNING; the real
  guard is `--node-timeout` (default 1800s). Do NOT kill a node on a stall alone — confirm it's dead (no event
  recovery as the node-timeout approaches) before intervening; the runner's early-kill is reserved for a
  repeated-delta stuck-loop, not silence.)_

## Product code (built against the skill contracts)
1. **Genre templates (build-plan Phase 1).** `templates/core/` (shared engine: `hook.ts` = the
   `window.__GAME__` adapter, placeholder-filling `Preloader.ts`, UI scenes, `LevelManager`, build config)
   + `templates/modules/platformer/` — **BUILT**: builds green (`tsc --noEmit && vite build`), boots
   headless to `__GAME__.ready` with the hook proven field-by-field (live swiftshader Playwright). W2 copies
   per `templates/README.md` (copy `core/`, then overlay the module so it wins). Of the other 4 archetypes
   (reuse `core/` unchanged): **`top_down` is mid-build** (per `docs/handoff-build-archetype-templates.md`, one
   at a time → build green → prove with `packages/verify/` → next); `grid_logic`/`tower_defense`/`ui_heavy` remain.
2. **Verify harness (build-plan Phase 2).** `packages/verify/` per `assertion-execution-grammar.md` §5 —
   **BUILT**: the general-interpreter runner is complete (`bin/verify-milestone.ts` + `src/{harness,observe,
   compile,marker,report,vlm}.ts` + README); boots the built game (Chromium + swiftshader), compiles each
   assertion, evaluates the observe grammar off `window.__GAME__`, emits the `VALIDATION_PASSED/FAILED` marker.
   One-time setup: `npx playwright install chromium`. (Building it produced the §5.2 step-6b title-advance fix
   below.) Remaining done-criterion: the recorded platformer proof (a green M1 + a deliberately-broken FAILED).
The skill system + orchestration are complete; these are the product-code builds the skills are specced against.

## Diagnostics log (product-quality edits only; append one line each: date — owner — rule — commit — supporting doc(s))
_Every entry CITES its supporting doc (research brief / handoff / findings) and we COMMIT that doc — so a future
session can retrace the evidence behind any edit. A claim with no doc on disk is not yet grounded; record it._
- 2026-06-08 — system — Built the W0–W5 skill system + `game-omni.js` orchestrator, one research-grounded
  sub-agent per node, emergent artifact contracts (no commit yet — repo is not under git).
- 2026-06-08 — `scaffold/SKILL.md` — Building the Phase-1 platformer template revealed the template ships as
  shared `core/` + a module **overlay** (module wins on `main.ts`/`utils.ts`/`gameConfig.json`), but §2's
  no-clobber copy would drop the module's files and boot the wrong scene. Fixed §2 to the canonical
  two-step merge (copy `core/` first, then overlay the module so it wins; no-clobber only for this-run
  artifacts). Generalizes to all five archetypes. Verify: next W2 run yields a project whose `main.ts` is
  the archetype's and builds+boots `ready`.
- 2026-06-08 — `verify/assertion-execution-grammar.md` — Building the Phase-2 harness against the real
  template showed §5.2's boot order waits for `__GAME__.ready` immediately after `goto`, but the template
  gates `ready` behind a `TitleScreen` needing ENTER/SPACE/pointerdown → it would hang on the title. Added
  step 6b: a generic, archetype-AGNOSTIC title-advance (focus canvas → Enter/Space/click, poll until ready)
  before the ready-wait. Matches the proven `harness.ts:advanceToReady`. Verify: a fresh harness boot of any
  template reaches `ready` and runs assertions.
- 2026-06-08 — `game-omni.js` (chain) — The W5 node prompt described re-implementing Playwright inline; now
  that the proven `packages/verify/` runner exists, pointed W5 at it (invoke `verify-milestone <project> <mid>`,
  parse the marker, re-run the harness in the ≤3 fix loop) and added the harness to the immutable-oracle list.
  Verify: a W5 run drives the harness, not ad-hoc test code.
- 2026-06-09 — **FINDING (OPEN — no fix yet; recorded per human request)** — `cp`-provider PATH
  CORRUPTION on the first full Pi loop (`out/plat1`, platformer). The `cp` (cheap coding-plan) model
  READS the correct project dir (`ls out/game/`, reads `out/game/spec/*`) but WRITES to a fabricated
  sibling `out-game/` (the `/` dropped): W2 ran `cp -r templates/core/. …/out-game/`, `…platformer/src/.
  …/out-game/src/`; across W2 events `out-game` appears 193× vs `out/game` 296×. Result: `spec/` lands
  in `out/game/` but the entire scaffold+assets+build+verify lands in `out-game/`. The driver still
  marks nodes `ok` because it stat()s the model-REPORTED `outputArtifacts` (`run.mjs:369`), which point
  at `out-game/…` and exist → a SILENT FALSE-GREEN: the cross-node filesystem contract drifts
  undetected. Secondary: every node logs `"no return JSON block parsed from pi output"` — the cheap
  model under-complies with the forced-JSON return contract (driver falls back to artifact-existence).
  Root cause = `cp` model fidelity (drops the `/`, skips the fenced ```json```), NOT the workflow
  (prompts say `out/game` correctly). Proposed route (later pass, human-gated): a CHAIN guard
  (`run.mjs`/`game-omni.js`) that REJECTS any reported `outputArtifact` not under `${PROJECT}/` → turns
  the false-green into a loud, correct failure for ANY path drift; + a slash-free default `projectDir`
  (nothing to corrupt); + preamble hardening (`cd` into an absolute project dir once, operate relative).
  Evidence: `out/plat1/_pi/w2-scaffold.{events.jsonl,prompt.md}`, `out-game/` vs `out/game/spec/`.
  Human decision: let the run finish, no re-run yet.
  — UPDATE 2026-06-09: the **false-green half is now closed** by the generic post-condition guard
  (next log entry): a path-drifted / empty-output node halts `blocked` instead of silently `ok`.
  The slash-free `projectDir` + per-game-folders + catalog `index.json` half of A1 remains OPEN.
- 2026-06-09 — `pi-runner/{run,extract}.mjs` (generic engine) + `game-omni.js` (chain) — GENERIC node
  POST-CONDITION GUARD, killing the silent false-green class `plat1` surfaced. The chain now DECLARES
  each node's on-disk contract as data (`agent()` opts `produces:[projectDir-relative files]` /
  `mutates:'<subdir>'`); the driver ENFORCES it after every node — a reported artifact OUTSIDE the
  projectDir, a declared `produces` file missing/empty, or a `mutates` dir left byte-for-byte unchanged
  ⇒ node `blocked` (loud halt), never `ok`. Declared W0–W3 (`produces`) + W4 (`mutates:'src'`); no-ops
  when a node doesn't opt in or no projectDir is passed (legacy behavior + engine game-agnosticism
  preserved). Would have caught ALL three plat1 failures: W4 wrote 0 files yet went ok; W2 never wrote
  STRUCTURE.md; W3 wrote to corrupted `out-game/`. De-hardcoded: engine checks on-disk EFFECTS, the
  chain owns the per-node truth — no game/genre knowledge anywhere. Verify: `node --check` + `extract.mjs`
  still 10 stages; empirical proof deferred to the NEXT fresh-prompt run (never a plat1 rerun — avoids
  overfitting the fix to one game). Partially lands A1's "chain guard". Proven: `pi-runner/guard.test.mjs` (6/6).
  (commit: `3e94d7e` · skillsys(game-omni); doc: `docs/handoff-fix-pipeline-findings.md` §A1–A4 — the findings.)
- 2026-06-09 — `write-gdd/SKILL.md` (+ companion `implement-milestone/SKILL.md`) — **Bucket 3 (the quality
  break): no node DESIGNED for "can a real player play+win this".** plat1 shipped a level whose platforms
  exceeded the jump arc and whose goal needed no jumping, yet PASSED — assertions checked mechanics in
  ISOLATION (`x increases on Right`), never a win-path. Research-grounded fix (our research first, then
  multi-source): W1 gains §3.5 "Design the PLAYABLE SPACE" (win-path reachability · legibility · onboarding)
  and §5 REQUIRES a final-milestone reachability assertion (fire documented `controls[]` → assert the win
  observable); W4 builds the reachable/legible space. De-hardcoded: the relation "objective reachable via the
  documented verb", mapped per archetype to observables already in the grammar
  (`status`/`moveCount`/`lives`/`enemyHP`) — zero genre constants, NO schema change. Anti-reward-hack:
  STRENGTHENS the observable oracle (an un-fakeable win-path), oracle stays immutable. PREREQUISITE: paired
  with **A4** (the verify harness must actually DRIVE the documented controls to the goal — plat1's M3-A1
  errored "not drivable by natural input"; else we trade false-green for false-error). doc:
  `docs/bucket3-playability-research.md` (full brief + cited sources: Sturgeon-MKIII reachability /
  gamedeveloper legibility / GMTK + Level-Design-Book onboarding). (commit: pending — W1/W4 skill edit + A4
  harness in progress via sub-agents.)
- _(future flaws/fixes append here so repeat-flaws become visible and the next diagnosis starts ahead.)_

## Stewardship note
This system follows `hermes-skill-system`. Treat any flaw, recurring finding, or user feedback on a
generated game as a trigger: capture → route (prefer fixing the chain in game-omni.js over a single skill) →
edit the smallest durable change → verify by intent → get human approval → record here. The human is the
eye for the playable artifact.
