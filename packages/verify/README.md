# @game-omni/verify — the W5 verify harness

The runner the **W5 Verify+Fix** node invokes to prove ONE milestone works at
runtime. It is a **general interpreter** over the committed gdd assertion schema
— it contains **zero per-game test code**. It boots the BUILT Phaser game
headless (real Chromium + software WebGL via Playwright), compiles each
`{setup, input, observe, expect}` assertion into Playwright actions, evaluates
the `observe` grammar off `window.__GAME__`, compares the declarative comparator,
and emits the verbatim `VALIDATION_PASSED` / `VALIDATION_FAILED` marker.

Canonical spec: `packages/skills/verify/assertion-execution-grammar.md` §5.
Report shape: `packages/skills/verify/report.schema.json`.

## Install

```bash
cd packages/verify
npm install
npx playwright install chromium    # one-time: download the Chromium build
```

## Use

```bash
# verify one milestone of a built project
npm run verify-milestone -- <projectDir> <milestoneId>
#   e.g.
npm run verify-milestone -- /tmp/gv-proj M1
```

`<projectDir>` must contain:
- `spec/gdd.json` — the milestone's `assertions[]` (the oracle; read-only).
- `dist/` — the BUILT game (run the project's `npm run build` first).

Output:
- the verbatim marker on **stdout** (the gate the orchestrator parses).
- `<projectDir>/verify/report.json` — per-assertion observed-vs-expected, marker,
  screenshots, advisory VLM (valid against `report.schema.json`).
- `<projectDir>/verify/*.png` — end-state + per-failure screenshots.

The CLI **always exits 0** — the marker is the signal, not the exit code
(a missing marker = FAILED by default).

## Structural ≤3 self-fix bound (`src/fixcycles.ts`)

The W5 self-fix loop is the **agent re-invoking `verify-milestone <project> <mid>`** after each
`src/**` edit. The harness is stateless per invocation, so to make the SKILL's **≤3-cycle** bound
ENFORCED (not trusted to the model), the harness owns a **persistent per-milestone attempt counter**
in a sidecar `<projectDir>/verify/.fixcycles-<mid>.json`. Each invocation reads+increments it:

- It runs the **initial pass + at most 3 self-fix re-verifies** (so `report.fixCycles` is 0 on the
  initial pass, 1..3 on a self-fix pass).
- On the **4th re-invoke** for a still-FAILED milestone, the harness **refuses to run another verify**:
  it emits `VALIDATION_FAILED: self-fix bound (3) exhausted — <last failures>` and returns
  **before launching Chromium** — so a runaway re-invoke loop cannot burn cost or hit the node timeout.
- The counter **resets** (sidecar removed) the moment a milestone **passes**, and is absent for a fresh
  milestone — each milestone gets its own independent budget; a re-run after a genuine fix starts clean.

**Anti-reward-hack:** at the bound the harness emits an HONEST `VALIDATION_FAILED` carrying the last
real failures. It NEVER fakes a pass, never weakens an assertion, never touches the oracle — it only
STOPS the fix loop. An honest FAILED after 3 cycles is the correct output.

## Layout (grammar §5.1)

```
packages/verify/
  package.json            # pins playwright 1.56.1
  src/
    harness.ts            # boot (static-serve dist/, launch Chromium swiftshader,
                          #   inject evaluator, wait-on-ready, focus canvas) + run-one-milestone
    observe.ts            # __evalObserve/__comparatorSettled (injected) + the §2.6 comparator table
    compile.ts            # assertion -> Playwright actions (the §2 compiler)
    marker.ts             # format + parse the §4 marker (verbatim + the two-line parser)
    report.ts             # build + write verify/report.json (schema-valid)
    vlm.ts                # advisory canvas-not-blank check (NEVER blocks the marker)
  bin/
    verify-milestone.ts   # CLI: verify-milestone <projectDir> <milestoneId>
```

## What it does NOT do

- It does **not** edit any GAME file (the self-fix loop is the W5 *agent's* job; this
  runner only observes + reports). It writes ONLY its own artifacts under `verify/`
  (`report.json`, screenshots, and the bound counter `.fixcycles-<mid>.json`).
- It does **not** contain per-game logic (general interpreter).
- It does **not** block on the VLM (advisory only).
- It does **not** touch `spec/gdd.json`, the assertions, or the `__GAME__` hook
  (the oracle is outside the harness's concern — it reads observable state only).

## Determinism (grammar §5.5)

Fixed 800×600 viewport · software WebGL (`--use-gl=swiftshader`) ·
`addInitScript` injects the evaluator before load · wait-on-`__GAME__.ready`
(never sleep) · reads observable STATE not pixels · timed/relative assertions
poll-to-settle within a bounded window (`max(durationMs+250, 500)`, cap 2000ms).
