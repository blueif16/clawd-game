#!/usr/bin/env python3
"""
W3 real asset generator for game-omni — self-contained, evidence-grounded.

Driven entirely by the project's index.json (the frozen W2 asset SLOT manifest)
+ spec/gdd.json (art direction). Turns each slot into a real PNG via Gemini
("Nano Banana"), keys the plain background out LOCALLY (no network bg-removal,
no Supabase), fits to exact slot dims, and writes back ONLY each filled slot's
path/status/(refined dims) — never touching slot KEYS or order.

Strategy per slot type (the SKILL contract):
  - sprite / image  ........ BATCH into grids (<=9 cells, side by count),
                             one Gemini call per grid -> split -> local key ->
                             normalize -> fit:contain to slot dims (transparent).
  - animation (frames[]) ... generate the named frames as labeled grid cells
                             (same entity, distinct poses), key each, fit to
                             per-frame dims, then assemble a HORIZONTAL STRIP
                             (frames.length * width) x height. Falls back to a
                             single keyed frame tiled across the strip.
  - background ............. SINGLE call at the slot's aspect ratio, fit:cover,
                             FULLY OPAQUE (no transparency).
  - tileset ................ SINGLE seamless tile at slot dims.
  - audio .................. NOT generated (left for the placeholder WAV).

Graceful degradation:
  - No resolvable API key -> exit 3 ("degrade to placeholder"); never crash.
  - Any single slot that fails -> left with status 'pending'/reason recorded;
    the SKILL/Preloader covers it. NEVER aborts the whole run for one slot.

CLI:
  python generate_assets.py --index <proj>/index.json --gdd <proj>/spec/gdd.json
      --out <proj>/public/assets [--style "<artStyle>"] [--mode gemini|placeholder]
      [--model <id>] [--only <slot,slot>] [--limit-batches N] [--no-anchor]

Game-agnostic: zero game/slot/case is hard-coded; everything flows from args.
"""

import argparse
import io
import json
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

from PIL import Image

# Local, self-contained helpers (copied INTO game-omni — no Omniscience import).
import image_ops
import prompt_library as plib
from gemini_client import DEFAULT_MODEL, GeminiImageClient

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Gemini image_config.aspect_ratio only accepts this fixed set; snap to nearest.
SUPPORTED_ASPECTS = {
    "1:1": 1.0, "2:3": 2 / 3, "3:2": 3 / 2, "3:4": 3 / 4, "4:3": 4 / 3,
    "4:5": 4 / 5, "5:4": 5 / 4, "9:16": 9 / 16, "16:9": 16 / 9, "21:9": 21 / 9,
}

GRID_BATCH_LIMIT = 9
# Sub-dir per type (matches the W3 SKILL §3 file layout).
TYPE_SUBDIR = {
    "sprite": "sprites", "image": "images", "animation": "sprites",
    "tileset": "tiles", "background": "backgrounds", "audio": "audio",
}
REPO_ROOT_ENV_FILE = Path(__file__).resolve().parents[4] / ".env.assets"

# Repo-root .env.assets is 4 levels up: gen/ < assets/ < skills/ < packages/ < ROOT.


# ---------------------------------------------------------------------------
# Key resolution + grid sizing
# ---------------------------------------------------------------------------

def resolve_api_key() -> str | None:
    """env GOOGLE_API_KEY / GEMINI_API_KEY, else gitignored repo .env.assets."""
    for var in ("GOOGLE_API_KEY", "GEMINI_API_KEY"):
        v = os.environ.get(var, "").strip()
        if v:
            return v
    if REPO_ROOT_ENV_FILE.exists():
        for line in REPO_ROOT_ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, val = line.split("=", 1)
                if k.strip() in ("GOOGLE_API_KEY", "GEMINI_API_KEY"):
                    val = val.strip().strip('"').strip("'")
                    if val:
                        return val
    return None


def grid_side_for_count(count: int) -> int:
    """Smallest grid that holds `count`, capped 3x3 (1->1, <=4->2, <=9->3)."""
    if count <= 1:
        return 1
    return 2 if count <= 4 else 3


def nearest_aspect(width: int, height: int) -> str:
    """Snap a w:h to the nearest Gemini-supported aspect-ratio token."""
    if height <= 0:
        return "1:1"
    target = width / height
    return min(SUPPORTED_ASPECTS, key=lambda k: abs(SUPPORTED_ASPECTS[k] - target))


