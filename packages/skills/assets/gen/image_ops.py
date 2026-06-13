"""
Self-contained image-processing helpers for the W3 asset generator.

Ported VERBATIM (logic-preserving) from the Omniscience donor:
  - key_white_to_transparent  <- scripts/gen_asset_svg.py   (LOCAL corner-median
       chroma key; NO network bg-removal service — this is what makes generation
       free + offline)
  - split_grid / split_grid_2x2 / split_grid_3x3,
    alpha_bbox, measure_visible_content,
    normalize_object_canvas    <- agent/services/image_processing.py

Deliberately NOT ported: remove_background() (it POSTs to rembg.com) and the
Supabase upload path. We write PNGs to local disk and key the plain background
out locally instead.

Game-agnostic: no game/slot/asset name is referenced here; everything is driven
by the bytes handed in.
"""

import io
from typing import Any

import numpy as np
from PIL import Image


# ---------------------------------------------------------------------------
# LOCAL chroma key — corner-median, no network (from gen_asset_svg.py)
# ---------------------------------------------------------------------------

def key_white_to_transparent(png_bytes: bytes, tolerance: int = 26) -> Image.Image:
    """Color-key a (near-)uniform light background to transparent alpha.

    Samples the background from the four corners (median) so a faint off-white or
    cream still keys cleanly, then sets alpha=0 where the pixel is within
    `tolerance` Euclidean RGB of that bg. Local + free — no remove.bg dependency.
    Returns an RGBA image.
    """
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    arr = np.array(img)
    rgb = arr[:, :, :3].astype(np.int32)
    h, w = rgb.shape[:2]
    corners = np.stack(
        [rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]]
    )
    bg = np.median(corners, axis=0)
    dist_sq = ((rgb - bg) ** 2).sum(axis=2)
    is_bg = dist_sq <= tolerance * tolerance
    alpha = np.where(is_bg, 0, 255).astype(np.uint8)
    # Keep the original alpha where the source already had transparency.
    alpha = np.minimum(alpha, arr[:, :, 3])
    out = arr.copy()
    out[:, :, 3] = alpha
    return Image.fromarray(out, mode="RGBA")


# ---------------------------------------------------------------------------
# Grid split (from image_processing.py)
# ---------------------------------------------------------------------------

def split_grid(image_bytes: bytes, rows: int, cols: int) -> list[bytes]:
    """Split an image into a rows×cols grid of equal cells (row-major).

    Remainder pixels (when width/height isn't divisible) are absorbed by the
    last column/row so no content is lost.
    """
    if rows <= 0 or cols <= 0:
        raise ValueError(f"rows and cols must be positive, got rows={rows}, cols={cols}")

    img = Image.open(io.BytesIO(image_bytes))
    w, h = img.size
    cw, ch = w // cols, h // rows

    result: list[bytes] = []
    for row in range(rows):
        for col in range(cols):
            left = col * cw
            top = row * ch
            right = w if col == cols - 1 else left + cw
            bottom = h if row == rows - 1 else top + ch
            cell = img.crop((left, top, right, bottom))
            buf = io.BytesIO()
            cell.save(buf, format="PNG")
            result.append(buf.getvalue())
    return result


def split_grid_2x2(image_bytes: bytes) -> list[bytes]:
    return split_grid(image_bytes, rows=2, cols=2)


def split_grid_3x3(image_bytes: bytes) -> list[bytes]:
    return split_grid(image_bytes, rows=3, cols=3)


# ---------------------------------------------------------------------------
# Visible-content geometry (from image_processing.py)
# ---------------------------------------------------------------------------

