import { useState, useEffect, useRef } from 'react';
import './App.css';
import { getGeom, makeFreshGrid, calcStats, isSolved, playChord, findLogicalStep } from './gameUtils.js';
import { Board, StaticBoard } from './Board.jsx';

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

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen,       setScreen]       = useState('tutorial');
  const [sizeKey,      setSizeKey]      = useState(meta.availableCombos[0]?.split('-')[0] ?? '4x4');
  const [difficulty,   setDifficulty]   = useState('medium');
  const [grid,         setGrid]         = useState(() => makeFreshGrid(pickPuzzle('4x4', 'medium')));
  const [mode,         setMode]         = useState('fill');
  const [msg,          setMsg]          = useState(null);
  const [streak,       setStreak]       = useState(0);
  const [dark,         setDark]         = useState(false);
  const [showProgress,  setShowProgress]  = useState(true);
  const [hintMenu,      setHintMenu]      = useState(false);
  const [errorCells,    setErrorCells]    = useState(null);
  const historyRef    = useRef([]);
  const errorTimerRef = useRef(null);
  const msgTimerRef   = useRef(null);

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
      const sp = localStorage.getItem('acre_progress');
      if (sp !== null) setShowProgress(sp !== 'false');
    } catch {}
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
  }, [dark]);

  // ── Win detection ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'play') return;
    if (!isSolved(grid, puzzle)) return;
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

  // ── Selection switch ───────────────────────────────────────────────────────
  function switchSelection(newSizeKey, newDiff) {
    const newPuzzle = pickPuzzle(newSizeKey, newDiff);
    historyRef.current = [];
    setSizeKey(newSizeKey);
    setDifficulty(newDiff);
    setGrid(makeFreshGrid(newPuzzle));
    setMode('fill'); setMsg(null);
  }

  // ── Start / reset ──────────────────────────────────────────────────────────
  function startPlay() {
    if (!puzzle) return;
    historyRef.current = [];
    setGrid(makeFreshGrid(puzzle));
    setMode('fill'); setMsg(null);
    setScreen('play');
  }

  function resetGrid() {
    historyRef.current.push(JSON.stringify(grid));
    setGrid(makeFreshGrid(puzzle));
    setMsg(null);
  }

  // ── Board callbacks ────────────────────────────────────────────────────────
  function handleDragStart(currentGrid) {
    historyRef.current.push(JSON.stringify(currentGrid));
    if (historyRef.current.length > 80) historyRef.current.shift();
    setMsg(null);
  }

  function handleUpdate(newGrid) {
    setGrid(newGrid);
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  function handleUndo() {
    if (!historyRef.current.length) return;
    setGrid(JSON.parse(historyRef.current.pop()));
    setMsg(null);
  }

  function clearErrors() {
    clearTimeout(errorTimerRef.current);
    setErrorCells(null);
  }

  function handleHintCell() {
    if (!puzzle) return;
    setHintMenu(false);
    // Try a logical step first; fall back to any empty cell from the solution
    const step = findLogicalStep(grid, puzzle);
    if (step) {
      historyRef.current.push(JSON.stringify(grid));
      const g = grid.map(row => [...row]);
      g[step.r][step.c] = step.regionId;
      setGrid(g);
      setMsg('One cell revealed.');
      clearErrors();
      return;
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === -1) {
          historyRef.current.push(JSON.stringify(grid));
          const g = grid.map(row => [...row]);
          g[r][c] = puzzle.solution[r][c];
          setGrid(g);
          setMsg('One cell revealed.');
          clearErrors();
          return;
        }
      }
    }
    setMsg('All cells are already filled!');
  }

  function handleHintRegion() {
    if (!puzzle) return;
    setHintMenu(false);
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
    setGrid(g);
    setMsg("Here's one region for you.");
    clearErrors();
  }

  function handleHintValidate() {
    if (!puzzle) return;
    setHintMenu(false);
    const wrong = new Set();
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (grid[r][c] >= 0 && grid[r][c] !== puzzle.solution[r][c])
          wrong.add(`${r},${c}`);
    if (wrong.size === 0) {
      setMsg('No mistakes found so far!');
      return;
    }
    clearTimeout(errorTimerRef.current);
    setErrorCells(wrong);
    errorTimerRef.current = setTimeout(() => setErrorCells(null), 5000);
    setMsg(`${wrong.size} mistake${wrong.size > 1 ? 's' : ''} highlighted — fix them to clear.`);
  }

  function toggleDark() {
    const on = !dark;
    setDark(on);
    try { localStorage.setItem('acre_dark', String(on)); } catch {}
  }


  // Auto-clear hint feedback messages after 3 s
  useEffect(() => {
    if (msg) {
      clearTimeout(msgTimerRef.current);
      msgTimerRef.current = setTimeout(() => setMsg(null), 3000);
    }
  }, [msg]);

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
                'Each coloured square is a clue. The <strong>filled square ■</strong> shows the area — how many cells the region must contain. The <strong>dashed square □</strong> shows the perimeter — how many edges are exposed to other regions or the grid border.')}
              {card('🎨', 'Grow your region',
                'Click and drag from a clue cell to paint neighbouring cells with its colour. Keep growing until the area and perimeter both match the clue exactly.')}
              {card('📐', 'Shape matters',
                'The same area can have different perimeters. A 2×2 square (area 4) has perimeter 8 — the most compact shape. A 1×4 strip (area 4) has perimeter 10. Use both clues together to deduce the shape.')}
              {card('🎯', 'Win condition',
                'Every cell must be filled and every region must match its clue exactly. The puzzle has a unique solution — there is only one valid arrangement.')}
            </div>

            <button onClick={() => setScreen('home')} style={{
              width:'100%', padding:14, border:'none', borderRadius:14,
              background:'var(--acc)', color:'#fff',
              fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:15,
              cursor:'pointer',
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

            {/* Legend + Progress */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:20,
                            fontSize:14, fontWeight:600, color:'var(--text-muted)' }}>
                <span style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <span style={{ width:13, height:13, background:'var(--text)',
                                 display:'inline-block', opacity:.7 }} />
                  area
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
                       style={{ display:'inline-block', opacity:.5 }}>
                    <rect x="1" y="1" width="11" height="11" stroke="var(--text)"
                          strokeWidth="1.5" strokeDasharray="3 2"/>
                  </svg>
                  perimeter
                </span>
              </div>
              <button
                onClick={() => {
                  const next = !showProgress;
                  setShowProgress(next);
                  try { localStorage.setItem('acre_progress', String(next)); } catch {}
                }}
                title={showProgress ? 'Hide region progress' : 'Show region progress'}
                style={{
                  border:'1px solid var(--surface-border)', borderRadius:10, padding:'6px 10px',
                  background: showProgress ? 'var(--btn-active-bg)' : 'var(--surface)',
                  color: showProgress ? 'var(--text)' : 'var(--text-faint)',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:12,
                  cursor:'pointer',
                }}>
                Progress
              </button>
            </div>

            {/* Board */}
            <div style={{ display:'flex', justifyContent:'center', padding:'12px 0',
                          overflowX:'auto' }}>
              <Board
                puzzle={puzzle} geom={geom} grid={grid}
                mode={mode} dark={dark}
                onDragStart={handleDragStart}
                onUpdate={handleUpdate}
                showProgress={showProgress}
                errorCells={errorCells}
              />
            </div>

            {/* Brief hint feedback — only shows when a hint sets a message */}
            {msg && (
              <div style={{ textAlign:'center', color:'var(--text-faint)', fontSize:13, fontWeight:500 }}>
                {msg}
              </div>
            )}

            {/* Fill / Erase row */}
            <div style={{ display:'flex', gap:10 }}>
              {[
                { label:'Fill',  active: mode === 'fill',  onClick: () => setMode('fill')  },
                { label:'Erase', active: mode === 'erase', onClick: () => setMode('erase') },
              ].map(({ label, active, onClick }) => (
                <button key={label} onClick={onClick} style={{
                  flex:1, padding:13, borderRadius:12, cursor:'pointer',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:14,
                  border: active ? 'none' : '1px solid var(--btn-border)',
                  background: active ? 'var(--acc)' : 'var(--btn-bg)',
                  color: active ? '#fff' : 'var(--text)',
                }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Undo / Clear / Hint row — transforms into hint options in place */}
            <div style={{ display:'flex', gap:10 }}>
              {hintMenu ? (
                <>
                  {[
                    { label:'Reveal cell',   title:'Fill one correct cell from the solution', fn: handleHintCell     },
                    { label:'Reveal region', title:'Complete an entire region',               fn: handleHintRegion   },
                    { label:'Mistakes',      title:'Highlight incorrect cells in red for 5s', fn: handleHintValidate },
                  ].map(({ label, title, fn }) => (
                    <button key={label} onClick={fn} title={title} style={{
                      flex:1, padding:13, borderRadius:12, cursor:'pointer',
                      fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:13,
                      border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text)',
                    }}>
                      {label}
                    </button>
                  ))}
                  <button onClick={() => setHintMenu(false)} style={{
                    padding:'13px 16px', borderRadius:12, cursor:'pointer',
                    fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:14,
                    border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text-faint)',
                  }}>
                    ✕
                  </button>
                </>
              ) : (
                <>
                  {[
                    { label:'Undo',  onClick: handleUndo },
                    { label:'Clear', onClick: resetGrid  },
                  ].map(({ label, onClick }) => (
                    <button key={label} onClick={onClick} style={{
                      flex:1, padding:13, borderRadius:12, cursor:'pointer',
                      fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:14,
                      border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text)',
                    }}>
                      {label}
                    </button>
                  ))}
                  <button onClick={() => setHintMenu(true)} style={{
                    flex:1, padding:13, borderRadius:12, cursor:'pointer',
                    fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:14,
                    border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text)',
                  }}>
                    Hint ▾
                  </button>
                </>
              )}
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
