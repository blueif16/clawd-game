# W5 Assertion-Execution Grammar + `packages/verify/` Harness Spec

_Owner: **W5 Verify+Fix**. Status: **canonical / load-bearing**. This file commits the two contracts W5 owns on top of the W1 gdd assertion schema and the W2 `window.__GAME__` hook: (1) **how the declarative `setup → input → observe → expect` assertion compiles into Playwright actions + the `observe` evaluator + the comparator semantics**, and (2) **the precise SPEC for the `packages/verify/` runner that build-plan Phase 2 implements** (so that build task is unambiguous). Evidence: `research/skills/w5-verify-research.md`. Bound contracts it consumes: `write-gdd/gdd.schema.json` (the assertions) and `scaffold/template-contract.md` §3 (the `__GAME__` accessor + §3.4 observe grammar)._

> **The one-line invariant.** W5 is a **GENERAL INTERPRETER** over the committed gdd assertion schema — it never contains per-game test code. It compiles whatever assertions W1 wrote into Playwright actions, reads `window.__GAME__` (the read-only adapter W2/W4 populated from REAL live state), compares against the declarative comparator, and emits the verbatim marker. The W1 assertions + the gdd + the `__GAME__` hook are the **IMMUTABLE ORACLE**: W5's bounded fix step edits `src/**` game code ONLY (the web analogue of gamedevbench's anti-cheat sandbox — the oracle is outside the fix edit set).

---

## 1. The assertion shape W5 executes (recap of the W1 contract)

From `write-gdd/gdd.schema.json` (`milestones[].assertions[]`), each assertion is:

```jsonc
{
  "id": "M2-A1",                              // <milestoneId>-A<n>
  "describe": "pressing Up decreases player.y within 300ms",  // = the failure message
  "setup":  { "scene"?: "...", "state"?: { "player.health": 1 } },   // GIVEN (optional)
  "input":  { "type": "keyPress|keyHold|click|event|none", "key"?, "durationMs"?, "target"? }, // WHEN (optional)
  "observe": "player.y",                      // THEN — read off __GAME__ (the §3.4 grammar)
  "expect":  { "decreases": true }            // exactly ONE comparator key
}
```

`setup`/`input` are optional (an at-scene-start check has neither and is a pure observe). `observe` + `expect` are required. Assertions are 1:1 with `acceptanceCriteria`. W5 runs **every** assertion of the milestone (single-aggregate), not fail-fast.

---

## 2. Compilation: `setup → input → observe → expect` → Playwright actions

For each assertion, in order. (`page` = the booted, ready, canvas-focused Playwright page; see the harness spec §5.)

### 2.1 Decide if the comparator needs a BEFORE read
- **Relative comparators** — `decreases`, `increases`, `changes`, `unchanged` — need a `before` value. Read `observe` **after `setup`, before `input`**.
- **Absolute comparators** — `equals`, `atLeast`, `atMost` — need only an `after` value. Skip the before read.

### 2.2 `setup` (GIVEN) — establish the precondition
- `setup.scene` present and != current → drive to that scene via the sanctioned command (`__GAME__.commands.reset()` to the level, or navigate `?level=<scene>` if the template supports it). Re-wait `__GAME__.ready` and re-focus the canvas.
- `setup.state` present → apply each `field → value` via the SANCTIONED command only:
  `await page.evaluate((patch) => window.__GAME__.commands.setState(patch), setup.state)`.
  **Use sparingly and ONLY to establish a precondition (e.g. `{ "player.health": 1 }` so a death-on-next-hit can be checked) — NEVER to set the OBSERVED outcome (that would fake the pass).** Prefer natural state (reach the precondition via real input) when feasible.
- No `setup` → the fresh ready scene is the precondition.

### 2.3 BEFORE read (relative comparators only)
`const before = await page.evaluate((expr) => __evalObserve(window.__GAME__, expr), observe);`
(`__evalObserve` = the §3 evaluator, injected once via `addInitScript` — see §3.4.)

