# game-omni gallery

A tiny, **zero-dependency** local front end for the games the `game-omni` pipeline
produces. It scans a directory, reads the artifacts each game already writes, and
shows the **newest game playable on top** with a **bento of the key facts** below.

```bash
node apps/gallery/server.mjs           # -> http://localhost:4321
GAMES_DIR=/abs/path PORT=8080 node apps/gallery/server.mjs
```

## What counts as a game
Any directory (depth ≤ 3 under `GAMES_DIR`, default `../../out`) that contains
`spec/classification.json`. So it works whether a run wrote to `out/game`,
`out/games/<name>/`, or anywhere else — just point `GAMES_DIR` at the parent.
**To get a real gallery, give each run a distinct `projectDir`** (e.g.
`out/games/<slug>`); same-dir runs overwrite and show as one game.

## What it reads (and nothing it writes)
| Artifact | Surfaced as |
|---|---|
| `spec/classification.json` | archetype · physics · core loop · scope-cut · confidence |
| `spec/gdd.json` | title · controls · win/lose · milestones · entities/mechanics/assets counts |
| `index.json` | asset readiness + poster sprite |
| `verify/report*.json` | VALIDATION_PASSED/FAILED · assertions passed · fix cycles _(W5)_ |
| artifact presence | the W0→W5 pipeline status dots |
| `dist/index.html` | the **playable** build shown in the cabinet (else a poster) |

It **invents no data model** — it only projects keys the pipeline already commits.
Known-but-unsure-of-shape signals (Hermes per-skill improvement deltas, the design
doc) are **commented out** in `public/app.js` (`verifyCard`) ready to wire once W5 /
Hermes land.

## Samples
`out/games/coin-dash/` (fully playable, verified) and `out/games/orbit-dodger/`
(pre-build, poster mode) are **sample fixtures** so the UI is non-empty. Delete them
once real games land.
