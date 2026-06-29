# Area + Perimeter Puzzle — Claude Code Instructions

## Project overview

A daily logic puzzle game called **Acre**. Players partition a grid into orthogonally connected regions; each region must satisfy an area (A) and perimeter (P) clue. The puzzle has a unique solution and always contains at least one 2×2 block, which differentiates it from Fillomino.

Docs: [docs/CLAUDE_CODE_BRIEFING.md](docs/CLAUDE_CODE_BRIEFING.md)  
Issues: [docs/ISSUE_LOG.md](docs/ISSUE_LOG.md)  
Tasks: [docs/TASKS.md](docs/TASKS.md)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite (JSX, plain CSS — no Tailwind) |
| Puzzle data | JSON files in `src/puzzles/` |
| Puzzle generation | Python in `solver/` |
| Deployment | GitHub Pages / Vercel |

---

## Project structure

```
src/
  App.jsx              # Main app (all screens: home, tutorial, play, win)
  App.css / index.css  # Styles with CSS variables for theming
  components/          # Older component prototypes (Grid, PuzzlePlayer, Tutorial)
  puzzles/             # JSON puzzle files
solver/
  solver.py            # CLI entry point: python solver/solver.py --generate 5 5 --json
  geometry.py          # Pure grid geometry helpers
  models.py            # Clue, Puzzle dataclasses
  verifier.py          # verify(), region_valid()
  core.py              # Backtracking Solver, count_solutions()
  generator.py         # generate_puzzle(), _random_fill()
  difficulty.py        # rate_difficulty(), logical solving simulation
  export.py            # export_puzzle_json(), export_js()
docs/
  TASKS.md             # Prioritised task list
  ISSUE_LOG.md         # Open/closed issues — never mark resolved without user approval
  CLAUDE_CODE_BRIEFING.md  # Full project brief
```

---

## Key design decisions

1. **At least one 2×2 block required per puzzle.** A 2×2 block (A=4, P=8) is the only shape with those exact values — it gives players an immediate logical deduction. Without this rule the puzzle reduces to Fillomino.

2. **No 2×2 prohibition.** The old "no 2×2" rule has been removed. Regions can be any connected shape including squares and rectangles.

3. **Uniqueness guaranteed by A+P constraints alone.** The Python solver verifies every puzzle has exactly one valid solution before it is saved.

4. **Difficulty is separate from grid size.** Difficulty is measured by `branchesNeeded` from the logical solver simulation: 0 = easy, 1–3 = medium, 4+ = hard. A hard 4×4 can be harder than an easy 6×6.

5. **Solution matching, not rule checking, determines win.** The frontend checks area and perimeter of each region against the clues — it does not check against `puzzle.solution` directly (uniqueness means they are equivalent).

---

## Development commands

```bash
# Frontend
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Run oxlint on src/ (zero warnings is the target)
npm run format       # Auto-format src/ with Prettier
npm run format:check # Check formatting without writing

# Puzzle generation (writes to puzzle-bank/, never to src/)
python3 solver/generate_bank.py --all --count 10       # Generate 10 per combination
python3 solver/generate_bank.py --size 5 --difficulty hard --count 5  # Targeted

# Daily publish workflow (run once per day, then commit + deploy)
python3 scripts/publish.py                # Publish today
python3 scripts/publish.py --days 7       # Pre-publish next 7 days
git add src/puzzles/daily/ src/puzzles/meta.json
git commit -m "publish YYYY-MM-DD"

# Python solver (one-off generation / debugging)
python3 solver/solver.py --generate 4 4 --json  # Generate a single puzzle

# Python quality
~/.local/bin/pytest                        # Run all solver unit tests (0.4s)
~/.local/bin/black solver/ scripts/        # Auto-format Python
~/.local/bin/pylint solver/*.py scripts/publish.py  # Lint Python (target: 10.00/10)
```

---

## Code style

### General
- No comments unless the WHY is non-obvious. Never explain what the code does.
- No unused variables, imports, or dead code.
- No backwards-compatibility shims.

### Python
- Follow PEP 8.
- Type hints on all public functions.
- Docstrings on all public functions and classes.
- After modifying Python: run `~/.local/bin/black solver/` then `~/.local/bin/pylint solver/*.py`.
  Target score: 10.00/10. Suppression (`# pylint: disable=...`) requires an inline comment explaining why.
- `.pylintrc` at the project root holds project-wide thresholds and the `good-names` list for short grid variables.

### JavaScript / JSX
- Plain CSS with CSS variables (`var(--text)`, `var(--acc)`, etc.) — no inline colour literals that would break dark mode unless intentional (e.g. clue cell text is always `#1a1a1a` because the cell backgrounds are always light pastels).
- After modifying JS/JSX: run `npm run lint` (oxlint) and `npm run format:check` (Prettier). Fix all warnings before finishing.
- The project uses **oxlint** (not ESLint) — faster, already configured, supports React hooks rules out of the box.
- Prettier config is in `.prettierrc`: single quotes, 100-char line width, semicolons.

---

## Issue and task management

- Issues go in `docs/ISSUE_LOG.md`. Never mark an issue resolved without explicit user approval.
- Tasks go in `docs/TASKS.md`. Tasks marked ✅ have been completed and signed off.
- Ask permission before adding new entries to either file.
