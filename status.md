# game-omni — STATUS

_Updated 2026-06-08. Single entry point per session. **Read order:** this → `design/pipeline-design-v1.md` (the plan) → `research/` (the why). Keep this LEAN: research lives in `research/`, the plan lives in `design/`._

---

## What we're building
An **AI game-generation engine** — a pipeline that turns a prompt into a working, playable **web** game in one full pass. The pipeline **DESIGN absorbs the best practices** of the best open-source products (in `reference-repos/`) — **assembled**, not forked, not built from scratch.

## Scope (locked)
- **LLM code-generation games ONLY.** No neural world models / "playable video" (Genie/Oasis/Cosmos). _(research report §1 vs §2.)_
- **This phase = DESIGN ONLY.** We are designing the build pipeline — not implementing it, not picking a host runtime to code against. **The design is the deliverable.**
- **v1 target = ONE full pass: prompt → playable game**, to test the generation engine itself. No UI/IDE, nothing downstream.

## Decisions (firm)
1. **Substrate = WEB / TypeScript → Phaser (2D-first)**; R3F/Three.js (3D) later. _(report §8)_
2. **Engine escape hatch = Godot-via-MCP only** (native 3D / console export); Godot, not Unity/Unreal. _(report §8)_
3. **Host = a Workflow, not a chassis app.** The pipeline is authored as a pipeline-shaped Claude Code **`Workflow`** (`.claude/workflows/*.js`, single source of truth) and is **Pi-portable** (cheap non-Claude models) via `transform-workflow-to-pi`, Claude Code as console. The subprocess-vs-SDK-vs-IDE-host question is therefore **moot**; agent-game-forge = **pattern reference**, not chassis.
4. **ASSEMBLE, don't fork.** No single repo is "the base." OpenGame is a **module donor** (`agent-test/` codegen IP), not a runtime to inherit — it's a Qwen/Gemini-CLI fork and its OpenGame-Bench verify loop is **unshipped**. _(deep reads — see research.)_
5. **Pipeline phases = spec → codegen → assets → verify → fix** (the consensus design across all 9 repos). The **verify node** (Playwright headless → screenshot/assert, gamedevbench marker contract) is the highest-value & highest-risk part — and is net-new (no shipped web example exists).

## Hard truths (calibration)
- Best agent solves only **54.5%** of game-dev tasks; game tasks need **>3× the code** of normal SWE tasks (GameDevBench).
- Naive vibe-coding rots fast (800–1000-line slop). **Scope discipline beats tooling choice.**
- The only MATURE self-test loops in the wild are **Godot** (god-code, gamedevbench). A **web** verify loop is net-new — even agent-game-forge *disallows* agent visual verification, and OpenGame-Bench is unshipped.
- AI **assets** (sprites w/ pixel-snap) are the cleanest win; treat 3D as placeholder.

---

## Reference material (read in this order)
1. **THE BUILD PLAN** → `design/build-plan-v1.md` — the v1 auto-system build plan: ordered phases, each pinned to the actual repo positions (templates/skills/layouts) we revisit while building, + a master reference index. _Start here to build._
1b. **THE DESIGN** → `design/pipeline-design-v1.md` — the pipeline design + why (waves, milestone policy, verify node).
2. **Repo deep-reads (pass 1)** → `research/reference-repo-deep-reads-2026-06-08.md` — what each of the 9 reference repos does; most-used patterns (consensus); novelty; corrections to prior assumptions.
3. **Landscape research report** → `research/ai-game-generation-2026-06-08.md` — full sourced landscape. §2 code-gen · §3 assets · §6 benchmarks · §7 harness · §8 substrate.
4. **Reference repos** → `reference-repos/` (snapshots). One-line "extract THIS" per repo:

| Repo | ★ | Stack | Extract THIS |
|---|---|---|---|
| **OpenGame** | 2.5k | TS/Phaser | **Module donor.** Qwen/Gemini-CLI fork + Phaser harness; bench/skills unshipped. Real value in `agent-test/`: 5-genre Phaser game-feel modules, `generate-gdd.ts`, classifier, asset/tilemap tools. |
| **agent-game-forge** | 163 | TS | Pattern ref: disk-as-contract, CLI-adapter (codex/claude subprocess → normalized events), `<question-form>` human-in-loop. Bans Phaser; disallows visual verify. |
| **Claude-Code-Game-Studios** | 21k | CC skills | Agent/skill ORG: 49 agents + 73 skills, SKILL.md format, director-gates, review modes, file-backed state. |
| **gameforge** | 1 | TS | Claude-Agent-SDK + per-role MCP wiring; Gemini (image) + Lyria (music) asset pipeline; **only real web Playwright verify**. 1★ — reference only. |
| **gamedevbench** | 70 | Godot | **Spec + verify methodology:** `task_config.json` spec, `test.gd` `VALIDATION_PASSED/FAILED` marker contract, hidden-test sandbox. Port to Playwright. |
| **ForgeDNA** | 0 | Py | **`gameDNA` JSON schema** (engine-agnostic spec) + 11-phase BuildPlan DAG + MCP tool contract. Our spec layer. |
| **gamestudio-subagents** | 210 | Py | Multi-agent role split (12 roles) + **engine-config abstraction** + **dedicated game-feel agent**. |
| **god-code** | 1 | Py/Godot | Godot escape hatch: 36-tool MCP, `playtest_harness.py`, visual regression, live TCP bridge. |
| **godogen** | 0 | CC skills | Godot-from-description staged skill pipeline; resumability files; GDScript-vs-C# doctrine. |

---

## Open design questions (to finalize in the plan)
- **Spec format:** adopt ForgeDNA `gameDNA` wholesale, or a slim v1 subset (genre · core mechanics · entities · win/lose · asset list)? _(lean slim for v1.)_
- **Role split for the v1 pass:** full quartet (designer · coder · artist · playtester) or collapse to coder + playtester first?
- **Verify depth for v1:** build-health + screenshot/VLM only, or also runtime mechanic assertions (marker contract)?
- **Assets in the v1 pass** (Gemini sprites) or **placeholder-only** to isolate the codegen test?
- **Game-feel:** juice-in-templates only for v1, or a dedicated pass?
- **Pi-portability constraints:** filesystem-coordinated, fixed waves over one input — does any node need data-driven fan-out? _(see `transform-workflow-to-pi` "dynamic workflows" caveat.)_

## Current state
**BUILT + PROVEN:** the W0–W5 skill system (`packages/skills/*`, each with a research record in `research/skills/`); the orchestrator **`.claude/workflows/game-omni.js`** (Pi-extractable: 10 stages); the **platformer template** (`templates/core/` + `templates/modules/platformer/` — builds green, boots headless to `window.__GAME__.ready`, hook proven live); and the **verify harness** (`packages/verify/` — proven PASS + FAIL against the template). Governance: `.agents/skill-system-map.md`, `CLAUDE.md`, `README.md`.

**RUNNING:** first end-to-end **pi** run (`node pi-runner/run.mjs --run plat1 …`) on a platformer prompt — status at `out/plat1/run-status.json`, the game lands in `out/game/`. (W0 already verified on pi: wrote a valid `spec/classification.json`.)

**NEXT:**
1. Build the other 4 genre templates (top_down / grid_logic / tower_defense / ui_heavy), reusing `templates/core/` unchanged → hand-off prompt **`docs/handoff-build-archetype-templates.md`**.
2. Watch the pi run; route any real flaw it surfaces via `hermes-skill-system` (a wave → its SKILL; the chain → `game-omni.js`).

_Evolve any node via `hermes-skill-system`. The human is the eye for the playable game._
