"""Unit tests for solver/deduplication.py."""

import json
from pathlib import Path

import pytest

from deduplication import normalize_solution, load_fingerprints, find_duplicates


# ---------------------------------------------------------------------------
# normalize_solution
# ---------------------------------------------------------------------------

def test_same_partition_different_ids():
    """Two grids with the same regions but different ID assignments → same fingerprint."""
    grid_a = [[0, 0, 1], [0, 1, 1]]
    grid_b = [[3, 3, 7], [3, 7, 7]]  # same partition, IDs 0→3, 1→7
    assert normalize_solution(grid_a) == normalize_solution(grid_b)


def test_different_partitions():
    """Grids with genuinely different spatial partitions → different fingerprints."""
    grid_a = [[0, 0, 1], [0, 1, 1]]
    grid_b = [[0, 1, 1], [0, 0, 1]]
    assert normalize_solution(grid_a) != normalize_solution(grid_b)


def test_single_region():
    """All-same-region grid normalises to all zeros."""
    grid = [[0, 0], [0, 0]]
    assert normalize_solution(grid) == ((0, 0), (0, 0))


def test_all_different_cells():
    """Every cell in its own region normalises to 0, 1, 2, … in raster order."""
    grid = [[5, 9], [2, 7]]
    assert normalize_solution(grid) == ((0, 1), (2, 3))


def test_fingerprint_is_hashable():
    """normalize_solution must return something that can live in a set."""
    grid = [[0, 1], [0, 1]]
    fp = normalize_solution(grid)
    fingerprint_set = {fp}
    assert fp in fingerprint_set


def test_fingerprint_consistent():
    """Same grid called twice produces the same fingerprint."""
    grid = [[0, 0, 1], [2, 1, 1]]
    assert normalize_solution(grid) == normalize_solution(grid)


def test_single_cell_grid():
    grid = [[0]]
    assert normalize_solution(grid) == ((0,),)


# ---------------------------------------------------------------------------
# load_fingerprints
# ---------------------------------------------------------------------------

def test_load_fingerprints_empty_dir(tmp_path):
    assert load_fingerprints(tmp_path) == set()


def test_load_fingerprints_counts(tmp_path):
    (tmp_path / "a.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    (tmp_path / "b.json").write_text(json.dumps({"solution": [[0, 0], [1, 1]]}))
    assert len(load_fingerprints(tmp_path)) == 2


def test_load_fingerprints_deduplicates_identical(tmp_path):
    """Two files with the same partition produce only one fingerprint."""
    (tmp_path / "a.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    (tmp_path / "b.json").write_text(json.dumps({"solution": [[5, 9], [5, 9]]}))
    assert len(load_fingerprints(tmp_path)) == 1


def test_load_fingerprints_skips_invalid_json(tmp_path):
    (tmp_path / "bad.json").write_text("not json {{{")
    (tmp_path / "good.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    fps = load_fingerprints(tmp_path)
    assert len(fps) == 1


def test_load_fingerprints_skips_no_solution_key(tmp_path):
    (tmp_path / "meta.json").write_text(json.dumps({"id": "tutorial", "rows": 3}))
    fps = load_fingerprints(tmp_path)
    assert fps == set()


def test_load_fingerprints_recursive(tmp_path):
    """Should find puzzles in subdirectories (matching the bank structure)."""
    sub = tmp_path / "4x4" / "easy"
    sub.mkdir(parents=True)
    (sub / "puzzle_001.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    fps = load_fingerprints(tmp_path)
    assert len(fps) == 1


# ---------------------------------------------------------------------------
# find_duplicates
# ---------------------------------------------------------------------------

def test_find_duplicates_empty_dir(tmp_path):
    assert find_duplicates(tmp_path) == []


def test_find_duplicates_all_unique(tmp_path):
    (tmp_path / "a.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    (tmp_path / "b.json").write_text(json.dumps({"solution": [[0, 0], [1, 1]]}))
    assert find_duplicates(tmp_path) == []


def test_find_duplicates_detects_one(tmp_path):
    (tmp_path / "a.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    (tmp_path / "b.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    dups = find_duplicates(tmp_path)
    assert len(dups) == 1


def test_find_duplicates_detects_normalised(tmp_path):
    """Same partition but different IDs should be flagged as a duplicate."""
    (tmp_path / "a.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    (tmp_path / "b.json").write_text(json.dumps({"solution": [[3, 9], [3, 9]]}))
    dups = find_duplicates(tmp_path)
    assert len(dups) == 1


def test_find_duplicates_returns_correct_paths(tmp_path):
    p1 = tmp_path / "first.json"
    p2 = tmp_path / "second.json"
    p1.write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    p2.write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    dups = find_duplicates(tmp_path)
    assert dups[0] == (p1, p2)


def test_find_duplicates_across_subdirs(tmp_path):
    """A duplicate across two different difficulty folders should be caught."""
    easy = tmp_path / "4x4" / "easy"
    hard = tmp_path / "4x4" / "hard"
    easy.mkdir(parents=True)
    hard.mkdir(parents=True)
    (easy / "puzzle_001.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    (hard / "puzzle_001.json").write_text(json.dumps({"solution": [[0, 1], [0, 1]]}))
    dups = find_duplicates(tmp_path)
    assert len(dups) == 1


# ---------------------------------------------------------------------------
# Integration test against the live puzzle bank (skipped if bank not yet built)
# ---------------------------------------------------------------------------

def test_daily_puzzles_globally_unique():
    """
    All puzzles in src/puzzles/daily/ must have distinct solution partitions.
    The tester/ directory is intentionally populated with copies from the bank
    and is excluded from this check.
    """
    daily_root = Path(__file__).parents[2] / "src" / "puzzles" / "daily"
    if not daily_root.exists() or not any(daily_root.glob("*.json")):
        pytest.skip("Daily puzzles not yet published — run scripts/publish.py first")
    dups = find_duplicates(daily_root)
    assert not dups, (
        f"{len(dups)} duplicate pair(s) in daily/:\n"
        + "\n".join(f"  {a.name} == {b.name}" for a, b in dups)
    )
