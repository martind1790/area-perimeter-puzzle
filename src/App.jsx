import { useState, useEffect, useRef } from 'react';
import './App.css';

// ─── Daily puzzle loader ──────────────────────────────────────────────────────
// Only src/puzzles/daily/ is bundled — one file per size/difficulty combination,
// published each day by scripts/publish.py.  The full puzzle bank lives in
// puzzle-bank/ (gitignored) and is never shipped to users.

import meta from './puzzles/meta.json';

const _DAILY_MODS = import.meta.glob('./puzzles/daily/*.json', { eager: true });

const DAILY = {};   // { '4x4-easy': puzzleObj, '5x5-medium': puzzleObj, ... }
for (const [path, mod] of Object.entries(_DAILY_MODS)) {
  const key = path.replace('./puzzles/daily/', '').replace('.json', '');
  const p   = mod.default ?? mod;
  DAILY[key] = { ...p, size: p.rows };
}

const SIZE_KEYS  = ['4x4', '5x5', '6x6'];
const DIFF_KEYS  = ['easy', 'medium', 'hard'];
const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

function comboKey(sizeKey, diff) { return `${sizeKey}-${diff}`; }

function isAvailable(sizeKey, diff) {
  return meta.availableCombos.includes(comboKey(sizeKey, diff));
}

function pickPuzzle(sizeKey, diff) {
  return DAILY[comboKey(sizeKey, diff)] ?? null;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

function getGeom(size) {
  const gap  = size <= 4 ? 10 : size <= 6 ? 8 : 6;
  const cell = Math.floor((430 - (size - 1) * gap) / size);
  const step = cell + gap;
  const px   = size * cell + (size - 1) * gap;
  return { size, gap, cell, step, px };
}

// ─── Puzzle helpers ───────────────────────────────────────────────────────────

function makeFreshGrid(puzzle) {
  if (!puzzle) return [[]];
  return Array.from({ length: puzzle.rows }, (_, r) =>
    Array.from({ length: puzzle.cols }, (_, c) => {
      const reg = puzzle.regions.find(rg => rg.clueR === r && rg.clueC === c);
      return reg ? reg.id : -1;
    })
  );
}

function calcStats(grid, size, regions) {
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

function isAdj(r, c, id, grid, size) {
  return [[-1,0],[1,0],[0,-1],[0,1]].some(([dr,dc]) => {
    const nr = r+dr, nc = c+dc;
    return nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === id;
  });
}

function playChord() {
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

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function todayStr() { return dateStr(new Date()); }

function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d);
}

function fmtDate() {
  return new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });
}

function fmtDateShort() {
  return new Date().toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
}

// ─── Board component ──────────────────────────────────────────────────────────

