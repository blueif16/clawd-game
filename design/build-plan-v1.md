# Build plan — v1 auto game-generation system

_Draft 2026-06-08. The actionable plan to build **v1**: an automatic system that turns a prompt into a **full, playable, verified web game (Phaser 2D)**. Companion to `pipeline-design-v1.md` (the design/why) and `research/reference-repo-deep-reads-2026-06-08.md` (the findings). Every build phase opens with **Study (repo positions to revisit)** — concrete paths under `reference-repos/` — because we keep mining the proven repos for templates, skills, and layouts as we build._

---

## 0. The v1 system, end to end
A pipeline-shaped Claude Code **`Workflow`** (Pi-portable) that runs, over one prompt, coordinating entirely through on-disk files:

```
W0 Classify → W1 Spec → W2 Scaffold → ┌ W3 Assets ┐→ W4 Implement(M1..Mn) → W5 Verify+Fix(M1..Mn) → DONE
  Designer     Designer    Coder       └───────────┘    Coder                   Playtester
                                       Artist (∥)        n = 2..5 (per-game, §Milestone policy)
```
**v1 is DONE when:** for a sample prompt, the system outputs a Phaser project that **builds**, **boots headless**, and whose every milestone emits **`VALIDATION_PASSED`** — with zero human edits to the game code.

## Build principles
1. **Study before building.** Each phase first revisits the listed repo positions (templates / skills / layouts), then we build.
2. **Riskiest mechanics first.** Prove the spine, the template+test-hook, and the verify node *before* the generative middle.
3. **Filesystem is the contract.** Every node reads/writes the project dir + state files; nothing lives only in model context.
4. **One source of truth = the Workflow `.js`.** Prove on Claude; then `transform-workflow-to-pi`. Never hand-port prompts.
5. **Keep the reference index current** (§Reference index) so each component's repo position is tracked as we go.

---

## Build phases (ordered)

### Phase 0 — Workflow spine (stub conveyor)
**Goal:** a runnable `Workflow` whose W0→W5 nodes are stubs that pass a dummy artifact through and write the state files. Proves the conveyor + filesystem contract before any intelligence.
**Study — layouts:**
- Workflow host + Pi: `~/.claude/skills/transform-workflow-to-pi/templates/pi-runner/` (`extract.mjs`, `run.mjs`, `coding-plan.ts`, `.env.example`); reference impl `animation-test/pi-runner/`.
- State-file/disk-as-contract layout: `agent-game-forge/docs/architecture.md`, `agent-game-forge/packages/contracts/src/ogf-schema.ts`; CCGS `Claude-Code-Game-Studios/.claude/docs/directory-structure.md`, `context-management.md`.
**Build:** `.claude/workflows/game-omni.js` (`meta` + phases W0–W5, stub `agent()` calls writing `spec/`, `STRUCTURE.md`, `index.json`, `ASSETS.md`, `MEMORY.md`, `verify/report.json`). Prove on Claude.
**Done:** dummy run produces all state files in order; `node pi-runner/extract.mjs` shows the expected node/lane shape.

### Phase 1 — Genre template #1 (platformer) + `window.__GAME__` test hook
**Goal:** one hand-built Phaser/Vite/TS platformer starter that builds, plays, and exposes its live game object on `window.__GAME__` (the thing everything composes over and the thing verify asserts against).
**Study — templates (preferred structure):**
- `OpenGame/agent-test/templates/modules/platformer/src/` → layout = `behaviors/ characters/ scenes/ gameConfig.json utils.ts` (the preferred genre-module shape; also `top_down`, `grid_logic`, `tower_defense`, `ui_heavy`).
- `OpenGame/agent-test/templates/core/src/test/helpers/phaser.ts` (headless Phaser test scaffold — basis of the test hook).
- `gameforge/packages/game-templates/src/{lib,templates}` (Phaser/Three Vite starter wiring).
- `agent-game-forge/apps/daemon/src/templates/foundation/{side-scroll,top-down-rpg}/seed/` (foundation-seed idea) + `templates/conventions/{common.md,runtime-patterns.md,genres/}` (per-genre conventions).
**Study — game-feel (juice ships inside the template):** `OpenGame/agent-test/templates/modules/platformer/src/behaviors/` (shake/dash/i-frames), `ui_heavy/src/systems/ComboManager.ts`.
**Build:** `packages/templates/platformer/` web starter (Vite+TS+Phaser) that builds, runs, and sets `window.__GAME__`; a `capabilities.md` describing its API (what the spec stage is allowed to call). Juice modules wired but inert.
**Done:** `npm run build` + manual boot OK; `window.__GAME__` exposes player/score/entities.

