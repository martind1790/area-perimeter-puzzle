"""
Area + Perimeter Puzzle — CLI entry point.

When run as `python3 solver/solver.py`, Python automatically adds the script's
directory to sys.path, so sibling modules (geometry, models, …) are importable
without any path manipulation.

Usage:
  python3 solver/solver.py                        # demo 4×4 puzzle
  python3 solver/solver.py --generate 5 5         # generate a 5×5 puzzle
  python3 solver/solver.py --generate 6 6 --json  # output JSON for the front-end
  python3 solver/solver.py --generate 4 4 --seed 7 --json
"""

import argparse
import time

from generator import generate_puzzle
from difficulty import rate_difficulty
from export import export_puzzle_json, export_js


def demo_generate(rows: int, cols: int, seed=None, as_json: bool = False) -> None:
    """Generate one puzzle and print its solution, difficulty rating, and export."""
    print(f"\n=== GENERATOR: {rows}×{cols} ===")
    t0 = time.time()
    result = generate_puzzle(rows, cols, seed=seed)
    elapsed = time.time() - t0

    if result is None:
        print("  Failed to generate a puzzle. Try again or increase max_attempts.")
        return

    puzzle, sol = result
    print(f"  Generated in {elapsed:.2f}s")
    puzzle.display()
    puzzle.display_solution(sol)

    diff = rate_difficulty(puzzle, sol)
    print(
        f"  Difficulty: {diff['difficulty']} ({diff['branchesNeeded']} branches needed)"
    )
    print(f"  2×2 blocks: {diff['twoByTwoCount']}")

    if as_json:
        puzzle_id = f"puzzle_{rows}x{cols}"
        print(f"\n--- JSON (save to src/puzzles/{rows}x{cols}/) ---")
        print(export_puzzle_json(puzzle, sol, puzzle_id))
    else:
        print("\n--- JS export ---")
        print(export_js(puzzle, sol))


def main() -> None:
    """Parse CLI arguments and run the requested operation."""
    parser = argparse.ArgumentParser(description="Area+Perimeter puzzle tools")
    parser.add_argument(
        "--generate",
        nargs=2,
        type=int,
        metavar=("ROWS", "COLS"),
        help="Generate a new puzzle of the given size",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON (use with --generate)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for reproducible generation",
    )
    args = parser.parse_args()

    rows, cols = args.generate if args.generate else (4, 4)
    demo_generate(rows, cols, seed=args.seed, as_json=args.json)


if __name__ == "__main__":
    main()
