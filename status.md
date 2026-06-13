# game-omni — STATUS

_Updated 2026-06-12. Single entry point per session. **Read order:** this → `design/pipeline-design-v1.md` (the plan) → `research/` (the why). Keep this LEAN: research lives in `research/`, the plan lives in `design/`._

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
**BUILT:** the **seven-node** skill system — `W0 · W1 · VERIFY-1 · W2 · W3 · W4 · VERIFY-2` (`packages/skills/*`, each with a research record in `research/skills/`); the orchestrator **`.claude/workflows/game-omni.js`** (Pi-extractable: **11 stages**); the **platformer template** (`templates/core/` + `templates/modules/platformer/` — builds green, boots headless to `window.__GAME__.ready`, hook proven live); and the **verify harness** (`packages/verify/` — VERIFY-2's six-gate engine: build-health · fidelity · completability · invariants · isomorphic perturbation · self-guard; `tsc --noEmit` green, proven PASS + FAIL against the template). Governance: `.agents/skill-system-map.md`, `CLAUDE.md`, `README.md`.

**REDESIGN (2026-06-10) — separation of powers:** verification is now two nodes. **VERIFY-1** (`verify-design/`, pre-code, static) judges + HARDENS the design into a frozen, winnable `spec/blueprint.json` and owns GAMENESS alone; **W4 Execute** builds it VERBATIM (zero design latitude, HALT+escalate on a missing number, never invent); **VERIFY-2** (`verify/`, rescoped) checks IMPLEMENTATION FIDELITY only — incl. the load-bearing isomorphic-perturbation gate — and never re-judges gameness. _Why:_ the old single W5 was graded through state the implementer itself populated ("student grades its own homework") and conflated *is-the-design-good* with *is-the-code-correct*. The executable substrate (blueprint schema · perturbation grammar + harness engine · per-milestone reports) is built (`extract.mjs` → 11 stages clean); full write-up in `.agents/skill-system-map.md` diagnostics log.

**PROVEN ON PI (2026-06-09, on the PRE-redesign 6-node `W0–W5` chain):** the full pipeline ran robust end-to-end on a cheap non-Claude model. Run `td1` (`MiniMax-M3`, main-tree, top_down robot-collect-batteries prompt) completed **all 10 nodes in 95.2m**, and **all 3 milestones reached `VALIDATION_PASSED` on the first try (fixCycles=0)** over real `window.__GAME__` assertions → `out/td1/verify/report.json` + `verify/M{1,2,3}-end.png`. _(That run also exposed the two flaws — one-color entities, threat-decoupled reward path — that motivated the two-verify redesign above; the new chain awaits its own fresh validation run.)_ Two prerequisites were settled to get here: the MODEL (`cp`/qwen `reasoning:false` derailed the heavy nodes → `MiniMax-M3` `reasoning:true`/1M-ctx terminates cleanly), and two ENGINE false-blocks in the OUTPUT-CONTRACT layer (G2 + G3, synced byte-identical to canonical `transform-workflow-to-pi`). After G2+G3 every remaining `blocked`/`error` is a genuine failure. _(Full write-up: `.agents/skill-system-map.md` diagnostics log.)_

**2026-06-12 — a cw1 fix-everything batch, now COMMITTED** (Hermes series-eval on MiniMax-M3, `out/ceval1–3`): the human played the cloud gnome game `out/cw1` and named severe flaws; all fixed. **(A) Assets — `819f549`:** real Gemini **batch** generation is the W3 DEFAULT (placeholder = graceful floor) via a new tool `packages/skills/assets/gen/` — proven with real cw1 art. **(B) Fullscreen — `f5104d0`:** the game fills the window (16:9 **1280×720**). **(C) Game-design foundations — `f97eb9d`** (+ camera/world-bounds `ef03037`): a new grounding doc `research/game-design-foundations.md` (38 sources) + a new GLOBAL skill `agentic-prompt-design`, encoded into the DESIGN nodes — **score-meaning** (`meta.maxScore` + idempotent rewards: the farming bug is dead) and **level RICHNESS**. **META-LESSON:** doctrine alone didn't carry on the cheap executor; **prompt-craft** did (enumerate the bar in-prompt + a self-critique pass). Validated on `out/ceval3`: round one is now an 8-terrace, 3-crow, 4-beat, ~3-screen escalating single level with a bounded/gating score, vs the prior thin 30s crossing. Single rich level is the default; a longer level uses a wider world + camera-follow (template proven headless).

**NEXT (next session) — the design nodes now produce what we want; push it down the producing path:**
1. **Build the now-rich design end-to-end (W2 → W3 → W4 + scaffold).** The design declares a rich, LONGER, scrolling single level (wide world + camera-follow). Run a fresh full pass so a real build actually renders it: W3 ships real assets, the game fills the window, and W4 builds the 8-terrace/3-crow/4-beat escalating level with the bounded/idempotent/gating score. Human eyes the playable artifact. (The W2/W4 side has NOT been re-validated against the new design — that's the next sweep target.)
2. Build the other 4 genre templates (top_down / grid_logic / tower_defense / ui_heavy), reusing `templates/core/` unchanged → **`docs/handoff-build-archetype-templates.md`**.
3. Human is the eye: inspect the generated artifact + screenshots for play-feel quality; route any real flaw via `hermes-skill-system` (a wave → its SKILL; the chain → `game-omni.js`).

_Evolve any node via `hermes-skill-system`. The human is the eye for the playable game._
