"""
Minimal, reusable prompt library for the W3 asset generator.

Our own slim version of the Omniscience asset_prompt_library.json idea: a global
flat-style wrapper (from gen_asset_svg.py _STYLE) + per-type contracts that make
the output engine-ready (isolated subject on a plain bg for cut-outs; edge-to-edge
opaque for backgrounds; seamless for tilesets). Everything composes as:

    <flat style> + <archetype view> + <gdd.meta.artStyle> + <per-type contract>
    + <slot description> + <plain-bg key instruction> + <global negative>

GAME-AGNOSTIC: no game/slot name is baked in; the only game-specific text is the
slot.description and gdd.meta.artStyle passed in at call time.
"""

# Flat papercraft sticker style (from gen_asset_svg.py _STYLE) — produces clean
# flat fills on a plain background, which the LOCAL corner-median key removes
# cleanly. No SVG-tracer-specific palette lock; we keep the flat-style discipline
# that makes the local key reliable.
FLAT_STYLE = (
    "Flat papercraft vector sticker / children's-book cut-paper illustration. "
    "Bold solid FLAT fills, clean dark navy outline, consistent medium line "
    "weight. NO gradients, NO photographic realism, NO 3D, minimal soft shading."
)

# Global negative — appended last on every prompt.
GLOBAL_NEGATIVE = (
    "No text, no letters, no numbers, no labels, no words, no watermark, no logo, "
    "no UI, no border, no frame, no signature."
)

# Plain-bg instruction for CUT-OUT assets (sprites / animation frames). A plain
# PURE WHITE background is what the LOCAL key_white_to_transparent corner-median
# key removes for free — no chroma-green, no rembg service.
PLAIN_BG_CUTOUT = (
    "Background: PLAIN PURE WHITE, completely empty — no scene, no surface, no "
    "ground, no shadow. The subject is crisply isolated with clean edges."
)

# Archetype -> the camera/view direction the sprite should be drawn from. Mirrors
# the W3 SKILL's archetype-conditioned view rule.
ARCHETYPE_VIEW = {
    "platformer": "side-view (profile)",
    "top_down": "top-down (bird's-eye)",
    "grid_logic": "top-down (bird's-eye)",
    "tower_defense": "top-down (bird's-eye)",
    "ui_heavy": "front-facing bust",
}


def view_for(archetype: str) -> str:
    return ARCHETYPE_VIEW.get(archetype, "clear readable view")


def _head(art_style: str, archetype: str) -> str:
    """Common style header: flat style + game art direction + archetype view."""
    art = (art_style or "").strip()
    art_clause = f"Art direction: {art}. " if art and art.lower() != "placeholder" else ""
    return f"{FLAT_STYLE} {art_clause}View: {view_for(archetype)}."


def sprite_prompt(description: str, art_style: str, archetype: str) -> str:
    """Single isolated cut-out subject on a plain white bg (1:1, then keyed)."""
    return (
        f"A single {description}, drawn as ONE object only, centered, filling most "
        f"of the frame. {_head(art_style, archetype)} {PLAIN_BG_CUTOUT} {GLOBAL_NEGATIVE}"
    )


def grid_prompt(items: list[dict], art_style: str, archetype: str, side: int) -> str:
    """A side×side grid of DISTINCT subjects, each isolated on the same plain
    white bg. `items` = [{label, description}]. Empty cells are plain white."""
    if side == 2:
        positions = ["Top-left", "Top-right", "Bottom-left", "Bottom-right"]
    else:
        positions = [
            "Row 1 column 1", "Row 1 column 2", "Row 1 column 3",
            "Row 2 column 1", "Row 2 column 2", "Row 2 column 3",
            "Row 3 column 1", "Row 3 column 2", "Row 3 column 3",
        ]
    lines = []
    for i in range(side * side):
        if i < len(items):
            lines.append(f"{positions[i]}: {items[i]['description']}")
        else:
            lines.append(f"{positions[i]}: empty plain white background")
    body = ". ".join(lines)
    return (
        f"{body}. Arranged in a clean {side}x{side} grid with generous even "
        f"spacing, each subject isolated, same scale, same lighting, facing the "
        f"same way. {_head(art_style, archetype)} {PLAIN_BG_CUTOUT} {GLOBAL_NEGATIVE}"
    )


def animation_grid_prompt(
    entity_desc: str, frames: list[str], art_style: str, archetype: str, side: int
) -> str:
    """A side×side grid of the SAME entity in distinct named poses (the frames),
    style-anchored for consistency. Each cell isolated on plain white."""
    if side == 2:
        positions = ["Top-left", "Top-right", "Bottom-left", "Bottom-right"]
    else:
        positions = [
            "Row 1 column 1", "Row 1 column 2", "Row 1 column 3",
            "Row 2 column 1", "Row 2 column 2", "Row 2 column 3",
            "Row 3 column 1", "Row 3 column 2", "Row 3 column 3",
        ]
    lines = []
    for i in range(side * side):
        if i < len(frames):
            lines.append(
                f"{positions[i]}: the SAME {entity_desc}, in the '{frames[i]}' pose/state"
            )
        else:
            lines.append(f"{positions[i]}: empty plain white background")
    body = ". ".join(lines)
    return (
        f"The exact same character in different poses across a grid. {body}. "
        f"Keep the character's design, colors and proportions IDENTICAL in every "
        f"cell — only the pose/state changes. Arranged in a clean {side}x{side} "
        f"grid with generous even spacing, each isolated at the same scale. "
        f"{_head(art_style, archetype)} {PLAIN_BG_CUTOUT} {GLOBAL_NEGATIVE}"
    )


def background_prompt(description: str, art_style: str) -> str:
    """Edge-to-edge opaque scenery — no characters, no UI, no transparency."""
    art = (art_style or "").strip()
    art_clause = f"Art direction: {art}. " if art and art.lower() != "placeholder" else ""
    return (
        f"A 2D game BACKGROUND: {description}. {FLAT_STYLE} {art_clause}"
        f"BACKGROUND ONLY — distant scenery / sky / environment filling the ENTIRE "
        f"canvas edge-to-edge, fully opaque, no transparency. Do NOT include any "
        f"characters, players, enemies, platforms, collectibles, or UI. {GLOBAL_NEGATIVE}"
    )


def tileset_prompt(description: str, art_style: str) -> str:
    """A seamless tileable surface texture filling the whole canvas."""
    art = (art_style or "").strip()
    art_clause = f"Art direction: {art}. " if art and art.lower() != "placeholder" else ""
    return (
        f"A seamless, tileable 2D surface texture: {description}. {FLAT_STYLE} "
        f"{art_clause}Fill the ENTIRE canvas edge-to-edge with NO grid lines, NO "
        f"borders, NO padding, flat front view, consistent lighting, designed to "
        f"tile without visible seams. {GLOBAL_NEGATIVE}"
    )
