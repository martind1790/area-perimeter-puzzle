"""
Puzzle deduplication utilities.

Two puzzles are considered duplicates if their solution grids represent the
same physical partition of the grid — i.e. the same set of regions in the
same positions — regardless of which integer IDs were assigned to each region.

Example of duplicates (same partition, different IDs):
  [[0, 0, 1],   and   [[3, 3, 7],
   [0, 1, 1]]          [3, 7, 7]]

Example of non-duplicates (different partitions):
  [[0, 0, 1],   and   [[0, 1, 1],
   [0, 1, 1]]          [0, 0, 1]]
"""

from __future__ import annotations

import json
from pathlib import Path


def normalize_solution(grid: list) -> tuple:
    """
    Return a hashable fingerprint of a solution grid.

    Region IDs are relabelled in raster-order-of-first-appearance so that
    two grids with the same physical partition always produce the same result.
    """
    mapping: dict[int, int] = {}
    next_id = 0
    rows = []
    for row in grid:
        new_row = []
        for v in row:
            if v not in mapping:
                mapping[v] = next_id
                next_id += 1
            new_row.append(mapping[v])
        rows.append(tuple(new_row))
    return tuple(rows)


def load_fingerprints(puzzle_root: Path) -> set:
    """
    Recursively scan puzzle_root for JSON puzzle files and return a set of
    normalised solution fingerprints.

    Files that are missing a 'solution' key or are not valid JSON are skipped.
    """
    fingerprints: set = set()
    for path in sorted(puzzle_root.rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if "solution" in data:
                fingerprints.add(normalize_solution(data["solution"]))
        except (json.JSONDecodeError, KeyError, OSError):
            pass
    return fingerprints


def find_duplicates(puzzle_root: Path) -> list[tuple[Path, Path]]:
    """
    Find all pairs of puzzle files in puzzle_root that share the same solution
    partition.

    Returns a list of (first_file, duplicate_file) pairs in discovery order.
    An empty list means the bank is globally unique.
    """
    seen: dict[tuple, Path] = {}
    duplicates: list[tuple[Path, Path]] = []
    for path in sorted(puzzle_root.rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if "solution" not in data:
                continue
            fp = normalize_solution(data["solution"])
            if fp in seen:
                duplicates.append((seen[fp], path))
            else:
                seen[fp] = path
        except (json.JSONDecodeError, KeyError, OSError):
            pass
    return duplicates
