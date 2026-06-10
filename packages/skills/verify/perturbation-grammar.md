# VERIFY-2 Isomorphic-Perturbation Grammar (`perturbation.ts` SPEC)

_Owner: **VERIFY-2 Verify+Fix** (impl/QA gate). Status: **canonical / load-bearing**. This file commits the contract VERIFY-2 owns on top of `blueprint.declaredRanges` (from VERIFY-1) and the `window.__GAME__` `commands` seam (from `scaffold/template-contract.md` §3): **how the blueprint's declared-range parameters are PERMUTED into a behavior-preserving re-run of the acceptance criteria + completability, and how invariance across that re-run is decided** (the SKILL §6 load-bearing anti-gaming gate). It is the companion to `assertion-execution-grammar.md` — that file commits the §2 compiler + the `observe` evaluator + the comparator table + the boot sequence; THIS file commits the permutation engine that re-drives those same compiled checks under permuted parameters. The `packages/verify/` harness implements `perturbation.ts` against this spec. Evidence: `research/skills/w5-verify-research.md`; SKILL §6 + Appendix A/B. Bound contracts it consumes: `verify-design/SKILL.md` §5 (`blueprint.declaredRanges`/`referenceSolution`/`acceptanceCriteria`) and `scaffold/template-contract.md` §3 (the `commands.{reset,seed,setState}` seam)._

> **The one-line invariant.** Perturbation is a **GENERAL INTERPRETER** over the blueprint's `declaredRanges` — it never contains per-game permutation logic. It enumerates `parameterPath → [min,max]`, draws an in-envelope permuted value DETERMINISTICALLY, re-applies the committed acceptance criteria + the completability replay through the SANCTIONED `commands` seam ONLY, and asserts the build is INVARIANT. The blueprint (its `declaredRanges`, `referenceSolution`, `acceptanceCriteria`), `spec/gdd.json`, the `__GAME__` hook, and the `packages/verify/` harness are the **IMMUTABLE ORACLE**: perturbation NEVER edits `src/**`, NEVER edits an oracle, and NEVER widens a declared range. A faithful build is invariant under any in-envelope permutation; a contorted/over-fit build DIVERGES → `perturbation.invariant=false` → marker FAILED. _([repo] gamedevbench "validate behavior not implementation"; [E] arxiv 2604.15149 "a shortcut is EXACTLY an output that passes the original but fails a structure-preserving permutation"; ar5iv 2507.05619 Evaluator Stress Test "if a high score disappears under a content-preserving change, it was gamed".)_

---

## 1. The input contract: `blueprint.declaredRanges` (the perturbation envelope)

VERIFY-1 emits (`verify-design/SKILL.md` §5) the single field §6 cannot operate without: the **declared range** per parameter. The committed encoding the perturbation engine enumerates against is a **FLAT object** mapping each tunable key AND each placement coordinate — a `parameterPath` string — to a `[min, max]` 2-tuple:

```jsonc
"declaredRanges": {
  // a tunable (config key), addressed by its config path:
  "config.enemyWalkSpeed":      [70, 95],
  "config.walkSpeed":           [180, 220],
  // a placement coordinate (one axis of one entity), addressed by its layout path:
  "layout.rewards.coin_1.x":    [380, 460],
  "layout.rewards.coin_1.y":    [290, 310],
  "layout.threats.patrol_1.speed":      [70, 95],
  "layout.threats.patrol_1.periodMs":   [2200, 2800],
  "layout.playerSpawn.x":       [24, 48],
  // a count, addressed by the collection it sizes:
  "layout.rewards.count":       [3, 5],
  // the RNG seed envelope (any value in band is behavior-preserving by design):
  "rng.seed":                   [1, 2147483646]
}
```

