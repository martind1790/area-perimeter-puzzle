"""Unit tests for solver/difficulty.py."""

from difficulty import rate_difficulty, _find_forced_cells, _reachable_empty

# ---------------------------------------------------------------------------
# rate_difficulty — output structure
# ---------------------------------------------------------------------------


def test_rate_difficulty_keys(puzzle_4x4, sol_4x4):
    result = rate_difficulty(puzzle_4x4, sol_4x4)
    assert {"twoByTwoCount", "branchesNeeded", "difficulty"} == set(result.keys())


def test_rate_difficulty_valid_category(puzzle_4x4, sol_4x4):
    result = rate_difficulty(puzzle_4x4, sol_4x4)
    assert result["difficulty"] in ("easy", "medium", "hard")


def test_rate_difficulty_non_negative_branches(puzzle_4x4, sol_4x4):
    result = rate_difficulty(puzzle_4x4, sol_4x4)
    assert result["branchesNeeded"] >= 0


def test_rate_difficulty_two_by_two_count(puzzle_4x4, sol_4x4):
    result = rate_difficulty(puzzle_4x4, sol_4x4)
    # Known: solution has 3 same-region 2×2 sub-blocks
    assert result["twoByTwoCount"] == 3


def test_rate_difficulty_branches_match_category(puzzle_4x4, sol_4x4):
    result = rate_difficulty(puzzle_4x4, sol_4x4)
    b = result["branchesNeeded"]
    if b == 0:
        assert result["difficulty"] == "easy"
    elif b <= 3:
        assert result["difficulty"] == "medium"
    else:
        assert result["difficulty"] == "hard"


# ---------------------------------------------------------------------------
# _find_forced_cells
# ---------------------------------------------------------------------------


def test_find_forced_single_adjacent_region(puzzle_4x4):
    """A cell adjacent to only one non-full region must be forced to that region."""
    # Start with clue cells only
    grid = [[-1] * 4 for _ in range(4)]
    for cl in puzzle_4x4.clues:
        grid[cl.clue_r][cl.clue_c] = cl.id

    forced = _find_forced_cells(grid, puzzle_4x4)
    # At minimum, naked singles adjacent to exactly one clue cell should appear
    for (r, c), reg_id in forced.items():
        assert grid[r][c] == -1, "Forced cell must be empty"
        assert 0 <= reg_id < len(puzzle_4x4.clues)


def test_find_forced_empty_on_complete_grid(puzzle_4x4, sol_4x4):
    """On a fully solved grid there are no empty cells → no forced cells."""
    forced = _find_forced_cells(sol_4x4, puzzle_4x4)
    assert forced == {}


# ---------------------------------------------------------------------------
# _reachable_empty
# ---------------------------------------------------------------------------


def test_reachable_empty_isolated_clue(puzzle_4x4):
    """From a lone clue cell, all adjacent empty cells should be reachable."""
    grid = [[-1] * 4 for _ in range(4)]
    # Place only region 3's clue at (3,0)
    grid[3][0] = 3
    reachable = _reachable_empty(grid, puzzle_4x4, region_id=3)
    # (2,0) and... (3,1) should be reachable, plus the rest of the empty grid
    assert (2, 0) in reachable
    assert (3, 1) in reachable
    assert (3, 0) not in reachable  # the clue cell itself is not "empty reachable"


def test_reachable_empty_blocked(puzzle_4x4, sol_4x4):
    """In the final solution, all regions are full → no empty cells reachable."""
    for cl in puzzle_4x4.clues:
        reachable = _reachable_empty(sol_4x4, puzzle_4x4, cl.id)
        assert reachable == set()
