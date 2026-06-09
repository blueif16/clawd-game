# Reference-repo deep reads — pass 1 (2026-06-08)

_Research artifact. Findings from deep code reads of all 9 `reference-repos/`. This is RESEARCH (what exists out there); the pipeline DESIGN that absorbs these findings lives in `design/pipeline-design-v1.md`; the lean entry point is `status.md`._

## Method
One deep-read agent per repo, in parallel:
- **4 Codex headless dives** (`codex exec --sandbox read-only`) on the code-heavy repos: OpenGame, agent-game-forge, gameforge, gamedevbench.
- **4 Claude `Explore` dives** on the doc/skill repos: Claude-Code-Game-Studios (CCGS), ForgeDNA, gamestudio-subagents, god-code+godogen.
Each returned the same contract: thesis · architecture map · harness-layer coverage (L1–L6) · reusable artifacts · novel · skip/breaks · integration surface. Codex was confirmed spawnable and run concurrently (smoke test + fleet).

Harness layers scored (from `status.md` cheat sheet): **L1** templates+skill library · **L2** grounding · **L3** spec-driven milestones · **L4** multi-agent roles · **L5** runtime self-test (play→screenshot→verify→fix) · **L6** game-feel pass.

---

## Cross-repo synthesis (the conclusions)

### ⚠️ Corrections to prior assumptions
- **OpenGame is NOT the shipped "verify-loop" base prior notes assumed.** It's a **Qwen/Gemini-CLI fork (a whole agent runtime)** + a Phaser game-gen harness in `agent-test/`. The headline **OpenGame-Bench (headless + VLM verify) is README-only — not in the code** ("will be released soon"). Template-Skill/Debug-Skill are *offline research* pipelines, not wired into the main runner. No Playwright/Puppeteer dependency anywhere. Its client loop is tightly coupled to **Gemini** (swap to Claude = rewrite). Forkability 3–4/5.
- **OpenGame's strongest *shipped* assets are different from the hype:** the **5-genre Phaser module library with real game-feel code** (screen-shake, dash, combo-gating, hit-freeze via `timeScale`, economy gating), the **~1300-line `generate-gdd.ts`** (structured GDD = machine-readable spec), the genre **classifier**, and a closed-loop **template-evolution** pipeline (collect→classify→extract→abstract→merge).
- **The "per-project `index.json` of exact asset dims" grounding ideal is practiced by ~nobody.** Real repos ground with prose **spec files + asset manifests** (`.ogf/spec.md`, `asset-pack.json`, `PLAN/MEMORY/STRUCTURE/ASSETS.md`, `active.md`). Keep the index idea, but treat it as aspirational.
- **agent-game-forge *intentionally disallows* agent visual verification** (its conventions prompt blocks it) and **bans Phaser today** (scaffolds vanilla Canvas + legacy Godot; Phaser is roadmap). A web verify loop is net-new work, not a toggle.
- **The only MATURE runtime self-test loops are Godot** (god-code: live TCP bridge + visual regression; gamedevbench: marker-based runtime assertions). For **web**, only gameforge has a real (basic) Playwright screenshot pass.

### Most-used patterns = de-facto best practice (ranked by # of repos doing it)
1. **Templates + a `SKILL.md` skills library** — ~all 9. `SKILL.md` w/ frontmatter (`name/description/allowed-tools/model`) is the dominant skill-encoding format (CCGS, godogen, agent-game-forge, gameforge).
2. **Spec-driven decomposition** — ~8. A central game-spec doc (GDD / gameDNA / task_config) → decomposed **task plan/DAG with per-task verification criteria**.
3. **Persistent project-local state files as grounding** — ~7. `PLAN/STRUCTURE/MEMORY/ASSETS.md` (godogen), `active.md` (CCGS), `.ogf/spec.md` (agent-game-forge) — updated *as you go*, survive compaction.
4. **Multi-agent role split, consensus quartet = Designer/Planner · Coder · Artist · QA/Playtester** — ~6 (gameforge designer/artist/musician/developer/qa; gamestudio 12-team; CCGS 3-tier; god-code planner/worker/reviewer).
5. **Asset-gen as a callable tool/MCP server → files + a manifest** — ~6. Most-used image model = **Gemini** (gameforge `gemini-2.5-flash-image`, godogen, OpenGame). Manifest doubles as grounding.
6. **Verify loop = headless-run → screenshot → VLM/assert → bounded self-fix** — mature only in god-code + gamedevbench (Godot); gameforge is the only web one. Bounded cycles (god-code caps at 3).
7. **Juice baked into templates** (shake/i-frames/combo) rather than a dedicated game-feel pass — ~4. Only gamestudio-subagents has a *dedicated* game-feel agent.
8. **MCP as the tool/integration substrate** — ~6.

