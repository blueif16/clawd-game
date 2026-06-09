# Pipeline design — v1 (game-omni generation engine)

_Draft 2026-06-08. This is the PLAN: the carefully-designed build pipeline that absorbs the best practices from `research/reference-repo-deep-reads-2026-06-08.md`. **Design only** — what the pipeline IS, not how to code it. Recommendations are marked **[REC]**; decisions needing sign-off are in §9._

---

## 1. Goal & scope
- **Goal:** one **full pass**, `prompt → playable web game (Phaser 2D)`, to test the *generation engine itself*. No UI/IDE, nothing downstream.
- **Form:** a pipeline-shaped Claude Code **`Workflow`** (single source of truth), **Pi-portable** via `transform-workflow-to-pi`. Nodes coordinate **through the filesystem** (the project dir + state files). No host app, no DB.
- **Success = the verify node passes:** the game builds, boots headless, and its declared core mechanics assert true (not "the build succeeded").

## 2. Design principles absorbed (consensus → concrete rule)
Each rule is a pattern used by most reference repos (the "used-the-most" findings), turned into a pipeline rule.

| # | Consensus finding (≈N repos) | Pipeline rule we adopt |
|---|---|---|
| P1 | Spec-driven decomposition (~8) | Every run produces a **spec doc** first; the spec is decomposed into a **per-game milestone list (2–5, default 3) chosen at W1**, each a *playable slice* with explicit **verify assertions**. Never one-shot. (See §3b Milestone policy.) |
| P2 | Genre templates + skill library (all 9) | Codegen **starts from a genre template module**, never a blank file. The model fills a known skeleton (OpenGame "archetype compiler"). |
| P3 | Persistent project-local state files (~7) | Grounding lives in **on-disk files updated as you go** — `gdd.json`, `PLAN.md`, `STRUCTURE.md`, `index.json`, `ASSETS.md`, `MEMORY.md`. These are also the **pi filesystem-coordination contract**. |
| P4 | Role split: Designer · Coder · Artist · Playtester (~6) | Pipeline waves map to these four roles. |
| P5 | Asset-gen as a tool → files + manifest (~6) | Assets are generated into `public/assets/` with an **`ASSETS.md` manifest** that doubles as downstream grounding. |
| P6 | Verify = headless-run → screenshot → assert → bounded self-fix (mature only in Godot) | The **verify node** boots the game headless, asserts mechanics via a marker contract, screenshots for VLM review, and self-fixes ≤3 cycles. **This is net-new for web.** |
| P7 | Juice baked into templates (~4) | **Game-feel ships inside the genre templates** (shake/dash/combo/hit-freeze) — wired in during codegen, not a separate pass for v1. |
| P8 | Scope discipline beats tooling (hard truth) | W0/W1 must **cut scope explicitly** (record what's OUT). The milestone **ceiling (5)** is the anti-slop guardrail: if the spec needs more playable slices than that, the pipeline forces a scope cut back to W0/W1 rather than growing. |

## 3. The pipeline (waves)
Linear spine with one parallel lane (assets ∥ first code milestone). Fixed waves over one input (the prompt) → pi-portable.

```
W0 Classify ─► W1 Spec ─► W2 Scaffold ─► ┌─ W3 Assets ─┐─► W4 Implement(M1..M3) ─► W5 Verify+Fix(M1..M3) ─► done
   (Designer)   (Designer)  (Coder)       └─────────────┘     (Coder)                 (Playtester)
                                          (Artist, parallel)
```

| Wave | Role | Input | Output artifact (on disk) | Best-practice absorbed | Gate to advance |
|---|---|---|---|---|---|
| **W0 Classify** | Designer | `args.prompt`, template catalog | `spec/classification.json` (chosen archetype ∈ {platformer, top_down, grid_logic, tower_defense, ui_heavy}; core-loop one-liner; **scope-cut list**) | OpenGame physics-first classifier (P2); scope discipline (P8) | archetype ∈ supported set |
| **W1 Spec** | Designer | classification + prompt + chosen **template's capability/API doc** | `spec/gdd.json` (slim gameDNA: meta · entities · mechanics · win/lose · controls · **asset-list** · **milestone list (2–5, default 3), each w/ acceptance criteria + runtime assertions**); `spec/PLAN.md` | OpenGame `generate-gdd` constrained-by-template-API; ForgeDNA gameDNA subset; gamedevbench per-task assertions (P1) | gdd validates; milestone count ∈ [2,5]; M1 = core loop, final = end-state |
| **W2 Scaffold** | Coder | gdd + genre template module | running Phaser/Vite/TS project (copied from template, builds empty); `STRUCTURE.md`; **`index.json`** (exact asset slots + dims from the asset-list) | OpenGame template modules; agent-game-forge bootstrap; the `index.json` grounding ideal — *created here, where it's actually useful* (P2,P3) | `npm run build` passes (build-health) |
| **W3 Assets** (∥) | Artist | gdd asset-list + `index.json` | sprites/tiles in `public/assets/`; `ASSETS.md` manifest (path · dims · slot) | gameforge `AssetGenerator` (Gemini) + OpenGame generate-assets/tilemap; manifest-as-grounding; pixel-snap (P5) | every required slot filled (or placeholder) |
| **W4 Implement** | Coder | gdd milestones + scaffold + `STRUCTURE.md` + `ASSETS.md` + template **behavior modules** (juice) | game code, milestone by milestone; `MEMORY.md` (quirks/discoveries) | milestone-based build (P1); game-feel via template juice (P7); CCGS story-by-story; OpenGame behavior modules | each milestone builds |
| **W5 Verify+Fix** | Playtester | built game + per-milestone assertions | `verify/report.json` (build-health · mechanic-assert pass/fail · screenshot · VLM verdict) | **gamedevbench marker contract** + **gameforge Playwright/screenshot** + **god-code bounded self-fix (≤3)** (P6) | all 3 milestones `VALIDATION_PASSED` |

W6 (dedicated game-feel polish pass) and asset re-iteration are **deferred past v1**.

## 3b. Milestone policy (the count is per-game, not fixed)
A milestone is **a playable vertical slice with a verify gate** — the game runs and you can do something meaningful at the end of it. It is NOT a task ("implement inventory" = task; "player can collect and score reflects it" = milestone). The count = number of **playable checkpoints**, which tracks the game's *systems* and so varies by game.

**Decided at W1**, not hard-coded. Fixed instead are the **invariants**:
1. Each milestone is a **playable slice** (runnable + asserted), never an internal task.
2. **M1 = the core loop** (moves · responds to input · renders) — the "it plays at all" gate.
3. The **final milestone includes an end-state** (win and/or lose) — the game can finish.
4. **Bounded 2–5, default 3.** Floor 2 keeps it a sequenced build (loop + goal), never one-shot. Ceiling 5 is the **scope-control**: more than 5 playable slices ⇒ pipeline forces a scope cut back to W0/W1, it does not grow.
5. Each milestone carries its own **acceptance criteria + runtime assertions**.

Examples (count follows the game): grid-logic 2048 → **2** (loop · win/lose+score) · platformer → **3** (move/jump · collect+hazards · win/lose+restart) · tower-defense → **3–4** (path+1 tower · waves+economy+towers · base-health/win+upgrades).

_Why bounded not unbounded: the ceiling IS the anti-slop mechanism (GameDevBench: 3× the code, 54.5% solve). Remove it and scope is unbounded — the exact failure mode. The ceiling only bites at the extreme, where "cut to fit" is the correct action._

## 4. Grounding / state files (the filesystem contract)
All grounding is files in the project dir — readable by any node, survives compaction, and is exactly what Pi needs to coordinate.

```
<project>/
  spec/classification.json   # W0  archetype + scope-cut
  spec/gdd.json              # W1  the spec (slim gameDNA + 3 milestones + assertions)
  spec/PLAN.md               # W1  milestone checklist, kept updated  (godogen/CCGS)
  STRUCTURE.md               # W2  architecture map                  (godogen)
  index.json                 # W2  exact asset slots + dims          (the "asset index" ideal)
  ASSETS.md                  # W3  generated-asset manifest          (gameforge/OpenGame)
  MEMORY.md                  # W4  quirks/discoveries/what-failed     (godogen)
  src/ public/ ...           # the Phaser/Vite game
  verify/report.json         # W5  the proof it works
```

## 5. The verify node (the crux — net-new for web)
The single highest-value, highest-risk node. Absorbs the three mature-but-Godot patterns and ports them to web.

- **Test hook (template requirement):** each genre template exposes its live game object on `window.__GAME__` — our web analogue of gamedevbench's `test.tscn` and god-code's live TCP bridge. Without this, mechanics can't be asserted; build-success ≠ correct.
- **Per-milestone assertions (from `gdd.json`):** declarative checks against `window.__GAME__` state/API, authored in W1. Examples: "pressing Up decreases `player.y` within 200ms"; "overlap(player, coin) increments `score`"; "enemy count == 3 at scene start". **1 Playwright spec ↔ 1 milestone** (gamedevbench's 1:1 mapping).
- **Marker contract:** the spec runner boots the scene headless (Playwright), fires synthetic input, asserts, prints **`VALIDATION_PASSED` / `VALIDATION_FAILED`** + a screenshot path. Keeping this exact marker means the scoring logic is trivial and portable (gamedevbench `validation.py` equivalent).
- **VLM screenshot review (optional, additive):** the screenshot is judged for intent-alignment / visual-usability (the +14pts finding). Verdict is advisory in v1 (doesn't block) unless the mechanic-assert already passed.
- **Bounded self-fix:** on `VALIDATION_FAILED`, feed `{failed assertion, stderr, screenshot}` back to a fix node; **≤3 cycles** (god-code cap), then surface failure. No infinite loops.

## 6. Role split — two options
- **[REC] Minimal-quartet for v1:** Designer (W0+W1) · Coder (W2+W4) · Artist (W3) · Playtester (W5). Four roles, matches the consensus quartet, keeps lanes clean.
- **Lean (collapse):** Coder (W0–W4) + Playtester (W5), assets = placeholder. Fewer nodes, fastest to first end-to-end pass; add Designer/Artist once the spine works. Good for the *very first* bring-up.

## 7. Mapping to a Pi-portable Workflow (design-level)
- Each **wave = `phase()`**; each **node = `agent()`** with a **schema** (forces the JSON artifact, e.g. `gdd.json`). The model never decides control flow — the script does.
- **W3 ∥ W4-M1** = `parallel()` lane; **milestones** = `pipeline()` so M2 implements while M1 verifies.
- **Self-fix** = a bounded `while (cycles < 3 && !passed)` inside the milestone stage.
- **Discovered-once lists (Pi-safe):** the milestone list (2–5) and the asset-slot list are both produced by W1, then the pipeline fans out over them. This is the well-supported "scout the work-list, then pipeline over it" pattern — *not* the problematic open-ended fan-out. The milestone ceiling (5) and the fixed `index.json` slot list keep both lists small and bounded, so the extractor records clean, finite lanes. (Milestone count is per-game; see §3b. My earlier "fix milestones = 3 for Pi" reasoning was wrong and is dropped.)
- **Single source of truth:** improve a wave by editing its prompt/skill in the workflow `.js` and re-proving on Claude; Pi inherits it. No port, no drift.

## 8. Novelty: adopt vs park (we choose what's used-most; park the rest)
- **Adopt as differentiators (rare but high-value):** gamedevbench marker contract ported to web; OpenGame archetype-compiler flow; `window.__GAME__` test hook (live-bridge analogue); god-code bounded self-fix; 3-milestone = static pi shape.
- **Park for later (novel but out of v1 scope):** ForgeDNA remix-lineage; CCGS 49-agent hierarchy + director-gates (seed minimal instead); gamestudio market-first Go/No-Go + analytics; godogen C# doctrine (we're TS/web); dedicated game-feel pass; multiplayer.

## 9. Open design decisions (to finalize before we author the Workflow)
1. **Spec format** — **[REC]** slim v1 subset of gameDNA (meta · genre · entities · mechanics · win/lose · controls · asset-list · 3 milestones+assertions), *not* the full 1068-line schema. Adopt full gameDNA later.
2. **Role split** — **[REC]** start **Lean** (Coder + Playtester, placeholder assets) to prove the spine end-to-end, then expand to the **Minimal-quartet**.
3. **Verify depth** — **[REC]** require **runtime mechanic assertions** (marker contract) from day one, with build-health as a pre-gate and VLM screenshot review as advisory. (The assertions are the whole point.)
4. **Assets in v1** — **[REC]** **placeholder-first** (programmatic/pixel rects) for the first passing pipeline, Gemini assets as the immediate next toggle. Isolates the codegen test from asset-gen flakiness.
5. **Game-feel** — **[REC]** juice-in-templates only for v1; defer a dedicated pass.
6. **Genre coverage for v1** — **[REC]** ship **one** genre template end-to-end first (suggest **platformer** — richest OpenGame juice modules), then add the other four.
7. **Which model drives nodes** — out of scope here (host = Workflow; Claude to prove, Pi/coding-plan to scale). No decision needed now.