def alpha_bbox(image: Image.Image, alpha_threshold: int = 1):
    """Bounding box of visible pixels based on alpha, or None if fully blank."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= alpha_threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        return None
    left, top, right, bottom = bbox
    return int(left), int(top), int(right), int(bottom)


def measure_visible_content(image: Image.Image, alpha_threshold: int = 1) -> dict[str, Any]:
    """Measure exact visible bounds of an RGBA asset (for provenance/QA)."""
    rgba = image.convert("RGBA")
    canvas_width, canvas_height = rgba.size
    bbox = alpha_bbox(rgba, alpha_threshold=alpha_threshold)

    if bbox is None:
        return {
            "canvas_width": int(canvas_width),
            "canvas_height": int(canvas_height),
            "visible_width": 0,
            "visible_height": 0,
            "occupied_ratio": 0.0,
            "has_visible_pixels": False,
        }

    left, top, right, bottom = bbox
    visible_width = int(right - left)
    visible_height = int(bottom - top)
    canvas_area = max(1, int(canvas_width * canvas_height))
    visible_area = visible_width * visible_height

    return {
        "canvas_width": int(canvas_width),
        "canvas_height": int(canvas_height),
        "visible_left": int(left),
        "visible_top": int(top),
        "visible_right": int(right),
        "visible_bottom": int(bottom),
        "visible_width": visible_width,
        "visible_height": visible_height,
        "visible_aspect_ratio": round(visible_width / max(1, visible_height), 6),
        "occupied_ratio": round(visible_area / canvas_area, 6),
        "has_visible_pixels": True,
    }


def normalize_object_canvas(
    image: Image.Image,
    target_size: int = 1024,
    target_fill: float = 0.82,
    alpha_threshold: int = 1,
) -> Image.Image:
    """Re-fit a transparent-background object PNG onto a canonical square canvas.

    Rescales the visible content so its LONGER edge occupies `target_fill` of
    `target_size`, centered, so a batch of sprites renders at a consistent
    visual size. No-op (blank canvas) when there is no visible alpha.

    (The Omniscience `anchor="bottom"` stature mode is dropped — game sprites
    are centered cut-outs resized to exact slot dims downstream.)
    """
    rgba = image.convert("RGBA")
    bbox = alpha_bbox(rgba, alpha_threshold=alpha_threshold)
    if bbox is None:
        return Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))

    left, top, right, bottom = bbox
    visible = rgba.crop((left, top, right, bottom))
    vw, vh = visible.size
    if vw <= 0 or vh <= 0:
        return Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))

    scale = max(1, int(target_size * target_fill)) / max(vw, vh)
    scale = min(scale, (target_size * 0.96) / max(vw, vh))
    new_w = max(1, round(vw * scale))
    new_h = max(1, round(vh * scale))
    resized = visible.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
    paste_x = (target_size - new_w) // 2
    paste_y = (target_size - new_h) // 2
    canvas.paste(resized, (paste_x, max(0, paste_y)), resized)
    return canvas


# ---------------------------------------------------------------------------
# Slot-dim fitters (game-omni specific — match the Preloader's frame contract)
# ---------------------------------------------------------------------------

def fit_contain_rgba(image: Image.Image, width: int, height: int) -> Image.Image:
    """Resize a transparent cut-out into an exactly width×height RGBA canvas,
    preserving aspect (transparent letterbox). Never crops the subject — the
    sprite contract: full subject, exact slot dims."""
    rgba = image.convert("RGBA")
    vw, vh = rgba.size
    if vw <= 0 or vh <= 0:
        return Image.new("RGBA", (width, height), (0, 0, 0, 0))
    scale = min(width / vw, height / vh)
    new_w = max(1, round(vw * scale))
    new_h = max(1, round(vh * scale))
    resized = rgba.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.paste(resized, ((width - new_w) // 2, (height - new_h) // 2), resized)
    return canvas


def fit_cover_rgb(image: Image.Image, width: int, height: int) -> Image.Image:
    """Resize+center-crop an image to fill width×height, FLATTENED onto an
    opaque canvas (fit:cover). Backgrounds must be fully opaque — any alpha hole
    renders in-game as a hole to the clear color."""
    rgba = image.convert("RGBA")
    vw, vh = rgba.size
    if vw <= 0 or vh <= 0:
        return Image.new("RGB", (width, height), (0, 0, 0))
    scale = max(width / vw, height / vh)
    new_w = max(1, round(vw * scale))
    new_h = max(1, round(vh * scale))
    resized = rgba.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - width) // 2
    top = (new_h - height) // 2
    cropped = resized.crop((left, top, left + width, top + height))
    # Flatten any (spurious) transparency onto opaque white so backgrounds have
    # NO holes. measure step downstream verifies full opacity.
    flat = Image.new("RGB", (width, height), (255, 255, 255))
    flat.paste(cropped, (0, 0), cropped)
    return flat
