# Acre

A daily logic puzzle game. Divide the grid into orthogonally connected regions — each region must satisfy both an **area** (A) and **perimeter** (P) clue. The puzzle has a unique solution.

## How to play

Each coloured clue cell shows two numbers:

```
  8
○ 10
```

The large number is the **area** — how many cells the region must contain.  
The circled number is the **perimeter** — how many edges are exposed to other regions or the grid border.

Drag from a clue cell to grow the region. Every cell must be filled. There is exactly one valid arrangement.

## Puzzle design

- Regions can be any connected shape, including 2×2 squares.
- A 2×2 block (A = 4, P = 8) is the only shape with those exact values — this gives players an immediate logical deduction and distinguishes the puzzle from Fillomino.
- Difficulty is rated by the number of "branches needed" when solving logically: 0 = easy, 1–3 = medium, 4+ = hard.

---

## Development

### Prerequisites

- Node.js 18+
- Python 3.12+

### Frontend

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # production build
npm run lint         # oxlint (zero warnings target)
npm run format       # prettier
```

### Puzzle generation

Puzzles are generated offline and stored in `puzzle-bank/` (gitignored). Only today's published set lives in `src/puzzles/daily/`.

```bash
# Generate puzzles into puzzle-bank/
python3 solver/generate_bank.py --size 4 --difficulty easy --count 10
python3 solver/generate_bank.py --all --count 10   # all 9 combinations

# Publish today's puzzles (copies from puzzle-bank/ → src/puzzles/daily/)
python3 scripts/publish.py

# Queue the next 7 days at once
python3 scripts/publish.py --days 7

# Then commit and deploy
git add src/puzzles/daily/ src/puzzles/meta.json
git commit -m "publish YYYY-MM-DD"
git push
```

### Python quality

```bash
~/.local/bin/pytest                          # 82 unit tests (~0.5 s)
~/.local/bin/black solver/ scripts/          # auto-format
~/.local/bin/pylint solver/*.py scripts/publish.py   # lint (target: 10.00/10)
```

---

## Project structure

```
src/
  App.jsx              # Main app — home, tutorial, play, win, archive screens
  App.css / index.css  # CSS variables for theming (light + dark)
  puzzles/
    daily/             # Today's published puzzles (6 files, one per combination)
    meta.json          # Launch date + available combinations

solver/
  solver.py            # CLI: python3 solver/solver.py --generate 5 5 --json
  geometry.py          # Pure grid helpers
  models.py            # Clue, Puzzle
  verifier.py          # verify(), region_valid()
  core.py              # Backtracking solver with reachability pruning
  generator.py         # generate_puzzle()
  difficulty.py        # rate_difficulty() — logical solving simulation
  export.py            # export_puzzle_json()
  deduplication.py     # normalize_solution(), find_duplicates()
  generate_bank.py     # Batch puzzle generator (writes to puzzle-bank/)
  tests/               # 82 pytest unit tests

scripts/
  publish.py           # Daily publish — copies bank → src/puzzles/daily/

docs/
  TASKS.md             # Task list
  ISSUE_LOG.md         # Open issues

puzzle-bank/           # gitignored — all generated puzzles, never public
  4x4/easy/
  4x4/medium/
  4x4/hard/
  5x5/{easy,medium,hard}/
  schedule.json        # Tracks which puzzle was published on which date
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Styling | Plain CSS with CSS variables (no Tailwind) |
| Linting | oxlint + Prettier (JS), pylint + black (Python) |
| Testing | pytest (Python) |
| Puzzle logic | Python (backtracking solver + logical difficulty rater) |
| Deployment | GitHub Pages / Vercel |