### 2.4 `input` (WHEN) — fire the synthetic input
Re-focus the canvas first (`await page.locator('canvas').focus()` — Phaser loses focus; without this, keyboard events never reach Phaser's KeyboardPlugin). Then by `input.type`:

| `input.type` | Playwright action | Notes |
|---|---|---|
| `keyPress` | `await page.keyboard.press(input.key)` | A single tap. `input.key` is a DOM key name (`'ArrowUp'`, `'Space'`); must appear in `gdd.controls[]`. |
| `keyHold` | `await page.keyboard.down(input.key); await page.waitForTimeout(input.durationMs ?? 200); await page.keyboard.up(input.key)` | A timed hold. The `waitForTimeout` here is a **HOLD duration, not a readiness wait** (allowed). |
| `click` | resolve `input.target` (an entity id) to a canvas position via `__GAME__.entities` lookup, then `await page.locator('canvas').click({ position: { x, y } })` | Canvas content has no DOM — click by COORDINATE relative to the canvas, never `getByRole`. If the entity can't be located, the assertion errors (recorded). |
| `event` | trigger the REAL interaction the event names (`target:'overlap:player,coin'` → drive the player's OWN documented `controls[]` toward the target until the interaction fires for real); use a `commands`-sanctioned trigger ONLY if no natural input reaches it | **NEVER** `setState` the observed outcome directly. The event must happen for real. **The driver is GENERIC** (see §2.4.1): it resolves the target by gdd role, derives movement keys from `controls[]`, and drives both axes toward the goal in a bounded budget. If the target is unreachable within budget, the driver does NOT error — it lets the comparator read the real (still-unwon) state and **FAIL honestly** (the unwinnable-level signal). |
| `none` / absent | (no input) | A pure at-scene-start observe. |

#### 2.4.1 The generic `event` / win-path driver (`compile.ts:driveEvent`)
The `event` input drives the player's OWN documented controls toward the named target until the REAL interaction fires — **archetype-agnostic, derived ONLY from `__GAME__` observables + the gdd's `entities[]`/`controls[]`** (no genre constants, no per-game special-casing). The same code reaches a platformer exit, a top_down goal, a grid goal tile, a collected coin:
- **Resolve the target by ROLE, not literal name.** `parseEventTargetRef` takes the 2nd operand of `overlap:a,b` (or a bare ref); `resolveTargetRefs` maps that gdd `entities[].id` to its `role` (the hook's `entities[].type` vocabulary — `goal|collectible|obstacle|enemy|tower|…`). The live lookup then matches on **id OR type OR role** (whichever the W4 build tagged). _(This is the fix for the M3-A1 false-error: the gdd named `exit`, but the hook tags the door `type:'goal'`.)_
- **Derive movement keys from `controls[]`.** `deriveMovementKeys` classifies each documented control by its DOM key (`ArrowUp`/`w`, `ArrowRight`/`d`, …) and action keywords (`jump`/`up`, `right`/`east`, …) into right/left/up/down intents; falls back to the universal arrow keys if `controls[]` is absent.
- **Drive both axes toward the goal, bounded.** Each step reads live `player.{x,y}` + the target's `{x,y}` off `__GAME__`, holds the documented key that REDUCES `|dx|` (continuous walk), and TAPS the up/down key when the target is meaningfully above/below (a jump is a discrete press). Bounded by a step + wall-clock budget (wait-on-state, never a blind sleep).
- **Terminate on the REAL interaction.** The loop ends when the target entity is GONE (consumed/collected) OR true 2D overlap is reached; a brief one-time settle lets the engine's overlap/win callback latch before the AFTER read.
- **Anti-reward-hack + honest failure.** The driver issues ONLY real key input and reads ONLY observable state to pick a direction — it **NEVER** writes `status`/the observed field. It returns an input-error ONLY when there is no player to drive. When the goal is unreachable within budget it returns OK anyway, so the comparator reads the real state and **FAILS** (never errors-as-"unsupported") — the unwinnable-level signal the Bucket-3 win-path assertion depends on.

### 2.5 AFTER read + the within-window poll for relative timing
- Default: `const after = await page.evaluate((expr) => __evalObserve(window.__GAME__, expr), observe);`
- **Timed relative assertions** (a `keyHold`/`describe` implies "within Nms", or the effect needs frames to settle): after firing, **poll** the observable to satisfy the comparator within a bounded window rather than assume a fixed frame count:
  `await page.waitForFunction(([expr, b]) => __comparatorSettled(window.__GAME__, expr, b), [observe, before], { timeout: settleMs }).catch(() => {})`
  then read `after`. `settleMs` defaults to `max(durationMs + 250, 500)` capped at a per-assertion ceiling (e.g. 2000ms). On timeout, read `after` anyway and let the comparator decide (fail). **This is wait-on-state, never a blind sleep.**

### 2.6 `expect` — compare (the comparator semantics)
Exactly one comparator key is set. Evaluate:

| comparator | needs | passes iff |
|---|---|---|
| `decreases: true` | before, after | `after < before` (numeric) |
| `increases: true` | before, after | `after > before` (numeric) |
| `changes: true` | before, after | `after !== before` (direction-agnostic; deep-equals for arrays/objects) |
| `unchanged: true` | before, after | `after === before` |
| `equals: X` | after | `after === X` (number\|string\|boolean; strict) |
| `atLeast: N` | after | `after >= N` (numeric) |
| `atMost: N` | after | `after <= N` (numeric) |

- A comparator whose `observe` resolved to `undefined`/`null` (missing path) → **status `error`**, message `observe path <expr> not present on __GAME__` (a real contract/capability gap — see §6), counted as a failure for the marker.
- A relative comparator on a non-numeric before/after where ordering is undefined (`decreases` on a string) → `error` with a clear message (W1 should not author this; recorded if it happens).

### 2.7 Record the per-assertion result
Append to `report.assertions[]`: `{ id, describe, observe, comparator, expected, observed: <after | {before, after}>, status: pass|fail|error, message?, screenshot? }`. On fail/error, capture a screenshot.

---

## 3. The `observe` mini-grammar evaluator (W5-owned; template-contract §3.4)

W5 owns evaluating the grammar; the template only owns exposing the underlying fields on `__GAME__`. The grammar is intentionally tiny and closed.

### 3.1 Supported forms
- **Dot-paths** (read a primitive field, possibly nested one level):
  `player.x`, `player.y`, `player.vx`, `player.vy`, `player.health`, `player.maxHealth`, `player.gridX`, `player.gridY`, `player.facingDirection`, `player.isGrounded`, `player.isDead`, `score`, `status`, `scene`, `ready`, `moveCount`, `maxMoves`, `gold`, `lives`, `waveIndex`, `playerHP`, `enemyHP`, `phase`.
- **The count helper** (the ONLY function form):
  `entities.count(type==<T>)` → `window.__GAME__.entities.filter(e => e.type === '<T>').length`, where `<T>` ∈ the entity type vocabulary (`player|enemy|collectible|obstacle|goal|tower|projectile`).

### 3.2 Evaluation rules
- A dot-path reads live from the read-only adapter each access (getters), so W5 always sees current state.
- A path whose head (`player`) is `null` → the whole expression resolves to `undefined` (the assertion errors with a clear message), never throws. (E.g. `player.x` before the player exists.)
- A path that doesn't apply to the archetype (`gold` on a platformer) → `undefined` → `error` "observe path not present" (a real signal: W1 authored an assertion the archetype can't satisfy).
- The grammar is CLOSED. If a future game needs a richer predicate, **W5 extends the grammar here** (the template only owns the fields). v1 supports exactly §3.1.

### 3.3 Reference evaluator (the function injected into the page)
```js
function __evalObserve(game, expr) {
  if (game == null) return undefined;
  const m = expr.match(/^entities\.count\(type==([a-z_]+)\)$/);
  if (m) return Array.isArray(game.entities) ? game.entities.filter(e => e && e.type === m[1]).length : undefined;
  // dot-path, max one level of nesting under a top-level key
  const parts = expr.split('.');
  let v = game;
  for (const p of parts) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}
function __comparatorSettled(game, expr, before) {
  const after = __evalObserve(game, expr);
  // used only for the relative-settle poll; returns true once the value has moved off `before`
  return after !== undefined && after !== before;
}
```
Injected ONCE per page via `addInitScript` (before the game boots) so it's available to every `page.evaluate`. It reads only `__GAME__` (never raw Phaser/engine objects). It is W5 infrastructure, NOT part of the game and NOT part of the oracle.

### 3.4 Why read state, not pixels
W5 reads observable GAME STATE off `__GAME__` (deterministic, credit-accurate), never canvas pixels for mechanic assertions. Pixel/visual judgement is the ADVISORY layer only (§7 of the SKILL). _([repo] gamedevbench observable-state assertions; [E] Phaser "don't test pixels in the main suite"; G1 "Inaccurate Reward Credit" — a pixel/VLM signal can reward a crashed game.)_

---

## 4. The marker contract (exact, verbatim, portable)

After running ALL of the milestone's assertions:
- **All pass** (and the game booted/became ready with no fatal console error) → print exactly:
  `VALIDATION_PASSED: <milestoneId> all <N> assertions passed`
- **Any fail/error** → print exactly:
  `VALIDATION_FAILED: <describe of failure 1>; <describe of failure 2>; …`  (the failed assertions' `describe` strings, '; '-joined — the gamedevbench `issues[]` shape).
- **Never became ready / crashed / no marker reached** → print:
  `VALIDATION_FAILED: game did not become ready (boot failed)` (or the captured fatal error).

Parser contract (the orchestrator's side stays trivial — ported from gamedevbench `validation.py`):
`/VALIDATION_PASSED(?::\s*(.+))?/` and `/VALIDATION_FAILED(?::\s*(.+))?/`; first marker found wins; **a missing marker = FAILED by default**. One milestone ↔ one verify spec ↔ one marker. _([repo] gamedevbench validation.py; [E] OpenSWE exit-code-marker absent=fail.)_

---

## 5. `packages/verify/` harness SPEC (what build-plan Phase 2 implements)

A small, focused Playwright runner. It is the executable engine the W5 SKILL drives. **It is a general interpreter — it takes the gdd + the project dir, it contains zero per-game logic.**

### 5.1 Layout
```
packages/verify/
  package.json            # deps: @playwright/test (or playwright), the project's own build is separate
  src/
    harness.ts            # the boot + run-one-milestone engine (the core)
    observe.ts            # __evalObserve / __comparatorSettled (injected into the page) + the comparator fns
    compile.ts            # assertion -> Playwright action sequence (the §2 compiler)
    marker.ts             # format + parse the VALIDATION_PASSED/FAILED marker (the §4 contract)
    report.ts             # build + write verify/report.json (validates against report.schema.json)
    vlm.ts                # OPTIONAL advisory screenshot review (the §7 advisory layer); no-op stub allowed in v1
  bin/
    verify-milestone.ts   # CLI: verify-milestone <projectDir> <milestoneId> -> prints the marker, writes report.json, exits 0 (always; the marker is the signal, not the exit code)
```

### 5.2 The boot procedure (`harness.ts`) — the exact sequence
1. **Serve the built game.** Run the project's preview server (`npm run preview` / `vite preview`) OR `vite build` then serve `dist/` — the harness boots the BUILT artifact, not the dev server (W4 guaranteed `npm run build` green). Capture the served URL.
2. **Launch real headless Chromium** (NOT `Phaser.HEADLESS`): `chromium.launch({ headless: true, channel: 'chromium', args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] })`. `--use-gl=swiftshader` = software WebGL (no GPU); `channel:'chromium'` = the new headless mode (same code as headed). _([E] Barth Cave swiftshader; Currents new-headless-mode.)_
3. **New context with a FIXED viewport** (determinism): `newContext({ viewport: { width: 800, height: 600 } })` (or the template's `screenSize`). `newPage()`.
4. **Inject the evaluator + seed determinism BEFORE load:** `page.addInitScript(<observe.ts source>)`; optionally `addInitScript(() => { /* fix Math.random if no commands.seed */ })`.
5. **Capture errors:** `page.on('console', m => m.type()==='error' && consoleErrors.push(m.text()))`; `page.on('pageerror', e => consoleErrors.push(String(e)))`.
6. **Navigate (never sleep):** `page.goto(url, { waitUntil: 'load', timeout: 30000 })` (NOT `networkidle` — unreliable).
6b. **Advance past any start/title gate, THEN wait for READY.** A template may gate `ready` behind a start/title scene that needs a generic "begin" input (e.g. the platformer's `TitleScreen` accepts ENTER/SPACE/pointerdown), so a literal goto→wait-ready would hang on the title with `scene:null`. Drive the engine's archetype-AGNOSTIC start inputs — `await page.locator('canvas').focus()`, then press `Enter`, press `Space`, and `page.click('canvas')` — polling until ready (bounded). NEVER special-case a specific game; these are the universal "begin" inputs the template's start scene accepts. Then `page.waitForFunction(() => window.__GAME__ && window.__GAME__.ready === true, { timeout: 15000 })`. On timeout → boot_failed → `VALIDATION_FAILED: game did not become ready`. A FATAL console error during boot → boot_failed. _(Surfaced building the Phase-2 harness against the real template; implemented there as `harness.ts:advanceToReady`.)_
7. **Focus the canvas** (the Phaser keyboard gotcha): `await page.waitForSelector('canvas'); await page.click('canvas')`.
8. **Optional settle:** poll a few frames after ready (`waitForFunction` on a frame-count or a short bounded `waitForTimeout` ≤200ms) so the first interactive frame has rendered. (This is a one-time settle, not a per-assertion sleep.)

### 5.3 Run-one-milestone (`harness.ts` + `compile.ts`)
- Read `spec/gdd.json`; select `milestones[milestoneId]`. Read `MEMORY.md` (quirks; e.g. "score in registry", "overlap guarded", capability gaps).
- For each assertion in order: compile + execute per §2; record the per-assertion result; capture a screenshot at the end and on each failure.
- Aggregate per §4; build `report.json` per the schema; write it.
- Print the marker. Exit 0 (the marker is the signal; the exit code is not the gate — matches gamedevbench, where the marker is parsed from output).

### 5.4 What the harness does NOT do
- It does NOT edit any file (the SELF-FIX is the SKILL's job — the harness only OBSERVES and reports; the agent edits `src/**` between harness runs).
- It does NOT contain per-game logic (general interpreter).
- It does NOT block on the VLM (advisory; `vlm.ts` may be a no-op stub in v1).
- It does NOT touch `spec/gdd.json`, the assertions, or the `__GAME__` hook adapter.

### 5.5 Determinism checklist the harness honors
Fixed viewport · software WebGL · `addInitScript` seed (or `commands.seed`) · wait-on-`ready` not sleep · read STATE not pixels · assert only stable gameplay fields (position/score/status), never shake/particle/RNG-tainted fields · timed assertions poll-to-settle within a bounded window. _([E] Phaser issue #3361 deterministic-mode; colyseus fixed-tick; w5-research §3.2.)_

### 5.6 Phase-2 done-criteria (from build-plan)
Hand-written assertions for the platformer template pass via `verify-milestone <dir> M1` → `VALIDATION_PASSED`; a deliberately broken build (e.g. ArrowUp unwired) yields `VALIDATION_FAILED` + a screenshot, and the SKILL's bounded fix loop (driven on top of the harness) repairs it (or exhausts after 3 and surfaces honestly).

---

## 6. Edge handling (the harness + SKILL must handle these deterministically)

| Situation | Handling |
|---|---|
| **Game never becomes ready** (boot timeout / fatal console error) | `boot_failed` → `VALIDATION_FAILED: game did not become ready`. Do NOT burn self-fix cycles blindly; the fix step gets the console error + screenshot (a boot crash is fixable, but it's a distinct outcome). |
| **`observe` path missing on `__GAME__`** | Assertion status `error`, message `observe path <expr> not present on __GAME__`. Counts as a failure. Often a real capability/contract gap MEMORY.md may have flagged (§6 of the contract). The fix step exposes the field over REAL state (per template-contract) or implements the missing mechanic — NEVER fakes the value. |
| **A flaky timing assertion** | Use the poll-to-settle within the bounded window (§2.5), not a blind sleep. If it still flickers, the bounded settle gives a deterministic verdict (timeout → read → compare). Record the observed before/after so a human can see a near-miss. |
| **An assertion that legitimately can't pass (known capability gap in MEMORY.md)** | The assertion fails honestly (`VALIDATION_FAILED`). This is the CORRECT signal (W4 noted the gap; W1 may have over-specified). The fix step should NOT fabricate the capability; after ≤3 cycles, surface the real failure. A real FAILED is a valuable output, not a defect. |
| **Canvas blank but assertions pass** | Record `advisoryVlm.canvasNotBlank = false` (a notable advisory signal — the hook may report state while nothing renders). Does NOT change the marker in v1 (the mechanic is the gate), but it's a flag for a human and for a future blocking-visual version. |
| **A self-fix edit breaks the build** | After any `src/**` fix edit, re-run `npm run build` BEFORE re-booting (reuse `implement-milestone` §7). A red post-fix build is a FAILED fix cycle (`buildHealth.greenAfterFix=false`); don't re-boot a broken build. |

---

## 7. The anti-reward-hack guardrails (structural — the heart of this contract)

1. **The fix step's edit set is `src/**` GAME CODE ONLY.** It MUST NOT edit `spec/gdd.json`, the milestone's assertions, the `__GAME__` hook adapter (`main.ts`'s read-only seam), or `MEMORY.md`-to-rewrite-the-oracle. The oracle (assertions + gdd + hook) is OUTSIDE the edit set — the web analogue of gamedevbench's sandbox that hides the test from the solver. _([repo] gamedevbench benchmark_runner sandbox; [E] OpenSWE legitimacy-check, ContractBench hidden-validator, 2511.16858 "hiding the test reduces overfitting".)_
2. **The fix makes the REAL input→behavior→state path true.** It wires the input, writes `score` to the registry, sets the `status` flag at the real win/lose point — so the OBSERVABLE becomes genuinely correct. It NEVER special-cases the hook to return a faked value, NEVER hard-codes an expected value into a getter. _([repo] W4 §6 anti-reward-hack; [E] 2604.01476 "replace test with unconditional success" is the forbidden mode.)_
3. **Assert observable state, not implementation.** The grammar (§3) reads only `__GAME__` observable accessors. A behavioral assertion ("player.y decreased after Up") can only be satisfied by real behavior — faking is impossible AND pointless (the real mechanic is the same work). _([repo] gamedevbench "validate behavior not implementation".)_
4. **A missing marker / never-ready = FAILED.** The absence of a genuine pass is a fail — the fix step cannot win by making the harness crash or hang. _([repo] gamedevbench validation.py no-marker=fail.)_
5. **Exhaustion surfaces an honest FAILED.** After ≤3 cycles (or a stall), W5 emits `VALIDATION_FAILED`. A real failure is the correct, valuable output — never massage the marker to green. _([E] Lanham "bounded-stop is a feature"; abrarqasim "debugging decay".)_

These five make reward-hacking the oracle structurally impossible (the oracle is un-editable by the fix step) and pointless (real behavior is the same effort). They are the reason a `VALIDATION_PASSED` from W5 genuinely means "the game works".
