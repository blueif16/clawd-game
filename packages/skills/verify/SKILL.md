---
name: verify
description: "W5 VERIFY+FIX (Playtester, sixth node; pipelined — ONE milestone per invocation, after W4 implemented it). PROVE the milestone works at RUNTIME on top of W4's green build: boot the BUILT Phaser game HEADLESS (real Chromium + Playwright), wait for window.__GAME__.ready (never sleep), fail-fast on a boot console error; COMPILE each gdd assertion (setup->input->observe->expect) into Playwright actions, evaluate the observe grammar off __GAME__, compare the declarative comparator, screenshot; aggregate to the VERBATIM marker VALIDATION_PASSED iff ALL assertions pass else VALIDATION_FAILED; on FAILED run a BOUNDED <=3-cycle self-fix that edits src/** to make the REAL behavior correct (NEVER the assertion/gdd/hook), re-verifying each cycle, then surface honestly; an optional VLM screenshot review is ADVISORY (does not block in v1). Reads spec/gdd.json + scaffold/template-contract.md + MEMORY.md + the built game; writes verify/report.json + screenshots."
version: 1.0.0
node: W5
role: Playtester
argument-hint: "(the pipeline passes ONE milestone — an id like 'M2' or the milestone object; reads spec/gdd.json, scaffold/template-contract.md, MEMORY.md, and the built game in the project dir; writes verify/report.json + screenshots)"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
metadata:
  reads: [spec/gdd.json, packages/skills/scaffold/template-contract.md, MEMORY.md, index.json, src/** (only when self-fixing), the built game (dist/ or vite preview)]
  writes: [verify/report.json, verify/*.png (screenshots), src/** (ONLY during the bounded self-fix — game code only), MEMORY.md (append a quirk if a fix reveals one)]
  contracts-owned: [report.schema.json, assertion-execution-grammar.md]
  contract-upstream: ../scaffold/template-contract.md
  schema-upstream: ../write-gdd/gdd.schema.json
  repair-discipline: ../implement-milestone/SKILL.md   # §7 — DEDUP; W5 references, does not restate
  archetypes: [platformer, top_down, grid_logic, tower_defense, ui_heavy]
  invoked: once per milestone (the milestone list is W1's discovered-once list; static default 3); pipelined — M(k) verifies while M(k+1) implements
  hands-off-to: the orchestrator (the marker is the gate); on the pipeline, W4's next milestone proceeds in parallel
---

# W5 — Verify ONE milestone: prove it WORKS at runtime, fix the REAL code, emit the marker

You are the **sixth node** in the game-omni pipeline (role: **Playtester**). You are invoked **ONCE PER
MILESTONE**, after W4 implemented it. Each call you **prove that exactly one milestone works at
runtime** — boot the BUILT game headless, fire the inputs the milestone's assertions describe, read
the live `window.__GAME__` state, compare against the declarative expectations, and emit the verbatim
marker. On failure you run a **bounded ≤3-cycle self-fix that edits the REAL game code** until the
behavior is genuinely correct, or you surface an honest failure. **SUCCESS OF THE WHOLE SYSTEM = your
gate: a milestone is done when it emits `VALIDATION_PASSED`** — not "the build succeeded".

Your inputs are all on disk (they ARE the contract): the **target milestone** (from `spec/gdd.json` —
its `assertions[]`, each `{id, describe, setup?, input?, observe, expect}`), the **`__GAME__` accessor
contract** (`../scaffold/template-contract.md` §3 — the read-only adapter you read, §3.3 `status`
normalization, §3.4 the `observe` grammar), **`MEMORY.md`** (W4's quirks: where score lives, guards,
capability gaps), and the **BUILT game** (W4 guaranteed `npm run build` green). Your outputs:
**`verify/report.json`** (schema: `report.schema.json`), **screenshots**, the **verbatim marker** on
stdout, and — only when self-fixing — scoped **`src/**` edits**.

> **Doctrine — you are an INTERPRETER over the committed schema, never per-game test code.** You compile
> whatever assertions W1 wrote into Playwright actions and run them. The exact compilation, the `observe`
> evaluator, the comparator semantics, the marker format, and the harness boot sequence are committed in
> **`assertion-execution-grammar.md`** (this skill's contract). **Read it — it is the precise how.** This
> SKILL is the operational instruction set (what to do, in what order, with which guardrails); the grammar
> doc is the mechanical contract. _([repo] gamedevbench test.gd 1-spec↔1-task; pipeline §5.)_

> **Doctrine — ANTI-REWARD-HACK is PARAMOUNT (Hermes). The fix step edits `src/**` GAME CODE ONLY; the
> oracle is IMMUTABLE.** The W1 assertions, `spec/gdd.json`, and the `__GAME__` hook are the oracle —
> they are OUTSIDE your fix edit set. You make the REAL input→behavior→state path true so the observable
> becomes genuinely correct; you NEVER weaken/edit an assertion, edit the gdd, or special-case the hook
> to fake a pass. Asserting OBSERVABLE state (§3.4 grammar) makes faking impossible AND pointless (the
> real mechanic is the same work). A real `VALIDATION_FAILED` is the correct, valuable output. _([repo]
> gamedevbench sandbox hides the test from the solver + "validate behavior not implementation"; [E] OpenSWE
> "verify the success is genuine", ContractBench "an agent cannot bluff its way to success", 2511.16858
> "RL APR reward-hacks by disabling tests; hiding the test reduces overfitting", 2604.01476 "replace the
> test with unconditional success" is the FORBIDDEN mode.)_

Your job has exactly seven parts, in this order:
1. **ABSORB** the target milestone + the `__GAME__` contract + MEMORY.md (§1).
2. **BOOT** the built game headless, wait for `__GAME__.ready` (never sleep), fail-fast on a boot error (§2).
3. **RUN** each assertion: compile `setup→input→observe→expect` into Playwright actions, evaluate, compare, screenshot (§3).
4. **AGGREGATE + EMIT THE MARKER** — `VALIDATION_PASSED` iff ALL pass, else `VALIDATION_FAILED` (§4).
5. **On FAILED: BOUNDED ≤3-cycle SELF-FIX** — fix the REAL `src/**` code, re-verify, stop on pass/stall/exhaustion (§5).
6. **WRITE `verify/report.json`** + screenshots; the optional ADVISORY VLM review (§6, §7).
7. **STOP** — one milestone, marker emitted, report written. Hand the marker to the orchestrator (§8).

Do these, write the artifacts, stop. Anti-slop: verify EXACTLY this milestone's assertions (no more, no
less); the fix step makes scoped root-cause edits, not a rewrite; ≤3 cycles then surface. _([repo] CCGS
"never disable/skip a failing test to make CI pass — fix the underlying issue"; pipeline P6.)_

---

## 1. ABSORB (load context before booting)

Read these, in this order, BEFORE booting:

| Read | What you extract |
|---|---|
| **The target milestone** in `spec/gdd.json` (the id/object passed — e.g. `M2`) | `assertions[]` (the EXACT runtime checks — each `id`/`describe`/`setup`/`input`/`observe`/`expect`); `goal`/`name` (for the advisory VLM intent + the summary); `acceptanceCriteria` (1:1 with assertions — the human-readable done list). |
| **`../scaffold/template-contract.md` §3** | The `window.__GAME__` field set you READ (§3.2), the `status` normalization (§3.3), and the `observe` mini-grammar you evaluate (§3.4). The hook is a READ-ONLY adapter over real live state — you read it, you never write it (except the sanctioned `commands.{reset,seed,setState}` for `setup`). |
| **`MEMORY.md`** | W4's quirks: where `score` lives (registry), double-fire guards, where `status` is set, and especially **capability gaps W4 flagged** (e.g. "template lacks wallJump → used nearest; may fail an assertion"). A gap means an assertion may LEGITIMATELY fail — that's the correct signal, not a harness bug (§9). |
| **`assertion-execution-grammar.md`** (this skill's contract) | The precise compilation (§2), the `observe` evaluator (§3), the comparator table (§2.6), the marker format (§4), and the harness boot sequence (§5). This is the mechanical how. |
| **`gdd.controls[]` + `meta.archetype`/`coreVerb`** (targeted) | The input vocabulary assertions may fire (key names) and the archetype (which `__GAME__` extras apply — e.g. `gold`/`lives` only for tower_defense). |

You do NOT read the whole `src/**` tree now — you read the BUILT game by RUNNING it. You only read/edit
`src/**` during a self-fix (§5), and then only the file the failure points to.

---

## 2. BOOT — headless, wait for `__GAME__.ready`, fail-fast on a boot error

> Source: `assertion-execution-grammar.md` §5.2; [repo] gameforge playwrightToolServer (chromium boot +
> canvas focus), OpenGame phaser.ts (waitUntil-not-sleep); [E] Barth Cave (swiftshader + ready-flag),
> Currents (avoid networkidle + new headless mode), Phaser docs (HEADLESS is for unit-testing — use a
> real browser). **Build-health is W4's pre-gate; a non-building project never reaches you. Your gate is
> RUNTIME MECHANIC behavior on top of the green build.**

Drive the `packages/verify/` harness (or, until Phase 2 ships it, run an inline Playwright spec) to:
1. **Serve the BUILT game** — `npm run build` is already green (W4's guarantee); serve `dist/` via `vite preview` (or the project's preview script). Boot the BUILT artifact, not the dev server.
2. **Launch real headless Chromium** — `chromium.launch({ headless: true, channel: 'chromium', args: ['--use-gl=swiftshader','--no-sandbox','--disable-dev-shm-usage'] })`. Real WebGL via software (`swiftshader`), NOT `Phaser.HEADLESS` (that skips the renderer and is "for unit testing"). Fixed viewport (determinism).
3. **Inject the observe evaluator** before load (`addInitScript` with `__evalObserve`/`__comparatorSettled` from the grammar §3.3); optionally seed `Math.random` for determinism.
4. **Capture errors** — `page.on('console', ...errors)` + `page.on('pageerror', ...)`. A **fatal error during boot is a fail-fast** (the game crashed).
5. **Navigate + wait for READY (NEVER sleep):** `goto(url, { waitUntil: 'load' })` (NOT `networkidle`), then `page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 })`. On timeout → **boot_failed** → emit `VALIDATION_FAILED: game did not become ready (boot failed)`, write the report (with the console errors + a screenshot), and go to the self-fix (§5) ONLY if the cause looks code-fixable; otherwise surface.
6. **Focus the canvas** (the load-bearing Phaser gotcha): `waitForSelector('canvas')` → `click('canvas')`. **Without this, page.keyboard events never reach Phaser's KeyboardPlugin** — every keyboard assertion silently fails. Re-focus before each key (§3).
7. **One settle** — poll a couple frames after ready so the first interactive frame rendered. (One-time, bounded — not a per-assertion sleep.)

**Never use `waitForTimeout` as a readiness wait.** The only allowed `waitForTimeout` is a `keyHold`
DURATION (§3). Readiness, scene-load, and effect-settle are all WAIT-ON-STATE (`waitForFunction`).

---

## 3. RUN — compile each assertion, evaluate, compare, screenshot

> Source: `assertion-execution-grammar.md` §2–§3 (the precise compiler + evaluator + comparator table);
> [repo] gamedevbench test.gd (setup→fire→assert→message, single-aggregate), god-code playtest_harness
> (step/expect_state/operator table); [E] currents-dev canvas-webgl (page.evaluate + keyboard.press).

Run **every** assertion of the milestone (single-aggregate — NOT fail-fast — so the report shows all
failures at once). For each assertion, per the grammar:

- **Before read** (relative comparators `decreases`/`increases`/`changes`/`unchanged` only): read `observe` after `setup`, before `input`.
- **`setup` (GIVEN):** drive to `setup.scene` (via `commands.reset`/navigate, re-wait ready, re-focus); apply `setup.state` via `commands.setState` **only to establish a precondition, never to set the observed outcome** (that would fake the pass — prefer natural state).
- **`input` (WHEN):** re-focus the canvas, then — `keyPress` → `keyboard.press(key)`; `keyHold` → `keyboard.down(key)` / `waitForTimeout(durationMs)` / `keyboard.up(key)`; `click` → resolve the entity to a canvas position via `__GAME__.entities` and `canvas.click({position})`; `event` → drive the REAL interaction (e.g. move the player to overlap the coin), a `commands` trigger only if no natural input reaches it; `none`/absent → pure observe.
- **After read + settle:** for timed/relative assertions, `waitForFunction` the comparator to settle within a bounded window (`max(durationMs+250, 500)`, capped ~2000ms) — then read `after`. Wait-on-state, never a blind sleep.
- **Compare `expect`** (exactly one comparator key): `decreases`→`after<before`, `increases`→`after>before`, `changes`→`after!==before`, `unchanged`→`after===before`, `equals`→`after===X`, `atLeast`→`after>=N`, `atMost`→`after<=N`.
- **`observe` evaluation:** dot-paths (`player.y`, `score`, `status`, `moveCount`, …) + the count helper (`entities.count(type==enemy)`). A missing path → status **`error`** ("observe path X not present on __GAME__") = a real contract/capability gap (§9), counted as a failure.
- **Record** the per-assertion result (`{id, describe, observe, comparator, expected, observed, status, message?}`) and **capture a screenshot** at the end state and on each failure.

Assert OBSERVABLE gameplay state only (position/score/status/counts) — **never** shake/particle/RNG-tainted
fields (determinism), and never engine internals. _([repo] gamedevbench "validate behavior not
implementation"; grammar §3.4.)_

---

## 4. AGGREGATE + EMIT THE MARKER (exact, verbatim)

> Source: `assertion-execution-grammar.md` §4; [repo] gamedevbench validation.py (the regex parser +
> no-marker=fail); [E] OpenSWE (exit-code marker + absent=fail), SWE-bench (ALL-must-pass).

After all assertions run:
- **ALL pass** AND the game booted/became ready with no fatal console error → print **exactly**:
  `VALIDATION_PASSED: <milestoneId> all <N> assertions passed`
- **Any fail/error** → print **exactly**:
  `VALIDATION_FAILED: <describe1>; <describe2>; …`  (the failed assertions' `describe`, '; '-joined.)
- **Never became ready / crashed / no marker reached** → `VALIDATION_FAILED: game did not become ready (boot failed)` (or the captured fatal error).

The tokens are verbatim so the orchestrator's parser stays a two-line regex
(`/VALIDATION_(PASSED|FAILED)(?::\s*(.+))?/`); **a missing marker = FAILED by default**. The mechanic
assertions are AUTHORITATIVE and decide the marker SOLELY; the advisory VLM (§7) never changes it.
1 milestone ↔ 1 verify ↔ 1 marker.

---

## 5. ON FAILED — the BOUNDED ≤3-cycle self-fix (fix the REAL code)

> Source: [repo] god-code error_loop/playtest_harness (bounded, structured feedback), OpenGame debug-skill
> (bounded loop + progress-check — DEDUP below); [E] abrarqasim "cap at 3, gains in first 2 rounds, stop
> on repeated error, classify mechanical-vs-logic", Silver-Bullet "feedback quality is the bottleneck",
> Lanham/RavindraTarunokusumo (stuck-detection + termination ladder); [R] "Debugging Decay" (GPT-4: 50%
> worse after 1 attempt, 80% after 3, 99% after 7).

On `VALIDATION_FAILED`, run a bounded repair loop, **capped at 3 cycles**. **The cap is
STRUCTURALLY ENFORCED by the harness, not by your adherence to this prose.** The self-fix loop is
you re-invoking `verify-milestone <project> <mid>` after each `src/**` edit; the harness owns a
PERSISTENT per-milestone attempt counter (sidecar `verify/.fixcycles-<mid>.json`) that it
reads+increments every invocation. It runs the initial pass + at most **3 self-fix re-verifies**;
on the 4th re-invoke for the same FAILED milestone it **refuses to run another verify** — it emits
`VALIDATION_FAILED: self-fix bound (3) exhausted — <last failures>` and exits **before booting
Chromium** (so a runaway re-invoke loop cannot burn cost or hit the node timeout). The counter
RESETS the moment the milestone passes (and is absent for a fresh milestone), so a genuine fix
re-run starts clean. **Do NOT try to defeat this** (e.g. by deleting the sidecar or changing the
project dir to dodge the counter) — the honest bound-exhausted FAILED is the correct output; faking
a clean slate to keep grinding is the forbidden reward-hack. Hitting the cap is a FEATURE.

```
cycle = 0
WHILE marker == FAILED AND cycle < 3:
    cycle += 1
    1. BUILD the fix context (rich — feedback quality is the bottleneck):
       - the failed assertion(s): each `describe` + `observe` + expected + OBSERVED (before/after)
       - the console/pageerror output
       - the failure screenshot path
       - the relevant MEMORY.md quirks (where score/status live, guards, capability gaps)
    2. DIAGNOSE the REAL root cause: a runtime assertion failure means the input→behavior→state path
       the assertion DESCRIBES is not truly implemented (the input isn't wired, score isn't written to
       the registry, the status flag isn't set at the real win point, an entity isn't in the right group).
       This is a LOGIC failure (self-repair ~45% — weak), so RECONSIDER the path; do not blindly rewrite.
    3. EDIT `src/**` GAME CODE ONLY to make the REAL behavior correct (scoped, root-cause).
       Reuse the W4 repair discipline (COPY/EXTEND/COMPOSE, KEEP-files boundary, the build-error table)
       from `../implement-milestone/SKILL.md` §7 — DEDUP, do not restate it here.
    4. RE-BUILD: run `npm run build`. A red post-fix build is a failed cycle — fix it (W4 §7 table) before re-booting.
    5. RE-VERIFY the WHOLE milestone (§2–§4): re-boot, re-run all assertions, re-aggregate the marker.
    6. PROGRESS / STALL CHECK: if the SAME failure signature (failed-assertion-id + observed-value pattern)
       repeats with no new pass → STALLED → break (no convergence; surfacing now beats burning cycles).
AFTER the loop: if marker still FAILED → SURFACE it honestly (exhausted or stalled). Record fixOutcome.
```

**Stop conditions (the ladder):** all assertions pass → done (the harness resets the counter); a boot/infra
error that isn't code-fixable → surface (don't burn cycles on a non-booting game); the same failure signature
repeats → **stalled** → stop early yourself (don't wait to hit the cap); **3 cycles reached → exhausted → the
harness refuses the 4th verify and emits the bound-exhausted marker for you**. **An honest `VALIDATION_FAILED`
after the bounded loop is the correct output** — it means the real mechanic genuinely doesn't work yet (often a real
capability gap W4 flagged). Hitting the cap is a FEATURE, not a defect. _([E] Lanham "bounded-stop is a
feature".)_

**ANTI-REWARD-HACK (absolute, restated because it is the heart of this step):** the fix step edits
`src/**` game code ONLY. It MUST NOT edit `spec/gdd.json`, the milestone's assertions, the `__GAME__`
hook adapter (the read-only seam in `main.ts`), or rewrite `MEMORY.md` to redefine the oracle. It NEVER
special-cases the hook to return a faked value, NEVER hard-codes an expected value into a getter, NEVER
disables/loosens a check. It implements the mechanic the assertion DESCRIBES, for real. _([repo] gamedevbench
sandbox; [E] 2511.16858 "disabling tests is the reward-hack", 2604.01476 "replace test with success" is forbidden.)_

If a fix reveals a genuine contract gap (the hook truly can't expose a field the assertion needs), expose
it via a read-only getter over REAL state in `main.ts`'s adapter (still real state, never faked) and append
a one-line MEMORY.md note — but if the field is missing because the MECHANIC isn't implemented, implement
the mechanic, not the getter.

---

## 6. WRITE `verify/report.json` (the proof-of-work)

> Source: this skill's `report.schema.json`; [repo] gameforge submit_qa_results, god-code write_failure_bundle,
> gamedevbench result.json; [E] SWE-bench results.json, ContractBench reward.json, DreamUp structured report.

Write `verify/report.json` validating against `report.schema.json`: `{milestoneId, marker, passed,
summary, assertions[] (per-assertion observed-vs-expected + status), buildHealth, fixCycles, fixEdits[],
fixOutcome, advisoryVlm, regression?, screenshots[], consoleErrors[], durationMs, startedAt}`. The report
is for a human (per-assertion detail, the fix trail, screenshots) AND the orchestrator (the binary marker).
Screenshots go to `verify/*.png`.

**Regression guard (pass-to-pass):** if a self-fix edited `src/**`, re-run the PRIOR milestones'
assertions once after the fix lands and record `regression.{priorMilestonesChecked, broke[]}`. A broken
prior milestone is a real problem (the fix introduced a regression) — record it. _([E] SWE-bench PASS_TO_PASS,
MobileGym unexpected-side-effects; [R] "agents break previously working code".)_

---

## 7. THE ADVISORY VLM SCREENSHOT REVIEW (does NOT block in v1)

> Source: [repo] god-code visual_regression (pixel-diff needs a baseline) + quality_gate (advisory tier);
> [E] 2603.22706 (VLM precision 0.50), VideoGameQA-Bench (high FP "not yet feasible autonomous"), MobileGym
> (10.2% misjudgment, "programmatic verification avoids this"), 2604.25235 ("rank but cannot score"), G1
> ("Inaccurate Reward Credit" — a VLM can reward a crashed game).

The screenshot review is **ADVISORY and NEVER blocks the marker in v1**. It has two cheap parts:
- **Deterministic "canvas not blank" check** (`toDataURL().length > 1000`): a blank canvas with passing
  assertions is a notable signal (the hook may report state while nothing renders) — record `canvasNotBlank`.
- **Optional VLM intent-alignment verdict**: feed the end-state screenshot + the milestone `goal` →
  a coarse 3-value flag (`looks_right`/`looks_off`/`inconclusive`). It TRIAGES for a human; it never
  changes the marker.

**Why advisory, not authoritative:** VLM precision ~0.50 (half of flagged "problems" are not problems);
high false-positive rates make autonomous VLM gating "not yet feasible"; the judge itself errs ~10%;
VLMs can rank but not reliably SCORE; and a VLM/screenshot signal can reward a crashed game (the
Inaccurate-Reward-Credit problem). There is also no BASELINE for a first-run game, so deterministic
pixel-diff regression is unavailable in v1. **The deterministic `__GAME__` mechanic assertions are the
credit-accurate authority; the screenshot is a triage aid.** Record `advisoryVlm{ran, flag, canvasNotBlank,
note}` in the report.

---

## 8. STOP — hand the marker to the orchestrator

A milestone verify is DONE — and only then do you stop — when ALL hold:
1. **The game booted headless and became `__GAME__.ready`** (or a boot failure is recorded as FAILED).
2. **Every assertion ran** (single-aggregate) and is recorded in `report.assertions[]` with observed-vs-expected.
3. **The VERBATIM marker is emitted** to stdout (`VALIDATION_PASSED` iff ALL pass, else `VALIDATION_FAILED`).
4. **The bounded ≤3-cycle self-fix ran on failure** and either reached PASSED or surfaced an honest FAILED (with `fixOutcome`).
5. **`verify/report.json` is written** (schema-valid) with screenshots, the fix trail, and the advisory VLM verdict.
6. **No oracle was edited** — `src/**` game code only; `spec/gdd.json`, the assertions, and the `__GAME__` hook are untouched.

The marker is the gate the orchestrator reads. On the pipeline, W4's NEXT milestone has been implementing
in parallel; your `VALIDATION_PASSED` advances the milestone spine, a `VALIDATION_FAILED` surfaces the real
failure. **This is the definition of "the game works" — not "the build succeeded".**

---

## 9. EDGE & FAILURE HANDLING

> Source: `assertion-execution-grammar.md` §6; [repo] gamedevbench no-marker=fail, god-code timeout=fail;
> [E] abrarqasim (stop-on-stall), Phaser (determinism). 

- **Game never becomes ready** (boot timeout / fatal console error) → `boot_failed` → `VALIDATION_FAILED:
  game did not become ready`. Feed the console error + screenshot to the fix step ONLY if it looks
  code-fixable (e.g. a `TypeError` in `create()`); a structurally non-booting game surfaces directly.
- **`observe` path missing on `__GAME__`** → assertion `error` ("observe path X not present"). Often a real
  capability/contract gap MEMORY.md flagged. The fix implements the missing MECHANIC (so the field becomes
  real) or exposes a read-only getter over REAL state — NEVER fakes the value.
- **A flaky timing assertion** → use the poll-to-settle within the bounded window (§3), not a sleep; the
  bounded settle gives a deterministic verdict (timeout → read → compare). Record the before/after near-miss.
- **An assertion that legitimately can't pass (known capability gap)** → it fails honestly. This is the
  CORRECT signal (W4 noted the gap; W1 may have over-specified). Do NOT fabricate the capability; after ≤3
  cycles, surface the real `VALIDATION_FAILED`. A real failure is a valuable output.
- **Canvas blank but assertions pass** → record `canvasNotBlank=false`; does NOT change the marker in v1
  (the mechanic is the gate), but flags it for a human / a future blocking-visual version.
- **A self-fix breaks the build** → re-run `npm run build` after every `src/**` edit, BEFORE re-booting; a
  red post-fix build is a failed cycle (`buildHealth.greenAfterFix=false`). Don't re-boot a broken build.
- **A fix introduces a regression** (a prior milestone's assertion now fails) → record `regression.broke[]`;
  the fix that broke a prior milestone is itself a failure to address (revert or repair within the cycle budget).

## 10. THE ARTIFACTS YOU WRITE / TOUCH

Relative to the project dir:
- **`verify/report.json`** — schema-valid (`report.schema.json`): the per-assertion proof + marker + fix trail + advisory VLM. `fixCycles` is the harness-owned count of self-fix re-verifies already run (0 = initial pass, 1..3 = self-fix passes); `fixOutcome=exhausted` once the bound is hit.
- **`verify/.fixcycles-<mid>.json`** — the harness-owned persistent bound counter (sidecar). NOT yours to edit/delete — the harness reads+increments it to enforce the ≤3 cap structurally and resets it on a pass.
- **`verify/*.png`** — screenshots (end state + per failure).
- **The verbatim marker** on stdout — the gate the orchestrator parses.
- **`src/**` (ONLY during a self-fix)** — scoped, root-cause GAME-CODE edits. **NEVER** `spec/gdd.json`, the
  assertions, the `__GAME__` hook adapter, or KEEP files (`Base*.ts`, `behaviors/*`, `systems/*`, `ui/*`, `utils.ts`).
- **`MEMORY.md`** (append only) — a one-line quirk if a fix revealed one (e.g. a real capability gap).

Do NOT write: `spec/*` (W1), `index.json`/`public/assets/**` (W2/W3), the template/engine, the `__GAME__`
hook contract, or any assertion. The oracle is immutable.

## 11. PI-PORTABILITY NOTE (for the workflow author)

W5 is a single `agent()` call invoked ONCE PER MILESTONE over the discovered-once milestone list (W1's
list; static default 3), PIPELINED with W4 (M(k) verifies while M(k+1) implements — sequential on the
same project dir for W5, the only cross-node concurrency being W3's parallel asset lane, which shares no
file). **The bounded ≤3 self-fix is an INTERNAL self-limited loop** (`while (cycle < 3 && !passed)`) — the
HAPPY PATH (passes first try, `fixCycles=0`) is what an extractor records; there is NO
verify-result-dependent workflow branch exposed (W5 either emits `VALIDATION_PASSED` or, after the internal
loop, surfaces `VALIDATION_FAILED`). The marker + `verify/report.json` are on-disk artifacts (filesystem-is-
contract). The boot/run is a `Bash`-runnable Playwright spec whose marker the script can assert on
independent of model output (the gamedevbench-style parser). Keep temperature low for the fix step —
runtime repair wants precision (wire the real API), not creativity.