def chunk(seq: list, n: int) -> list[list]:
    return [seq[i:i + n] for i in range(0, len(seq), n)]


# ---------------------------------------------------------------------------
# Slot description resolution (fallback to entity desc, per SKILL §1.1)
# ---------------------------------------------------------------------------

def slot_description(slot: dict, gdd: dict) -> str:
    desc = (slot.get("description") or "").strip()
    if desc:
        return desc
    # Fall back to the entity description via entityIds.
    ent_by_id = {e.get("id"): e for e in gdd.get("entities", [])}
    for eid in slot.get("entityIds", []) or []:
        ent = ent_by_id.get(eid)
        if ent and ent.get("description"):
            return ent["description"].strip()
    # Last resort: synthesize from slot key + type.
    return f"{slot['slot'].replace('_', ' ')} ({slot['type']})"


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------

class AssetGenerator:
    def __init__(self, client, art_style, archetype, out_dir, use_anchor=True,
                 limit_batches=None):
        self.client = client
        self.art_style = art_style
        self.archetype = archetype
        self.out_dir = Path(out_dir)
        self.use_anchor = use_anchor
        self.limit_batches = limit_batches  # for cheap self-tests
        self.style_anchor: bytes | None = None  # first generated sprite PNG
        self.batches_done = 0
        self.provenance: list[dict] = []  # per-slot records
        self.results: dict[str, dict] = {}  # slot -> {status, path, width, height, reason}

    def _refs(self) -> list[bytes] | None:
        if self.use_anchor and self.style_anchor:
            return [self.style_anchor]
        return None

    def _save_png(self, img: Image.Image, slot_type: str, slot_key: str) -> str:
        subdir = TYPE_SUBDIR.get(slot_type, "images")
        target = self.out_dir / subdir
        target.mkdir(parents=True, exist_ok=True)
        path = target / f"{slot_key}.png"
        img.save(path, format="PNG")
        return f"{subdir}/{slot_key}.png"

    def _record(self, slot, prompt, ok, reason="", extra=None):
        rec = {
            "slot": slot["slot"], "type": slot["type"], "ok": ok,
            "model": self.client.model if self.client else None,
            "prompt": prompt, "reason": reason,
            "date": date.today().isoformat(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        if extra:
            rec.update(extra)
        self.provenance.append(rec)

    def _budget_hit(self) -> bool:
        return self.limit_batches is not None and self.batches_done >= self.limit_batches

    # -- backgrounds: single, opaque, fit:cover -----------------------------
    def gen_background(self, slot):
        key = slot["slot"]
        w, h = int(slot["width"]), int(slot["height"])
        prompt = plib.background_prompt(slot_description(slot, self.gdd), self.art_style)
        aspect = nearest_aspect(w, h)
        try:
            png = self.client.generate_with_retry(prompt, aspect_ratio=aspect)
            self.batches_done += 1
            img = Image.open(io.BytesIO(png))
            fitted = image_ops.fit_cover_rgb(img, w, h)  # RGB, fully opaque
            rel = self._save_png(fitted, "background", key)
            self.results[key] = {"status": "generated", "path": rel, "width": w, "height": h}
            self._record(slot, prompt, True, extra={"aspect": aspect, "dims": [w, h], "opaque": True})
            print(f"  [ok] background {key} -> {rel} ({w}x{h}, opaque)")
        except Exception as exc:  # noqa: BLE001 — per-slot isolation
            self._fail(slot, prompt, f"background gen failed: {exc}")

    # -- tileset: single seamless tile --------------------------------------
    def gen_tileset(self, slot):
        key = slot["slot"]
        w, h = int(slot["width"]), int(slot["height"])
        prompt = plib.tileset_prompt(slot_description(slot, self.gdd), self.art_style)
        aspect = nearest_aspect(w, h)
        try:
            png = self.client.generate_with_retry(prompt, aspect_ratio=aspect)
            self.batches_done += 1
            img = Image.open(io.BytesIO(png))
            fitted = image_ops.fit_cover_rgb(img, w, h)  # opaque tile
            rel = self._save_png(fitted, "tileset", key)
            self.results[key] = {"status": "generated", "path": rel, "width": w, "height": h}
            self._record(slot, prompt, True, extra={"aspect": aspect, "dims": [w, h]})
            print(f"  [ok] tileset {key} -> {rel} ({w}x{h})")
        except Exception as exc:  # noqa: BLE001
            self._fail(slot, prompt, f"tileset gen failed: {exc}")

    # -- sprites/images: batched grids --------------------------------------
    def gen_sprite_batch(self, slots):
        """slots: a list of sprite/image slot dicts (already chunked <=9)."""
        items = [
            {"label": s["slot"], "description": slot_description(s, self.gdd)}
            for s in slots
        ]
        side = grid_side_for_count(len(items))
        if side == 1:
            prompt = plib.sprite_prompt(items[0]["description"], self.art_style, self.archetype)
        else:
            prompt = plib.grid_prompt(items, self.art_style, self.archetype, side)
        try:
            png = self.client.generate_with_retry(
                prompt, aspect_ratio="1:1", reference_images=self._refs(),
            )
            self.batches_done += 1
            if self.style_anchor is None and self.use_anchor:
                self.style_anchor = png  # first sprite sheet -> style anchor
            cells = self._split(png, side)
            for i, s in enumerate(slots):
                self._finish_cutout_cell(s, cells[i] if i < len(cells) else png)
        except Exception as exc:  # noqa: BLE001 — whole batch failed -> all degrade
            for s in slots:
                self._fail(s, prompt, f"sprite batch gen failed: {exc}")

    def _finish_cutout_cell(self, slot, cell_bytes):
        """Key bg -> normalize -> fit:contain to slot dims -> write."""
        key = slot["slot"]
        w, h = int(slot["width"]), int(slot["height"])
        try:
            keyed = image_ops.key_white_to_transparent(cell_bytes)
            normalized = image_ops.normalize_object_canvas(keyed, target_size=1024)
            fitted = image_ops.fit_contain_rgba(normalized, w, h)
            m = image_ops.measure_visible_content(fitted)
            rel = self._save_png(fitted, slot["type"], key)
            self.results[key] = {"status": "generated", "path": rel, "width": w, "height": h}
            self._record(slot, "(grid cell)", True, extra={"dims": [w, h], "measure": m})
            print(f"  [ok] {slot['type']} {key} -> {rel} ({w}x{h}, occ={m.get('occupied_ratio')})")
        except Exception as exc:  # noqa: BLE001
            self._fail(slot, "(grid cell)", f"cut-out post-process failed: {exc}")

    # -- animations: named-frame grid -> horizontal strip -------------------
    def gen_animation(self, slot):
        key = slot["slot"]
        w, h = int(slot["width"]), int(slot["height"])
        frames = slot.get("frames") or ["frame0"]
        n = len(frames)
        entity_desc = slot_description(slot, self.gdd)
        side = grid_side_for_count(n)
        prompt = plib.animation_grid_prompt(entity_desc, frames, self.art_style, self.archetype, side)
        try:
            png = self.client.generate_with_retry(
                prompt, aspect_ratio="1:1", reference_images=self._refs(),
            )
            self.batches_done += 1
            if self.style_anchor is None and self.use_anchor:
                self.style_anchor = png
            cells = self._split(png, side)
            frame_imgs = []
            for i in range(n):
                cell = cells[i] if i < len(cells) else png
                keyed = image_ops.key_white_to_transparent(cell)
                normalized = image_ops.normalize_object_canvas(keyed, target_size=1024)
                frame_imgs.append(image_ops.fit_contain_rgba(normalized, w, h))
            self._assemble_strip(slot, frame_imgs, prompt, fallback=False)
        except Exception as exc:  # noqa: BLE001
            # Fallback: a single generated frame tiled across the strip, so the
            # strip ALWAYS lands at correct dims even if pose-gen is unreliable.
            self._animation_fallback(slot, frames, entity_desc, exc)

    def _animation_fallback(self, slot, frames, entity_desc, prior_exc):
        key = slot["slot"]
        w, h = int(slot["width"]), int(slot["height"])
        n = len(frames)
        prompt = plib.sprite_prompt(entity_desc, self.art_style, self.archetype)
        try:
            png = self.client.generate_with_retry(
                prompt, aspect_ratio="1:1", reference_images=self._refs(),
            )
            self.batches_done += 1
            keyed = image_ops.key_white_to_transparent(png)
            normalized = image_ops.normalize_object_canvas(keyed, target_size=1024)
            one = image_ops.fit_contain_rgba(normalized, w, h)
            self._assemble_strip(slot, [one] * n, prompt, fallback=True,
                                 reason=f"pose-grid failed ({prior_exc}); tiled single frame")
        except Exception as exc:  # noqa: BLE001
            self._fail(slot, prompt, f"animation gen failed (grid: {prior_exc}; single: {exc})")

    def _assemble_strip(self, slot, frame_imgs, prompt, fallback, reason=""):
        key = slot["slot"]
        w, h = int(slot["width"]), int(slot["height"])
        n = len(frame_imgs)
        strip = Image.new("RGBA", (w * n, h), (0, 0, 0, 0))
        for i, fimg in enumerate(frame_imgs):
            strip.paste(fimg.convert("RGBA"), (i * w, 0))
        rel = self._save_png(strip, "animation", key)
        # Per-frame dims written back (width === per-frame, NOT strip width).
        self.results[key] = {"status": "generated", "path": rel, "width": w, "height": h}
        self._record(
            slot, prompt, True,
            reason=reason,
            extra={"frames": slot.get("frames"), "per_frame_dims": [w, h],
                   "strip_dims": [w * n, h], "fallback_tiled": fallback},
        )
        tag = " (tiled fallback)" if fallback else ""
        print(f"  [ok] animation {key} -> {rel} strip={w * n}x{h} perframe={w}x{h}{tag}")

    def _split(self, png, side):
        if side == 1:
            return [png]
        if side == 2:
            return image_ops.split_grid_2x2(png)
        return image_ops.split_grid_3x3(png)

    def _fail(self, slot, prompt, reason):
        key = slot["slot"]
        # Leave status so the SKILL/Preloader covers it with a placeholder.
        self.results[key] = {"status": "pending", "reason": reason}
        self._record(slot, prompt, False, reason=reason)
        print(f"  [degrade] {slot['type']} {key}: {reason}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def run(args) -> int:
    index_path = Path(args.index).resolve()
    gdd_path = Path(args.gdd).resolve()
    out_dir = Path(args.out).resolve()

    if not index_path.exists():
        print(f"ERROR: index not found: {index_path}", file=sys.stderr)
        return 2
    index = json.loads(index_path.read_text())
    gdd = json.loads(gdd_path.read_text()) if gdd_path.exists() else {}

    archetype = index.get("archetype", "platformer")
    art_style = args.style or gdd.get("meta", {}).get("artStyle", "")

    slots = index.get("slots", [])
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        slots = [s for s in slots if s["slot"] in wanted]
    if not slots:
        print("No slots to generate (empty/filtered). Nothing to do.")
        return 0

    # Mode + key gate. placeholder mode is the SKILL's job, not ours — we signal
    # "degrade to placeholder" with exit 3 and write nothing.
    if args.mode == "placeholder":
        print("mode=placeholder requested: this tool only does real generation; "
              "the SKILL owns placeholder. Exiting (degrade-to-placeholder).")
        return 3
    api_key = resolve_api_key()
    if not api_key:
        print("No GOOGLE_API_KEY/GEMINI_API_KEY (env or .env.assets) — "
              "degrade to placeholder.", file=sys.stderr)
        return 3

    client = GeminiImageClient(api_key=api_key, model=args.model)
    print(f"index={index_path}")
    print(f"out={out_dir}  archetype={archetype}  model={client.model}")
    print(f"artStyle={art_style!r}  slots={len(slots)}")

    gen = AssetGenerator(
        client, art_style, archetype, out_dir,
        use_anchor=not args.no_anchor, limit_batches=args.limit_batches,
    )
    gen.gdd = gdd

    # Partition by strategy.
    cutouts = [s for s in slots if s["type"] in ("sprite", "image")]
    animations = [s for s in slots if s["type"] == "animation"]
    backgrounds = [s for s in slots if s["type"] == "background"]
    tilesets = [s for s in slots if s["type"] == "tileset"]
    audios = [s for s in slots if s["type"] == "audio"]

    # Audio: not generated here (left for the placeholder WAV).
    for s in audios:
        gen.results[s["slot"]] = {"status": "pending", "reason": "audio out of scope (placeholder WAV)"}
        print(f"  [skip] audio {s['slot']}: left for placeholder WAV")

    # Generate. Order: animations first (anchor the style), then sprite batches,
    # then backgrounds, then tilesets. Each respects the --limit-batches budget.
    def budget_ok():
        return not gen._budget_hit()

    for s in animations:
        if not budget_ok():
            gen._fail(s, "(skipped: batch budget)", "skipped: --limit-batches budget reached")
            continue
        print(f"-- animation {s['slot']} (frames={s.get('frames')}) --")
        gen.gen_animation(s)
        time.sleep(args.delay)

    for batch in chunk(cutouts, GRID_BATCH_LIMIT):
        if not budget_ok():
            for s in batch:
                gen._fail(s, "(skipped: batch budget)", "skipped: --limit-batches budget reached")
            continue
        keys = [s["slot"] for s in batch]
        print(f"-- sprite batch {keys} (grid side={grid_side_for_count(len(batch))}) --")
        gen.gen_sprite_batch(batch)
        time.sleep(args.delay)

    for s in backgrounds:
        if not budget_ok():
            gen._fail(s, "(skipped: batch budget)", "skipped: --limit-batches budget reached")
            continue
        print(f"-- background {s['slot']} --")
        gen.gen_background(s)
        time.sleep(args.delay)

    for s in tilesets:
        if not budget_ok():
            gen._fail(s, "(skipped: batch budget)", "skipped: --limit-batches budget reached")
            continue
        print(f"-- tileset {s['slot']} --")
        gen.gen_tileset(s)
        time.sleep(args.delay)

    # --- write back index.json (parallel-safe: only path/status/dims) -------
    write_back(index_path, gen.results)

    # --- provenance / asset-library seed -----------------------------------
    out_dir.mkdir(parents=True, exist_ok=True)
    prov_path = out_dir / "_provenance.json"
    prov_path.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": client.model,
        "art_style": art_style,
        "archetype": archetype,
        "records": gen.provenance,
    }, indent=2))
    print(f"provenance -> {prov_path}")

    n_gen = sum(1 for r in gen.results.values() if r["status"] == "generated")
    n_pend = sum(1 for r in gen.results.values() if r["status"] != "generated")
    print(f"DONE: {n_gen} generated, {n_pend} left for placeholder. index.json updated.")
    return 0


