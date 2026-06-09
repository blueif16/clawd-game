# Handoff — fix the game-omni pipeline findings + finish the genre templates

_Paste everything below the line into a fresh session in `/Users/tk/Desktop/game-omni`. It is self-contained._

---

You are continuing work on **game-omni**, an AI game-generation engine (a Pi-portable Claude Code Workflow that
orchestrates a 6-node skill system: `W0 Classify → W1 Spec → W2 Scaffold → W3 Assets → per-milestone(W4 Implement →
W5 Verify+Fix)`). The single source of truth is `.claude/workflows/game-omni.js`; the Hermes governance map is
`.agents/skill-system-map.md`. Read `CLAUDE.md` (the constitution) first.

## How to operate THIS session (read first)
- **You are the ORCHESTRATOR. Actively SPAWN SUBAGENTS** (Agent tool) — one per subtask below — and coordinate them;
  you do not implement the fixes yourself. Run **independent** subtasks in parallel; keep **dependent** ones ordered.
- **Hermes discipline is law** (`CLAUDE.md` + `.agents/skill-system-map.md` + the `hermes-skill-system` skill):
  improve a wave by editing its SKILL; improve the chain by editing `game-omni.js`. Every edit must **GENERALIZE**
  to all future runs (never hard-code one game/case). **Anti-reward-hack is absolute** — the assertions / `spec/gdd.json`
  / `window.__GAME__` hook / the `packages/verify/` harness are the IMMUTABLE ORACLE; a fix changes real `src/**` /
  chain behavior, never the test. **The human gates every STRUCTURAL change** (new node, changed node/contract,
  reordered waves) — present the diff/plan for approval BEFORE it lands; then record it in the map's diagnostics log
  with a `skillsys(<owner>):` commit.
- **Monitoring (already built — use it):** `node pi-runner/status.mjs --run <id>` (per-node dashboard + token/cost),
  and `node pi-runner/watch.mjs --run <id> --notify` in the background (wakes only on done/error/driver-gone/dead-stall;
  it will NOT trip on the transient ~60–90s `cp` stream pause). The `cp` provider can go silent ~60–90s mid-node and
  self-recover — do NOT kill on the 45s STALL warning; the real guard is `run.mjs --node-timeout` (1800s).
- Treat the `$` cost figures as the provider's self-reported estimate (`run.mjs:304` sums `u.cost.total`); the hard
  number is **tokens**.

## What just happened (state you inherit)
- **First full Pi loop completed: `plat1` (platformer prompt) → FAILED** (`done:true, ok:false`, ~100 min,
  ~7.9M tok). **9/10 nodes ok; M1 ✓ verified, M2 ✓ verified, M3 ✗.** This run did its job — it surfaced **real bugs**
  (below) and produced an honest FAILED, not a false-green. All artifacts are consolidated in **`out/games/plat1/`**
  (game `src/`+`dist/`, `spec/`, `verify/report.json`+screenshots, `run-status.json`, `_pi/` forensics, driver logs).
- **`top_down` template is DONE + proven** (builds green, M1 `VALIDATION_PASSED` + a flipped assertion `VALIDATION_FAILED`
  via `packages/verify/`, `core/`+`tsconfig` untouched). Committed on branch `feat/top_down-template`.
- **Monitoring tooling shipped** (`pi-runner/watch.mjs` + `status.mjs`, also in the global `transform-workflow-to-pi`
  skill template). Committed on `feat/pi-monitoring`.
- **Git is live:** `main` = baseline (`eb65efd`); feature branches `feat/top_down-template`, `feat/pi-monitoring`
  (none merged). Commit convention: `skillsys(<owner>): <rule>` for skill-system edits, `feat(...)`/`fix(...)` for
  product code. Branch first; don't push.
- **Open in the map's diagnostics log:** the path-corruption finding (committed `bcb7f92`).

---

## THE TASKS — spawn one subagent per subtask

### A. Pipeline-bug fixes from the `plat1` run (route each through Hermes; human-gate structural changes)

**A1 — Path corruption `out/game` → `out-game` + per-game folders/index/provisioning (the big one; design ALREADY APPROVED).**
The `cp` model READS the correct project dir (`ls out/game/`) but WRITES to a fabricated sibling `out-game/` (drops the
`/`): across W2 events `out-game` appeared 193× vs `out/game` 296×; the whole scaffold/build/verify landed in `out-game/`
while the driver still marked nodes `ok` (it stat()s the model-REPORTED `outputArtifacts`, `run.mjs:369`) → a SILENT
FALSE-GREEN. **Approved fix design (build it):**
- **Per-game folders** `out/games/<id>/` (each game isolated) + a **catalog `out/games/index.json`**
  (`{id,title,archetype,prompt,projectDir,createdAt,status,milestones:[{id,status}]}`). Seed it with the games already on
  disk: `out/games/plat1` (status `failed`, M1✓M2✓M3✗), `out/games/coin-dash`, `out/games/orbit-dodger`.
- **Workflow preflight in `game-omni.js`** that provisions the per-game folder tree (`spec/`, `public/assets/`) and
  registers/updates the index entry from `args` BEFORE W0 — expressed as a deterministic FIRST node (the Claude Workflow
  runtime has NO fs at eval time, confirmed `game-omni.js:56-57`; on Pi the driver runs it identically). Pass each node an
  absolute, pre-created `${PROJECT}` so the model never `mkdir`s the top dir.
