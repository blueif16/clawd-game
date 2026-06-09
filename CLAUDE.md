# game-omni — project guide

**What this is:** an AI **game-generation engine** — one prompt → a verified, playable Phaser 2D web game in
one pass. It is a **workflow that orchestrates a skill system**: six nodes, each loading one evidence-grounded
skill, coordinating ONLY through on-disk files (the filesystem is the contract). The single source of truth is
`.claude/workflows/game-omni.js`; it is **Pi-portable** (runs cheaply on pi via `pi-runner/`).

## The pipeline (what each step does)
`W0 → W1 → W2 → W3 → (per milestone: W4 → W5)` — see `.agents/skill-system-map.md` for the full wiring.

| Node | Skill | Does |
|---|---|---|
| **W0 Classify** | `packages/skills/classify-game/` | Route the prompt to a physics-first archetype + one-line core loop + explicit **scope-cut**. → `spec/classification.json` |
| **W1 Spec** | `packages/skills/write-gdd/` | Slim GDD + **2–5 playable milestones**, each with executable runtime assertions over `window.__GAME__`. → `spec/gdd.json`, `spec/PLAN.md` |
| **W2 Scaffold** | `packages/skills/scaffold/` | Copy `templates/core/` + overlay the archetype module → empty building project + `index.json` + `STRUCTURE.md`; expose `window.__GAME__`. |
| **W3 Assets** | `packages/skills/assets/` | Fill `public/assets/` + `ASSETS.md` from `index.json` (placeholder-first; gemini toggle). |
| **W4 Implement** | `packages/skills/implement-milestone/` | Implement each milestone, wiring template juice; populate `window.__GAME__` for real; build green. → `src/**`, `MEMORY.md` |
| **W5 Verify+Fix** | `packages/skills/verify/` | Run `packages/verify/` headless → assert vs `window.__GAME__` → `VALIDATION_PASSED/FAILED`; bounded ≤3 self-fix. → `verify/report.json` |

## How to run
- **On Claude:** invoke the `game-omni` Workflow with `args.prompt` (+ optional `args.projectDir`, default `out/game`).
- **On Pi (cheap):** `node pi-runner/run.mjs --run <id> --arg prompt="…" --arg projectDir=out/game --debug`
  (background). Provider `cp` resolves from pi's native `~/.pi/agent/models.json`; status → `out/<id>/run-status.json`.
- **Sanity-check the DAG (free):** `node pi-runner/extract.mjs` → 10 stages.

## Skill-system stewardship (Hermes — this is live)
We continuously evolve this skill system at dev speed. Treat any flaw, recurring finding, or user feedback on a
generated game as a trigger: run the **`hermes-skill-system`** skill to capture → route → edit → verify → (human
approves) → commit a durable, **generalizing** fix. Map = `.agents/skill-system-map.md` (keep it current — a
stale map is the only real failure mode; record product-quality edits in its diagnostics log).
- **Improve a wave by editing its SKILL; improve the chain (ordering, hand-offs, wiring) by editing
  `game-omni.js`.** This is the one global precedence rule.
- **One canonical home, smallest durable edit.** Patch a section > add a `references/` file > new skill.
- **Generalize or don't ship.** Every edit must hold for ALL future runs — never hard-code one game/case.
- **Anti-reward-hack is absolute.** Assert OBSERVABLE state only; the oracle (assertions / `spec/gdd.json` /
  the `window.__GAME__` hook / the verify harness) is immutable — a fix changes real `src/**` behavior, never the test.
- **The human is the eye** for the playable artifact; verification is confirmed by a real run, never assumed.
- Commit convention (once under git): `skillsys(<owner>): <rule>` — one lesson, one revertible commit;
  `~/.claude/skills/hermes-skill-system/scripts/review-edits.sh` is the span review.

## How to improve the system (where to look)
- A node produces a bad artifact → edit that node's **SKILL** (the craft); re-run only the changed node + downstream.
- Nodes mis-coordinate / a hand-off drops data → edit **`game-omni.js`** (the chain) or the relevant **contract**
  (`scaffold/template-contract.md`, `verify/assertion-execution-grammar.md`).
- A skill rests on a guess → the per-node **research records** in `research/skills/` are the evidence base; deepen
  the research (Reddit/Exa/yt-rag) and refine the skill against it.
- Coverage gaps → only `platformer` template exists; build the other four via `docs/handoff-build-archetype-templates.md`.

## Pointers
`status.md` (current state) · `README.md` (overview) · `.agents/skill-system-map.md` (full wiring + diagnostics) ·
`design/` (the why) · `research/` (the evidence) · `templates/README.md` (the template contract + merge) ·
`packages/verify/README.md` (the harness).
