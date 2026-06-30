import { useState, useEffect, useRef } from 'react';
import { useForm } from '@formspree/react';
import { Board, StaticBoard } from './Board.jsx';
import {
  getGeom, makeFreshGrid, calcStats, isSolved, playChord, findLogicalStep,
} from './gameUtils.js';

// ─── Tester puzzle bank ───────────────────────────────────────────────────────
// All puzzles in src/puzzles/tester/ are loaded and organised by size/difficulty
// using the metadata embedded in each JSON file.

const _TESTER_MODS = import.meta.glob('./puzzles/tester/*.json', { eager: true });

const TESTER_BANK = {};         // { '4x4': { easy: [...], medium: [...], hard: [...] }, ... }
const TESTER_AVAILABLE = new Set();   // '4x4-easy', '5x5-medium', etc.

for (const [, mod] of Object.entries(_TESTER_MODS)) {
  const p    = mod.default ?? mod;
  const size = `${p.rows}x${p.cols}`;
  const diff = p.meta?.difficulty ?? 'medium';
  TESTER_BANK[size]       = TESTER_BANK[size]       ?? {};
  TESTER_BANK[size][diff] = TESTER_BANK[size][diff] ?? [];
  TESTER_BANK[size][diff].push({ ...p, size: p.rows });
  TESTER_AVAILABLE.add(`${size}-${diff}`);
}

const SIZE_KEYS  = ['4x4', '5x5', '6x6'];
const DIFF_KEYS  = ['easy', 'medium', 'hard'];
const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

function isAvailable(sizeKey, diff) {
  return TESTER_AVAILABLE.has(`${sizeKey}-${diff}`);
}

// Pick the next unplayed puzzle for this combo; wraps around when all are played.
function pickPuzzle(sizeKey, diff, attempts) {
  const pool = TESTER_BANK[sizeKey]?.[diff] ?? [];
  if (!pool.length) return null;
  const played = new Set(
    attempts.filter(a => a.sizeKey === sizeKey && a.difficulty === diff).map(a => a.puzzleId)
  );
  const unplayed = pool.filter(p => !played.has(p.id));
  return (unplayed.length > 0 ? unplayed : pool)[0];
}

// ─── Survey ───────────────────────────────────────────────────────────────────

const SURVEY = [
  { id: 'overall',   type: 'nps', low: 'Not at all',       high: 'Loved it',
    label: 'Overall, how much did you enjoy the puzzles? (0–10)' },
  { id: 'recommend', type: 'nps', low: 'Not at all likely', high: 'Extremely likely',
    label: 'How likely are you to recommend Acre to a friend? (0–10)' },
  { id: 'rules',     type: 'nps', low: 'Very confusing',    high: 'Crystal clear',
    label: 'How easy were the rules to understand? (0–10)' },
  { id: 'interface', type: 'nps', low: 'Not intuitive',     high: 'Very intuitive',
    label: 'How intuitive was the interface? (0–10)' },
  { id: 'games',     type: 'multiselect',
    label: 'Which daily puzzle games do you currently play? (select all that apply)',
    options: ['Wordle', 'NYT Crossword', 'NYT Connections', 'Spelling Bee', 'Sudoku',
              'Nonogram / Picross', 'Quordle / Octordle', 'None', 'Other'] },
  { id: 'compare',   type: 'choice',
    label: 'Compared to those games, how does Acre feel?',
    options: ['Better than most', 'On par with them', 'Not quite there yet',
              'Hard to compare', "I don't play others"] },
  { id: 'improve',   type: 'multiselect', max: 3,
    label: 'What would most improve Acre? (pick up to 3)',
    options: ['More puzzle variety', 'Harder difficulty levels', 'Easier difficulty levels',
              'A mobile app', 'Shareable results (like Wordle)', 'Leaderboard / competition',
              'Better tutorial', 'Faster / shorter puzzles', 'Other'] },
  { id: 'daily',     type: 'choice',
    label: 'Would you play this as a daily puzzle game?',
    options: ['Definitely', 'Probably', 'Maybe', 'Probably not'] },
  { id: 'bugs',      type: 'text', label: 'Did you notice any bugs or confusing moments?' },
  { id: 'other',     type: 'text', label: 'Anything else you\'d like to share?' },
];