**The enumeration contract the harness implements.** `perturbation.ts` reads `blueprint.declaredRanges`, iterates its entries as `[parameterPath, [min, max]]`, and for each entry it selects ONE permuted value in `[min, max]` (§2). A `parameterPath` is an opaque dotted string the engine does NOT parse for meaning beyond routing it to a seam (§4) and to a permutation class (§5); its FIRST segment classes it (`config.*` | `layout.*` | `rng.*`). The blueprint guarantees (VERIFY-1 §5) that **every value in `[min,max]` keeps the §3 feasibility and §4 threat-on-path properties true at BOTH endpoints** — so any in-envelope draw is, by VERIFY-1's contract, behavior-preserving. **VERIFY-2 trusts this envelope and stays strictly inside it** (§7 / SKILL §6 anti-anti-pattern).

- A `parameterPath` named in an `acceptanceCriteria` GIVEN/`observe`/`then` or in a `referenceSolution` step is still permutable — permuting it is the whole point; what is forbidden is permuting OUTSIDE `[min,max]` or editing the criterion text (§7).
- A `parameterPath` absent from `declaredRanges` is **not permutable** (VERIFY-1 declared no behavior-preserving band for it) — the engine leaves it at its frozen blueprint value.
- If `declaredRanges` is empty or absent, perturbation records `ran:false` with a reason — and that is a VERIFY-1 contract gap (a design escalation per SKILL §8/§11), NOT a build pass (a verify without the permutation pass is INCOMPLETE, SKILL §11).

---

## 2. The permutation model: deterministic, seed/index-based selection (NEVER raw randomness)

A permuted value is drawn from `[min, max]` **DETERMINISTICALLY** and **REPRODUCIBLY**. The pi runner may not expose `Math.random()`, and a non-reproducible permutation would make a divergence un-replayable for the fix step — so the engine NEVER uses raw randomness. It uses a **seeded/index-based selector** passed in:

### 2.1 The selector
- The harness passes a single integer **`permutationSeed`** into `perturbation.ts` (CLI flag / env, default a fixed constant, e.g. `0xC0FFEE`, so a re-verify reproduces the exact permuted run). Every drawn value is a pure function of `(permutationSeed, parameterPath)` — no wall-clock, no PID, no `Math.random()`.
- For each `parameterPath`, derive a stable per-parameter index from a small string hash of the path mixed with `permutationSeed` (e.g. FNV-1a over `parameterPath` XOR `permutationSeed`), then map it into the range.

### 2.2 Selecting a value in `[min, max]`
Given `[min, max]` and the derived index `i` (a non-negative integer):
- **A coordinate / speed / timing (continuous):** pick a value strictly inside the band, NOT an endpoint (an endpoint may sit exactly on a feasibility boundary; the interior is unambiguously behavior-preserving). Use a fixed small set of interior offsets and select by `i`, e.g. quartiles `{min + ¼·span, min + ½·span, min + ¾·span}` and `picked = offsets[i % offsets.length]`, rounded to an integer for pixel coordinates. `span = max - min`.
- **A count (integer band):** `picked = min + (i % (max - min + 1))`, choosing a count DIFFERENT from the original where the band allows (so the permutation actually moves; see §5).
- **The RNG seed (`rng.seed`):** `picked = min + (i % (max - min + 1))`; applied via `commands.seed(picked)` (§4). The mechanic under test must be seed-invariant on the observable, so ANY in-band seed is valid. **NO frozen "original" (committed):** a runtime-seeded game has no literal seed on the blueprint (`resolveOriginal` returns undefined for `rng.*`), so there is no frozen design value to move off. The engine records `original` for an `rng.*` move as the **band `min` SENTINEL** purely so the move-the-needle selector (§2.3) has a value to differ from — it is NOT a fabricated design number, and `permutationsApplied[].original` for an `rng.*` path MUST be read as "no frozen original; sentinel = band min" (§8), never as a seed the build was authored against. (The seed applied to the build is always `permuted`.)
- **Degenerate band** (`min === max`): no permutation possible for this path — record it as `applied: false, reason:'point-range'` and skip; it cannot diverge (there is nothing to vary).