### Phase 2 — Verify node (the unlock) — built early to de-risk
**Goal:** prove the web verify loop on the Phase-1 template *by hand-written assertions*, before any generation depends on it. Headless run → assert → marker → screenshot → bounded fix.
**Study — verify (port Godot → web):**
- `gamedevbench/sample-tasks/task_0001/start/{task_config.json,task_validation.md,scripts/test.gd}` (spec + QA + runtime-assertion shape), `gamedevbench/src/benchmark_runner.py` + `src/utils/validation.py` (the **`VALIDATION_PASSED/FAILED`** marker parser).
- `gameforge/apps/orchestrator/src/tools/playwrightToolServer.ts` (Playwright boot + screenshot QA — the real web example).
- `god-code/godot_agent/runtime/{playtest_harness.py,visual_regression.py,quality_gate.py}` (scenario specs, bounded fix, layout/visual validation).
**Build:** `packages/verify/` — a Playwright runner that boots a Phaser build headless, runs per-milestone assertion specs against `window.__GAME__`, prints `VALIDATION_PASSED/FAILED` + a screenshot, parses the marker (validation.py analogue), and a bounded **≤3-cycle** fix wrapper.
**Done:** hand-written assertions for the platformer pass; a deliberately broken build yields `VALIDATION_FAILED` + screenshot and triggers (then exhausts) the fix loop.

### Phase 3 — Spec stage (W0 Classify + W1 Spec) + "construct-a-game" questions
**Goal:** prompt → `spec/classification.json` + `spec/gdd.json` (slim gameDNA + milestone list 2–5 + per-milestone assertions) + `spec/PLAN.md`.
**Study — spec + questions:**
- `OpenGame/packages/core/src/tools/game-type-classifier.ts` (physics-first archetype routing), `generate-gdd.ts` (constrained GDD compiler), `OpenGame/agent-test/prompts/custom.md` (end-to-end gen protocol).
- `ForgeDNA/schema/game_dna.schema.json` (field menu for the slim spec).
- `gamedevbench/sample-tasks/*/start/task_config.json` + `task_validation.md` (how to author per-milestone assertions/QA).
- `agent-game-forge/packages/contracts/src/forms.ts` (`<question-form>` human-in-loop pattern), CCGS design skills `Claude-Code-Game-Studios/.claude/skills/{brainstorm,quick-design,map-systems}/SKILL.md`.
**The construct-a-game question set** (Designer asks/infers; maps 1:1 to slim gameDNA fields): genre · core fantasy/goal · player verbs+controls · entities (player/obstacles/collectibles) · win condition · lose condition · art style (or placeholder) · **explicit scope-cut** · proposed **milestones + assertions**. (See `pipeline-design-v1.md` §3b for milestone invariants.)
**Build:** `packages/skills/{classify-game,write-gdd}` + `packages/schema/gdd.schema.json` (slim subset of gameDNA) + the question set as the Designer prompt.
**Done:** three different prompts each yield a schema-valid `gdd.json` with a sensible per-game milestone count and runnable assertions.

### Phase 4 — Scaffold stage (W2)
**Goal:** `gdd.json` → a running **empty** project copied from the genre template + `STRUCTURE.md` + `index.json` (exact asset slots/dims).
**Study — scaffold + layout maintenance:**
- `agent-game-forge/apps/daemon/src/templates/bootstrap.ts` (project + vendored skills/conventions bootstrap).
- `godogen/claude/skills/godogen/{scaffold.md,scene-generation.md}` (scaffold + `STRUCTURE.md` kept current when scaffolding changes).
- `gamestudio-subagents/engine_configs/godot_config.json` (project-structure-as-config idea; we author a web/Phaser equivalent).
**Build:** `packages/skills/scaffold` (copy template, set up `index.json` from the asset-list, write `STRUCTURE.md`); a build-health gate (`npm run build`).
**Done:** scaffold builds green; `index.json` lists every asset slot with dims; `STRUCTURE.md` matches the tree.

### Phase 5 — Implement stage (W4)
**Goal:** implement the game milestone-by-milestone, wiring the template's behavior/juice modules, recording quirks in `MEMORY.md`; each milestone builds before the next.
**Study — codegen + debug protocol:**
- `OpenGame/agent-test/templates/modules/<genre>/src/behaviors/` + `systems/` (the real game-feel code to wire), `OpenGame/agent-test/prompts/custom.md`.
- `OpenGame/agent-test/debug-skill/src/{runner.ts,validator.ts,debug-loop.ts,repairer.ts}` + `seed-protocol/protocol.json` (known-failure → fix patterns).
- CCGS story-by-story discipline: `Claude-Code-Game-Studios/.claude/skills/{dev-story,story-done}/SKILL.md`.
**Build:** `packages/skills/implement-milestone` (reads `gdd.json` milestone + `STRUCTURE.md` + `ASSETS.md` + template behaviors; emits code; updates `MEMORY.md`); pipeline so Mk+1 implements while Mk verifies.
**Done:** for the platformer prompt, all milestones implement + build; verify (Phase 2) passes M1 unaided.

