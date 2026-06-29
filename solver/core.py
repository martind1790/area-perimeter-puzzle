"""
Backtracking solver with incremental constraint propagation.

Pruning strategies (applied in order, cheapest first):

1. Area budget       — region already at its target area → skip (O(1)).
2. Perimeter budget  — incremental delta would exceed target → skip (O(1)).
3. Reachability      — after a placement, any incomplete region that can no
                       longer reach enough empty cells to fill its remaining
                       area → prune the whole branch (O(K·N) per node, but
                       catches dead-ends many levels before the leaf).

Cell ordering: adjacent regions are tried before non-adjacent ones, reducing
the effective branching factor without additional cost.
"""

from copy import deepcopy
from typing import Optional

from geometry import DIRS, neighbours
from models import Puzzle
from verifier import verify


class Solver:  # pylint: disable=too-few-public-methods
    """
    Backtracking solver that fills the grid cell by cell in raster order.

    Solutions are accumulated in self.solutions up to `limit`.
    Initialise and call solve(); do not reuse an instance.

    The single public method (solve) is intentional: this class encapsulates
    mutable backtracking state that must not be shared between calls.
    """

    def __init__(self, puzzle: Puzzle, limit: int = 2):
        self.puzzle = puzzle
        self.rows = puzzle.rows
        self.cols = puzzle.cols
        self.limit = limit
        self.solutions: list[list] = []

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def solve(self) -> list[list]:
        """Run the solver and return all solutions found (capped at limit)."""
        rows, cols = self.rows, self.cols
        grid = [[-1] * cols for _ in range(rows)]
        region_counts: dict[int, int] = {cl.id: 0 for cl in self.puzzle.clues}
        region_perim:  dict[int, int] = {cl.id: 0 for cl in self.puzzle.clues}

        # Place clue cells first; compute their initial perimeters afterwards
        # so adjacency between clue cells is handled correctly.
        for cl in self.puzzle.clues:
            grid[cl.clue_r][cl.clue_c] = cl.id
            region_counts[cl.id] = 1

        for cl in self.puzzle.clues:
            p = 0
            for dr, dc in DIRS:
                nr, nc = cl.clue_r + dr, cl.clue_c + dc
                if 0 <= nr < rows and 0 <= nc < cols:
                    if grid[nr][nc] != cl.id:
                        p += 1
                else:
                    p += 1
            region_perim[cl.id] = p

        self._backtrack(grid, 0, region_counts, region_perim)
        return self.solutions

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _perim_delta(self, grid: list, r: int, c: int, reg_id: int) -> int:
        """
        O(1) incremental change to reg_id's partial perimeter when placing at (r, c).

        Per neighbour direction:
        - Out of bounds          → +1 (new boundary edge for the new cell)
        - Same-region neighbour  → −1 (existing cell loses its edge toward (r,c);
                                        new cell's edge is internal, contributes 0)
        - Other / empty          → +1 (new cell gains an external edge)
        """
        rows, cols = self.rows, self.cols
        delta = 0
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                delta += -1 if grid[nr][nc] == reg_id else 1
            else:
                delta += 1
        return delta

    def _reachability_ok(  # pylint: disable=too-many-locals
        self, grid: list, region_counts: dict[int, int]
    ) -> bool:
        """
        Return False if any incomplete region can no longer reach enough empty
        cells to satisfy its remaining area need.

        Performs one BFS per incomplete region, expanding only through empty cells.
        Short-circuits as soon as enough reachable cells are found for that region.
        """
        rows, cols = self.rows, self.cols
        for cl in self.puzzle.clues:
            remaining = cl.area - region_counts[cl.id]
            if remaining <= 0:
                continue

            # BFS from all current cells of this region
            visited: set = set()
            queue: list = []
            for r in range(rows):
                for c in range(cols):
                    if grid[r][c] == cl.id:
                        visited.add((r, c))
                        queue.append((r, c))

            reachable = 0
            while queue:
                r, c = queue.pop()
                for dr, dc in DIRS:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in visited:
                        visited.add((nr, nc))
                        if grid[nr][nc] == -1:
                            reachable += 1
                            if reachable >= remaining:
                                break  # enough found for this region
                            queue.append((nr, nc))
                else:
                    continue
                break

            if reachable < remaining:
                return False

        return True

    def _backtrack(  # pylint: disable=too-many-locals,too-many-nested-blocks
        self,
        grid: list,
        pos: int,
        region_counts: dict[int, int],
        region_perim: dict[int, int],
    ) -> None:
        """Recursive backtracking step; fills one cell at a time in raster order.
        Local variable count and nesting depth are inherent to the algorithm."""
        if len(self.solutions) >= self.limit:
            return

        rows, cols = self.rows, self.cols

        # Advance past already-filled cells
        while pos < rows * cols and grid[pos // cols][pos % cols] != -1:
            pos += 1

        if pos == rows * cols:
            ok, _ = verify(self.puzzle, grid)
            if ok:
                self.solutions.append(deepcopy(grid))
            return

        r, c = pos // cols, pos % cols

        # Try adjacent regions first — exploits the connectivity constraint cheaply
        adj_ids = {grid[nr][nc] for (nr, nc) in neighbours(r, c, rows, cols) if grid[nr][nc] >= 0}
        candidates = sorted(
            [cl.id for cl in self.puzzle.clues],
            key=lambda x: (0 if x in adj_ids else 1),
        )

        for reg_id in candidates:
            if len(self.solutions) >= self.limit:
                return

            cl = self.puzzle.clues[reg_id]

            # Prune 1: area budget
            if region_counts[reg_id] >= cl.area:
                continue

            # Prune 2: perimeter budget (O(1))
            delta = self._perim_delta(grid, r, c, reg_id)
            if region_perim[reg_id] + delta > cl.perim:
                continue

            # Place
            grid[r][c] = reg_id
            region_perim[reg_id]  += delta
            region_counts[reg_id] += 1

            # Prune 3: reachability — most expensive, applied after placement
            if self._reachability_ok(grid, region_counts):
                self._backtrack(grid, pos + 1, region_counts, region_perim)

            # Unplace
            grid[r][c] = -1
            region_perim[reg_id]  -= delta
            region_counts[reg_id] -= 1


def count_solutions(puzzle: Puzzle, limit: int = 2) -> tuple[int, Optional[list]]:
    """Return (count_capped_at_limit, first_solution_or_None)."""
    solver = Solver(puzzle, limit=limit)
    sols = solver.solve()
    return len(sols), (sols[0] if sols else None)
