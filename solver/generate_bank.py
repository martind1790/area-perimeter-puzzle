"""
Puzzle bank generator.

Fills puzzle-bank/ with up to --count puzzles per size/difficulty combination.
When --all is used, generation rotates round-robin across all combinations so
the bank grows evenly even if the process is killed early.

Usage examples:
  python3 solver/generate_bank.py --all --count 50
  python3 solver/generate_bank.py --size 5 --difficulty hard --count 10
  python3 solver/generate_bank.py --all --count 500 --max 500
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

# Allow running as a script from the project root.
sys.path.insert(0, str(Path(__file__).parent))

from deduplication import load_fingerprints, normalize_solution  # noqa: E402
from difficulty import rate_difficulty  # noqa: E402
from export import export_puzzle_json  # noqa: E402
from generator import generate_puzzle, generate_puzzle_parallel  # noqa: E402

BANK_ROOT = Path(__file__).parent.parent / "puzzle-bank"
SIZE_KEYS = ["4x4", "5x5", "6x6"]
DIFF_KEYS = ["easy", "medium", "hard"]
DEFAULT_COUNT = 50
DEFAULT_MAX = 500


def _parse_size(raw: str) -> tuple[int, int]:
    """Accept '4', '4x4', or '4×4'."""
    raw = raw.replace("×", "x").lower()
    if "x" in raw:
        r, c = raw.split("x", 1)
        return int(r), int(c)
    n = int(raw)
    return n, n


def _next_puzzle_number(folder: Path) -> int:
    """Return the next free puzzle number (1-based) for a combo folder."""
    existing = sorted(folder.glob("puzzle_*.json"))
    if not existing:
        return 1
    last = int(existing[-1].stem.split("_")[1])
    return last + 1


def _generate_for_combo(
    # pylint: disable=too-many-arguments,too-many-positional-arguments,too-many-locals
    # One local per loop/IO step of the search-and-save sequence; splitting
    # this further would scatter a single linear sequence across helpers.
    rows: int,
    cols: int,
    diff: str,
    folder: Path,
    count: int,
    max_per_combo: int,
    fingerprints: set,
    seed: int | None,
    parallel: bool = False,
) -> int:
    """
    Generate up to `count` new puzzles for one size/difficulty combo.

    Skips duplicates (checked against fingerprints, which is updated in place).
    When parallel=True, each search distributes independent seed attempts
    across CPU cores (see generate_puzzle_parallel) — faster wall-clock time
    for larger grids, at the cost of using all available cores.
    Returns the number of puzzles successfully written.
    """
    folder.mkdir(parents=True, exist_ok=True)
    existing = len(list(folder.glob("puzzle_*.json")))
    target = min(existing + count, max_per_combo)

    if existing >= target:
        print(
            f"  {rows}x{cols}/{diff}: already at {existing} (max {max_per_combo}) — skipping"
        )
        return 0

    needed = target - existing
    written = 0
    attempts = 0
    next_num = _next_puzzle_number(folder)

    rng_seed = seed if seed is not None else int(time.time() * 1000) % (2**31)

    print(f"  {rows}x{cols}/{diff}: {existing} existing, generating {needed} more …")

    while written < needed:
        attempts += 1
        if parallel:
            result = generate_puzzle_parallel(
                rows, cols, seed_start=rng_seed + attempts * 1000
            )
        else:
            result = generate_puzzle(rows, cols, seed=rng_seed + attempts)
        if result is None:
            continue

        puzzle, sol = result
        meta = rate_difficulty(puzzle, sol)

        if meta["difficulty"] != diff:
            continue

        fp = normalize_solution(sol)
        if fp in fingerprints:
            continue

        fingerprints.add(fp)

        puzzle_id = f"puzzle_{next_num:03d}"
        json_str = export_puzzle_json(puzzle, sol, puzzle_id)

        out_path = folder / f"{puzzle_id}.json"
        out_path.write_text(json_str, encoding="utf-8")

        print(f"    Saved {out_path.name} (attempt {attempts})")
        next_num += 1
        written += 1
        attempts = 0  # reset attempt counter per successful puzzle

    return written


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Generate puzzle bank")
    parser.add_argument(
        "--all", action="store_true", help="Generate all size/difficulty combos"
    )
    parser.add_argument("--size", type=str, help="Grid size, e.g. 4 or 5x5")
    parser.add_argument("--difficulty", choices=DIFF_KEYS, help="Target difficulty")
    parser.add_argument(
        "--count",
        type=int,
        default=DEFAULT_COUNT,
        help=f"Puzzles to add per combo (default {DEFAULT_COUNT})",
    )
    parser.add_argument(
        "--max",
        type=int,
        default=DEFAULT_MAX,
        dest="max_per_combo",
        help=f"Hard ceiling per combo (default {DEFAULT_MAX})",
    )
    parser.add_argument("--seed", type=int, default=None, help="Random seed base")
    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Distribute each search across CPU cores (faster wall-clock, uses all cores)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=BANK_ROOT,
        help=f"Output root (default: {BANK_ROOT})",
    )
    args = parser.parse_args()

    out_root: Path = args.output
    out_root.mkdir(parents=True, exist_ok=True)

    # Load all existing fingerprints once — shared across all combos to prevent
    # cross-combo duplicates.
    print("Loading existing fingerprints …")
    fingerprints = load_fingerprints(out_root)
    print(f"  {len(fingerprints)} existing puzzles indexed.")

    if args.all:
        # Build list of (rows, cols, diff) combos, excluding 6x6 (too slow) unless
        # explicitly requested.  Round-robin so the bank grows evenly if killed early.
        combos = [(_parse_size(sk) + (diff,)) for sk in SIZE_KEYS for diff in DIFF_KEYS]

        # Keep rotating until every combo has hit its target.
        done: set[int] = set()
        while len(done) < len(combos):
            progress = False
            for i, (rows, cols, diff) in enumerate(combos):
                if i in done:
                    continue
                folder = out_root / f"{rows}x{cols}" / diff
                existing = len(list(folder.glob("puzzle_*.json")))
                target = min(existing + args.count, args.max_per_combo)
                if existing >= target:
                    done.add(i)
                    continue
                n = _generate_for_combo(
                    rows,
                    cols,
                    diff,
                    folder,
                    count=1,  # one at a time for round-robin
                    max_per_combo=args.max_per_combo,
                    fingerprints=fingerprints,
                    seed=args.seed,
                    parallel=args.parallel,
                )
                if n > 0:
                    progress = True
                # Re-check after each single puzzle
                existing = len(list(folder.glob("puzzle_*.json")))
                if existing >= target:
                    done.add(i)
            if not progress:
                # All combos hit target or made no progress — check again
                all_at_target = all(
                    len(list((out_root / f"{r}x{c}" / d).glob("puzzle_*.json")))
                    >= min(args.count, args.max_per_combo)
                    for (r, c, d) in combos
                )
                if all_at_target:
                    break
    else:
        if not args.size:
            parser.error("--size is required unless --all is given")
        rows, cols = _parse_size(args.size)
        diffs = [args.difficulty] if args.difficulty else DIFF_KEYS
        for diff in diffs:
            folder = out_root / f"{rows}x{cols}" / diff
            _generate_for_combo(
                rows,
                cols,
                diff,
                folder,
                count=args.count,
                max_per_combo=args.max_per_combo,
                fingerprints=fingerprints,
                seed=args.seed,
                parallel=args.parallel,
            )

    print("\nDone.")


if __name__ == "__main__":
    main()
