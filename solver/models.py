"""Data classes for puzzle representation."""

from __future__ import annotations

from typing import Optional

from geometry import is_connected, count_2x2_blocks, compute_region_stats


class Clue:
    """A single region clue: the cell position plus its area and perimeter targets."""

    # pylint: disable=too-few-public-methods
    # Clue is a plain data container; adding artificial methods to satisfy this
    # threshold would add noise without value.

    def __init__(self, region_id: int, clue_r: int, clue_c: int, area: int, perim: int):
        self.id = region_id
        self.clue_r = clue_r
        self.clue_c = clue_c
        self.area = area
        self.perim = perim

    def __repr__(self) -> str:
        return (
            f"Clue(id={self.id}, pos=({self.clue_r},{self.clue_c}), "
            f"A={self.area}, P={self.perim})"
        )


class Puzzle:
    """A puzzle instance: grid dimensions plus a list of region clues."""

    def __init__(self, rows: int, cols: int, clues: list[Clue]):
        self.rows = rows
        self.cols = cols
        self.clues = clues
        self.clue_at: dict[tuple[int, int], Clue] = {
            (c.clue_r, c.clue_c): c for c in clues
        }

    def display(self, solution: Optional[list] = None) -> None:
        """Print the clue grid; optionally show region IDs from a solution."""
        print(f"\n{'='*40}")
        print(f"  {self.rows}×{self.cols} Area+Perimeter Puzzle — CLUES")
        print(f"{'='*40}")
        for r in range(self.rows):
            row_str = ""
            for c in range(self.cols):
                if (r, c) in self.clue_at:
                    cl = self.clue_at[(r, c)]
                    row_str += f"[A{cl.area:2d}P{cl.perim:2d}]"
                else:
                    row_str += (
                        f"[  {solution[r][c]:2d}   ]" if solution else "[       ]"
                    )
            print(row_str)
        print()

    def display_solution(self, grid: list) -> None:
        """Print a colour-coded solution grid with per-region stats."""
        colours = [
            "\033[44m",
            "\033[42m",
            "\033[45m",
            "\033[43m",
            "\033[46m",
            "\033[41m",
            "\033[47m",
            "\033[100m",
        ]
        reset = "\033[0m"
        print(f"\n{'='*40}")
        print(f"  Solution ({self.rows}×{self.cols})")
        print(f"{'='*40}")
        for r in range(self.rows):
            row_str = ""
            for c in range(self.cols):
                v = grid[r][c]
                marker = "*" if (r, c) in self.clue_at else " "
                row_str += f"{colours[v % len(colours)]} {v}{marker}{reset}"
            print(row_str)
        print()

        two_by_two = count_2x2_blocks(grid, self.rows, self.cols)
        stats = compute_region_stats(grid, self.rows, self.cols)
        print(f"  2×2 blocks in solution: {two_by_two}")
        print("  Region summary:")
        for cl in self.clues:
            s = stats.get(cl.id, {"cells": 0, "perim": 0})
            ok_a = "✓" if s["cells"] == cl.area else f"✗(got {s['cells']})"
            ok_p = "✓" if s["perim"] == cl.perim else f"✗(got {s['perim']})"
            cells = {
                (r, c)
                for r in range(self.rows)
                for c in range(self.cols)
                if grid[r][c] == cl.id
            }
            conn = (
                "✓" if is_connected(cells, self.rows, self.cols) else "✗ disconnected"
            )
            print(
                f"  Region {cl.id}: A={cl.area}{ok_a}  P={cl.perim}{ok_p}  connected={conn}"
            )
        print()
