#!/usr/bin/env python3
"""Split the Just10 Group logo into aligned layers for the door-reveal.

Every layer is cropped to the same box as the full logo and holds only its
own part, so the site stacks them with no positioning maths and animates
each one separately: monogram, divider, "Just10", "GROUP".
Also writes a light variant (GROUP in white) for dark backgrounds, and a
favicon from the monogram.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "media" / "source" / "logo.png"
OUT = ROOT / "public" / "brand"

PAD = 8
# Column/row splits measured from the source artwork (1262x1246).
MARK_X = (0, 474)
DIVIDER_X = (474, 505)
WORD_X = (505, 1262)
WORD_SPLIT_Y = 629  # empty row between "Just10" and "GROUP"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rgba = np.array(Image.open(SRC).convert("RGBA"))
    ys, xs = np.where(rgba[..., 3] > 20)
    box = (xs.min() - PAD, ys.min() - PAD, xs.max() + PAD + 1, ys.max() + PAD + 1)

    def layer(name: str, x: tuple[int, int], y: tuple[int, int] = (0, rgba.shape[0])) -> None:
        part = np.zeros_like(rgba)
        part[y[0]:y[1], x[0]:x[1]] = rgba[y[0]:y[1], x[0]:x[1]]
        Image.fromarray(part).crop(box).save(OUT / f"logo-{name}.png", optimize=True)

    Image.fromarray(rgba).crop(box).save(OUT / "logo-full.png", optimize=True)
    layer("mark", MARK_X)
    layer("divider", DIVIDER_X)
    layer("just10", WORD_X, (0, WORD_SPLIT_Y))
    layer("group", WORD_X, (WORD_SPLIT_Y, rgba.shape[0]))

    light = rgba.copy()
    word = light[WORD_SPLIT_Y:, WORD_X[0]:WORD_X[1]]
    dark = word[..., :3].max(-1) < 90
    word[dark, :3] = 255
    Image.fromarray(light).crop(box).save(OUT / "logo-full-light.png", optimize=True)

    mark = Image.fromarray(rgba).crop((box[0], box[1], MARK_X[1], box[3]))
    side = max(mark.size)
    square = Image.new("RGBA", (side, side))
    square.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
    square.resize((128, 128), Image.LANCZOS).save(OUT / "favicon.png", optimize=True)

    print("box", box, "->", [p.name for p in sorted(OUT.glob("*.png"))])


if __name__ == "__main__":
    main()
