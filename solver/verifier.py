"""Puzzle solution verifier."""

from geometry import compute_perimeter, is_connected, count_2x2_blocks
from models import Puzzle


def region_valid(cells: set, area: int, perim: int, rows: int, cols: int) -> bool:
    """Return True if a set of cells satisfies area, perimeter, and connectivity constraints."""
    return (
        len(cells) == area
        and compute_perimeter(cells, rows, cols) == perim
        and is_connected(cells, rows, cols)
    )


def verify(  # pylint: disable=too-many-branches
    puzzle: Puzzle, grid: list
) -> tuple[bool, list[str]]:
    """
    Verify a completed solution grid against a puzzle.
    Returns (is_valid, list_of_error_messages).
    The branch count reflects the number of distinct error conditions checked,
    not algorithmic complexity — suppression is appropriate here.
    """
    rows, cols = puzzle.rows, puzzle.cols
    errors: list[str] = []

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] < 0:
                errors.append(f"Cell ({r},{c}) is empty.")

    for cl in puzzle.clues:
        if grid[cl.clue_r][cl.clue_c] != cl.id:
            errors.append(
                f"Clue cell ({cl.clue_r},{cl.clue_c}) for region {cl.id} "
                f"is assigned to region {grid[cl.clue_r][cl.clue_c]}."
            )

    region_cells: dict[int, set] = {}
    for r in range(rows):
        for c in range(cols):
            region_cells.setdefault(grid[r][c], set()).add((r, c))

    known_ids = {cl.id for cl in puzzle.clues}
    unknown = set(region_cells.keys()) - known_ids
    if unknown:
        errors.append(f"Unknown region IDs in grid: {unknown}")

    for cl in puzzle.clues:
        cells = region_cells.get(cl.id, set())
        a = len(cells)
        p = compute_perimeter(cells, rows, cols)
        if a != cl.area:
            errors.append(f"Region {cl.id}: area={a}, expected {cl.area}.")
        if p != cl.perim:
            errors.append(f"Region {cl.id}: perimeter={p}, expected {cl.perim}.")
        if not is_connected(cells, rows, cols):
            errors.append(f"Region {cl.id}: not connected.")

    if count_2x2_blocks(grid, rows, cols) == 0:
        errors.append(
            "Puzzle has no 2×2 blocks — at least one region must contain one."
        )

    return len(errors) == 0, errors
