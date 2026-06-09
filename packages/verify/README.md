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

- It does **not** edit any file (the self-fix loop is the W5 *agent's* job; this
  runner only observes + reports).
- It does **not** contain per-game logic (general interpreter).
- It does **not** block on the VLM (advisory only).
- It does **not** touch `spec/gdd.json`, the assertions, or the `__GAME__` hook
  (the oracle is outside the harness's concern — it reads observable state only).

## Determinism (grammar §5.5)

Fixed 800×600 viewport · software WebGL (`--use-gl=swiftshader`) ·
`addInitScript` injects the evaluator before load · wait-on-`__GAME__.ready`
(never sleep) · reads observable STATE not pixels · timed/relative assertions
poll-to-settle within a bounded window (`max(durationMs+250, 500)`, cap 2000ms).