### 2.3 Move-the-needle requirement
A permutation that resolves to the ORIGINAL frozen value tests nothing. For every permutable path the engine MUST pick a value `!== original` when the band permits (`max > min`); if the derived index lands on the original, advance to the next interior offset / count. Record the actual `original` and `permuted` per path (§6). A run where NO path could move (all point-ranges) records `invariant:true` with `permutationsApplied:[]` and a note — it is vacuously invariant but is a weak gate (flag for the steward).

---

## 3. What a permuted re-run IS (the second bounded boot)

Perturbation is a **second, distinct boot** of the SAME built game (SKILL §6, Appendix A) — never a `src/**` edit and never a new build except for the one baked-config case (§4). The procedure:

1. **Boot fresh** (the §5.2 sequence in `assertion-execution-grammar.md`): serve the built game, launch Chromium swiftshader, inject the `observe` evaluator, advance-to-ready, focus canvas, canvas-not-blank.
2. **Apply the permutation** for every permutable `parameterPath` through its seam (§4) — runtime `commands` for the RUNTIME class, a permuted `gameConfig.json` + one rebuild for the BAKED class.
3. **Re-run the committed checks** — re-compile and re-drive EXACTLY `blueprint.acceptanceCriteria` (the §3 fidelity set) AND replay `blueprint.referenceSolution` (the §4 completability set), using the same `compile.ts` primitives, against the permuted state. The criteria text is byte-identical to the original pass; only the underlying parameters moved.
4. **Compare invariance** (§5 verdict): every check that PASSED in the original pass must PASS again. Record `perturbation{...}` (§6).

The permuted run reuses the original pass's compiled checks verbatim — perturbation does NOT author new assertions, it RE-RUNS the oracle's own checks over moved parameters. This is why it is un-game-able: the build cannot satisfy the permuted run by reading a flag, because the same comparator over `__GAME__` must hold on a layout/seed/count the build never saw at author time.

---

## 4. The two seams — WHERE a permutation is applied (committed: D1)

**D1 (committed).** A permutation is applied at ONE of exactly two seams, chosen by the `parameterPath`'s parameter CLASS. The default is the runtime seam (no rebuild); the baked-config seam costs exactly one rebuild and is used ONLY for a tunable read once at build/`create()` time.

### 4.1 SEAM A — RUNTIME (default; NO rebuild)
Applied via the sanctioned `window.__GAME__.commands` (`scaffold/template-contract.md` §3.2) AFTER `commands.reset()` to a fresh level and BEFORE driving the check:
- `commands.setState(patch)` — re-place a coordinate / re-position the player at a permuted precondition / set a permuted count (positions, placement, approach-distance, precondition placement, patrol phase offset).
- `commands.seed(n)` — apply a permuted RNG seed.
- a permuted **level-config injected pre-boot** (the harness writes the permuted layout into the page context before the level scene reads it, via `addInitScript` / a permuted `commands.reset(config)` overload where the template supports it) — for counts/coordinates a runtime `setState` can't retro-place.

**Parameter CLASSES routed to SEAM A:** coordinates / spawn / goal / hazard / collectible positions; the RNG seed; counts-within-range; approach-distance & precondition placement; patrol **phase offset** (the starting point in the patrol cycle, a runtime state, not a baked speed).

### 4.2 SEAM B — BAKED CONFIG (one rebuild for the permuted pass)
A tunable BAKED at build time — read ONCE in `create()` and never re-read (e.g. `enemyWalkSpeed`, `gravityY`, `jumpPower` consumed at scene construction) — cannot be moved by a runtime `setState` (the value is already closed over). For these, the engine writes a **permuted `src/gameConfig.json`** (only the permuted `config.*` keys, within their `declaredRanges`) and triggers **EXACTLY ONE rebuild** (`npm run build`) for that permuted pass, then boots the rebuilt artifact and runs §3.

- This is a permutation of a **config input the build legitimately reads**, NOT a `src/**` edit — `gameConfig.json` is the tunable surface (`template-contract.md` §4), not game logic and not an oracle. The permuted file is reverted after the pass (the original frozen `gameConfig.json` is restored).
- The baked-config rebuild costs **one rebuild per permuted pass** — bounded and acceptable for the Pi budget (a single extra `npm run build`, the same gate W4 already runs). The engine batches ALL baked permutations into ONE permuted `gameConfig.json` so the rebuild happens **once**, not per-key.
- A `config.*` path whose value the template re-reads live each frame (rare) may use SEAM A instead; when in doubt the engine uses SEAM B (correctness over the one-rebuild cost).

