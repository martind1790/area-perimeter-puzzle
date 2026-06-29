"""Unit tests for solver/generator.py."""

import pytest
from generator import generate_puzzle, _random_fill
from geometry import count_2x2_blocks, is_connected
from verifier import verify
from core import count_solutions


# ---------------------------------------------------------------------------
# generate_puzzle — basic contract
# ---------------------------------------------------------------------------

def test_generate_4x4_returns_result():
    result = generate_puzzle(4, 4, seed=7)
    assert result is not None


def test_generate_returns_correct_types():
    result = generate_puzzle(4, 4, seed=7)
    puzzle, sol = result
    assert puzzle.rows == 4 and puzzle.cols == 4
    assert len(sol) == 4 and len(sol[0]) == 4


def test_generate_solution_passes_verify():
    result = generate_puzzle(4, 4, seed=7)
    puzzle, sol = result
    ok, errors = verify(puzzle, sol)
    assert ok, f"Verify failed: {errors}"


def test_generate_solution_is_unique():
    result = generate_puzzle(4, 4, seed=7)
    puzzle, sol = result
    n, _ = count_solutions(puzzle, limit=2)
    assert n == 1


def test_generate_has_at_least_one_2x2():
    result = generate_puzzle(4, 4, seed=7)
    _, sol = result
    assert count_2x2_blocks(sol, 4, 4) >= 1


def test_generate_all_regions_connected():
    result = generate_puzzle(4, 4, seed=7)
    puzzle, sol = result
    for cl in puzzle.clues:
        cells = {(r, c) for r in range(4) for c in range(4) if sol[r][c] == cl.id}
        assert is_connected(cells, 4, 4), f"Region {cl.id} is not connected"


def test_generate_covers_all_cells():
    result = generate_puzzle(4, 4, seed=7)
    _, sol = result
    assert all(sol[r][c] >= 0 for r in range(4) for c in range(4))


# ---------------------------------------------------------------------------
# generate_puzzle — determinism
# ---------------------------------------------------------------------------

def test_generate_deterministic():
    r1 = generate_puzzle(4, 4, seed=42)
    r2 = generate_puzzle(4, 4, seed=42)
    assert r1 is not None and r2 is not None
    _, sol1 = r1
    _, sol2 = r2
    assert sol1 == sol2


def test_different_seeds_may_differ():
    r1 = generate_puzzle(4, 4, seed=1)
    r2 = generate_puzzle(4, 4, seed=2)
    # It's theoretically possible for two seeds to produce the same puzzle,
    # but in practice they should differ for small grids
    if r1 and r2:
        _, s1 = r1
        _, s2 = r2
        # Just ensure both are valid — don't assert inequality
        assert s1 is not None and s2 is not None


# ---------------------------------------------------------------------------
# generate_puzzle — 5×5
# ---------------------------------------------------------------------------

def test_generate_5x5_valid():
    result = generate_puzzle(5, 5, seed=11)
    assert result is not None
    puzzle, sol = result
    ok, errors = verify(puzzle, sol)
    assert ok, f"Verify failed: {errors}"


def test_generate_5x5_has_2x2():
    result = generate_puzzle(5, 5, seed=11)
    _, sol = result
    assert count_2x2_blocks(sol, 5, 5) >= 1


# ---------------------------------------------------------------------------
# _random_fill
# ---------------------------------------------------------------------------

def test_random_fill_covers_all_cells():
    import random
    rng = random.Random(0)
    grid = _random_fill(4, 4, 4, rng)
    assert grid is not None
    assert all(grid[r][c] >= 0 for r in range(4) for c in range(4))


def test_random_fill_uses_correct_region_count():
    import random
    rng = random.Random(0)
    grid = _random_fill(4, 4, 3, rng)
    assert grid is not None
    region_ids = {grid[r][c] for r in range(4) for c in range(4)}
    assert region_ids == {0, 1, 2}
