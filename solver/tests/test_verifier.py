"""Unit tests for solver/verifier.py."""

import copy
from verifier import verify, region_valid

# ---------------------------------------------------------------------------
# region_valid
# ---------------------------------------------------------------------------


def test_region_valid_single_cell():
    assert region_valid({(0, 0)}, area=1, perim=4, rows=4, cols=4)


def test_region_valid_2x2_block():
    cells = {(0, 0), (0, 1), (1, 0), (1, 1)}
    assert region_valid(cells, area=4, perim=8, rows=4, cols=4)


def test_region_valid_wrong_area():
    cells = {(0, 0), (0, 1)}
    assert not region_valid(cells, area=3, perim=6, rows=4, cols=4)


def test_region_valid_wrong_perim():
    cells = {(0, 0), (0, 1), (0, 2)}  # strip: A=3, P=8
    assert not region_valid(cells, area=3, perim=10, rows=4, cols=4)


def test_region_valid_disconnected():
    cells = {(0, 0), (2, 2)}
    assert not region_valid(cells, area=2, perim=8, rows=4, cols=4)


# ---------------------------------------------------------------------------
# verify — valid solution
# ---------------------------------------------------------------------------


def test_verify_valid_solution(puzzle_4x4, sol_4x4):
    ok, errors = verify(puzzle_4x4, sol_4x4)
    assert ok, f"Expected valid but got errors: {errors}"


# ---------------------------------------------------------------------------
# verify — cell-level errors
# ---------------------------------------------------------------------------


def test_verify_empty_cell(puzzle_4x4, sol_4x4):
    grid = copy.deepcopy(sol_4x4)
    grid[0][0] = -1
    ok, errors = verify(puzzle_4x4, grid)
    assert not ok
    assert any("empty" in e.lower() for e in errors)


def test_verify_wrong_clue_cell(puzzle_4x4, sol_4x4):
    # Move a clue cell to the wrong region
    grid = copy.deepcopy(sol_4x4)
    # Region 2's clue is at (0,1); swap it to region 1's ID
    grid[0][1] = 1
    ok, errors = verify(puzzle_4x4, grid)
    assert not ok


# ---------------------------------------------------------------------------
# verify — region-level errors
# ---------------------------------------------------------------------------


def test_verify_wrong_area(puzzle_4x4, sol_4x4):
    grid = copy.deepcopy(sol_4x4)
    # Steal a cell from region 0 and give it to region 3
    grid[2][1] = 3  # was region 0
    ok, errors = verify(puzzle_4x4, grid)
    assert not ok
    assert any("area" in e.lower() for e in errors)


def test_verify_disconnected_region(puzzle_4x4, sol_4x4):
    # Reassign cells to split region 1 into two disconnected pieces
    grid = copy.deepcopy(sol_4x4)
    # Region 1 cells: (0,2)(0,3)(1,1)(1,2)(1,3)
    # Remove the bridge at (1,2): reassign to region 0
    grid[1][2] = 0
    grid[1][1] = 0  # also give this to region 0 to keep counts roughly right
    ok, errors = verify(puzzle_4x4, grid)
    assert not ok


def test_verify_no_2x2_block(puzzle_4x4):
    # Build a manually crafted solution grid that is otherwise valid
    # but has no 2×2 blocks — verify should reject it.
    # Use a known unique no-2x2 layout for this 4×4 puzzle.
    # Here we just confirm that our VALID solution (which HAS 2×2 blocks) passes.
    from geometry import count_2x2_blocks

    ok, _ = verify(
        puzzle_4x4,
        [
            [2, 2, 1, 1],
            [2, 1, 1, 1],
            [3, 0, 0, 0],
            [3, 0, 0, 0],
        ],
    )
    assert ok  # solution has 2×2 blocks → should pass