- **Chain guard (the real anti-drift catch):** reject any reported `outputArtifact` NOT under `${PROJECT}/` → mark the node
  `gap`/`blocked`, not `ok`. This turns the silent false-green into a loud, correct failure for ANY path drift. (Decide:
  guard in `game-omni.js` schema/post-check vs `run.mjs` — keep the generic engine `run.mjs` non-diverging.)
- Verify by a fresh `--until w2` Pi run that lands the scaffold in `out/games/<id>/` and indexes it.

**A2 — The ≤3 self-fix bound is NOT enforced.** W5-M3 re-ran `npm run verify-milestone -- …/out-game M3` **~8×** (saw
79 FAILED / 36 PASSED markers across attempts) and **burned to the 1800s node-timeout** (killed → run failed). The W5
SKILL specifies ≤3 self-fix cycles but the `cp` model ignored it. Make the bound **structurally enforced** (by the W5
harness/driver loop, not trusted to the model): after ≤3 verify→fix cycles, STOP and emit the honest `VALIDATION_FAILED`.
Owner: `packages/skills/verify/` (+ maybe `packages/verify/`). Evidence: `out/games/plat1/_pi/w5-verify-m3.events.jsonl`.

**A3 — Forced-JSON return non-compliance.** EVERY node logged `"no return JSON block parsed from pi output"`; the driver
fell back to artifact-existence to mark `ok`, degrading the "verified, not trusted" guarantee. The cheap `cp` model isn't
emitting the fenced ```json``` return block reliably. Harden the node return contract (clearer/again-at-the-end JSON
instruction in `game-omni.js`'s schema wrapping / PREAMBLE, and/or a more lenient-but-correct parser in `run.mjs`). Verify a
re-run shows parsed structured returns. (Note: `run.mjs` is the generic engine — prefer fixing the prompt/contract side.)

**A4 — M3 win-on-exit fails (`status` observed `null`).** `out/games/plat1/verify/report.json`: **M3-A1 = `error`** —
input `{type:"event", target:"overlap:player,exit"}`, `observe:status`, expected `"won"`, **observed `null`** (the hook
never returns null → the observe couldn't read status). **M3-A2 passed.** So the failure is win-on-exit only. Two
candidate root causes to diagnose (read the report + re-run the harness against `out/games/plat1`): (i) a **harness `event`-
input gap** — `packages/verify/` didn't actually drive the player into the exit overlap (the `event` compile path in
`assertion-execution-grammar.md` §2.4 may be under-implemented), or (ii) the **platformer template/W4 win-state isn't
reachable/observable** (no exit, or `status` not set on goal overlap). Fix the real cause (harness `event` driving, or the
template's goal→`registry.status='won'` wiring) — NEVER fake the value. This is partly entangled with A1 (it ran in the
split `out-game`).

### B. Finish the remaining genre templates (the original build — `docs/handoff-build-archetype-templates.md`)
`top_down` is done. Build **`grid_logic` → `tower_defense` → `ui_heavy`**, ONE at a time, each: scaffold mirroring
`templates/modules/platformer/`, reuse `templates/core/` unchanged, build green at `/tmp/<a>`, PROVE with
`packages/verify/` (paste `VALIDATION_PASSED` + a flipped `VALIDATION_FAILED`), update `templates/README.md`. **Don't
batch — build one, prove it, then the next.** Spawn one subagent per archetype (sequentially). Full brief:
`docs/handoff-build-archetype-templates.md` (the contract + procedure).

### C. Housekeeping (do, or surface for the human)
- **Skill-repo uncommitted WIP:** `~/.claude/skills/transform-workflow-to-pi/` has a pre-existing uncommitted reorg
  (`run.mjs`, `SKILL.md`, `README.md`, `provider-and-headless.md`, `.env.example`, `models.json.example`) + this
  session's monitor-doc edits mixed in. NOT yours to sweep — the human reviews + commits it. The two NEW monitor files
  ARE committed (`65c4822`).
- **Branches:** decide whether to merge `feat/top_down-template` + `feat/pi-monitoring` into `main`.
- When each fix lands, append its conclusion to the **diagnostics log** in `.agents/skill-system-map.md` (date — owner —
  rule — `skillsys` commit), and keep the map current (a stale map is the one real failure mode).

---

## Evidence to read FIRST (don't guess — diagnose from real data)
- `.agents/skill-system-map.md` — the system map + the diagnostics log (the path-corruption finding is there).
- `packages/skills/scaffold/template-contract.md` (the `window.__GAME__` + template contract) and
  `packages/skills/verify/assertion-execution-grammar.md` (the W5 boot/observe/`event`-input grammar + harness spec).
- The run's forensics: `out/games/plat1/_pi/<node>.events.jsonl` + `<node>.debug.log` (every tool call; this is how the
  bugs were found), `out/games/plat1/run-status.json`, `out/games/plat1/verify/report.json` (the M3 proof).
- `.claude/workflows/game-omni.js` (the chain), `pi-runner/run.mjs` (the driver — note `:369` artifact stat, `:304` cost).

## Re-run to validate a fix
`node pi-runner/run.mjs --run <newid> --arg prompt="…" --arg projectDir=out/games/<newid> --debug > out/games/<newid>/driver.log 2>&1 &`
(redirect to a FILE — piping the driver through a truncating filter SIGPIPE-kills the run). Use `--until <phase>` to bring
up just the changed suffix. Watch with `node pi-runner/status.mjs --run <newid>` + background `watch.mjs --run <newid> --notify`.

## Definition of done (per fix)
Builds/boots green where applicable; the REAL behavior is corrected (no faked oracle); validated by a real Pi run or a
`packages/verify/` run; generalizes to any prompt; recorded in the diagnostics log with a `skillsys(...)` commit; human
approved any structural change.
