#!/usr/bin/env python3
"""Split an unexpected grid/contact sheet into *separate* private review assets.

An inspector must supply the layout; never guess arbitrary gutters or pretend that
a cropped tile is a new full-resolution generation. This is a recovery tool, not
permission to generate grids instead of one native frame per call.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from PIL import Image


def split_sheet(source: Path, destination: Path, rows: int, columns: int,
                gutter: int = 0, min_width: int = 1280, min_height: int = 720):
    if rows < 1 or columns < 1 or rows * columns < 2:
        raise ValueError("Provide an actual multi-panel grid, e.g. 2 rows and 2 columns")
    if gutter < 0 or min_width < 1 or min_height < 1:
        raise ValueError("Gutter and output dimensions must be non-negative/positive")
    if destination.resolve() == source.resolve():
        raise ValueError("Input cannot also be output directory")
    with Image.open(source) as loaded:
        image = loaded.convert("RGB")
        width, height = image.size
        usable_width = width - gutter * (columns - 1)
        usable_height = height - gutter * (rows - 1)
        if usable_width < columns or usable_height < rows:
            raise ValueError("Grid gutter leaves no usable pixels")
        tile_width = usable_width // columns
        tile_height = usable_height // rows
        if tile_width < 1 or tile_height < 1:
            raise ValueError("Grid cells are empty")
        destination.mkdir(parents=True, exist_ok=True)
        result = []
        for row in range(rows):
            for column in range(columns):
                left = column * (tile_width + gutter)
                top = row * (tile_height + gutter)
                right = width if column == columns - 1 else left + tile_width
                bottom = height if row == rows - 1 else top + tile_height
                tile = image.crop((left, top, right, bottom))
                output = destination / f"{source.stem}_frame_{len(result) + 1:02d}.png"
                tile.save(output, "PNG")
                result.append({
                    "file": output.name, "width": tile.width, "height": tile.height,
                    "source": source.name, "source_grid": f"{rows}x{columns}",
                    "provenance": "cropped_panel_not_native_generation",
                    "status": "needs_review",
                    "meets_minimum_resolution": tile.width >= min_width and tile.height >= min_height,
                })
    manifest = destination / "manifest.json"
    manifest.write_text(json.dumps({"source": source.name, "rows": rows,
                                     "columns": columns, "frames": result}, indent=2))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--gutter", type=int, default=0)
    parser.add_argument("--min-width", type=int, default=1280)
    parser.add_argument("--min-height", type=int, default=720)
    args = parser.parse_args()
    frames = split_sheet(args.source, args.destination, args.rows, args.columns,
                         args.gutter, args.min_width, args.min_height)
    print(json.dumps({"separate_review_files": len(frames),
                      "min_resolution_passed": all(f["meets_minimum_resolution"] for f in frames),
                      "status": "needs_review"}, indent=2))


if __name__ == "__main__":
    main()
