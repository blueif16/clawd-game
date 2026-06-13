"""
Self-contained Gemini image-generation client for the W3 asset generator.

Ported from the Omniscience donor (agent/services/image_gen.py +
scripts/gen_asset_svg.py call shape), STRIPPED of all Supabase/upload/DB
coupling. It only turns (prompt, aspect_ratio, [reference PNGs]) into raw PNG
bytes via the google-genai SDK. Disk-writing + index.json write-back live in
generate_assets.py.

Model: gemini-2.5-flash-image (documented "Nano Banana"); gemini-3.1-flash-image
is a drop-in upgrade. Override with --model or env GEMINI_IMAGE_MODEL.
"""

import sys
import time

# Documented default + drop-in upgrade (per the W3 SKILL + Omniscience donor).
DEFAULT_MODEL = "gemini-2.5-flash-image"
UPGRADE_MODEL = "gemini-3.1-flash-image"


class GeminiImageClient:
    """Thin wrapper over google-genai generate_content for image output."""

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        # Imported lazily so --help / placeholder mode never require the SDK.
        from google import genai

        self.model = model
        self.client = genai.Client(api_key=api_key)

    def generate(
        self,
        prompt: str,
        aspect_ratio: str = "1:1",
        reference_images: list[bytes] | None = None,
    ) -> bytes:
        """One Gemini call -> raw PNG bytes. Raises on no-image (caller catches).

        reference_images (optional) are sent as inline image Parts BEFORE the
        text prompt so the model locks visual style across calls (the style
        anchor). See image_gen._generate_sync in the donor.
        """
        from google.genai import types

        parts: list = []
        for ref in reference_images or []:
            parts.append(types.Part.from_bytes(data=ref, mime_type="image/png"))
        parts.append(types.Part.from_text(text=prompt))
        contents = [types.Content(role="user", parts=parts)]

        config = types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
        )

        resp = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )

        for part in resp.parts or []:
            if part.inline_data and part.inline_data.data:
                return part.inline_data.data

        # No image part -> surface text + finish reason verbatim so the caller
        # can record WHY this slot degraded to placeholder.
        texts = [p.text for p in (resp.parts or []) if getattr(p, "text", None)]
        frs = [
            str(getattr(c, "finish_reason", None))
            for c in (getattr(resp, "candidates", None) or [])
        ]
        raise RuntimeError(
            f"no image data (finish_reasons={frs} text={(' '.join(texts))[:300]!r})"
        )

    def generate_with_retry(
        self,
        prompt: str,
        aspect_ratio: str = "1:1",
        reference_images: list[bytes] | None = None,
        attempts: int = 3,
    ) -> bytes:
        """generate() with up to `attempts` tries and linear backoff."""
        last_err: Exception | None = None
        for i in range(attempts):
            try:
                return self.generate(prompt, aspect_ratio, reference_images)
            except Exception as exc:  # noqa: BLE001 — retry then surface verbatim
                last_err = exc
                if i < attempts - 1:
                    wait = 2 * (i + 1)
                    print(
                        f"    gen attempt {i + 1}/{attempts} failed: {exc} — retrying in {wait}s",
                        file=sys.stderr,
                    )
                    time.sleep(wait)
        raise last_err if last_err else RuntimeError("generation produced nothing")
