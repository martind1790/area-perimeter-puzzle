"""Random puzzle generator with uniqueness verification."""

import os
import random
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from typing import Optional

from geometry import neighbours, compute_perimeter, is_connected, count_2x2_blocks
from models import Clue, Puzzle
from core import count_solutions


def generate_puzzle(  # pylint: disable=too-many-locals
    rows: int,
    cols: int,
    num_regions: Optional[int] = None,
    max_attempts: int = 300,
    seed: Optional[int] = None,
) -> Optional[tuple[Puzzle, list]]:
    """
    Generate a valid puzzle with a unique solution and at least one 2×2 block.

    Strategy:
    1. Fill the grid randomly via flood-fill growth.
    2. Reject if any region is disconnected or no 2×2 block exists.
    3. Choose a random clue cell per region.
    4. Run the uniqueness checker — return on first unique result.

    Returns (puzzle, solution_grid) or None if no puzzle found within max_attempts.
    """
    rng = random.Random(seed)

    if num_regions is None:
        total = rows * cols
        num_regions = max(2, total // rng.randint(3, 5))

    for attempt in range(max_attempts):
        grid = _random_fill(rows, cols, num_regions, rng)
        if grid is None:
            continue

        region_cells: dict[int, set] = {}
        for r in range(rows):
            for c in range(cols):
                region_cells.setdefault(grid[r][c], set()).add((r, c))

        if len(region_cells) != num_regions:
            continue

        if any(not is_connected(cells, rows, cols) for cells in region_cells.values()):
            continue

        # At least one 2×2 block distinguishes the puzzle from Fillomino
        if count_2x2_blocks(grid, rows, cols) == 0:
            continue

        clues = [
            Clue(
                reg_id,
                *rng.choice(sorted(cells)),
                len(cells),
                compute_perimeter(cells, rows, cols),
            )
            for reg_id, cells in sorted(region_cells.items())
        ]
        puzzle = Puzzle(rows, cols, clues)

        n_sols, sol = count_solutions(puzzle, limit=2)
        if n_sols == 1:
            print(f"  Found unique puzzle on attempt {attempt + 1}")
            return puzzle, sol

    return None


def _random_fill(  # pylint: disable=too-many-locals
    rows: int, cols: int, num_regions: int, rng: random.Random
) -> Optional[list]:
    """
    Grow num_regions regions from random seed cells via randomised BFS.
    Allows 2×2 blocks to form naturally — they are required by the puzzle rules.
    """
    grid = [[-1] * cols for _ in range(rows)]
    all_cells = [(r, c) for r in range(rows) for c in range(cols)]
    rng.shuffle(all_cells)

    seeds = all_cells[:num_regions]
    if len(seeds) < num_regions:
        return None

    for i, (r, c) in enumerate(seeds):
        grid[r][c] = i

    frontier = list(seeds)

    for _ in range(rows * cols * 20):
        unfilled = [
            (r, c) for r in range(rows) for c in range(cols) if grid[r][c] == -1
        ]
        if not unfilled:
            break

        rng.shuffle(frontier)
        placed = False
        for r, c in frontier:
            reg = grid[r][c]
            empty_nbs = [
                nb for nb in neighbours(r, c, rows, cols) if grid[nb[0]][nb[1]] == -1
            ]
            if empty_nbs:
                nr, nc = rng.choice(empty_nbs)
                grid[nr][nc] = reg
                frontier.append((nr, nc))
                placed = True
                break

        if not placed:
            rng.shuffle(unfilled)
            for r, c in unfilled:
                adj = [
                    grid[nr][nc]
                    for (nr, nc) in neighbours(r, c, rows, cols)
                    if grid[nr][nc] >= 0
                ]
                if adj:
                    grid[r][c] = rng.choice(adj)
                    frontier.append((r, c))
                    placed = True
                    break
            if not placed:
                return None

    if any(grid[r][c] == -1 for r in range(rows) for c in range(cols)):
        return None
    return grid


def _try_seed(args: tuple) -> Optional[tuple[Puzzle, list]]:
    """Worker entry point: attempt exactly one seed (used by process pool)."""
    rows, cols, num_regions, seed = args
    return generate_puzzle(
        rows, cols, num_regions=num_regions, max_attempts=1, seed=seed
    )


def generate_puzzle_parallel(
    # pylint: disable=too-many-arguments,too-many-positional-arguments
    # All six parameters are independently meaningful tuning knobs (grid
    # shape, region count, seed range, worker count, search cap); bundling
    # them into a config object would add indirection without reducing
    # complexity for callers.
    rows: int,
    cols: int,
    num_regions: Optional[int] = None,
    seed_start: int = 0,
    num_workers: Optional[int] = None,
    max_seeds: int = 100_000,
) -> Optional[tuple[Puzzle, list]]:
    """
    Search for a unique-solution puzzle across many random seeds in parallel.

    Each seed is an independent attempt (one random fill + uniqueness check),
    distributed across a process pool so CPU cores run attempts concurrently.
    Returns as soon as any worker succeeds; the rest are abandoned. Intended
    for grid sizes where a single attempt is expensive (7×7+) — the speedup
    is linear in core count, not algorithmic, so very large grids may still
    be impractical.
    """
    workers = num_workers or os.cpu_count() or 4
    in_flight = workers * 2

    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_try_seed, (rows, cols, num_regions, seed_start + i)): i
            for i in range(in_flight)
        }
        next_seed = seed_start + in_flight

        while futures:
            done, _ = wait(futures, return_when=FIRST_COMPLETED)
            for fut in done:
                del futures[fut]
                result = fut.result()
                if result is not None:
                    executor.shutdown(wait=False, cancel_futures=True)
                    return result
                if next_seed < seed_start + max_seeds:
                    futures[
                        executor.submit(_try_seed, (rows, cols, num_regions, next_seed))
                    ] = next_seed
                    next_seed += 1

    return None
