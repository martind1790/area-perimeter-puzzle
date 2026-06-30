"""
Shared pytest fixtures and path setup for solver tests.

All tests use the same well-known 4×4 puzzle (generated with seed=7)
whose solution has been manually verified.
"""

import sys
import os
import pytest

# Make sibling modules in solver/ importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import Clue, Puzzle  # noqa: E402

# ---------------------------------------------------------------------------
# Verified 4×4 puzzle (seed=7)
#
# Solution:           Region cells:
#   2 2 1 1           0 (blue)  : (2,1)(2,2)(2,3)(3,1)(3,2)(3,3) — 2×3 block, A=6 P=10
#   2 1 1 1           1 (green) : (0,2)(0,3)(1,1)(1,2)(1,3)       — L-shape,  A=5 P=10
#   3 0 0 0           2 (pink)  : (0,0)(0,1)(1,0)                  — L-shape,  A=3 P=8
#   3 0 0 0           3 (yellow): (2,0)(3,0)                        — domino,   A=2 P=6
# ---------------------------------------------------------------------------


@pytest.fixture
def puzzle_4x4():
    """Return the known 4×4 Puzzle object."""
    return Puzzle(
        4,
        4,
        [
            Clue(0, 2, 3, 6, 10),
            Clue(1, 0, 3, 5, 10),
            Clue(2, 0, 1, 3, 8),
            Clue(3, 3, 0, 2, 6),
        ],
    )


@pytest.fixture
def sol_4x4():
    """Return the known 4×4 solution grid."""
    return [
        [2, 2, 1, 1],
        [2, 1, 1, 1],
        [3, 0, 0, 0],
        [3, 0, 0, 0],
    ]
