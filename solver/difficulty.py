"""
Puzzle difficulty rating via logical solving simulation.

Simulates a human solver using two deduction rules:

1. Naked single  — only one region is adjacent to the cell and has
   remaining area capacity.
2. Forced reach  — a region has exactly as many reachable empty cells
   as it still needs; all of them must belong to it.

After exhausting all deductive moves, a "branch" (guess) is recorded
and the known solution is used to place one cell before continuing.
The total branch count is the difficulty score.
"""

from geometry import DIRS, count_2x2_blocks
from models import Puzzle


def rate_difficulty(puzzle: Puzzle, sol: list) -> dict:
    """
    Simulate logical solving and return difficulty metadata.

    Returns:
        twoByTwoCount  : number of 2×2 same-region blocks in the solution
        branchesNeeded : guesses required beyond pure deduction (0 = fully deductive)
        difficulty     : "easy" | "medium" | "hard"
    """
    rows, cols = puzzle.rows, puzzle.cols
    grid = [[-1] * cols for _ in range(rows)]
    for cl in puzzle.clues:
        grid[cl.clue_r][cl.clue_c] = cl.id

    def apply_forced() -> None:
        changed = True
        while changed:
            changed = False
            for (r, c), reg_id in _find_forced_cells(grid, puzzle).items():
                if grid[r][c] == -1:
                    grid[r][c] = reg_id
                    changed = True

    branches = 0
    apply_forced()

    while any(grid[r][c] < 0 for r in range(rows) for c in range(cols)):
        branches += 1
        placed = False
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == -1:
                    grid[r][c] = sol[r][c]
                    placed = True
                    break
            if placed:
                break
        apply_forced()

    two_by_two = count_2x2_blocks(sol, rows, cols)
    difficulty = "easy" if branches == 0 else ("medium" if branches <= 3 else "hard")

    return {
        "twoByTwoCount": two_by_two,
        "branchesNeeded": branches,
        "difficulty": difficulty,
    }


def _find_forced_cells(grid: list, puzzle: Puzzle) -> dict:
    """
    Return {(r, c): region_id} for cells determinable by logic alone.

    Uses two techniques:
    - Naked single: only one adjacent region has remaining capacity.
    - Forced reach: a region has exactly as many reachable empty cells
      as its remaining area need.
    """
    rows, cols = puzzle.rows, puzzle.cols
    region_counts = {cl.id: 0 for cl in puzzle.clues}
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] >= 0:
                region_counts[grid[r][c]] += 1

    forced: dict[tuple, int] = {}

    # Technique 1: naked singles
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] != -1:
                continue
            candidates = [
                cl.id for cl in puzzle.clues
                if region_counts[cl.id] < cl.area
                and any(
                    0 <= r + dr < rows and 0 <= c + dc < cols and grid[r + dr][c + dc] == cl.id
                    for dr, dc in DIRS
                )
            ]
            if len(candidates) == 1:
                forced[(r, c)] = candidates[0]

    # Technique 2: forced reach
    for cl in puzzle.clues:
        remaining = cl.area - region_counts[cl.id]
        if remaining <= 0:
            continue
        reachable = _reachable_empty(grid, puzzle, cl.id)
        if len(reachable) == remaining:
            for pos in reachable:
                forced[pos] = cl.id

    return forced


def _reachable_empty(grid: list, puzzle: Puzzle, region_id: int) -> set:
    """BFS from all cells of region_id through adjacent empty cells."""
    rows, cols = puzzle.rows, puzzle.cols
    visited: set = set()
    queue = []

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == region_id:
                visited.add((r, c))
                queue.append((r, c))

    reachable: set = set()
    while queue:
        r, c = queue.pop()
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in visited:
                visited.add((nr, nc))
                if grid[nr][nc] == -1:
                    reachable.add((nr, nc))
                    queue.append((nr, nc))

    return reachable