### 4.3 Seam routing table

| Parameter class | Example `parameterPath` | Seam | Why |
|---|---|---|---|
| Coordinate / spawn / goal / hazard / collectible | `layout.rewards.coin_1.x`, `layout.playerSpawn.x` | A (runtime) | re-placed via `setState` / injected level-config; never baked |
| RNG seed | `rng.seed` | A (runtime) | `commands.seed(n)` |
| Count within range | `layout.rewards.count` | A (runtime) | injected level-config / `setState` before the level reads it |
| Approach distance / precondition placement | (a re-placed GIVEN position) | A (runtime) | re-place the player at a different valid precondition for the same step |
| Patrol phase offset | `layout.threats.patrol_1.phaseMs` | A (runtime) | a runtime state seeded at level start |
| Baked tunable (read once in `create()`) | `config.enemyWalkSpeed`, `config.gravityY` | B (rebuild) | closed over at construction; permute via `gameConfig.json` + one rebuild |

---

## 5. The FIVE permutation classes (what each catches)

Each class maps to: the `declaredRanges` `parameterPath`s it touches, its seam (§4), and the contortion class it catches (mirroring SKILL §6's contortion→permutation table). All five run in one permuted pass; the verdict (§6) aggregates them.

### Class 1 — Coordinates / spawn / goal / hazard / collectible positions
- **Touches:** `layout.playerSpawn.{x,y}`, `layout.goal.{x,y}`, `layout.rewards.*.{x,y}`, `layout.threats.*.{x,y}` and `layout.threats.*.route[*].{x,y}`.
- **Seam:** A (runtime — `setState` / injected level-config).
- **Catches: RESPAWN faked / hard-coded entrance coordinate.** A faithful RESPAWN sends the player to the blueprint's (now-permuted) entrance; a build that hard-codes the original literal lands at the wrong place → the `decreases`/position post-condition mismatches → DIVERGES. Also catches a goal/door overlap keyed to a literal coordinate rather than the real entity position.

### Class 2 — RNG seed
- **Touches:** `rng.seed`.
- **Seam:** A (runtime — `commands.seed(n)`).
- **Catches: any seed-dependent shortcut** — a build whose observable mechanic only holds under the harness's default seed (e.g. an enemy that happens to be elsewhere under seed 0). A faithful build is seed-invariant on the observable; a seed-tuned one DIVERGES.

### Class 3 — Counts within the declared range (and entity order)
- **Touches:** `layout.rewards.count` (and the count-bearing path for the archetype: collectibles, waves, enemies), entity ordering.
- **Seam:** A (runtime — injected level-config).
- **Catches: guard self-disables at a literal threshold** (e.g. `score >= 3`). Permute the collectible count and re-place: a guard keyed to the literal `3` stands down at a permuted count where it should still contest → the threat-contact (RESPAWN) post-condition never fires when it should → DIVERGES. The guard must contest at the RELATION (`score >= requiredCount`), not a frozen `3`.

### Class 4 — Approach distance / precondition placement
- **Touches:** the GIVEN position the §3 driver places for a mechanism (re-placed to a DIFFERENT valid precondition for the SAME step, within the placement's declared range).
- **Seam:** A (runtime — `setState` the precondition to a different in-envelope position; never inject the observed outcome, §6 predicate).
- **Catches: overlap radius tuned to the driver** (`M2_PROXIMITY_PX === DRIVE_OVERLAP_PX`, the real `val1` build). Re-place the player at a different valid approach distance: a build whose mechanic fires only at the harness's exact reach radius (not the blueprint's real interaction distance) stops firing → DIVERGES. The blueprint's real interaction distance is the oracle, not the driver's reach. Also catches **score-teleported / injected win** — completability (§3 step 3 / SKILL §4) must reach the count THROUGH real collection on a permuted layout, so an injected literal no longer matches.

### Class 5 — Timings within the declared band
- **Touches:** `layout.threats.*.speed` (baked → e.g. `config.enemyWalkSpeed`), `layout.threats.*.periodMs`, `layout.threats.*.phaseMs` (patrol phase offset).
- **Seam:** B for a baked speed (`config.enemyWalkSpeed` → permuted `gameConfig.json` + one rebuild); A for a runtime phase offset / period.
- **Catches: `enemyWalkSpeed` config-drop / a timing keyed to a literal.** A build that ignored the frozen speed (moves at a default) or whose passable-window logic is keyed to the exact original timing breaks when the speed/period is permuted within its band → the timing-window post-condition mismatches → DIVERGES.

---

## 6. The precondition predicate — LEGAL GIVEN vs forbidden effect-under-test (committed: D2)

§3 (SKILL) places a precondition via `commands.setState`; §6 forbids injecting the observed-adjacent value. The boundary must be MECHANICAL so the harness can decide it, not a judgment call.

**D2 (committed mechanical rule).** A `setState` field `F` is a **LEGAL precondition** for acceptance criterion `C` IFF **both**:
- **(a)** `F` is NOT `C`'s `observe`/`then` field (you may not inject the very thing you then read back), AND
- **(b)** `F` is NOT a direct causal one-step input that the mechanism-under-test READS to produce `C`'s observed outcome (you may not inject a value the mechanism consumes in the single step that yields the outcome).

If either (a) or (b) is violated, the placement is ILLEGAL — it fakes the pass — and the harness MUST refuse it and re-place via a cause the player could genuinely reach (or, if none exists, record the check as a verdict-correctness issue per SKILL §11, never a spurious FAILED).

**The mechanical decision procedure the harness runs.** For a candidate `setState` patch `{F: v}` establishing the GIVEN of `C`:
1. Reject if `F` equals `C.observable` / the `observe` path in `C.then` (rule a).
2. Reject if `F` appears in the blueprint's `coupling`/mechanism description as the field the mechanism READS at the moment it writes `C`'s observed field — i.e. `F` is the immediate input on the same causal edge as the output (rule b). Concretely: if the mechanism is "door reads `score` → sets `status:'won'`", then `score` is a one-step input to the `status` outcome → injecting `{score:4}` is illegal for the win criterion.
3. Otherwise the placement is LEGAL: it sets an upstream state the player reaches by play, and the mechanism still has to do its real work to produce the observed outcome.

**Worked examples:**
- **ILLEGAL** — `C` = "all coins collected ⇒ door overlap sets `status:'won'`"; patch `{score: 4}` then drive overlap and assert `status==='won'`. Violates (b): the door's win mechanism reads `score` on the same causal edge that sets `status` → injecting `score` proves only that the door reads an injected number (the exact `val1` M3-A1 shortcut). Re-place by reaching `score` through REAL collection (completability, §3/§4).
- **LEGAL** — `C` = "contacting a blueprint-located hazard triggers RESPAWN (`status` stays `'playing'`, position resets to spawn)"; patch the player to one hop from the hazard the blueprint located, then drive the documented control INTO it. The placed position is an upstream cause the player genuinely reaches; the RESPAWN mechanism still must fire on real contact to produce the observed outcome. `F` (player position) is neither the observed field (`status`/spawn-position post-condition) nor the one-step input the RESPAWN reads to decide to fire (that is the overlap event, which happens for real).
- **LEGAL** — `C` = "with `player.health: 1`, the next hit sets `status:'lost'`"; patch `{player.health: 1}` then drive into damage. `health` is an upstream precondition, not the observed `status`; the death mechanism still reads the REAL hit event. (Matches `assertion-execution-grammar.md` §2.2's sanctioned `{player.health:1}` example.)

---

## 7. The INVARIANCE verdict

After the permuted re-run (§3) over all five classes (§5):

- **INVARIANT (`perturbation.invariant = true`):** every acceptance criterion that PASSED in the original pass PASSES again under the permutation, AND the completability replay still reaches the win through real play on the permuted layout. The build implements the RELATION the blueprint declares, not the exact original numbers. This is the faithful-build signal.
- **DIVERGENT (`perturbation.invariant = false`):** at least one check passed originally but FAILS under an in-envelope permutation. This is PROOF the build is contorted/hard-coded/over-fit, not faithful → it **forces the marker FAILED** (SKILL §6/§7). Each divergence is recorded in `diverged[]` with the original-vs-permuted observed, which localizes the contortion for the fix step.

**A check that FAILED in the original pass is out of scope for the perturbation verdict** — it is already a §3/§4 fidelity/completability failure forcing FAILED; perturbation reasons only about checks that PASSED originally (the gaming surface is "passed the exact test").

**The permutation MUST stay INSIDE `declaredRanges` (the §11 verdict-correctness self-guard).** A permutation that breaks the design — moves the goal out of reach, makes a required window negative — is a **HARNESS bug**, NOT a build divergence (SKILL §6 anti-anti-pattern, §11). Before recording `invariant:false`, the engine self-checks: did every applied value stay within its `[min,max]`? did the completability replay still have a winnable path on the permuted layout (VERIFY-1 guaranteed it does at both endpoints, so a no-win here means the engine drew out-of-band or mis-applied a seam)? If the verdict logic itself is wrong, fix the harness-side reasoning (within this grammar) and re-run — a buggy permutation must not false-block a faithful build, and must not false-pass a contorted one. The design's gameness is VERIFY-1's domain; perturbation only varies the parameters VERIFY-1 declared interchangeable, NEVER the design intent.

---

## 8. The OUTPUT RECORD (what the harness writes into `report.M<id>.json`)

`perturbation.ts` returns, and the report carries, exactly this shape (schema: `report.schema.json` `perturbation`):

```jsonc
"perturbation": {
  "ran": true,                       // false only on a missing/empty declaredRanges (a VERIFY-1 contract gap -> escalate)
  "permutationSeed": 12648430,       // the deterministic selector seed (reproducible re-run)
  "permutationsApplied": [           // one entry per parameterPath actually moved
    { "parameterPath": "layout.rewards.coin_1.x", "original": 420, "permuted": 445, "seam": "runtime" },
    { "parameterPath": "config.enemyWalkSpeed",   "original": 80,  "permuted": 90,  "seam": "baked-config" },
    { "parameterPath": "rng.seed",                "original": 1,   "permuted": 777, "seam": "runtime" }
  ],
  "invariant": true,                 // false iff any originally-passing check fails under the permutation -> marker FAILED
  "diverged": [                      // empty when invariant; each entry localizes a contortion
    { "checkId": "M2-A1",
      "permutation": "approach-distance (precondition re-placed +18px within [380,460])",
      "originalObserved": "status='playing' (RESPAWN fired)",
      "permutedObserved": "status='playing' but position unchanged (mechanic fired only at DRIVE_OVERLAP_PX)" }
  ]
}
```

- `seam ∈ {"runtime", "baked-config"}` (the D1 seams, §4).
- `permutationsApplied[]` records the ACTUAL moves (omitting point-ranges that couldn't move); `original` is the frozen blueprint value, `permuted` is the in-envelope draw. **Exception — `rng.*` (committed):** a runtime-seeded parameter has NO frozen original (§2.2), so its `original` is the band-`min` SENTINEL (a move-off anchor, not a design value); the seed the build actually ran under is always `permuted`.
- `diverged[].checkId` is the acceptance criterion / completability id that diverged; `permutation` names the class + the specific move so the fix step knows WHICH contortion to root-cause.
- The marker string for a divergence reads (SKILL §7): `M2-A1 diverged under permutation (approach-distance): real build invariant, this build not`.

---

## 9. ANTI-REWARD-HACK guardrails (structural — the heart of this contract)

Mirrors `assertion-execution-grammar.md` §7 and SKILL §6/§7, specialized to perturbation:

1. **Applied via `commands` / config-injection ONLY — NEVER by editing `src/**` or any oracle.** The permutation moves the parameter through the sanctioned `commands.{reset,seed,setState}` seam (runtime) or a permuted `gameConfig.json` input + one rebuild (baked) — both are inputs the build legitimately reads, not game logic. Perturbation NEVER edits `src/**`, `spec/gdd.json`, the assertions, `blueprint.{declaredRanges,referenceSolution,acceptanceCriteria}`, the `__GAME__` hook adapter, the `packages/verify/` harness, or this grammar. _([repo] gamedevbench sandbox — the oracle is outside the edit set; SKILL §7 "NEVER widens a perturbation envelope".)_
2. **NEVER widen a declared range.** The engine draws STRICTLY inside `[min,max]` (interior for continuous, in-band for counts/seed). Widening the envelope to force/avoid a divergence is forbidden — it would either false-pass a contorted build or false-block a faithful one. The envelope is VERIFY-1's frozen contract; VERIFY-2 reads it, never edits it. _([E] arxiv 2604.15149 isomorphic-vs-extensional; SKILL §6 anti-anti-pattern.)_
3. **Re-run the oracle's OWN checks, never new ones.** Perturbation re-drives `blueprint.acceptanceCriteria` + `referenceSolution` verbatim over moved parameters; it authors no per-game assertion. A build cannot satisfy the permuted run by reading a flag — the same comparator over `__GAME__` must hold on a layout/seed/count it never saw at author time. _([repo] gamedevbench "validate behavior not implementation".)_
4. **Deterministic, never raw randomness.** Every drawn value is a pure function of `(permutationSeed, parameterPath)` — reproducible so a divergence is replayable and the fix step can re-hit it; no `Math.random()` (unavailable in the pi runner), no wall-clock. _([E] Phaser determinism; SKILL §14 pi-portability.)_
5. **The verdict reasons only over originally-passing checks, and stays inside the envelope.** `invariant:false` requires a check that passed originally and fails in-envelope (§7); a permutation that broke the design is a harness bug (§11 self-guard), corrected and re-run — never recorded as a build divergence. _([E] iv4xr "agent failure ≠ level unsolvable — separately validate the correctness of the agent's verdicts".)_

These make a contorted build's green light **structurally non-survivable**: the build cannot pass the permuted run by faking a field (the real relation must hold on parameters it never saw), and the harness cannot accidentally false-block a faithful build (the envelope is VERIFY-1-guaranteed behavior-preserving and the §11 self-guard catches an out-of-band draw). A `perturbation.invariant === true` therefore genuinely means "the build implements the blueprint's RELATION, not its exact numbers."

---

## 10. Relationship to the gdd `assertions[]` (committed: D3)

**D3 (committed source-of-truth).** `blueprint.acceptanceCriteria` is the **canonical** fidelity contract — it carries the frozen GIVEN (the precondition VERIFY-1 froze) and is what §3 compiles and §6 permutes. The milestone's gdd `assertions[]` are the **executable FALLBACK** (the 1:1 executable form). §3 fidelity reads `acceptanceCriteria` and treats `assertions[]` as the fallback, so it **never double-runs** the same check; perturbation re-runs whatever §3 ran (the canonical `acceptanceCriteria`), permuted. **The AC↔assertion link is by `assertionId` (committed):** each AC sets `assertionId` to the gdd assertion id it upgrades (`verify-design/SKILL.md` §5; `blueprint.schema.json` acceptanceCriteria[].assertionId, pattern `^M\d+-A\d+$`), so §3 attaches the frozen GIVEN onto the executed assertion's report row BY ID — never by array order. The harness falls back to milestone + order only for a legacy AC missing the link. This is an attribution-precision link (annotation only); the executed oracle is the gdd assertion regardless, so the pairing never affects a verdict. When an acceptance criterion has no `declaredRanges` parameter in its GIVEN/observe (a pure at-scene-start observe), it is still re-run under the global permutation (e.g. a permuted seed) for completeness, and is invariant by construction.
