"""
Daily puzzle publisher for Acre.

Picks one puzzle per size/difficulty combination from the private puzzle bank,
copies it to src/puzzles/daily/ (which IS committed and bundled), and updates
the schedule so the same puzzle is never published twice.

Run this once per day before deploying:

  python3 scripts/publish.py              # publish today
  python3 scripts/publish.py --days 7    # queue the next 7 days at once
  python3 scripts/publish.py --date 2026-07-01  # publish a specific date
  python3 scripts/publish.py --force     # re-publish today even if already done

Workflow:
  1. python3 solver/generate_bank.py --all --count 10   → fills puzzle-bank/
  2. python3 scripts/publish.py                         → copies to src/puzzles/daily/
  3. git add src/puzzles/daily/ src/puzzles/meta.json && git commit -m "publish YYYY-MM-DD"
  4. git push  (triggers deploy)
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT  = Path(__file__).parent.parent
BANK_DIR      = PROJECT_ROOT / "puzzle-bank"
DAILY_DIR     = PROJECT_ROOT / "src" / "puzzles" / "daily"
SCHEDULE_FILE = BANK_DIR / "schedule.json"
META_FILE     = PROJECT_ROOT / "src" / "puzzles" / "meta.json"

# Canonical order for size/difficulty combinations.
COMBOS = [
    ("4x4", "easy"),   ("4x4", "medium"),   ("4x4", "hard"),
    ("5x5", "easy"),   ("5x5", "medium"),   ("5x5", "hard"),
    ("6x6", "easy"),   ("6x6", "medium"),   ("6x6", "hard"),
]


def load_schedule() -> dict:
    """Load the schedule from puzzle-bank/schedule.json."""
    if SCHEDULE_FILE.exists():
        return json.loads(SCHEDULE_FILE.read_text(encoding="utf-8"))
    return {}


def save_schedule(schedule: dict) -> None:
    """Persist the schedule back to puzzle-bank/schedule.json."""
    BANK_DIR.mkdir(parents=True, exist_ok=True)
    SCHEDULE_FILE.write_text(json.dumps(schedule, indent=2, sort_keys=True), encoding="utf-8")


def available_combos() -> list[str]:
    """Return size-difficulty combo keys that have at least one puzzle in the bank."""
    return [
        f"{size}-{diff}"
        for size, diff in COMBOS
        if (BANK_DIR / size / diff).is_dir()
        and any((BANK_DIR / size / diff).glob("puzzle_*.json"))
    ]


def pick_next_puzzle(size: str, diff: str, schedule: dict) -> str | None:
    """
    Return the filename of the next unpublished puzzle for this combo.
    Picks from puzzle-bank/<size>/<diff>/ in sorted order, skipping any
    already recorded in the schedule.  Wraps around if all are used.
    """
    pool_dir = BANK_DIR / size / diff
    if not pool_dir.is_dir():
        return None

    all_files = sorted(f.name for f in pool_dir.glob("puzzle_*.json"))
    if not all_files:
        return None

    combo_key = f"{size}-{diff}"
    used = {entry[combo_key] for entry in schedule.values() if combo_key in entry}
    unused = [f for f in all_files if f not in used]

    return (unused or all_files)[0]


def publish_date(target: str, schedule: dict, force: bool = False) -> bool:
    """
    Publish one date.  Returns True if anything was written.
    Updates schedule in place (caller must save).
    """
    if target in schedule and not force:
        print(f"  {target} already published — use --force to overwrite.")
        return False

    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    entry: dict[str, str] = {}
    published = []
    missing = []

    for size, diff in COMBOS:
        filename = pick_next_puzzle(size, diff, schedule)
        combo_key = f"{size}-{diff}"
        if filename is None:
            missing.append(combo_key)
            continue

        src = BANK_DIR / size / diff / filename
        dst = DAILY_DIR / f"{combo_key}.json"
        shutil.copy(src, dst)
        entry[combo_key] = filename
        published.append(f"  {combo_key}: {filename}")

    schedule[target] = entry

    print(f"{target}:")
    for line in published:
        print(line)
    if missing:
        print(f"  (skipped — no puzzles in bank: {', '.join(missing)})")

    return True


def update_meta(schedule: dict) -> None:
    """Write src/puzzles/meta.json with launch date and available combos."""
    meta = {
        "launchDate": min(schedule.keys()) if schedule else str(date.today()),
        "availableCombos": available_combos(),
    }
    META_FILE.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"\nUpdated meta.json — launch date: {meta['launchDate']}, "
          f"{len(meta['availableCombos'])} combos available")


def main() -> None:
    """Parse CLI arguments and run the publisher."""
    parser = argparse.ArgumentParser(description="Publish daily Acre puzzles")
    parser.add_argument(
        "--date", default=None,
        help="Date to publish (YYYY-MM-DD, default: today)",
    )
    parser.add_argument(
        "--days", type=int, default=1,
        help="Publish this many consecutive days starting from --date (default: 1)",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-publish even if the date is already in the schedule",
    )
    args = parser.parse_args()

    start = date.fromisoformat(args.date) if args.date else date.today()
    schedule = load_schedule()

    any_published = False
    for i in range(args.days):
        target = str(start + timedelta(days=i))
        if publish_date(target, schedule, force=args.force):
            any_published = True

    if any_published:
        save_schedule(schedule)
        update_meta(schedule)
        print("\nNext steps:")
        print("  git add src/puzzles/daily/ src/puzzles/meta.json")
        print(f"  git commit -m 'publish {start}'")
        print("  git push")


if __name__ == "__main__":
    main()
