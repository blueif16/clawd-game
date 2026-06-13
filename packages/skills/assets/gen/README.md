# W3 real-asset generator (`gen/`)

A self-contained, offline-keyed image-generation tool the **W3 (assets) node**
invokes via Bash to fill `public/assets/` with **real** sprites/backgrounds —
the `gemini` mode the SKILL describes. It is driven entirely by the project's
**`index.json`** (the frozen W2 slot manifest) + **`spec/gdd.json`** (art
direction). Placeholder mode stays the SKILL's floor; this tool only does real
generation and **degrades to placeholder cleanly** when it can't.

Ported from the proven Omniscience generator (batch-grid + local chroma key +
the Gemini call shape), with **all Supabase / DB / network-bg-removal stripped**:
we write PNGs to local disk and key the plain background out **locally** (free,
offline). Zero game-specific hard-coding — everything flows from the manifest.

## CLI contract (what the SKILL/chain calls)

```bash
packages/skills/assets/gen/.venv/bin/python \
  packages/skills/assets/gen/generate_assets.py \
  --index   <projectDir>/index.json \
  --gdd     <projectDir>/spec/gdd.json \
  --out     <projectDir>/public/assets \
  [--style  "<artStyle override; else gdd.meta.artStyle>"] \
  [--mode   gemini|placeholder]      # default gemini
  [--model  <id>]                    # default gemini-2.5-flash-image
  [--only   slot_a,slot_b]           # generate a subset (else all slots)
  [--limit-batches N]                # cap Gemini calls (cheap self-test); rest -> pending
  [--no-anchor]                      # disable style-anchor reference image
  [--delay  SECONDS]                 # between calls (rate-limit; default 1.0)
```

### Exit codes (the contract the SKILL branches on)
| code | meaning |
|---|---|
| `0` | ran; each slot is `generated` or left `pending` (per-slot degrade recorded) |
| `2` | bad invocation (index.json not found) |
| `3` | **degrade to placeholder** — no API key resolved, or `--mode placeholder`. The SKILL keeps placeholder as the floor. Never a crash. |

A `0` exit with some slots still `pending` is normal and safe: those slots fall
to the SKILL/Preloader placeholder. The tool **never aborts the whole run for
one slot**.

## API key (never printed, never tracked)
Resolved in order: env `GOOGLE_API_KEY` → env `GEMINI_API_KEY` → the gitignored
repo-root file **`.env.assets`** (4 dirs up from this tool). If none resolves →
exit `3`. The key value is never logged or written into any tracked file.

## What it does per slot type
| slot `type` | strategy |
|---|---|
| `sprite`, `image` | **batched** into grids (≤9 cells, side by count: 1→1×1, ≤4→2×2, ≤9→3×3), one Gemini call per grid → split → **local** `key_white_to_transparent` → `normalize_object_canvas` → `fit:contain` to exact slot dims (transparent PNG). |
| `animation` (`frames[]`) | the named frames as labeled grid cells of the **same** entity (distinct poses, style-anchored) → key each → fit to per-frame dims → assemble a **horizontal strip** `(frames.length × width) × height`. Falls back to a single keyed frame tiled across the strip; **always** ends at correct strip dims. |
| `background` | **single** call at the slot's nearest supported aspect ratio → `fit:cover` → **fully opaque** RGB (no alpha holes). |
| `tileset` | **single** seamless tile, fit to slot dims, opaque. |
| `audio` | **not generated** — left for the SKILL's placeholder WAV. |

**Style consistency:** the first successfully generated sprite/animation sheet
becomes the **style anchor**, passed as an inline reference image on every later
call so the set stays coherent (`--no-anchor` to disable).

## Outputs
- `public/assets/<subdir>/<slot>.png` — `sprites/ images/ tiles/ backgrounds/`
  by type (the SKILL's layout).
- `index.json` updated **in place, parallel-safely**: only each filled slot's
  `path` + `status` (`generated`) + refined `width`/`height`. Slot **keys/order
  and `archetype`/`assetsDir` are never touched.** `manifest === bytes` holds —
  written-back dims equal the actual per-frame file dims (for `animation`, file
  width === `frames.length × width`).
- `public/assets/_provenance.json` — prompt/model/date/dims per slot (the seed of
  a reusable asset library).

## Dependencies / Pi-portability
`requirements.txt` pins `google-genai`, `pillow`, `numpy` (the proven Omniscience
set). Provision the bundled venv once:

```bash
python3 -m venv packages/skills/assets/gen/.venv
packages/skills/assets/gen/.venv/bin/python -m pip install -r packages/skills/assets/gen/requirements.txt
```

The `.venv/` is gitignored. On a cheap Pi executor lacking these deps (or a key),
the tool exits `3` and W3 keeps placeholder — generation is a clean **toggle**,
never a hard requirement.

## Self-test
```bash
# Generate a background + a sprite batch + one animation into a scratch dir:
packages/skills/assets/gen/.venv/bin/python \
  packages/skills/assets/gen/generate_assets.py \
  --index /tmp/scratch/index.json --gdd /tmp/scratch/spec/gdd.json \
  --out /tmp/scratch/public/assets --only bg_level,greenhouse_door,terrace,player
```
Confirm real PNGs at exact slot dims, sprites transparent, background opaque,
animation strip width === frames × per-frame width, and `index.json` valid
against `../../scaffold/index.schema.json`.
```
