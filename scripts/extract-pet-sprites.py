#!/usr/bin/env python3
"""Split a five-pose transparent sheet into normalized desktop-pet sprites."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


DEFAULT_NAMES = ("egg", "young", "winged", "working", "doze")


def transparent_gaps(alpha: Image.Image, minimum_width: int) -> list[tuple[int, int]]:
    pixels = alpha.load()
    width, height = alpha.size
    occupied = [any(pixels[x, y] > 8 for y in range(height)) for x in range(width)]
    gaps: list[tuple[int, int]] = []
    start: int | None = None
    for x, has_subject in enumerate(occupied + [True]):
        if not has_subject and start is None:
            start = x
        elif has_subject and start is not None:
            if x - start >= minimum_width:
                gaps.append((start, x))
            start = None
    return gaps


def split_boundaries(alpha: Image.Image, count: int) -> list[int]:
    width, _ = alpha.size
    gaps = transparent_gaps(alpha, max(3, width // 500))
    boundaries = [0]
    for index in range(1, count):
        expected = width * index / count
        candidates = [gap for gap in gaps if boundaries[-1] < (gap[0] + gap[1]) / 2 < width]
        if not candidates:
            boundaries.append(round(expected))
            continue
        gap = min(candidates, key=lambda item: abs(((item[0] + item[1]) / 2) - expected))
        boundaries.append(round((gap[0] + gap[1]) / 2))
    boundaries.append(width)
    return boundaries


def normalize_sprite(sprite: Image.Image, size: int, inset: int) -> Image.Image:
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("sprite cell is fully transparent")
    sprite = sprite.crop(bbox)
    available = size - (inset * 2)
    sprite.thumbnail((available, available), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - sprite.width) // 2
    y = (size - sprite.height) // 2
    canvas.alpha_composite(sprite, (x, y))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sheet", type=Path)
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--inset", type=int, default=32)
    parser.add_argument("--names", nargs="+", default=list(DEFAULT_NAMES))
    args = parser.parse_args()

    sheet = Image.open(args.sheet).convert("RGBA")
    boundaries = split_boundaries(sheet.getchannel("A"), len(args.names))
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(args.names):
        left, right = boundaries[index], boundaries[index + 1]
        cell = sheet.crop((left, 0, right, sheet.height))
        normalized = normalize_sprite(cell, args.size, args.inset)
        normalized.save(args.out_dir / f"{name}.png", optimize=True)


if __name__ == "__main__":
    main()