function Board({ puzzle, geom, grid, mode, dark, onDragStart, onUpdate }) {
  const { size, cell, step, px } = geom;
  const containerRef  = useRef(null);
  const dragColorRef  = useRef(null);
  const isDraggingRef = useRef(false);
  const localGridRef  = useRef(null);

  const clueMap = {};
  const colorOf = {};
  puzzle.regions.forEach(reg => {
    clueMap[`${reg.clueR},${reg.clueC}`] = reg;
    colorOf[reg.id] = reg.color;
  });

  const emptyColor = dark ? '#2c2830' : '#ebebea';
  const radius     = Math.max(5, cell * 0.18);
  // Clue cells always have light pastel backgrounds regardless of theme,
  // so their text must always be dark for readability.
  const clueInk    = '#1a1a1a';
  const aF         = Math.min(cell * 0.40, 20);
  const pF         = Math.min(cell * 0.26, 11);
  const ring       = Math.max(7, pF + 1);

  function cellFromEvent(e) {
    if (!containerRef.current) return null;
    const b = containerRef.current.getBoundingClientRect();
    const col = Math.floor((e.clientX - b.left) / step);
    const row = Math.floor((e.clientY - b.top)  / step);
    if (row < 0 || row >= size || col < 0 || col >= size) return null;
    return { r: row, c: col };
  }

  function paintAt(r, c) {
    const g    = localGridRef.current;
    const clue = clueMap[`${r},${c}`];
    if (mode === 'erase') {
      if (clue || g[r][c] < 0) return;
      g[r][c] = -1;
      onUpdate(g.map(row => [...row]), null);
      return;
    }
    const col = dragColorRef.current;
    if (col == null) return;
    if (g[r][c] === col) return;
    if (clue && clue.id !== col) return;
    if (!isAdj(r, c, col, g, size)) return;
    g[r][c] = col;
    onUpdate(g.map(row => [...row]), col);
  }

  function handlePointerDown(e) {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const pos = cellFromEvent(e);
    if (!pos) return;
    localGridRef.current = grid.map(row => [...row]);
    onDragStart(grid);
    isDraggingRef.current = true;
    const v = localGridRef.current[pos.r][pos.c];
    if (mode === 'erase') {
      dragColorRef.current = null;
      paintAt(pos.r, pos.c);
      return;
    }
    dragColorRef.current = v >= 0 ? v : null;
  }

  function handlePointerMove(e) {
    if (!isDraggingRef.current) return;
    const pos = cellFromEvent(e);
    if (pos) paintAt(pos.r, pos.c);
  }

  function handlePointerUp() {
    isDraggingRef.current = false;
    dragColorRef.current  = null;
  }

  return (
    <div
      ref={containerRef}
      style={{ position:'relative', width:px, height:px, touchAction:'none', userSelect:'none',
               cursor: mode === 'erase' ? 'crosshair' : 'default' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Cells */}
      {Array.from({ length: size }, (_, r) =>
        Array.from({ length: size }, (_, c) => {
          const v  = grid[r][c];
          const bg = v >= 0 ? colorOf[v] : emptyColor;
          return (
            <div key={`${r}_${c}`} style={{
              position:'absolute', left:c*step, top:r*step,
              width:cell, height:cell,
              background:bg, borderRadius:radius,
              transition:'background .12s ease',
            }} />
          );
        })
      )}

      {/* Clue labels */}
      {puzzle.regions.map(reg => (
        <div key={`lbl_${reg.id}`} style={{
          position:'absolute',
          left: reg.clueC * step + cell / 2,
          top:  reg.clueR * step + cell / 2,
          transform:'translate(-50%,-50%)',
          zIndex:4, pointerEvents:'none',
          display:'flex', flexDirection:'column', alignItems:'center',
        }}>
          <div style={{ fontWeight:800, fontSize:aF, color:clueInk, lineHeight:1,
                        fontFamily:"'Hanken Grotesk', sans-serif" }}>
            {reg.area}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:2, marginTop:1 }}>
            <span style={{ width:ring, height:ring, borderRadius:'50%',
                           border:`1.5px solid ${clueInk}`, opacity:.45,
                           display:'inline-block', flexShrink:0 }} />
            <span style={{ fontWeight:700, fontSize:pF, color:clueInk, opacity:.7,
                           lineHeight:1, fontFamily:"'Hanken Grotesk', sans-serif" }}>
              {reg.perim}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── StaticBoard (home preview & win screen) ──────────────────────────────────

function StaticBoard({ puzzle, cellPx, gap, dark }) {
  const { rows, cols, regions } = puzzle;
  const step = cellPx + gap;
  const px   = cols * cellPx + (cols - 1) * gap;
  const py   = rows * cellPx + (rows - 1) * gap;
  const radius = Math.max(3, cellPx * 0.18);
  const emptyColor = dark ? '#2c2830' : '#ebebea';
  const colorOf = {};
  regions.forEach(r => { colorOf[r.id] = r.color; });

  return (
    <div style={{ position:'relative', width:px, height:py }}>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const reg = regions.find(rg => rg.clueR === r && rg.clueC === c);
          return (
            <div key={`${r}_${c}`} style={{
              position:'absolute', left:c*step, top:r*step,
              width:cellPx, height:cellPx, borderRadius:radius,
              background: reg ? colorOf[reg.id] : emptyColor,
              boxShadow: reg ? 'none' : 'inset 0 0 0 1px rgba(0,0,0,.07)',
            }} />
          );
        })
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen,       setScreen]       = useState('home');
  const [sizeKey,      setSizeKey]      = useState(meta.availableCombos[0]?.split('-')[0] ?? '4x4');
  const [difficulty,   setDifficulty]   = useState('medium');
  const [grid,         setGrid]         = useState(() => makeFreshGrid(pickPuzzle('4x4', 'medium')));
  const [mode,         setMode]         = useState('fill');
  const [msg,          setMsg]          = useState(null);
  const [streak,       setStreak]       = useState(0);
  const [dark,         setDark]         = useState(false);
  const [activeRegion, setActiveRegion] = useState(null);
  const historyRef = useRef([]);

  const puzzle = pickPuzzle(sizeKey, difficulty);
  const size   = puzzle?.rows ?? 4;
  const geom   = getGeom(size);

  // ── Persistence ────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved   = parseInt(localStorage.getItem('acre_streak') || '0', 10);
      const lastDay = localStorage.getItem('acre_last_solved') || '';
      if (lastDay && lastDay < yesterdayStr()) {
        setStreak(0);
        try { localStorage.setItem('acre_streak', '0'); } catch {}
      } else if (!isNaN(saved)) {
        setStreak(saved);
      }
      const d = localStorage.getItem('acre_dark') === 'true';
      setDark(d);
      document.body.classList.toggle('dark', d);
      if (localStorage.getItem('acre_first') !== 'false') {
        setScreen('tutorial');
        localStorage.setItem('acre_first', 'false');
      }
    } catch {}
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
  }, [dark]);

  // ── Win detection ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'play') return;
    if (!isSolved(grid)) return;
    playChord();
    const today   = todayStr();
    const lastDay = localStorage.getItem('acre_last_solved') || '';
    if (lastDay !== today) {
      const ns = lastDay === yesterdayStr() ? streak + 1 : 1;
      setStreak(ns);
      try {
        localStorage.setItem('acre_streak', String(ns));
        localStorage.setItem('acre_last_solved', today);
      } catch {}
    }
    const t = setTimeout(() => setScreen('win'), 300);
    return () => clearTimeout(t);
  }, [grid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Solve check ────────────────────────────────────────────────────────────
  function isSolved(g) {
    if (!puzzle) return false;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (g[r][c] < 0) return false;
    const st = calcStats(g, size, puzzle.regions);
    return puzzle.regions.every(rg => st[rg.id].area === rg.area && st[rg.id].perim === rg.perim);
  }

  // ── Selection switch ───────────────────────────────────────────────────────
  function switchSelection(newSizeKey, newDiff) {
    const newPuzzle = pickPuzzle(newSizeKey, newDiff);
    historyRef.current = [];
    setSizeKey(newSizeKey);
    setDifficulty(newDiff);
    setGrid(makeFreshGrid(newPuzzle));
    setMode('fill'); setMsg(null); setActiveRegion(null);
  }

  // ── Start / reset ──────────────────────────────────────────────────────────
  function startPlay() {
    if (!puzzle) return;
    historyRef.current = [];
    setGrid(makeFreshGrid(puzzle));
    setMode('fill'); setMsg(null); setActiveRegion(null);
    setScreen('play');
  }

  function resetGrid() {
    historyRef.current.push(JSON.stringify(grid));
    setGrid(makeFreshGrid(puzzle));
    setMsg(null); setActiveRegion(null);
  }

  // ── Board callbacks ────────────────────────────────────────────────────────
  function handleDragStart(currentGrid) {
    historyRef.current.push(JSON.stringify(currentGrid));
    if (historyRef.current.length > 80) historyRef.current.shift();
    setMsg(null);
  }

  function handleUpdate(newGrid, regionId) {
    setGrid(newGrid);
    if (regionId != null) setActiveRegion(regionId);
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  function handleUndo() {
    if (!historyRef.current.length) return;
    setGrid(JSON.parse(historyRef.current.pop()));
    setMsg(null);
  }

  function handleCheck() {
    if (!puzzle) return;
    let empty = 0;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (grid[r][c] < 0) empty++;
    let m;
    if (empty > 0)
      m = `${empty} cell${empty === 1 ? '' : 's'} still empty.`;
    else {
      const st    = calcStats(grid, size, puzzle.regions);
      const wrong = puzzle.regions.filter(rg => st[rg.id].area !== rg.area || st[rg.id].perim !== rg.perim).length;
      m = wrong > 0 ? `${wrong} region${wrong === 1 ? '' : 's'} don't match their clues.` : 'All correct!';
    }
    setMsg(m);
  }

  function handleHint() {
    if (!puzzle) return;
    const st     = calcStats(grid, size, puzzle.regions);
    const target = puzzle.regions.find(rg => st[rg.id].area !== rg.area || st[rg.id].perim !== rg.perim);
    if (!target) return;
    historyRef.current.push(JSON.stringify(grid));
    const g = grid.map(row => [...row]);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        if (puzzle.solution[r][c] === target.id) g[r][c] = target.id;
        else if (g[r][c] === target.id) g[r][c] = -1;
      }
    setGrid(g); setActiveRegion(target.id);
    setMsg("Here's one for you.");
  }

  function toggleDark() {
    const on = !dark;
    setDark(on);
    try { localStorage.setItem('acre_dark', String(on)); } catch {}
  }

  // ── Readout ────────────────────────────────────────────────────────────────
  const tip = 'Area = cells inside · Perimeter = outer edges';
  let readMain = 'Fill every region', readSub = tip, readTone = 'neutral';
  if (screen === 'play' && puzzle) {
    if (msg) {
      readMain = msg; readSub = tip; readTone = 'bad';
    } else if (activeRegion != null) {
      const reg = puzzle.regions.find(r => r.id === activeRegion);
      const st  = calcStats(grid, size, puzzle.regions);
      const s   = st[activeRegion];
      if (reg && s) {
        if (s.area === reg.area && s.perim === reg.perim) {
          readMain = 'Region complete'; readSub = `${reg.area} cells · perimeter ${reg.perim}`; readTone = 'good';
        } else {
          readMain = `${s.area} / ${reg.area} cells`; readSub = `Perimeter ${s.perim} / ${reg.perim}`;
        }
      }
    }
  }

  const readoutColor = readTone === 'good' ? '#2a9e68' : readTone === 'bad' ? '#d95b54' : 'var(--text)';

  // ── Shared layout vars ─────────────────────────────────────────────────────
  const wrap  = { minHeight:'100vh', width:'100%', display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', padding:'40px 20px' };
  const inner = { width:'100%', maxWidth:600, display:'flex', flexDirection:'column' };

  // ── Header (always shown) ──────────────────────────────────────────────────
  const header = (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  marginBottom:40, gap:16 }}>
      <div style={{ fontFamily:"'DM Serif Display', serif", fontStyle:'italic',
                    fontSize:32, lineHeight:1 }}>Acre</div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <button onClick={toggleDark} style={{
          border:'none', borderRadius:12, padding:'10px 16px',
          background:'var(--btn-bg)', color:'var(--text)',
          fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14, cursor:'pointer',
        }}>
          {dark ? '☀️ Light' : '🌙 Dark'}
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:8,
                      background:'var(--surface)', border:'1px solid var(--surface-border)',
                      padding:'8px 14px 8px 12px', borderRadius:999 }}>
          <span style={{ fontSize:14 }}>🔥</span>
          <span style={{ fontWeight:800, fontSize:15 }}>{streak}</span>
        </div>
      </div>
    </div>
  );

  // ── Reusable selector button ───────────────────────────────────────────────
  function SelBtn({ active, onClick, children }) {
    return (
      <button onClick={onClick} style={{
        flex:1, padding:12, borderRadius:12, cursor:'pointer',
        fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14,
        border: active ? 'none' : '1px solid var(--btn-border)',
        background: active ? 'var(--acc)' : 'var(--btn-bg)',
        color: active ? '#fff' : 'var(--text)',
      }}>
        {children}
      </button>
    );
  }

  const selectorLabel = {
    fontSize:11, fontWeight:700, letterSpacing:'1.2px',
    color:'var(--text-faint)', textTransform:'uppercase', marginBottom:10,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // HOME
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'home') {
    const gridSize   = parseInt(sizeKey);
    const previewCell = gridSize >= 6 ? 26 : gridSize >= 5 ? 29 : 32;
    const puzzleSub  = puzzle
      ? `${puzzle.rows} × ${puzzle.cols} grid · ${puzzle.regions.length} regions`
      : 'No puzzles yet for this combination';

    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div className="anim-float" style={{ display:'flex', flexDirection:'column', gap:24 }}>

            <div>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:30,
                            lineHeight:1.1, marginBottom:6 }}>Today's grid</div>
              <div style={{ color:'var(--text-muted)', fontSize:15, fontWeight:500 }}>
                {fmtDate()}
              </div>
            </div>

            {/* Grid size selector */}
            <div>
              <div style={selectorLabel}>Grid Size</div>
              <div style={{ display:'flex', gap:10 }}>
                {SIZE_KEYS.map(sk => {
                  const hasAny = DIFF_KEYS.some(d => isAvailable(sk, d));
                  return (
                    <SelBtn key={sk} active={sizeKey === sk}
                      onClick={() => hasAny && switchSelection(sk, difficulty)}
                      style={{ opacity: hasAny ? 1 : 0.4, cursor: hasAny ? 'pointer' : 'not-allowed' }}>
                      {sk.replace('x', ' × ')}
                      {!hasAny && <span style={{ fontSize:10, display:'block', fontWeight:600 }}>soon</span>}
                    </SelBtn>
                  );
                })}
              </div>
            </div>

            {/* Difficulty selector */}
            <div>
              <div style={selectorLabel}>Difficulty</div>
              <div style={{ display:'flex', gap:10 }}>
                {DIFF_KEYS.map(d => {
                  const avail = isAvailable(sizeKey, d);
                  return (
                    <SelBtn key={d} active={difficulty === d}
                      onClick={() => avail && switchSelection(sizeKey, d)}
                      style={{ opacity: avail ? 1 : 0.4, cursor: avail ? 'pointer' : 'not-allowed' }}>
                      {DIFF_LABEL[d]}
                      {!avail && <span style={{ fontSize:10, display:'block', fontWeight:600 }}>soon</span>}
                    </SelBtn>
                  );
                })}
              </div>
            </div>

            {/* Preview card */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--surface-border)',
                          borderRadius:20, padding:24, display:'flex', flexDirection:'column',
                          alignItems:'center', gap:20 }}>
              {puzzle ? (
                <StaticBoard puzzle={puzzle} cellPx={previewCell} gap={6} dark={dark} />
              ) : (
                <div style={{ height:120, display:'flex', alignItems:'center',
                              color:'var(--text-faint)', fontSize:14 }}>
                  No puzzles for this combination yet
                </div>
              )}
              <div style={{ width:'100%' }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>
                  {DIFF_LABEL[difficulty]} · {sizeKey.replace('x', ' × ')}
                </div>
                <div style={{ color:'var(--text-muted)', fontSize:13 }}>
                  {puzzleSub}
                </div>
              </div>
              <button onClick={startPlay} disabled={!puzzle} style={{
                width:'100%', padding:14, border:'none', borderRadius:14,
                background: puzzle ? 'var(--acc)' : 'var(--btn-bg)',
                color: puzzle ? '#fff' : 'var(--text-faint)',
                fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:15,
                cursor: puzzle ? 'pointer' : 'not-allowed',
                opacity: puzzle ? 1 : 0.5,
              }}>
                Play
              </button>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setScreen('tutorial')} style={{
                flex:1, padding:14, border:'1px solid var(--btn-border)',
                borderRadius:14, background:'var(--btn-bg)', color:'var(--text)',
                fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:15, cursor:'pointer',
              }}>
                How to play
              </button>
              <button onClick={() => setScreen('archive')} style={{
                flex:1, padding:14, border:'1px solid var(--btn-border)',
                borderRadius:14, background:'var(--btn-bg)', color:'var(--text)',
                fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:15, cursor:'pointer',
              }}>
                🔒 Archive
              </button>
            </div>

            <div style={{ textAlign:'center', color:'var(--text-faint)', fontSize:13, lineHeight:1.6 }}>
              Grow each region so its{' '}
              <span style={{ fontWeight:700, color:'var(--text-muted)' }}>area</span>{' '}
              and{' '}
              <span style={{ fontWeight:700, color:'var(--text-muted)' }}>perimeter</span>{' '}
              match the clue — there is only one valid arrangement.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TUTORIAL
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'tutorial') {
    const card = (emoji, title, body) => (
      <div style={{ padding:20, background:'var(--surface)', border:'1px solid var(--surface-border)',
                    borderRadius:16 }}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:8 }}>{emoji} {title}</div>
        <div style={{ color:'var(--text-muted)', fontSize:14, lineHeight:1.6 }}
             dangerouslySetInnerHTML={{ __html: body }} />
      </div>
    );
    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
            <button onClick={() => setScreen('home')} style={{
              alignSelf:'flex-start', border:'none', background:'transparent',
              color:'var(--acc)', fontFamily:"'Hanken Grotesk', sans-serif",
              fontWeight:700, fontSize:14, cursor:'pointer', padding:0,
            }}>← Back</button>

            <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:32, lineHeight:1.1 }}>
              How to play
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {card('📍', 'The clue',
                'Each coloured square is a clue. The <strong>large number</strong> is the area — how many cells the region must contain. The <strong>circled number</strong> is the perimeter — how many edges are exposed to other regions or the grid border.')}
              {card('🎨', 'Grow your region',
                'Click and drag from a clue cell to paint neighbouring cells with its colour. Keep growing until the area and perimeter both match the clue exactly.')}
              {card('📐', 'Shape matters',
                'The same area can have different perimeters. A 2×2 square (area 4) has perimeter 8 — the most compact shape. A 1×4 strip (area 4) has perimeter 10. Use both clues together to deduce the shape.')}
              {card('🎯', 'Win condition',
                'Every cell must be filled and every region must match its clue exactly. The puzzle has a unique solution — there is only one valid arrangement.')}
            </div>

            <button onClick={startPlay} disabled={!puzzle} style={{
              width:'100%', padding:14, border:'none', borderRadius:14,
              background: puzzle ? 'var(--acc)' : 'var(--btn-bg)',
              color: puzzle ? '#fff' : 'var(--text-faint)',
              fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:15,
              cursor: puzzle ? 'pointer' : 'not-allowed',
              opacity: puzzle ? 1 : 0.5,
            }}>
              Got it — let's play
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ARCHIVE
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'archive') {
    // Build the last 14 days (excluding today, which is always free).
    const archiveDays = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (i + 1));
      return d;
    });

    const launchDate = new Date(meta.launchDate + 'T00:00:00');

    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
            <button onClick={() => setScreen('home')} style={{
              alignSelf:'flex-start', border:'none', background:'transparent',
              color:'var(--acc)', fontFamily:"'Hanken Grotesk', sans-serif",
              fontWeight:700, fontSize:14, cursor:'pointer', padding:0,
            }}>← Back</button>

            <div>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:32, lineHeight:1.1, marginBottom:8 }}>
                Archive
              </div>
              <div style={{ color:'var(--text-muted)', fontSize:15 }}>
                Every past puzzle, every size and difficulty.
              </div>
            </div>

            {/* Lock card */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--surface-border)',
                          borderRadius:20, padding:28, textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:16 }}>🔒</div>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:22,
                            lineHeight:1.2, marginBottom:10 }}>
                Archive access coming soon
              </div>
              <div style={{ color:'var(--text-muted)', fontSize:14, lineHeight:1.6, marginBottom:20 }}>
                Unlock every past puzzle across all grid sizes and difficulty levels.
                Enter your email to be notified when archive access launches.
              </div>
              <div style={{ display:'flex', gap:8, maxWidth:360, margin:'0 auto' }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  style={{
                    flex:1, padding:'12px 14px', border:'1px solid var(--btn-border)',
                    borderRadius:10, background:'var(--btn-bg)', color:'var(--text)',
                    fontFamily:"'Hanken Grotesk', sans-serif", fontSize:14, outline:'none',
                  }}
                />
                <button style={{
                  padding:'12px 18px', border:'none', borderRadius:10,
                  background:'var(--acc)', color:'#fff',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14, cursor:'pointer',
                }}>
                  Notify me
                </button>
              </div>
            </div>

            {/* Recent days preview */}
            <div>
              <div style={selectorLabel}>Recent puzzles</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {archiveDays
                  .filter(d => d >= launchDate)
                  .map(d => {
                    const label = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
                    return (
                      <div key={d.toISOString()} style={{
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'12px 16px', borderRadius:12,
                        background:'var(--surface)', border:'1px solid var(--surface-border)',
                        opacity:0.7,
                      }}>
                        <span style={{ fontWeight:600, fontSize:14 }}>{label}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:12, color:'var(--text-faint)' }}>
                            {meta.availableCombos.length} puzzles
                          </span>
                          <span style={{ fontSize:16 }}>🔒</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAY
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'play' && puzzle) {
    const playLabel = `${DIFF_LABEL[difficulty]} · ${sizeKey.replace('x', ' × ')}`;
    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

            {/* Top bar */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <button onClick={() => setScreen('home')} style={{
                border:'none', background:'transparent', color:'var(--acc)',
                fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14,
                cursor:'pointer', padding:0,
              }}>← Back</button>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{playLabel}</div>
                <div style={{ color:'var(--text-muted)', fontSize:12 }}>{fmtDateShort()}</div>
              </div>
              <button onClick={() => setScreen('tutorial')} style={{
                border:'none', background:'transparent', color:'var(--acc)',
                fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:18,
                cursor:'pointer', padding:0, lineHeight:1,
              }}>?</button>
            </div>

            {/* Legend + mode toggle */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:16,
                            fontSize:12, fontWeight:600, color:'var(--text-faint)' }}>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:9, height:9, background:'#cdb4e8',
                                 borderRadius:2, display:'inline-block' }} />
                  area
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:11, height:11, border:'1.5px solid var(--acc)',
                                 borderRadius:'50%', display:'inline-block' }} />
                  perim
                </span>
              </div>
              <div style={{ display:'flex', gap:6, background:'var(--surface)',
                            border:'1px solid var(--surface-border)',
                            padding:4, borderRadius:10 }}>
                {['fill','erase'].map(m => (
                  <button key={m} onClick={() => setMode(m)} style={{
                    border:'none', borderRadius:7, padding:'6px 12px',
                    fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:12,
                    cursor:'pointer',
                    background: mode === m ? 'var(--btn-active-bg)' : 'transparent',
                    color: mode === m ? 'var(--text)' : 'var(--text-faint)',
                  }}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Board */}
            <div style={{ display:'flex', justifyContent:'center', padding:'12px 0',
                          overflowX:'auto' }}>
              <Board
                puzzle={puzzle} geom={geom} grid={grid}
                mode={mode} dark={dark}
                onDragStart={handleDragStart}
                onUpdate={handleUpdate}
              />
            </div>

            {/* Readout */}
            <div style={{ textAlign:'center', minHeight:58, display:'flex',
                          flexDirection:'column', justifyContent:'center', gap:4 }}>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontStyle:'italic',
                            fontSize:22, lineHeight:1.1, color:readoutColor }}>
                {readMain}
              </div>
              <div style={{ color:'var(--text-faint)', fontSize:13, fontWeight:500 }}>
                {readSub}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display:'flex', gap:10 }}>
              {[
                { label:'Undo',  onClick: handleUndo,  flex:1   },
                { label:'Clear', onClick: resetGrid,   flex:1   },
                { label:'Hint',  onClick: handleHint,  flex:1   },
                { label:'Check', onClick: handleCheck, flex:1.2, primary:true },
              ].map(({ label, onClick, flex, primary }) => (
                <button key={label} onClick={onClick} style={{
                  flex, padding:13, borderRadius:12, cursor:'pointer',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:14,
                  border: primary ? 'none' : '1px solid var(--btn-border)',
                  background: primary ? 'var(--acc)' : 'var(--btn-bg)',
                  color: primary ? '#fff' : 'var(--text)',
                }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WIN
  // ══════════════════════════════════════════════════════════════════════════
  const winSize     = puzzle?.rows ?? 4;
  const winCell     = winSize >= 6 ? 26 : winSize >= 5 ? 28 : 30;
  const winLabel    = `${DIFF_LABEL[difficulty]} · ${sizeKey.replace('x', ' × ')}`;
  return (
    <div style={wrap}>
      <div style={inner}>
        {header}
        <div style={{ display:'flex', flexDirection:'column', gap:24,
                      alignItems:'center', textAlign:'center' }}>
          {puzzle && (
            <div className="anim-pop" style={{ display:'flex', justifyContent:'center' }}>
              <StaticBoard puzzle={puzzle} cellPx={winCell} gap={5} dark={dark} />
            </div>
          )}
          <div style={{ fontFamily:"'DM Serif Display', serif", fontStyle:'italic',
                        fontSize:44, lineHeight:1 }}>
            Solved.
          </div>
          <div style={{ color:'var(--text-muted)', fontSize:14, fontWeight:600 }}>
            {winLabel}
          </div>
          <div style={{ color:'var(--text-muted)', fontSize:15, lineHeight:1.6, maxWidth:400 }}>
            You partitioned the whole grid. Every area and perimeter checks out — there was only one way to do it.
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12,
                        background:'var(--surface)', border:'1px solid var(--surface-border)',
                        padding:'14px 22px', borderRadius:14 }}>
            <span style={{ fontSize:18 }}>🔥</span>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontWeight:800, fontSize:15 }}>{streak} day streak</div>
              <div style={{ color:'var(--text-faint)', fontSize:12 }}>Keep it going!</div>
            </div>
          </div>
          <button onClick={() => setScreen('home')} style={{
            width:'100%', maxWidth:300, padding:14, border:'none', borderRadius:14,
            background:'var(--acc)', color:'#fff',
            fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:15, cursor:'pointer',
          }}>
            Play another
          </button>
        </div>
      </div>
    </div>
  );
}
