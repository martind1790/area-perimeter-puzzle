"""
Populate src/puzzles/tester/ with a curated selection from the puzzle bank.

Picks puzzles across all available size/difficulty combinations and copies
them to src/puzzles/tester/NNN.json. Testers play these puzzles in order.

Usage:
  python3 scripts/populate-tester.py                  # 2 per combination (up to 18 total)
  python3 scripts/populate-tester.py --per-combo 3    # 3 per combination
  python3 scripts/populate-tester.py --clear          # clear and repopulate
"""

from __future__ import annotations

import argparse
import json
import shutil
import random
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
BANK_DIR     = PROJECT_ROOT / "puzzle-bank"
TESTER_DIR   = PROJECT_ROOT / "src" / "puzzles" / "tester"

COMBOS = [
    ("4x4", "easy"),   ("4x4", "medium"),   ("4x4", "hard"),
    ("5x5", "easy"),   ("5x5", "medium"),   ("5x5", "hard"),
    ("6x6", "easy"),   ("6x6", "medium"),   ("6x6", "hard"),
]


def pick_puzzles(size: str, diff: str, n: int) -> list[Path]:
    """Return up to n randomly sampled puzzles from the bank for this combo."""
    pool_dir = BANK_DIR / size / diff
    if not pool_dir.is_dir():
        return []
    available = sorted(pool_dir.glob("puzzle_*.json"))
    return random.sample(available, min(n, len(available)))


def populate(per_combo: int = 2, seed: int | None = None, clear: bool = False) -> None:
    """Copy puzzle files from the bank to src/puzzles/tester/."""
    if seed is not None:
        random.seed(seed)

    TESTER_DIR.mkdir(parents=True, exist_ok=True)

    if clear:
        for f in TESTER_DIR.glob("*.json"):
            f.unlink()
        print("Cleared existing tester puzzles.")

    # Collect and shuffle so difficulty is interleaved (not all easy then all hard)
    selected: list[tuple[str, str, Path]] = []
    for size, diff in COMBOS:
        for path in pick_puzzles(size, diff, per_combo):
            selected.append((size, diff, path))

    random.shuffle(selected)

    existing_max = max(
        (int(f.stem) for f in TESTER_DIR.glob("*.json") if f.stem.isdigit()),
        default=0,
    )

    added = 0
    for i, (size, diff, src) in enumerate(selected, start=existing_max + 1):
        dst = TESTER_DIR / f"{i:03d}.json"
        shutil.copy(src, dst)
        data = json.loads(dst.read_text(encoding="utf-8"))
        print(f"  {dst.name}: {size} {diff} — {data.get('id', '?')}")
        added += 1

    print(f"\nAdded {added} puzzles to {TESTER_DIR.relative_to(PROJECT_ROOT)}")
    print("Now run: npm run build  (or npm run dev to test immediately)")


def main() -> None:
    """Parse CLI arguments and run the population script."""
    parser = argparse.ArgumentParser(description="Populate src/puzzles/tester/")
    parser.add_argument("--per-combo", type=int, default=2,
                        help="Puzzles per size/difficulty combination (default: 2)")
    parser.add_argument("--seed",  type=int,  default=None,
                        help="Random seed for reproducible selection")
    parser.add_argument("--clear", action="store_true",
                        help="Remove existing tester puzzles before adding new ones")
    args = parser.parse_args()
    populate(per_combo=args.per_combo, seed=args.seed, clear=args.clear)


if __name__ == "__main__":
    main()
