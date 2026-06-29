/**
 * Shared game logic used by both the main app and the tester.
 * No React imports — pure functions only.
 */

export function getGeom(size) {
  const gap  = size <= 4 ? 10 : size <= 6 ? 8 : 6;
  const cell = Math.floor((430 - (size - 1) * gap) / size);
  const step = cell + gap;
  const px   = size * cell + (size - 1) * gap;
  return { size, gap, cell, step, px };
}

export function makeFreshGrid(puzzle) {
  if (!puzzle) return [[]];
  return Array.from({ length: puzzle.rows }, (_, r) =>
    Array.from({ length: puzzle.cols }, (_, c) => {
      const reg = puzzle.regions.find(rg => rg.clueR === r && rg.clueC === c);
      return reg ? reg.id : -1;
    })
  );
}

export function calcStats(grid, size, regions) {
  const m = {};
  regions.forEach(r => { m[r.id] = { area: 0, perim: 0 }; });
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = grid[r][c];
      if (v < 0) continue;
      m[v].area++;
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => {
        const nr = r+dr, nc = c+dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size || grid[nr][nc] !== v)
          m[v].perim++;
      });
    }
  }
  return m;
}

export function isAdj(r, c, id, grid, size) {
  return [[-1,0],[1,0],[0,-1],[0,1]].some(([dr,dc]) => {
    const nr = r+dr, nc = c+dc;
    return nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === id;
  });
}

export function isSolved(grid, puzzle) {
  if (!puzzle) return false;
  const size = puzzle.rows;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (grid[r][c] < 0) return false;
  const st = calcStats(grid, size, puzzle.regions);
  return puzzle.regions.every(rg => st[rg.id].area === rg.area && st[rg.id].perim === rg.perim);
}

export function playChord() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [261.63, 329.63, 392.0, 523.25].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = f; osc.type = 'sine';
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t); osc.stop(t + 0.18);
    });
  } catch {}
}