def write_back(index_path: Path, results: dict) -> None:
    """Read index fresh, mutate ONLY each filled slot's path/status/(dims),
    write the whole file back once. KEYS/order/other fields untouched."""
    index = json.loads(index_path.read_text())
    for slot in index.get("slots", []):
        r = results.get(slot["slot"])
        if not r:
            continue
        slot["status"] = r["status"]
        if r["status"] == "generated":
            slot["path"] = r["path"]
            slot["width"] = r["width"]
            slot["height"] = r["height"]
        # On pending we leave the slot's existing path/dims so the Preloader can
        # placeholder-fill from the W2 dims; we only flip status.
    index_path.write_text(json.dumps(index, indent=2) + "\n")
    print(f"index.json written back -> {index_path}")


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="generate_assets.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--index", required=True, help="<projectDir>/index.json (the frozen slot manifest)")
    ap.add_argument("--gdd", required=True, help="<projectDir>/spec/gdd.json (art direction)")
    ap.add_argument("--out", required=True, help="<projectDir>/public/assets (assetsDir)")
    ap.add_argument("--style", default=None, help="art-style override (else gdd.meta.artStyle)")
    ap.add_argument("--mode", choices=["gemini", "placeholder"], default="gemini",
                    help="gemini=real generation (default); placeholder=exit 3 (SKILL owns it)")
    ap.add_argument("--model", default=os.environ.get("GEMINI_IMAGE_MODEL", DEFAULT_MODEL),
                    help=f"image model id (default {DEFAULT_MODEL}; gemini-3.1-flash-image is a drop-in)")
    ap.add_argument("--only", default=None, help="comma-separated slot keys to generate (subset)")
    ap.add_argument("--limit-batches", type=int, default=None,
                    help="cap the number of Gemini calls (cheap self-test); rest -> pending")
    ap.add_argument("--no-anchor", action="store_true",
                    help="disable passing the first sprite as a style-anchor reference")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between Gemini calls (rate-limit)")
    return ap


def main() -> int:
    args = build_parser().parse_args()
    try:
        return run(args)
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