// 0–10 NPS-style rating
function NPS({ value, onChange, low, high }) {
  return (
    <div>
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
        {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{
            width:36, height:36, borderRadius:8, cursor:'pointer', padding:0,
            fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:13,
            border: value === n ? 'none' : '1px solid var(--btn-border)',
            background: value === n ? 'var(--acc)' : 'var(--btn-bg)',
            color: value === n ? '#fff' : 'var(--text)',
          }}>{n}</button>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between',
                    fontSize:11, color:'var(--text-faint)' }}>
        <span>0 — {low}</span><span>{high} — 10</span>
      </div>
    </div>
  );
}

// Multi-select with optional max selections
function MultiSelect({ values = [], onChange, options, max }) {
  function toggle(opt) {
    if (values.includes(opt)) { onChange(values.filter(v => v !== opt)); return; }
    if (!max || values.length < max) onChange([...values, opt]);
  }
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
      {options.map(opt => {
        const sel      = values.includes(opt);
        const disabled = max && !sel && values.length >= max;
        return (
          <button key={opt} onClick={() => !disabled && toggle(opt)} style={{
            padding:'7px 12px', borderRadius:10,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:600, fontSize:13,
            border: sel ? 'none' : '1px solid var(--btn-border)',
            background: sel ? 'var(--acc)' : 'var(--btn-bg)',
            color: sel ? '#fff' : disabled ? 'var(--text-faint)' : 'var(--text)',
            opacity: disabled ? 0.5 : 1,
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

// Quick 1–5 per-puzzle rating
function Quick5({ value, onChange, low, high }) {
  return (
    <div>
      <div style={{ display:'flex', gap:6 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{
            flex:1, padding:'9px 0', borderRadius:10, cursor:'pointer',
            fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:15,
            border: value === n ? 'none' : '1px solid var(--btn-border)',
            background: value === n ? 'var(--acc)' : 'var(--btn-bg)',
            color: value === n ? '#fff' : 'var(--text)',
          }}>{n}</button>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between',
                    fontSize:11, color:'var(--text-faint)', marginTop:4 }}>
        <span>{low}</span><span>{high}</span>
      </div>
    </div>
  );
}

// ─── Submission ───────────────────────────────────────────────────────────────

const FORMSPREE_ID = 'mlgyland';

function fmtMs(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const STORAGE_KEY = 'acre_tester_v2';

// ─── TesterApp ────────────────────────────────────────────────────────────────

export default function TesterApp() {
  const [screen,      setScreen]      = useState('welcome');
  const [testerName,  setTesterName]  = useState('');
  const [dark,        setDark]        = useState(false);
  // Puzzle selection
  const [sizeKey,     setSizeKey]     = useState(
    SIZE_KEYS.find(s => TESTER_AVAILABLE.has(`${s}-medium`)) ?? '4x4'
  );
  const [difficulty,  setDifficulty]  = useState('medium');
  // Game state
  const [puzzle,      setPuzzle]      = useState(null);
  const [grid,        setGrid]        = useState([[]]);
  const [mode,        setMode]        = useState('fill');
  const [solved,      setSolved]      = useState(false);
  const [showProgress,  setShowProgress]  = useState(true);
  const [hintMenu,      setHintMenu]      = useState(false);
  const [errorCells,    setErrorCells]    = useState(null);
  const [msg,           setMsg]           = useState(null);
  // Per-puzzle mini-survey
  const [puzzleRating,  setPuzzleRating]  = useState({ difficulty: null, satisfaction: null });
  const [showLeavePanel,setShowLeavePanel]= useState(false);
  // Tester tracking
  const [attempts,    setAttempts]    = useState([]);
  const [survey,      setSurvey]      = useState({});
  // Formspree submission
  const [formState, submitToFormspree] = useForm(FORMSPREE_ID);

  const historyRef    = useRef([]);
  const startRef      = useRef(null);
  const errorTimerRef = useRef(null);
  const msgTimerRef   = useRef(null);

  // ── Persistence ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved?.attempts?.length) {
        setAttempts(saved.attempts);
        setTesterName(saved.testerName ?? '');
        if (saved.survey) setSurvey(saved.survey);
      }
    } catch {}
    const d = localStorage.getItem('acre_dark') === 'true';
    setDark(d);
    document.body.classList.toggle('dark', d);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
  }, [dark]);

  function persist(patch = {}) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        testerName, attempts, survey, ...patch,
      }));
    } catch {}
  }

  // ── Auto-clear msg ───────────────────────────────────────────────────────
  useEffect(() => {
    if (msg) {
      clearTimeout(msgTimerRef.current);
      msgTimerRef.current = setTimeout(() => setMsg(null), 3000);
    }
  }, [msg]);

  // ── Win detection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'play' || !puzzle || solved) return;
    if (!isSolved(grid, puzzle)) return;
    playChord();
    setSolved(true);
    // Modal appears in-place on the play screen via the solved flag.
  }, [grid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Game actions ─────────────────────────────────────────────────────────
  function switchSelection(sk, diff) {
    setSizeKey(sk);
    setDifficulty(diff);
  }

  function startPlay() {
    const p = pickPuzzle(sizeKey, difficulty, attempts);
    if (!p) return;
    historyRef.current = [];
    startRef.current   = Date.now();
    setPuzzle(p);
    setGrid(makeFreshGrid(p));
    setMode('fill');
    setSolved(false);
    setHintMenu(false);
    setErrorCells(null);
    setMsg(null);
    setPuzzleRating({ difficulty: null, satisfaction: null });
    setShowLeavePanel(false);
    setScreen('play');
  }

  // Record attempt (with optional per-puzzle rating) and navigate.
  function recordAndNavigate(destination, wasSolved) {
    const elapsed = startRef.current ? Date.now() - startRef.current : null;
    const entry   = {
      puzzleId: puzzle.id, sizeKey, difficulty,
      solved: wasSolved, timeMs: elapsed,
      perceivedDifficulty: puzzleRating.difficulty,
      satisfaction: puzzleRating.satisfaction,
    };
    const next = [...attempts, entry];
    setAttempts(next);
    persist({ attempts: next });
    setPuzzleRating({ difficulty: null, satisfaction: null });
    setShowLeavePanel(false);
    setHintMenu(false);
    setScreen(destination);
  }

  // ← Back: show the leave panel first so testers can rate before going.
  function handleBack() {
    if (solved) { recordAndNavigate('home', true); return; }
    setShowLeavePanel(true);
  }

  function handleUpdate(newGrid) { setGrid(newGrid); }

  function handleDragStart(g) {
    historyRef.current.push(JSON.stringify(g));
    if (historyRef.current.length > 80) historyRef.current.shift();
    setMsg(null);
  }

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
    const size = puzzle.rows;
    const step = findLogicalStep(grid, puzzle);
    if (step) {
      historyRef.current.push(JSON.stringify(grid));
      const g = grid.map(row => [...row]);
      g[step.r][step.c] = step.regionId;
      setGrid(g); setMsg('One cell revealed.'); clearErrors(); return;
    }
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (grid[r][c] === -1) {
          historyRef.current.push(JSON.stringify(grid));
          const g = grid.map(row => [...row]);
          g[r][c] = puzzle.solution[r][c];
          setGrid(g); setMsg('One cell revealed.'); clearErrors(); return;
        }
    setMsg('All cells are already filled!');
  }

  function handleHintRegion() {
    if (!puzzle) return;
    setHintMenu(false);
    const size = puzzle.rows;
    const st   = calcStats(grid, size, puzzle.regions);
    const tgt  = puzzle.regions.find(rg => st[rg.id].area !== rg.area || st[rg.id].perim !== rg.perim);
    if (!tgt) return;
    historyRef.current.push(JSON.stringify(grid));
    const g = grid.map(row => [...row]);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        if (puzzle.solution[r][c] === tgt.id) g[r][c] = tgt.id;
        else if (g[r][c] === tgt.id) g[r][c] = -1;
      }
    setGrid(g); setMsg("Here's one region for you."); clearErrors();
  }

  function handleHintValidate() {
    if (!puzzle) return;
    setHintMenu(false);
    const size  = puzzle.rows;
    const wrong = new Set();
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (grid[r][c] >= 0 && grid[r][c] !== puzzle.solution[r][c])
          wrong.add(`${r},${c}`);
    if (wrong.size === 0) { setMsg('No mistakes found so far!'); return; }
    clearTimeout(errorTimerRef.current);
    setErrorCells(wrong);
    errorTimerRef.current = setTimeout(() => setErrorCells(null), 5000);
    setMsg(`${wrong.size} mistake${wrong.size > 1 ? 's' : ''} highlighted — fix them to clear.`);
  }

  function resetSession() {
    if (!confirm('Clear all progress and start over?')) return;
    localStorage.removeItem(STORAGE_KEY);
    setAttempts([]); setSurvey({}); setTesterName('');
    setScreen('welcome');
  }

  function toggleDark() {
    const on = !dark;
    setDark(on);
    try { localStorage.setItem('acre_dark', String(on)); } catch {}
  }

  // ── Survey submission ────────────────────────────────────────────────────
  function handleSubmit() {
    const attemptSummary = attempts.map(a =>
      `${a.sizeKey} ${a.difficulty}: ${a.solved ? '✓' : '✗'} (${fmtMs(a.timeMs)})`
    ).join(', ');

    submitToFormspree({
      tester:          testerName || 'anonymous',
      puzzles_played:  attempts.length,
      puzzles_solved:  attempts.filter(a => a.solved).length,
      puzzles_summary: attemptSummary,
      ...Object.fromEntries(SURVEY.map(q => [`survey_${q.id}`, survey[q.id] ?? '—'])),
      full_data:       JSON.stringify({ testerName, attempts, survey }, null, 2),
    });
  }

  async function copyResults() {
    const data = { testerName: testerName || 'anonymous', attempts, survey };
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      alert('Copied to clipboard!');
    } catch {
      alert('Copy failed — please select the text preview below and copy manually.');
    }
  }

  // ── Layout constants ─────────────────────────────────────────────────────
  const wrap  = { minHeight:'100vh', width:'100%', display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', padding:'40px 20px' };
  const inner = { width:'100%', maxWidth:600, display:'flex', flexDirection:'column' };

  const attemptCount = attempts.length;
  const solvedCount  = attempts.filter(a => a.solved).length;

  // Header matches the main app style exactly
  const header = (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  marginBottom:40, gap:16 }}>
      <div style={{ fontFamily:"'DM Serif Display', serif", fontStyle:'italic', fontSize:32, lineHeight:1 }}>
        Acre
        <span style={{ fontSize:13, fontStyle:'normal', marginLeft:8, color:'var(--text-faint)',
                       fontFamily:"'Hanken Grotesk', sans-serif" }}>tester</span>
      </div>
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
          <span style={{ fontSize:14 }}>🎮</span>
          <span style={{ fontWeight:800, fontSize:15 }}>{solvedCount}/{attemptCount}</span>
        </div>
        <button onClick={resetSession} style={{
          border:'none', background:'transparent', color:'var(--text-faint)',
          fontFamily:"'Hanken Grotesk', sans-serif", fontSize:12, cursor:'pointer', padding:0,
        }}>Reset</button>
      </div>
    </div>
  );

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
  // WELCOME
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'welcome') {
    const resumed = attempts.length > 0;
    const totalPuzzles = Object.values(TESTER_BANK)
      .flatMap(diffs => Object.values(diffs)).flat().length;
    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:30, lineHeight:1.1 }}>
              {resumed ? 'Welcome back' : 'Welcome, tester'}
            </div>
            <div style={{ color:'var(--text-muted)', fontSize:15, lineHeight:1.7 }}>
              {resumed
                ? `You've played ${attempts.length} puzzle${attempts.length !== 1 ? 's' : ''} so far. Pick up where you left off, or try different sizes and difficulties.`
                : `You're testing Acre — a daily logic puzzle game. Try as many puzzles as you like across different sizes and difficulties, then complete a short survey. There are ${totalPuzzles} puzzles available.`
              }
            </div>

            {!resumed && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:8, color:'var(--text-muted)' }}>
                  Your name <span style={{ fontWeight:400, color:'var(--text-faint)' }}>(optional)</span>
                </div>
                <input
                  value={testerName}
                  onChange={e => setTesterName(e.target.value)}
                  placeholder="e.g. Alex"
                  style={{
                    width:'100%', padding:'11px 14px', borderRadius:10, boxSizing:'border-box',
                    border:'1px solid var(--btn-border)', background:'var(--btn-bg)',
                    color:'var(--text)', fontFamily:"'Hanken Grotesk', sans-serif",
                    fontSize:15, outline:'none',
                  }}
                />
              </div>
            )}

            {totalPuzzles === 0 ? (
              <div style={{ padding:20, background:'var(--surface)', borderRadius:14,
                            border:'1px solid var(--surface-border)', color:'var(--text-muted)' }}>
                No tester puzzles found. Run <code>python3 scripts/populate_tester.py</code> to add some.
              </div>
            ) : (
              <button onClick={() => setScreen('home')} style={{
                padding:14, border:'none', borderRadius:14, background:'var(--acc)', color:'#fff',
                fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:16, cursor:'pointer',
              }}>
                {resumed ? 'Continue testing →' : 'Start testing →'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HOME  (identical look to main app)
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'home') {
    const gridSize    = parseInt(sizeKey);
    const previewCell = gridSize >= 6 ? 26 : gridSize >= 5 ? 29 : 32;
    const preview     = pickPuzzle(sizeKey, difficulty, attempts);
    const comboPlayed = attempts.filter(a => a.sizeKey === sizeKey && a.difficulty === difficulty).length;
    const puzzleSub   = preview
      ? `${preview.rows} × ${preview.cols} grid · ${preview.regions.length} regions${comboPlayed > 0 ? ` · ${comboPlayed} played` : ''}`
      : 'No puzzles for this combination';

    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

            <div>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:30,
                            lineHeight:1.1, marginBottom:6 }}>Choose a puzzle</div>
              <div style={{ color:'var(--text-muted)', fontSize:15, fontWeight:500 }}>
                {testerName ? `Hi ${testerName} —` : ''} try any combination you like.
              </div>
            </div>

            {/* Grid size */}
            <div>
              <div style={selectorLabel}>Grid Size</div>
              <div style={{ display:'flex', gap:10 }}>
                {SIZE_KEYS.map(sk => {
                  const hasAny = DIFF_KEYS.some(d => isAvailable(sk, d));
                  return (
                    <SelBtn key={sk} active={sizeKey === sk}
                      onClick={() => hasAny && switchSelection(sk, difficulty)}>
                      {sk.replace('x', ' × ')}
                      {!hasAny && <span style={{ fontSize:10, display:'block' }}>soon</span>}
                    </SelBtn>
                  );
                })}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <div style={selectorLabel}>Difficulty</div>
              <div style={{ display:'flex', gap:10 }}>
                {DIFF_KEYS.map(d => {
                  const avail = isAvailable(sizeKey, d);
                  return (
                    <SelBtn key={d} active={difficulty === d}
                      onClick={() => avail && switchSelection(sizeKey, d)}>
                      {DIFF_LABEL[d]}
                      {!avail && <span style={{ fontSize:10, display:'block' }}>soon</span>}
                    </SelBtn>
                  );
                })}
              </div>
            </div>

            {/* Preview card */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--surface-border)',
                          borderRadius:20, padding:24, display:'flex', flexDirection:'column',
                          alignItems:'center', gap:20 }}>
              {preview ? (
                <StaticBoard puzzle={preview} cellPx={previewCell} gap={6} dark={dark} />
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
                <div style={{ color:'var(--text-muted)', fontSize:13 }}>{puzzleSub}</div>
              </div>
              <button onClick={startPlay} disabled={!preview} style={{
                width:'100%', padding:14, border:'none', borderRadius:14,
                background: preview ? 'var(--acc)' : 'var(--btn-bg)',
                color: preview ? '#fff' : 'var(--text-faint)',
                fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:15,
                cursor: preview ? 'pointer' : 'not-allowed', opacity: preview ? 1 : 0.5,
              }}>
                Play
              </button>
            </div>

            {/* Finish testing */}
            <button onClick={() => setScreen('survey')} style={{
              width:'100%', padding:14, border:'1px solid var(--btn-border)',
              borderRadius:14, background:'var(--btn-bg)', color:'var(--text)',
              fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:15, cursor:'pointer',
            }}>
              {attempts.length > 0 ? 'Finish testing & take survey →' : 'Skip to survey →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAY  (identical to main app)
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'play' && puzzle) {
    const size     = puzzle.rows;
    const geom     = getGeom(size);
    const playLabel = `${DIFF_LABEL[difficulty]} · ${sizeKey.replace('x', ' × ')}`;

    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

            {/* Top bar */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              {/* Back button is hidden when the win modal is open */}
              {!solved ? (
                <button onClick={handleBack} style={{
                  border:'none', background:'transparent', color:'var(--acc)',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14,
                  cursor:'pointer', padding:0,
                }}>← Back</button>
              ) : <div style={{ width:60 }} />}
              <div style={{ textAlign:'center' }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{playLabel}</div>
              </div>
              <div style={{ width:40 }} />
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
                onClick={() => setShowProgress(v => !v)}
                title={showProgress ? 'Hide region progress' : 'Show region progress'}
                style={{
                  border:'1px solid var(--surface-border)', borderRadius:10, padding:'6px 10px',
                  background: showProgress ? 'var(--btn-active-bg)' : 'var(--surface)',
                  color: showProgress ? 'var(--text)' : 'var(--text-faint)',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:12, cursor:'pointer',
                }}>
                Progress
              </button>
            </div>

            {/* Board */}
            <div style={{ display:'flex', justifyContent:'center', padding:'12px 0', overflowX:'auto' }}>
              <Board
                puzzle={puzzle} geom={geom} grid={grid}
                mode={mode} dark={dark}
                onDragStart={handleDragStart}
                onUpdate={handleUpdate}
                showProgress={showProgress}
                errorCells={errorCells}
              />
            </div>

            {msg && (
              <div style={{ textAlign:'center', color:'var(--text-faint)', fontSize:13, fontWeight:500 }}>
                {msg}
              </div>
            )}

            {/* Leave panel — shown when Back is pressed mid-puzzle */}
            {showLeavePanel && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--surface-border)',
                            borderRadius:16, padding:20, display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ fontWeight:700, fontSize:14, color:'var(--text-muted)', textAlign:'center' }}>
                  Rate this puzzle before leaving
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>
                    How difficult did it feel?
                  </div>
                  <Quick5
                    value={puzzleRating.difficulty}
                    onChange={v => setPuzzleRating(r => ({...r, difficulty: v}))}
                    low="Very easy" high="Very hard"
                  />
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>
                    How satisfying was the attempt?
                  </div>
                  <Quick5
                    value={puzzleRating.satisfaction}
                    onChange={v => setPuzzleRating(r => ({...r, satisfaction: v}))}
                    low="Not at all" high="Very satisfying"
                  />
                </div>
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => recordAndNavigate('home', false)} style={{
                    flex:1, padding:12, borderRadius:12, cursor:'pointer',
                    fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14,
                    border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text-faint)',
                  }}>
                    Skip & go back
                  </button>
                  <button onClick={() => recordAndNavigate('home', false)} style={{
                    flex:1.4, padding:12, borderRadius:12, cursor:'pointer',
                    fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:14,
                    border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text)',
                  }}>
                    Save & go back
                  </button>
                </div>
              </div>
            )}

            {/* Fill / Erase */}
            <div style={{ display:'flex', gap:10 }}>
              {['fill','erase'].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  flex:1, padding:13, borderRadius:12, cursor:'pointer',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:14,
                  border: mode === m ? 'none' : '1px solid var(--btn-border)',
                  background: mode === m ? 'var(--acc)' : 'var(--btn-bg)',
                  color: mode === m ? '#fff' : 'var(--text)',
                }}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {/* Undo / Clear / Hint */}
            <div style={{ display:'flex', gap:10 }}>
              {hintMenu ? (
                <>
                  {[
                    { label:'Reveal cell',   title:'Fill one correct cell', fn: handleHintCell     },
                    { label:'Reveal region', title:'Complete a region',     fn: handleHintRegion   },
                    { label:'Mistakes',      title:'Highlight wrong cells', fn: handleHintValidate },
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
                  }}>✕</button>
                </>
              ) : (
                <>
                  {[
                    { label:'Undo',  onClick: handleUndo             },
                    { label:'Clear', onClick: () => { setGrid(makeFreshGrid(puzzle)); setMsg(null); } },
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

        {/* Win modal — overlays the play screen when the puzzle is solved */}
        {solved && (
          <div style={{
            position:'fixed', inset:0, zIndex:100,
            background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)',
            display:'flex', alignItems:'center', justifyContent:'center', padding:'20px',
          }}>
            <div style={{
              background:'var(--surface)', borderRadius:20, padding:28,
              width:'100%', maxWidth:400,
              display:'flex', flexDirection:'column', gap:20,
            }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:"'DM Serif Display', serif", fontStyle:'italic',
                              fontSize:36, lineHeight:1, marginBottom:8 }}>
                  Solved!
                </div>
                <div style={{ color:'var(--text-muted)', fontSize:14 }}>
                  {DIFF_LABEL[difficulty]} · {sizeKey.replace('x', ' × ')}
                </div>
              </div>

              {/* Quick per-puzzle rating */}
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>
                    How difficult did that feel?
                  </div>
                  <Quick5
                    value={puzzleRating.difficulty}
                    onChange={v => setPuzzleRating(r => ({...r, difficulty: v}))}
                    low="Very easy" high="Very hard"
                  />
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>
                    How satisfying was solving it?
                  </div>
                  <Quick5
                    value={puzzleRating.satisfaction}
                    onChange={v => setPuzzleRating(r => ({...r, satisfaction: v}))}
                    low="Not at all" high="Very satisfying"
                  />
                </div>
              </div>

              {/* Two neutral buttons — neither highlighted */}
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => recordAndNavigate('home', true)} style={{
                  flex:1, padding:13, borderRadius:12, cursor:'pointer',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14,
                  border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text)',
                }}>
                  Try more puzzles
                </button>
                <button onClick={() => recordAndNavigate('survey', true)} style={{
                  flex:1, padding:13, borderRadius:12, cursor:'pointer',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14,
                  border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text)',
                }}>
                  Finish &amp; survey
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SURVEY
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'survey') {
    const requiredAnswered = SURVEY
      .filter(q => q.type === 'nps' || q.type === 'choice' || q.type === 'multiselect')
      .every(q => {
        const v = survey[q.id];
        if (q.type === 'multiselect') return Array.isArray(v) && v.length > 0;
        return v !== null && v !== undefined;
      });

    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

            <button onClick={() => setScreen('home')} style={{
              alignSelf:'flex-start', border:'none', background:'transparent',
              color:'var(--acc)', fontFamily:"'Hanken Grotesk', sans-serif",
              fontWeight:700, fontSize:14, cursor:'pointer', padding:0,
            }}>← Back to puzzles</button>

            <div>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:28,
                            lineHeight:1.1, marginBottom:6 }}>
                Almost done
              </div>
              <div style={{ color:'var(--text-muted)', fontSize:15 }}>
                A few questions about the game.
              </div>
            </div>

            {SURVEY.map(q => (
              <div key={q.id} style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{q.label}</div>
                {q.type === 'nps' && (
                  <NPS
                    value={survey[q.id] ?? null}
                    onChange={v => setSurvey(s => ({...s, [q.id]: v}))}
                    low={q.low} high={q.high}
                  />
                )}
                {q.type === 'multiselect' && (
                  <MultiSelect
                    values={survey[q.id] ?? []}
                    onChange={v => setSurvey(s => ({...s, [q.id]: v}))}
                    options={q.options}
                    max={q.max}
                  />
                )}
                {q.type === 'choice' && (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {q.options.map(opt => (
                      <button key={opt} onClick={() => setSurvey(s => ({...s, [q.id]: opt}))} style={{
                        padding:'8px 14px', borderRadius:10, cursor:'pointer',
                        fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:13,
                        border: survey[q.id] === opt ? 'none' : '1px solid var(--btn-border)',
                        background: survey[q.id] === opt ? 'var(--acc)' : 'var(--btn-bg)',
                        color: survey[q.id] === opt ? '#fff' : 'var(--text)',
                      }}>{opt}</button>
                    ))}
                  </div>
                )}
                {q.type === 'text' && (
                  <textarea
                    value={survey[q.id] ?? ''}
                    onChange={e => setSurvey(s => ({...s, [q.id]: e.target.value}))}
                    rows={2}
                    style={{
                      width:'100%', padding:'11px 14px', borderRadius:10, boxSizing:'border-box',
                      border:'1px solid var(--btn-border)', background:'var(--btn-bg)',
                      color:'var(--text)', fontFamily:"'Hanken Grotesk', sans-serif",
                      fontSize:14, resize:'vertical', outline:'none',
                    }}
                  />
                )}
              </div>
            ))}

            <button
              onClick={() => { persist({ survey }); setScreen('done'); }}
              disabled={!requiredAnswered}
              style={{
                padding:14, border:'none', borderRadius:14, cursor: requiredAnswered ? 'pointer' : 'not-allowed',
                fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:15,
                background: requiredAnswered ? 'var(--acc)' : 'var(--btn-bg)',
                color: requiredAnswered ? '#fff' : 'var(--text-faint)',
                opacity: requiredAnswered ? 1 : 0.6,
              }}>
              Finish →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════
  const exportData = { testerName: testerName || 'anonymous', attempts, survey };

  return (
    <div style={wrap}>
      <div style={inner}>
        {header}
        <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
          <div style={{ fontFamily:"'DM Serif Display', serif", fontStyle:'italic', fontSize:40, lineHeight:1 }}>
            Thank you{testerName ? `, ${testerName}` : ''}!
          </div>
          <div style={{ color:'var(--text-muted)', fontSize:15, lineHeight:1.6 }}>
            You played {attemptCount} puzzle{attemptCount !== 1 ? 's' : ''} and solved {solvedCount}.
            Your feedback is really helpful.
          </div>

          <div style={{ background:'var(--surface)', border:'1px solid var(--surface-border)',
                        borderRadius:20, padding:24, display:'flex', flexDirection:'column', gap:16 }}>
            {formState.succeeded ? (
              <div style={{ textAlign:'center', padding:'12px 0' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>✓</div>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Feedback submitted!</div>
                <div style={{ color:'var(--text-muted)', fontSize:14 }}>
                  Thanks — we received your results.
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Send your feedback</div>
                  <div style={{ color:'var(--text-muted)', fontSize:13, lineHeight:1.5 }}>
                    Click Submit to send your results, or copy them to share manually.
                  </div>
                </div>
                {formState.errors?.length > 0 && (
                  <div style={{ color:'#d95b54', fontSize:13 }}>
                    {formState.errors[0].message ?? 'Submission failed — please copy the results instead.'}
                  </div>
                )}
                <button onClick={handleSubmit} disabled={formState.submitting} style={{
                  padding:13, border:'none', borderRadius:12,
                  background: formState.submitting ? 'var(--btn-bg)' : 'var(--acc)',
                  color: formState.submitting ? 'var(--text-faint)' : '#fff',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:15,
                  cursor: formState.submitting ? 'not-allowed' : 'pointer',
                }}>
                  {formState.submitting ? 'Submitting…' : 'Submit feedback'}
                </button>
                <button onClick={copyResults} style={{
                  padding:13, border:'1px solid var(--btn-border)', borderRadius:12,
                  background:'var(--btn-bg)', color:'var(--text)',
                  fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14, cursor:'pointer',
                }}>
                  Copy results to clipboard
                </button>
              </>
            )}
          </div>

          <details>
            <summary style={{ cursor:'pointer', color:'var(--text-faint)', fontSize:13 }}>
              Preview results JSON
            </summary>
            <pre style={{
              marginTop:12, padding:14, borderRadius:10, fontSize:11, lineHeight:1.5,
              background:'var(--surface)', border:'1px solid var(--surface-border)',
              overflow:'auto', maxHeight:300, color:'var(--text)',
            }}>
              {JSON.stringify(exportData, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