### Phase 6 — Assets stage (W3)
**Goal:** fill `public/assets/` + `ASSETS.md` from the asset-list. Placeholder-first; Gemini as a toggle.
**Study — asset-gen + manifest:**
- `gameforge/apps/orchestrator/src/assets/assetGenerator.ts` (Gemini `gemini-2.5-flash-image` → PNG + manifest), `agents/skills/phaser-development/ASSETS.md`.
- `OpenGame/packages/core/src/tools/{generate-assets.ts,generate-tilemap.ts}`.
- `agent-game-forge/apps/daemon/src/gen-image.ts` (agent-agnostic image bridge + manifest watcher).
**Build:** `packages/skills/assets` with two modes — `placeholder` (programmatic rects/pixel-snap) and `gemini` — both writing `ASSETS.md` against `index.json` slots.
**Done:** placeholder mode fills every slot and the game renders; gemini mode is a flag-flip producing real sprites + manifest.

### Phase 7 — Skills + roles encoding, then full end-to-end pass
**Goal:** the node prompts become first-class `SKILL.md` skills + role agents; run the whole pipeline on one prompt to a verified game.
**Study — skills/agents format + layout doctrine:**
- CCGS: `Claude-Code-Game-Studios/.claude/skills/*/SKILL.md` (format), `.claude/docs/{skills-reference.md,agent-roster.md,coordination-rules.md,director-gates.md,technical-preferences.md,context-management.md,workflow-catalog.yaml}`, `.claude/hooks/{validate-commit.sh,validate-assets.sh,pre-compact.sh,post-compact.sh}` (how skills/hooks **maintain layout + state**).
- `godogen/claude/skills/godogen/SKILL.md` (staged read-on-demand skills), `gamestudio-subagents/agents/*.md` + `engine_configs/` (role split + engine-config abstraction), `gameforge/apps/orchestrator/src/agents/teamOrchestrator.ts`, `god-code/godot_agent/agents/dispatcher.py` (planner/worker/reviewer).
**Build:** seed skill set — `classify-game · write-gdd · scaffold · implement-milestone · verify · debug-fix · assets · phaser-engine` (SKILL.md w/ CCGS-style frontmatter); seed roles — **Designer · Coder · Artist · Playtester** (start lean: Coder+Playtester). A single `technical-preferences.md`-equivalent + a layout-validation gate.
**Done:** one command runs prompt → verified platformer game, no human edits.

### Phase 8 — Pi port
**Goal:** run the identical proven workflow cheaply on Pi.
**Study:** `~/.claude/skills/transform-workflow-to-pi/` (the six steps + the dynamic-list note).
**Build:** drop in `pi-runner/` verbatim; configure `.env` (`PI_RUNNER_WORKFLOW`, `PI_CP_MODEL`, …); extract → dry-run → live `--debug`.
**Done:** the same prompt produces a verified game via Pi; `out/<id>/run-status.json` = ok.

---

## Layouts & conventions we adopt (with refs)
- **Project layout (preferred):** genre-module structure `behaviors/ characters/ systems/ scenes/ gameConfig.json` on Vite+TS+Phaser, exposing `window.__GAME__`. → `OpenGame/agent-test/templates/modules/*/src/`; conventions style `agent-game-forge/apps/daemon/src/templates/conventions/{common.md,runtime-patterns.md}`.
- **State-file layout (grounding):** `spec/{classification,gdd}.json` · `spec/PLAN.md` · `STRUCTURE.md` · `index.json` · `ASSETS.md` · `MEMORY.md` · `verify/report.json`. → godogen `scaffold.md`/resumability-files; CCGS `.claude/docs/{directory-structure.md,context-management.md}`; agent-game-forge `.ogf/` disk-as-contract.
- **How skills maintain the layout:** a **layout-validation gate** + **keep `STRUCTURE.md` current on scaffold change** + compaction-safe state. → CCGS hooks `validate-commit.sh`/`validate-assets.sh` + `pre/post-compact.sh`; god-code `runtime/quality_gate.py` (scene/UI-layout validation); godogen "update STRUCTURE.md".
- **Conventions declared once:** a `technical-preferences.md`-equivalent (engine pin, naming, perf budget). → CCGS `.claude/docs/{technical-preferences.md,coding-standards.md}`.

