"""Unit tests for solver/core.py (Solver and count_solutions)."""

from models import Clue, Puzzle
from core import Solver, count_solutions

# ---------------------------------------------------------------------------
# count_solutions
# ---------------------------------------------------------------------------


def test_count_solutions_unique(puzzle_4x4, sol_4x4):
    n, sol = count_solutions(puzzle_4x4, limit=2)
    assert n == 1, f"Expected 1 solution, got {n}"
    assert sol == sol_4x4


def test_count_solutions_limit_1(puzzle_4x4, sol_4x4):
    n, sol = count_solutions(puzzle_4x4, limit=1)
    assert n == 1
    assert sol == sol_4x4


def test_count_solutions_returns_none_on_no_solution():
    # Impossible puzzle: clue cell demands A=1,P=4 but is surrounded,
    # making perimeter impossible — solver should find 0 solutions.
    impossible = Puzzle(
        2,
        2,
        [
            Clue(0, 0, 0, 4, 99),  # perim=99 is unreachable in a 2×2 grid
        ],
    )
    n, sol = count_solutions(impossible, limit=2)
    assert n == 0
    assert sol is None


# ---------------------------------------------------------------------------
# Solver internals
# ---------------------------------------------------------------------------


def test_solver_perim_delta_boundary():
    """Cell at (0,0) in a 4×4 grid with no same-region neighbours → delta=4."""
    puzzle = Puzzle(4, 4, [Clue(0, 0, 0, 4, 8)])
    s = Solver(puzzle)
    # Temporarily build a minimal grid with just the clue cell
    grid = [[-1] * 4 for _ in range(4)]
    grid[0][0] = 0
    # A new cell at (0,1): one same-region neighbour (0,0), 1 boundary (up), 1 external (right)
    # Expected delta = 4 - 2*1 = 2
    delta = s._perim_delta(grid, 0, 1, 0)
    assert delta == 2


def test_solver_perim_delta_two_same_region_neighbours():
    """Cell with 2 same-region neighbours → delta = 4 - 2*2 = 0."""
    puzzle = Puzzle(4, 4, [Clue(0, 0, 0, 4, 8)])
    s = Solver(puzzle)
    grid = [[-1] * 4 for _ in range(4)]
    grid[1][0] = 0
    grid[1][2] = 0
    # New cell at (1,1): left=(1,0)=same, right=(1,2)=same → 2 same-region neighbours
    # up=(0,1)=empty → +1, down=(2,1)=empty → +1, left=-1, right=-1 → delta = +1+1-1-1 = 0
    delta = s._perim_delta(grid, 1, 1, 0)
    assert delta == 0


def test_reachability_ok_all_complete(puzzle_4x4, sol_4x4):
    """All regions at target area → reachability check must return True."""
    s = Solver(puzzle_4x4)
    region_counts = {cl.id: cl.area for cl in puzzle_4x4.clues}
    assert s._reachability_ok(sol_4x4, region_counts) is True


def test_reachability_ok_isolated_region(puzzle_4x4):
    """A region that has been cut off from the cells it still needs → False."""
    s = Solver(puzzle_4x4)
    # Place region 0's clue cell only (1 of 6 needed), then fill all neighbouring
    # empty cells with a different region so region 0 has no reachable empty cells.
    grid = [[1] * 4 for _ in range(4)]  # fill everything with region 1
    grid[2][3] = 0  # region 0 clue cell
    region_counts = {0: 1, 1: 15, 2: 0, 3: 0}
    # Region 0 needs 5 more cells but all neighbours are region 1 → unreachable
    assert s._reachability_ok(grid, region_counts) is False
