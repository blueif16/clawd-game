# game-omni

An AI **game-generation engine**: one text prompt → a **verified, playable Phaser 2D web game** in one pass.

It is a **workflow that orchestrates a skill system** — six nodes, each loading one evidence-grounded skill,
coordinating only through on-disk files. The single source of truth is `.claude/workflows/game-omni.js`, and it
runs identically on Claude (the `game-omni` Workflow) or cheaply on **pi** (`pi-runner/`).

```
W0 Classify → W1 Spec → W2 Scaffold → W3 Assets → (per milestone: W4 Implement → W5 Verify+Fix)
prompt ─────► spec ───► gdd+milestones ─► empty game ─► art ─► code ─► VALIDATION_PASSED
```
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

## Layout
```
.claude/workflows/game-omni.js   the orchestrator (single source of truth)
packages/skills/<node>/          the six node skills (+ contracts: scaffold/template-contract.md, verify/*)
packages/verify/                 the W5 headless-assertion harness (Playwright)
templates/core + modules/        the genre templates W2 copies (platformer built; 4 more via docs/handoff-*)
research/skills/                  per-node research records (the evidence behind every skill)
design/                          the pipeline design + build plan (the why)
.agents/skill-system-map.md      Hermes map: full wiring + responsibilities + diagnostics log
CLAUDE.md · status.md            project guide · current state
```

## Improve it (Hermes)
This system is stewarded with the `hermes-skill-system` skill: improve a **wave** by editing its SKILL; improve the
**chain** by editing `game-omni.js`. Every edit must generalize across all future runs; the human is the eye for the
playable result. See `CLAUDE.md` ("Skill-system stewardship") and `.agents/skill-system-map.md`.

**Status:** skill system + orchestrator + platformer template + verify harness are built and proven. See `status.md`.