## Templates: which, and preferred style
- **Style:** genre-module templates with juice built-in + a `capabilities.md` API the spec is constrained to. → `OpenGame/agent-test/templates/modules/`.
- **Order:** **platformer first** (richest juice), then `top_down`, `grid_logic`, `tower_defense`, `ui_heavy` (mirror OpenGame's five). 3D (R3F) deferred. → same path; `gameforge/packages/game-templates` for Three later.

## Skills: the seed set (grow later, start minimal)
`classify-game` (`OpenGame/.../game-type-classifier.ts`) · `write-gdd` (`OpenGame/.../generate-gdd.ts` + `ForgeDNA/schema/game_dna.schema.json`) · `scaffold` (`agent-game-forge/.../templates/bootstrap.ts`, godogen `scaffold.md`) · `implement-milestone` (`OpenGame/.../templates/modules/*/behaviors`, `prompts/custom.md`) · `verify` (`gamedevbench` `test.gd`+`validation.py`, `gameforge` `playwrightToolServer.ts`, `god-code` `playtest_harness.py`) · `debug-fix` (`OpenGame/agent-test/debug-skill/*` + `seed-protocol/protocol.json`) · `assets` (`gameforge` `assetGenerator.ts`, `OpenGame` `generate-assets.ts`) · `phaser-engine` (`gameforge/.../agents/skills/phaser-development/`). Format → CCGS `.claude/skills/*/SKILL.md` + `skills-reference.md`.

---

## Reference index (component → repo : path)
| Component | Primary repo : path | Secondary |
|---|---|---|
| Workflow host / Pi | `~/.claude/skills/transform-workflow-to-pi/templates/pi-runner/` | animation-test `pi-runner/` |
| Genre templates | `OpenGame/agent-test/templates/modules/` | `gameforge/packages/game-templates/`, `agent-game-forge/apps/daemon/src/templates/foundation/` |
| Template test scaffold | `OpenGame/agent-test/templates/core/src/test/helpers/phaser.ts` | — |
| Game-feel (juice) | `OpenGame/agent-test/templates/modules/*/src/behaviors/` + `ui_heavy/.../ComboManager.ts` | gamestudio `agents/` (game-feel role) |
| Classifier | `OpenGame/packages/core/src/tools/game-type-classifier.ts` | — |
| GDD / spec | `OpenGame/packages/core/src/tools/generate-gdd.ts` | `ForgeDNA/schema/game_dna.schema.json` |
| Construct-a-game questions | `agent-game-forge/packages/contracts/src/forms.ts` | `OpenGame/agent-test/prompts/custom.md`, CCGS `.claude/skills/{brainstorm,quick-design,map-systems}` |
| Verify (marker contract) | `gamedevbench/sample-tasks/*/start/scripts/test.gd` + `src/utils/validation.py` | — |
| Verify (web Playwright) | `gameforge/apps/orchestrator/src/tools/playwrightToolServer.ts` | `god-code/godot_agent/runtime/playtest_harness.py` |
| Bounded self-fix | `god-code/godot_agent/runtime/playtest_harness.py` | `OpenGame/agent-test/debug-skill/src/debug-loop.ts` |
| Debug protocol | `OpenGame/agent-test/debug-skill/{src,seed-protocol/protocol.json}` | — |
| Scaffold / STRUCTURE | `agent-game-forge/apps/daemon/src/templates/bootstrap.ts` | `godogen/claude/skills/godogen/scaffold.md` |
| Asset-gen + manifest | `gameforge/apps/orchestrator/src/assets/assetGenerator.ts` | `OpenGame/.../generate-assets.ts`, `agent-game-forge/.../gen-image.ts` |
| Skill / agent format | `Claude-Code-Game-Studios/.claude/skills/*/SKILL.md` | `godogen/claude/skills/godogen/SKILL.md` |
| Role split | `Claude-Code-Game-Studios/.claude/{agents,docs/agent-roster.md,docs/coordination-rules.md}` | `gamestudio-subagents/agents/`, `gameforge/.../teamOrchestrator.ts` |
| Layout maintenance | `Claude-Code-Game-Studios/.claude/hooks/` + `docs/{directory-structure,context-management}.md` | `god-code/godot_agent/runtime/quality_gate.py` |
| Engine-config abstraction | `gamestudio-subagents/engine_configs/` | — |
| Godot escape hatch | `god-code/godot_agent/mcp_server.py` | `godogen/`, `ForgeDNA/harness/.../engine_adapters/godot.py` |

## Build sequencing & v1 done-criteria
**Critical path:** P0 spine → P1 template+hook → **P2 verify (de-risk)** → P3 spec → P4 scaffold → P5 implement → P6 assets → P7 end-to-end → P8 Pi. (P6 assets can lag — placeholder unblocks P5/P7.)
**v1 ships when:** prompt → (one genre) → schema-valid `gdd.json` → scaffold builds → milestones implement → **all milestones `VALIDATION_PASSED`** → playable game in the project dir, **no human edits**, and the same run reproduces on Pi.
