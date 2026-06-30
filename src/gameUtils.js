/**
 * Shared game logic used by both the main app and the tester.
 * No React imports — pure functions only.
 */

export function getGeom(size) {
  // 40px = 20px side padding × 2 (matches the outer wrap padding in App.jsx / TesterApp.jsx)
  const maxPx = Math.min(window.innerWidth - 40, 430);
  const gap = size <= 4 ? 10 : size <= 6 ? 8 : 6;
  const cell = Math.floor((maxPx - (size - 1) * gap) / size);
  const step = cell + gap;
  const px = size * cell + (size - 1) * gap;
  return { size, gap, cell, step, px };
}

export function makeFreshGrid(puzzle) {
  if (!puzzle) return [[]];
  return Array.from({ length: puzzle.rows }, (_, r) =>
    Array.from({ length: puzzle.cols }, (_, c) => {
      const reg = puzzle.regions.find((rg) => rg.clueR === r && rg.clueC === c);
      return reg ? reg.id : -1;
    })
  );
}

export function calcStats(grid, size, regions) {
  const m = {};
  regions.forEach((r) => {
    m[r.id] = { area: 0, perim: 0 };
  });
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = grid[r][c];
      if (v < 0) continue;
      m[v].area++;
      [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].forEach(([dr, dc]) => {
        const nr = r + dr,
          nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size || grid[nr][nc] !== v) m[v].perim++;
      });
    }
  }
  return m;
}

export function isAdj(r, c, id, grid, size) {
  return [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ].some(([dr, dc]) => {
    const nr = r + dr,
      nc = c + dc;
    return nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === id;
  });
}

export function isSolved(grid, puzzle) {
  if (!puzzle) return false;
  const size = puzzle.rows;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c] < 0) return false;
  const st = calcStats(grid, size, puzzle.regions);
  return puzzle.regions.every((rg) => st[rg.id].area === rg.area && st[rg.id].perim === rg.perim);
}

/**
 * Find the next cell determinable by pure logic alone.
 *
 * Uses two techniques (mirroring the Python difficulty rater):
 * 1. Naked single — only one adjacent non-full region can reach this cell.
 * 2. Forced reach — a region has exactly as many reachable empty cells as it
 *    still needs; all of them must belong to it.
 *
 * Returns { r, c, regionId } or null if no forced cell exists.
 */
export function findLogicalStep(grid, puzzle) {
  const size = puzzle.rows;

  const regionCounts = {};
  puzzle.regions.forEach((reg) => {
    regionCounts[reg.id] = 0;
  });
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (grid[r][c] >= 0) regionCounts[grid[r][c]] = (regionCounts[grid[r][c]] ?? 0) + 1;

  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  // Technique 1: naked single
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== -1) continue;
      const candidates = puzzle.regions.filter(
        (reg) =>
          regionCounts[reg.id] < reg.area &&
          dirs.some(([dr, dc]) => {
            const nr = r + dr,
              nc = c + dc;
            return nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === reg.id;
          })
      );
      if (candidates.length === 1) return { r, c, regionId: candidates[0].id };
    }
  }

  // Technique 2: forced reach
  for (const reg of puzzle.regions) {
    const remaining = reg.area - regionCounts[reg.id];
    if (remaining <= 0) continue;

    const visited = new Set();
    const queue = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (grid[r][c] === reg.id) {
          visited.add(`${r},${c}`);
          queue.push([r, c]);
        }

    const reachable = [];
    let qi = 0;
    while (qi < queue.length) {
      const [r, c] = queue[qi++];
      for (const [dr, dc] of dirs) {
        const nr = r + dr,
          nc = c + dc;
        const key = `${nr},${nc}`;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited.has(key)) {
          visited.add(key);
          if (grid[nr][nc] === -1) {
            reachable.push([nr, nc]);
            queue.push([nr, nc]);
          }
        }
      }
    }

    if (reachable.length === remaining)
      return { r: reachable[0][0], c: reachable[0][1], regionId: reg.id };
  }

  return null;
}

export function playChord() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [261.63, 329.63, 392.0, 523.25].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = f;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  } catch {}
}
