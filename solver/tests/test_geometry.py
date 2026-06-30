"""Unit tests for solver/geometry.py."""

from geometry import (
    neighbours,
    compute_perimeter,
    is_connected,
    count_2x2_blocks,
    compute_region_stats,
)

# ---------------------------------------------------------------------------
# neighbours
# ---------------------------------------------------------------------------


def test_neighbours_interior():
    result = sorted(neighbours(2, 2, 5, 5))
    assert result == sorted([(1, 2), (3, 2), (2, 1), (2, 3)])


def test_neighbours_corner():
    assert sorted(neighbours(0, 0, 4, 4)) == sorted([(1, 0), (0, 1)])


def test_neighbours_edge():
    assert sorted(neighbours(0, 2, 4, 4)) == sorted([(1, 2), (0, 1), (0, 3)])


def test_neighbours_1x1_grid():
    assert neighbours(0, 0, 1, 1) == []


# ---------------------------------------------------------------------------
# compute_perimeter
# ---------------------------------------------------------------------------


def test_perimeter_single_cell_interior():
    assert compute_perimeter({(2, 2)}, 5, 5) == 4


def test_perimeter_single_cell_corner():
    # Corner cell has 2 boundary edges + 2 facing other cells
    assert compute_perimeter({(0, 0)}, 4, 4) == 4


def test_perimeter_domino_horizontal():
    # Two adjacent cells in a row
    assert compute_perimeter({(0, 0), (0, 1)}, 4, 4) == 6


def test_perimeter_2x2_block():
    cells = {(0, 0), (0, 1), (1, 0), (1, 1)}
    assert compute_perimeter(cells, 4, 4) == 8


def test_perimeter_1x4_strip():
    cells = {(0, 0), (0, 1), (0, 2), (0, 3)}
    assert compute_perimeter(cells, 4, 4) == 10


def test_perimeter_l_shape():
    # L-shape: (0,0)(0,1)(1,0)
    cells = {(0, 0), (0, 1), (1, 0)}
    assert compute_perimeter(cells, 4, 4) == 8


def test_perimeter_2x3_block():
    cells = {(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2)}
    assert compute_perimeter(cells, 4, 4) == 10


# ---------------------------------------------------------------------------
# is_connected
# ---------------------------------------------------------------------------


def test_connected_empty_set():
    assert is_connected(set(), 4, 4) is True


def test_connected_single():
    assert is_connected({(1, 1)}, 4, 4) is True


def test_connected_line():
    assert is_connected({(0, 0), (0, 1), (0, 2)}, 4, 4) is True


def test_connected_l_shape():
    assert is_connected({(0, 0), (0, 1), (1, 0)}, 4, 4) is True


def test_not_connected_diagonal():
    # Diagonal cells are not orthogonally connected
    assert is_connected({(0, 0), (1, 1)}, 4, 4) is False


def test_not_connected_separated():
    assert is_connected({(0, 0), (2, 2)}, 4, 4) is False


# ---------------------------------------------------------------------------
# count_2x2_blocks
# ---------------------------------------------------------------------------


def test_count_2x2_empty_grid():
    grid = [[-1] * 4 for _ in range(4)]
    assert count_2x2_blocks(grid, 4, 4) == 0


def test_count_2x2_single_block():
    grid = [
        [0, 0, 1, 1],
        [0, 0, 1, 2],
        [3, 3, 3, 2],
        [4, 4, 4, 4],
    ]
    assert count_2x2_blocks(grid, 4, 4) == 1


def test_count_2x2_multiple_blocks():
    # 2×3 region 0 at top-left contains two overlapping 2×2 sub-blocks
    grid = [
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        [2, 2, 2, 1],
        [2, 2, 2, 1],
    ]
    # region 0: (0,0)(0,1)(0,2)(1,0)(1,1)(1,2) → 2 blocks
    # region 2: (2,0)(2,1)(2,2)(3,0)(3,1)(3,2) → 2 blocks
    assert count_2x2_blocks(grid, 4, 4) == 4


def test_count_2x2_no_cross_region():
    # Cells of different regions even if adjacent must not count
    grid = [
        [0, 1, 0, 1],
        [1, 0, 1, 0],
        [0, 1, 0, 1],
        [1, 0, 1, 0],
    ]
    assert count_2x2_blocks(grid, 4, 4) == 0


# ---------------------------------------------------------------------------
# compute_region_stats
# ---------------------------------------------------------------------------


def test_region_stats_known_solution(sol_4x4):
    stats = compute_region_stats(sol_4x4, 4, 4)
    assert stats[0]["cells"] == 6
    assert stats[0]["perim"] == 10
    assert stats[1]["cells"] == 5
    assert stats[1]["perim"] == 10
    assert stats[2]["cells"] == 3
    assert stats[2]["perim"] == 8
    assert stats[3]["cells"] == 2
    assert stats[3]["perim"] == 6