### Genuinely novel / rare (one repo each — candidate differentiators)
- **OpenGame:** game-gen as **archetype compiler** (classify physics → copy genre module → constrained GDD from the template's own API); closed-loop template evolution.
- **agent-game-forge:** **disk-as-contract** local-first workflow; unified **Codex+Claude event normalization** (stdout JSONL → one `AgentEvent` union); inline `<question-form>` that pauses the agent mid-run for human input; synthetic image-gen watcher.
- **gameforge:** **session-scoped per-role MCP servers** composed at runtime; artist/musician manifests become developer grounding.
- **CCGS:** **3-tier director/lead/specialist** w/ **director-gates** + review modes (full/lean/solo); story-level **TR-ID→ADR→control-manifest traceability**; crash-survivable file-backed state (`active.md`).
- **ForgeDNA:** **gameDNA schema** (1068-line JSON Schema) w/ **remix lineage/genealogy**; engine-agnostic adapter ABC; **11-phase parallel BuildPlan DAG** (50–100 tasks).
- **gamestudio-subagents:** **market-first** Go/No-Go gate before build; analytics/telemetry from day one; **engine-config abstraction** (role invariant; engine specifics in JSON).
- **gamedevbench:** hidden-test sandbox separation; **`VALIDATION_PASSED/FAILED` stdout-marker contract**; runtime GDScript mechanic assertions.
- **god-code:** **live TCP bridge** to a running Godot (port 9394) for real-time state assertions; scenario specs **auto-generated from scene introspection**; visual-regression baselines.
- **godogen:** **GDScript-vs-C# doctrine** (picks C# for LLM correctness); staged read-on-demand skill pipeline w/ resumability files.

---

## Repo-by-repo summaries

### OpenGame ⭐ (2.5k★, TS/Phaser) — forkability 3–4/5
**Thesis:** prompt → classify genre → scaffold Phaser from typed module templates → generate GDD + tilemap + assets via LLM tools → iterate with an (offline) debug-skill loop until build passes.
**Architecture:** `packages/cli` (Ink TUI; `nonInteractiveCli.ts`) · `packages/core` (Gemini agentic loop `client.ts`; tool registry in `config/config.ts`: `GameTypeClassifierTool`, `GenerateGDDTool`, `GenerateAssetsTool`, `GenerateTilemapTool`, `CopyTemplateTool`(commented out)) · `packages/sdk-typescript` (programmatic SDK over the CLI, stream-json) · `agent-test/templates/modules/{platformer,top_down,tower_defense,ui_heavy,grid_logic/puzzle}` (real Phaser genre code) · `agent-test/template-skill` (offline evolution) · `agent-test/debug-skill` (offline runner→validator→debug-loop→repairer; `seed-protocol/protocol.json`) · `agent-test/prompts/custom.md` (best end-to-end gen protocol).
**Layers:** L1 IMPL (genre modules + evolution) · L2 PARTIAL (GDD + copied docs; no index/PLAN/RAG) · L3 PARTIAL (GDD spec, single-pass, no milestone gating) · L4 PARTIAL (subagent infra, only general-purpose) · L5 PARTIAL (headless Phaser test scaffold + offline debug; **no Playwright/VLM — bench unshipped**) · L6 IMPL (shake/dash/combo/hit-freeze in templates).
**Lift:** `generate-gdd.ts` (spec compiler), `game-type-classifier.ts`, `templates/modules/*`, `generate-assets.ts`+`generate-tilemap.ts`, `debug-skill/seed-protocol/protocol.json`, `prompts/custom.md`.
**Skip:** `CopyTemplateTool` (commented out; uses `cp -r`), mechanical search/replace repairer, Gemini coupling, unshipped bench claims, Qwen/Gemini naming leaks.

### agent-game-forge ⭐ (163★, TS) — forkability 4/5
**Thesis:** local-first React/Express IDE that treats **disk as the contract** between a visual editor and BYO Codex/Claude CLI agents.
**Architecture:** `apps/web` (Vite/React IDE: files/scene/play/chat; SSE) ↔ HTTP `/api` + SSE ↔ `apps/daemon` (Express + SQLite `.ogf/app.sqlite`; `server.ts`, `runs.ts`, `agents.ts`, `codex.ts`, `claude-code.ts`, `godot.ts`, `templates/bootstrap.ts`) · `packages/contracts` (`api/events/forms/scene/ogf-schema.ts`). Disk artifacts: `data/*.json`, `.ogf/spec.md`, `.ogf/scene-context.json`.
**Agent integration (key):** **subprocess, no SDK.** `AgentAdapter.spawn` → Codex (`codex exec --json --skip-git-repo-check --full-auto -`, prompt via stdin) or Claude Code (`claude -p --output-format stream-json --permission-mode bypassPermissions`, prompt via stdin); both stdout JSONL → normalized `AgentEvent`; streamed to web over SSE (`POST /api/runs` → `/api/runs/:id/events`).
**Layers:** L1 IMPL (bootstraps `.agents/skills`, `.ogf/conventions`, recipes, foundation seeds) · L2 PARTIAL (injects `.ogf/spec.md` + scene-context + derived entities; no RAG) · L3 IMPL/PARTIAL (`<question-form>` + `.ogf/spec.md` phase checklists drive a progress UI; no enforcer) · L4 ABSENT (one agent per conversation; Claude subagents disabled) · L5 PARTIAL (Play tab iframe/Godot; **conventions explicitly disallow agent visual verification**) · L6 PARTIAL (juice in seeds, no evaluator).
**Lift:** the CLI-adapter pattern (`agents/codex/claude-code.ts`), the disk-first contract + `packages/contracts`, `templates/bootstrap.ts` (project/skill vendoring), `gen-image.ts` (agent-agnostic image bridge), the `<question-form>` human-in-loop protocol.
**Skip:** the IDE itself (out of v1 scope), Phaser ban (roadmap-only), trusted-local security (`--full-auto`/`bypassPermissions`), known fresh-vs-resume spec-approval conflict.

### gameforge (1★, TS) — lift-ability 4/5 as reference, 2/5 to ship
**Thesis:** multi-agent Claude-Agent-SDK + MCP pipeline → Phaser3/Three.js, with Gemini (Nano-Banana images) + Lyria (music). A **reference**, not a base.
**Claude Agent SDK wiring (key):** `apps/orchestrator/src/agents/teamOrchestrator.ts` → `runAgent()` calls `query({prompt, options})` per role (designer/artist/musician/developer/qa) with `systemPrompt`, role `model`, `cwd`, `settingSources:['project']`, `allowedTools`, `mcpServers`. **In-process MCP via `createSdkMcpServer`+`tool`:** `gameToolServer.ts`, `assetToolServer.ts`, `musicToolServer.ts`, `playwrightToolServer.ts`, registered per role. Skills copied into session `.claude/skills` by `projectScaffolder.copySkills`.
**Asset pipeline:** Designer emits `artDirection`/`musicDirection` → Artist runs `AssetGenerator.generateAsset` (GoogleGenAI `gemini-2.5-flash-image` → PNG + `assetManifest`) → Musician runs `MusicGenerator` (Lyria `client.live.music.connect` → WAV) → Developer reads manifests as grounding.
**Layers:** L1 IMPL · L2 PARTIAL · L3 PARTIAL · L4 IMPL (sequential roles) · L5 PARTIAL (**Playwright QA + screenshots + one dev retry — the realest web verify**) · L6 PARTIAL.
**Lift:** the per-role MCP-server registration pattern, `assetGenerator.ts`/`musicGenerator.ts`, `playwrightToolServer.ts`, `packages/{shared-types,game-templates}`.
**Skip (1-star risk):** `bypassPermissions`+`allowDangerouslySkipPermissions` globally (confinement is prompt-only), no tests/CI, experimental Lyria API.

### gamedevbench (70★, Godot/Python) — spec+verify methodology
**Thesis:** Godot benchmark — agents mutate starter projects, hidden GDScript runtime tests score whether the requested mechanic works.
**Spec schema (`task_config.json`):** `task_id`, `name`, `instruction`, `metadata{tutorial_source, video_id, github_repo, transcript_excerpt, expected_nodes, key_properties}`; agent only sees a stripped config with `instruction`.
**QA format (`task_validation.md`):** `# Key Checklist` / `# Feature Checklist` / `# Notes` / `# Examples`.
**Runtime assertion (`scripts/test.gd`):** extends `Node`, runs in `_ready()`, loads scene, calls gameplay methods, asserts (e.g. `if emitter.amount != 32: fail(...)`), prints **`VALIDATION_PASSED`/`VALIDATION_FAILED`**, quits. Some drive `_physics_process()`.
**Runner (`gamedevbench/src/`):** `benchmark_runner.py` loads config, builds a sandbox that **excludes tests/config/md** (hidden tests), runs solver (`solver_factory.py` registers claude-code/codex/gemini-cli/mini-swe), restores `test.gd`+`test.tscn`, runs Godot headless, `validation.py` parses markers, aggregates CSV.
**Transfer to web:** replace `test.tscn` with a Playwright page that boots the Phaser scene headlessly, fires synthetic input, asserts on the Phaser game object exposed on `window`; **keep the same `VALIDATION_PASSED/FAILED` stdout-marker contract** so scoring code is unchanged. 1 Playwright spec ↔ 1 `test.gd`.

### Claude-Code-Game-Studios ⭐ (21k★, CC skills) — integration 5/5 (CC-native)
**Thesis:** production-grade Claude-Code-native multi-agent studio: **49 agents + 73 skills**, gates, quality rules, full lifecycle.
**Layout:** `.claude/agents/{tier-1-directors,tier-2-leads,tier-3-specialists}/*.md` · `.claude/skills/<name>/SKILL.md` · `.claude/docs/{coordination-rules,director-gates,technical-preferences,context-management}.md` · `.claude/hooks/*` · `production/{session-state/active.md,epics,sprints,qa,milestones}` · `design/gdd/`.
**Agents (49):** Tier-1 directors (creative/technical/producer, Opus) · Tier-2 leads (designer/lead-programmer/art/audio/narrative/qa/release/localization, Sonnet) · Tier-3 specialists (38: programming×7, design×5, engine specialists×9 [godot/unity/unreal + sub], qa/a11y/devops, etc.).
**Skills (73):** SKILL.md frontmatter = `name/description/argument-hint/user-invocable/allowed-tools/model/agent/skills/context`. Categories: onboarding, design, architecture, epics/stories, sprint, QA, code/balance, release, **team-orchestration (`/team-*`)**, assets, ux.
**Coordination:** producer orchestrates; `/team-*` skills spawn subagents in parallel + collect verdicts; **director-gates** (CD/TD/PR/QL) with **review modes full/lean/solo**; `active.md` file-backed state read at SessionStart.
**Lift:** the SKILL.md + agent-md formats, `coordination-rules.md`, `director-gates.md` (gates + modes), story format (TR-ID→ADR→control-manifest), `/team-*` orchestration pattern, `context-management.md` (file-backed crash-survivable state).
**Layers:** L1 IMPL · L2 IMPL (memory + technical-preferences + active.md) · L3 IMPL (epics→stories w/ acceptance criteria) · L4 IMPL (49 agents, escalation) · L5 PARTIAL (commit/asset *validation hooks*, not gameplay playtest) · L6 PARTIAL (balance-check, no playtest instrumentation).

### ForgeDNA (0★, Py/Godot) — schema lift-ability 4/5
**Thesis:** text-first game creation where a JSON **gameDNA** schema drives spec-driven multi-agent code+asset gen; engine-agnostic (Godot reference adapter).
**gameDNA schema (`schema/game_dna.schema.json`, 1068 lines, v1.0.0):** top-level `meta` (incl. **lineage**: dna_id/parent_id/generation/ancestors) · `mechanics` (movement/combat/crafting/progression/economy) · `world` (scale/structure/environments[]/dungeons[]/procgen) · `entities` (player/npcs/enemies-tiers/items-rarity) · `assets` (description-only for AI gen) · `logic` (quests/world-events/skill-trees/recipes) · `ui` (style/palette/HUD/menus/accessibility).
**Generation flow:** `dna_parser.py` → `task_decomposer.py` (**11-phase BuildPlan**, 50–100 parallel tasks) → `orchestrator.py` (generate_agent_prompt, track %) → `agent_specs.py` (17 agent types: ASSET_3D/TEXTURE/ANIMATION/AUDIO_*/VFX/CODE_*/ASSEMBLY/TEST). MCP server `mcp_server.py` (10 tools: parse_game_dna→generate_build_plan→get_next_tasks→start/complete/fail_task→get_build_status). Engine adapter ABC `engine_adapters/base.py` + `godot.py`.
**Layers:** L1 PARTIAL (agent types defined; many stubbed) · L2 IMPL (schema grounds all tasks) · L3 IMPL (11-phase DAG) · L4 PARTIAL (MCP task-claim tools; no agent-to-agent bus) · L5 PARTIAL (TEST agent defined, not implemented) · L6 ABSENT.
**Lift:** the **gameDNA JSON Schema** (pure, engine-agnostic, port to TS w/ `ajv`), the MCP tool contract, the EngineAdapter ABC, the decompose() DAG logic.
**Skip (0★):** asset/audio agents stubbed, Godot adapter incomplete, TEST unimplemented, Docker/hub missing.

### gamestudio-subagents (210★, Py, multi-engine) — role split 5/5, runtime 2/5
**Thesis:** hierarchical **12-agent** team (market→design→eng→art→QA) that adapts to Godot/Unity/Unreal via engine configs.
**Roster:** Master Orchestrator · Producer · Market Analyst · Data Scientist · Sr/Mid Game Designer · Mechanics Developer · **Game Feel Developer** · Sr Game Artist · Technical Artist · UI/UX · QA.
**Pipeline:** Market (Go/No-Go) → Concept → Systems → Visual → Prototype/Production → Integration; User→Master→Producer→Specialists→back.
**Engine-config abstraction (`engine_configs/*.json`):** project structure + best practices + `agent_specializations` (per-engine tools, e.g. Godot mechanics_developer → GDScript/Signals/Scenes; game_feel_developer → Tweens/GPUParticles/Shaders) + platform targets. Role definitions invariant; engine specifics in JSON, read from `project-config.json`.
**Layers:** L1 IMPL (8 templates) · L2 PARTIAL (project-config) · L3 IMPL (milestone objects) · L4 FULLY IMPL (12 roles, comms matrix, handoff templates) · L5 ABSENT (manual QA sign-off) · L6 IMPL (**dedicated Game Feel Developer**: shake/bounce/impact/audio-pooling + polish checklist).
**Lift:** the role split, the **engine-config abstraction**, handoff template, project-config-as-SoT.
**Skip:** no runtime interaction model (how agents call each other unspecified), no spec versioning, no agent memory, no deliverable linting.

### god-code (≈1★, Py/Godot) + godogen (0★, CC/Codex skills) — Godot escape hatch 3.5/5
**god-code thesis:** Python CLI agent (36-tool MCP, live TCP bridge) for iterative Godot dev with quality gates, vision feedback, scenario playtests.
**godogen thesis:** staged skill pipeline (visual-target→decompose→scaffold→asset-gen→task-exec→capture→VQA) generating Godot 4 **C#** projects from a description.
**Scene edit (god-code):** `godot/scene_parser.py` (.tscn → `TscnScene`), `scene_writer.py` (`add_node`/`set_node_property`/`add_connection` via regex+`serialize_variant`), all writes auto-validate/auto-fix.
**Validation+playtest (god-code):** headless `godot --headless` error loop (`runtime/error_loop.py`), `quality_gate.py` (11 checks, cached `ValidationSuite`), **`playtest_harness.py`** (JSON `ScenarioSpec`: required_scene/nodes/events/inputs/forbid-runtime-errors; auto-discovers `scenes/playtests/*.tscn`; extracts `PLAYTEST_SUMMARY` from stdout; live bridge "live_for_pass" evidence), `screenshot.py` + `visual_regression.py` (PIL pixel diff baselines).
**MCP surface (god-code, `mcp_server.py`):** 36 tools — analysis (validate_project/tscn, lint_script, plan/validate_ui_layout…), write (write_scene/add_scene_node/set_scene_property/write_script), execution (run_gut_tests, screenshot_scene, run_playtest, get_runtime_snapshot, press_action, advance_ticks, compare_baseline…), sprite (generate_sprite, slice_sprite_sheet). Path-containment security.
**godogen skill (`claude/skills/godogen/SKILL.md` + 12 sub-files):** read-on-demand stages; resumability files `PLAN.md`/`STRUCTURE.md`/`MEMORY.md`/`ASSETS.md`; separate `godot-api` lookup skill. **`gdscript-vs-csharp.md` doctrine:** picks **C#** (compiler catches Variant-inference errors → more correct LLM first-try; one sharp edge = `SetScript()` "temp-parent" pattern).
**Layers (both):** L1–L4 mostly IMPL (god-code adds planner/worker/reviewer dispatcher; godogen defers multi-agent to the host) · **L5 god-code richest** (scenario specs + live bridge + visual regression) · L6 both thin (god-code `polish_rubric.py` stub + 3-cycle vision loop; godogen VQA).
**Lift:** god-code MCP + `playtest_harness.py` + `visual_regression.py` + scene parser/writer + quality-gate; godogen's staged-pipeline-with-resumability-files pattern + C# doctrine.
