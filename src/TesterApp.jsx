import { useState, useRef, useEffect } from 'react';
import { Board } from './Board.jsx';
import { getGeom, makeFreshGrid, isSolved, playChord } from './gameUtils.js';

// ─── Load tester puzzles ──────────────────────────────────────────────────────
// Populated by: python3 scripts/populate-tester.py
// Files are named NNN.json and contain the standard puzzle JSON format.

const _MODS = import.meta.glob('./puzzles/tester/*.json', { eager: true });
const PUZZLES = Object.entries(_MODS)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, mod]) => {
    const p = mod.default ?? mod;
    return { ...p, size: p.rows };
  });

// ─── Survey questions ─────────────────────────────────────────────────────────

const SURVEY = [
  { id: 'overall',   type: 'rating',  label: 'Overall, how much did you enjoy the puzzles?' },
  { id: 'rules',     type: 'rating',  label: 'How easy were the rules to understand?' },
  { id: 'interface', type: 'rating',  label: 'How intuitive did the interface feel?' },
  { id: 'daily',     type: 'choice',
    label: 'Would you play this as a daily puzzle game?',
    options: ['Definitely', 'Probably', 'Maybe', 'Probably not'] },
  { id: 'best',      type: 'text',    label: 'What did you like most?' },
  { id: 'change',    type: 'text',    label: 'What would you most want to change or improve?' },
  { id: 'compare',   type: 'text',    label: 'How does it compare to other daily puzzles you play? (Wordle, NYT Crossword, etc.)' },
  { id: 'bugs',      type: 'text',    label: 'Did you notice any bugs or confusing moments?' },
];

const STORAGE_KEY = 'acre_tester_session';

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Rating component ─────────────────────────────────────────────────────────

const LABELS = ['', 'Very easy', 'Easy', 'Medium', 'Hard', 'Very hard'];
const SAT    = ['', 'Not at all', 'Slightly', 'Moderately', 'Very', 'Extremely'];

function Stars({ value, onChange, labels }) {
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => onChange(n)} style={{
          padding:'8px 14px', borderRadius:10, cursor:'pointer',
          fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:13,
          border: value === n ? 'none' : '1px solid var(--btn-border)',
          background: value === n ? 'var(--acc)' : 'var(--btn-bg)',
          color: value === n ? '#fff' : 'var(--text)',
        }}>
          {n} — {labels[n]}
        </button>
      ))}
    </div>
  );
}

// ─── TesterApp ────────────────────────────────────────────────────────────────

export default function TesterApp() {
  const [screen,      setScreen]      = useState('welcome');
  const [testerName,  setTesterName]  = useState('');
  const [idx,         setIdx]         = useState(0);
  const [grid,        setGrid]        = useState(() => makeFreshGrid(PUZZLES[0]));
  const [mode,        setMode]        = useState('fill');
  const [solved,      setSolved]      = useState(false);
  const [ratings,     setRatings]     = useState([]);       // per-puzzle ratings
  const [current,     setCurrent]     = useState({ difficulty: 0, satisfaction: 0, notes: '' });
  const [survey,      setSurvey]      = useState({});
  const startRef  = useRef(null);
  const historyRef = useRef([]);

  const puzzle = PUZZLES[idx] ?? null;
  const geom   = puzzle ? getGeom(puzzle.size) : getGeom(4);
  const total  = PUZZLES.length;

  // Persist session to localStorage so testers can resume
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        if (s.ratings?.length) {
          setRatings(s.ratings);
          setIdx(Math.min(s.ratings.length, total - 1));
          setTesterName(s.testerName ?? '');
        }
      }
    } catch {}
  }, [total]);

  function persist(newRatings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ testerName, ratings: newRatings })); } catch {}
  }

  function startPuzzle(i) {
    setIdx(i);
    setGrid(makeFreshGrid(PUZZLES[i]));
    setMode('fill');
    setSolved(false);
    setCurrent({ difficulty: 0, satisfaction: 0, notes: '' });
    historyRef.current = [];
    startRef.current = Date.now();
    setScreen('puzzle');
  }

  function handleUpdate(newGrid) {
    setGrid(newGrid);
    if (!solved && isSolved(newGrid, puzzle)) {
      playChord();
      setSolved(true);
    }
  }

  function handleDragStart(g) {
    historyRef.current.push(JSON.stringify(g));
    if (historyRef.current.length > 60) historyRef.current.shift();
  }

  function handleUndo() {
    if (!historyRef.current.length) return;
    setGrid(JSON.parse(historyRef.current.pop()));
    setSolved(false);
  }

  function goToRate(skipped = false) {
    setScreen('rate');
    if (skipped && !solved) setCurrent(c => ({ ...c, skipped: true }));
  }

  function submitRating() {
    const elapsed = startRef.current ? Date.now() - startRef.current : null;
    const entry = {
      puzzleId:     puzzle.id,
      size:         `${puzzle.rows}x${puzzle.cols}`,
      metaDiff:     puzzle.meta?.difficulty ?? '?',
      difficulty:   current.difficulty,
      satisfaction: current.satisfaction,
      notes:        current.notes.trim(),
      solved:       solved,
      skipped:      current.skipped ?? false,
      timeMs:       elapsed,
    };
    const newRatings = [...ratings, entry];
    setRatings(newRatings);
    persist(newRatings);

    if (idx + 1 < total) {
      startPuzzle(idx + 1);
    } else {
      setScreen('survey');
    }
  }

  function submitSurvey() {
    setScreen('done');
  }

  function exportResults() {
    const data = {
      tester:   testerName || 'anonymous',
      exported: new Date().toISOString(),
      ratings,
      survey,
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      .then(() => alert('Copied to clipboard!'))
      .catch(() => alert('Copy failed — select the text box and copy manually.'));
  }

  function resetSession() {
    if (!confirm('Clear all progress and start over?')) return;
    localStorage.removeItem(STORAGE_KEY);
    setRatings([]);
    setIdx(0);
    setGrid(makeFreshGrid(PUZZLES[0]));
    setSolved(false);
    setTesterName('');
    setSurvey({});
    setScreen('welcome');
  }

  // ── Shared layout ───────────────────────────────────────────────────────────
  const wrap  = { minHeight:'100vh', display:'flex', flexDirection:'column',
                  alignItems:'center', padding:'40px 20px', fontFamily:"'Hanken Grotesk', sans-serif" };
  const inner = { width:'100%', maxWidth:560, display:'flex', flexDirection:'column', gap:20 };

  const header = (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
      <div style={{ fontFamily:"'DM Serif Display', serif", fontStyle:'italic', fontSize:26 }}>
        Acre <span style={{ fontSize:14, fontStyle:'normal', color:'var(--text-muted)', fontFamily:"'Hanken Grotesk', sans-serif" }}>tester</span>
      </div>
      <button onClick={resetSession} style={{
        border:'none', background:'transparent', color:'var(--text-faint)',
        fontSize:12, cursor:'pointer', padding:0,
      }}>Reset session</button>
    </div>
  );

  // ── Welcome ─────────────────────────────────────────────────────────────────
  if (screen === 'welcome') {
    const resumed = ratings.length > 0;
    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:30, lineHeight:1.1 }}>
            {resumed ? 'Welcome back' : 'Welcome, tester'}
          </div>
          <div style={{ color:'var(--text-muted)', fontSize:15, lineHeight:1.7 }}>
            {resumed
              ? `You've rated ${ratings.length} of ${total} puzzles. Pick up where you left off.`
              : `You'll play ${total} puzzle${total !== 1 ? 's' : ''} and rate each one. Then a short survey about the game. Takes about ${Math.ceil(total * 3)} minutes.`
            }
          </div>

          {!resumed && (
            <div>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:8, color:'var(--text-muted)' }}>
                Your name (optional)
              </div>
              <input
                value={testerName}
                onChange={e => setTesterName(e.target.value)}
                placeholder="e.g. Alex"
                style={{
                  width:'100%', padding:'11px 14px', borderRadius:10, boxSizing:'border-box',
                  border:'1px solid var(--btn-border)', background:'var(--btn-bg)',
                  color:'var(--text)', fontFamily:"'Hanken Grotesk', sans-serif", fontSize:15, outline:'none',
                }}
              />
            </div>
          )}

          {total === 0 ? (
            <div style={{ padding:20, background:'var(--surface)', borderRadius:14,
                          border:'1px solid var(--surface-border)', color:'var(--text-muted)' }}>
              No tester puzzles found. Run <code>python3 scripts/populate-tester.py</code> to add some.
            </div>
          ) : (
            <button onClick={() => startPuzzle(resumed ? ratings.length : 0)} style={{
              padding:14, border:'none', borderRadius:14, background:'var(--acc)', color:'#fff',
              fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:16, cursor:'pointer',
            }}>
              {resumed ? `Continue (puzzle ${ratings.length + 1} of ${total})` : 'Start testing →'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Puzzle ───────────────────────────────────────────────────────────────────
  if (screen === 'puzzle' && puzzle) {
    const label = `${puzzle.rows}×${puzzle.cols} — ${puzzle.meta?.difficulty ?? '?'}`;
    return (
      <div style={wrap}>
        <div style={inner}>
          {header}

          {/* Progress + label */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontWeight:700, fontSize:15 }}>{label}</div>
            <div style={{ color:'var(--text-faint)', fontSize:13 }}>
              {idx + 1} / {total}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height:4, background:'var(--surface)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${((idx + 1) / total) * 100}%`,
                          background:'var(--acc)', borderRadius:2, transition:'width .3s' }} />
          </div>

          {/* Mode buttons */}
          <div style={{ display:'flex', gap:6, background:'var(--surface)',
                        border:'1px solid var(--surface-border)', padding:4, borderRadius:10, alignSelf:'flex-start' }}>
            {['fill','erase'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                border:'none', borderRadius:7, padding:'6px 12px',
                fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:12, cursor:'pointer',
                background: mode === m ? 'var(--btn-active-bg)' : 'transparent',
                color:      mode === m ? 'var(--text)' : 'var(--text-faint)',
              }}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Board */}
          <div style={{ display:'flex', justifyContent:'center' }}>
            <Board
              puzzle={puzzle} geom={geom} grid={grid}
              mode={mode} dark={false}
              onDragStart={handleDragStart}
              onUpdate={(g) => handleUpdate(g)}
            />
          </div>

          {solved && (
            <div style={{ textAlign:'center', color:'#2a9e68', fontWeight:700, fontSize:16 }}>
              Solved! ✓
            </div>
          )}

          {/* Controls */}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleUndo} style={{
              flex:1, padding:12, borderRadius:12, cursor:'pointer',
              fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14,
              border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text)',
            }}>Undo</button>
            <button onClick={() => setGrid(makeFreshGrid(puzzle))} style={{
              flex:1, padding:12, borderRadius:12, cursor:'pointer',
              fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:700, fontSize:14,
              border:'1px solid var(--btn-border)', background:'var(--btn-bg)', color:'var(--text)',
            }}>Clear</button>
            <button onClick={() => goToRate(!solved)} style={{
              flex:1.4, padding:12, borderRadius:12, cursor:'pointer',
              fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:14,
              border:'none',
              background: solved ? 'var(--acc)' : 'var(--btn-bg)',
              color:      solved ? '#fff' : 'var(--text)',
            }}>
              {solved ? 'Rate it →' : 'Skip & rate →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Rate ─────────────────────────────────────────────────────────────────────
  if (screen === 'rate') {
    const elapsed = startRef.current ? Date.now() - startRef.current : null;
    const canSubmit = current.difficulty > 0 && current.satisfaction > 0;

    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:24, lineHeight:1.2 }}>
            {solved ? `Solved in ${fmt(elapsed)}` : 'Skipped — that\'s fine!'}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
            {/* Difficulty */}
            <div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:10 }}>
                How difficult did this feel?
              </div>
              <Stars value={current.difficulty} onChange={v => setCurrent(c => ({...c, difficulty:v}))} labels={LABELS} />
            </div>

            {/* Satisfaction */}
            <div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:10 }}>
                How satisfying was it to {solved ? 'solve' : 'attempt'}?
              </div>
              <Stars value={current.satisfaction} onChange={v => setCurrent(c => ({...c, satisfaction:v}))} labels={SAT} />
            </div>

            {/* Notes */}
            <div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:8 }}>
                Any thoughts on this puzzle? <span style={{ fontWeight:400, color:'var(--text-faint)' }}>(optional)</span>
              </div>
              <textarea
                value={current.notes}
                onChange={e => setCurrent(c => ({...c, notes:e.target.value}))}
                placeholder="e.g. the 5×5 region felt impossible to start..."
                rows={3}
                style={{
                  width:'100%', padding:'11px 14px', borderRadius:10, boxSizing:'border-box',
                  border:'1px solid var(--btn-border)', background:'var(--btn-bg)',
                  color:'var(--text)', fontFamily:"'Hanken Grotesk', sans-serif",
                  fontSize:14, resize:'vertical', outline:'none',
                }}
              />
            </div>
          </div>

          <button onClick={submitRating} disabled={!canSubmit} style={{
            padding:14, border:'none', borderRadius:14, cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:15,
            background: canSubmit ? 'var(--acc)' : 'var(--btn-bg)',
            color:      canSubmit ? '#fff' : 'var(--text-faint)',
            opacity: canSubmit ? 1 : 0.6,
          }}>
            {idx + 1 < total ? 'Next puzzle →' : 'Continue to survey →'}
          </button>
        </div>
      </div>
    );
  }

  // ── Survey ────────────────────────────────────────────────────────────────────
  if (screen === 'survey') {
    const allAnswered = SURVEY
      .filter(q => q.type === 'rating' || q.type === 'choice')
      .every(q => survey[q.id]);

    return (
      <div style={wrap}>
        <div style={inner}>
          {header}
          <div>
            <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:28, lineHeight:1.1, marginBottom:6 }}>
              Almost done
            </div>
            <div style={{ color:'var(--text-muted)', fontSize:15 }}>
              A few questions about the game overall.
            </div>
          </div>

          {SURVEY.map(q => (
            <div key={q.id} style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontWeight:700, fontSize:15 }}>{q.label}</div>
              {q.type === 'rating' && (
                <Stars
                  value={survey[q.id] ?? 0}
                  onChange={v => setSurvey(s => ({...s, [q.id]: v}))}
                  labels={['','Poor','Fair','Good','Great','Excellent']}
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

          <button onClick={submitSurvey} disabled={!allAnswered} style={{
            padding:14, border:'none', borderRadius:14, cursor: allAnswered ? 'pointer' : 'not-allowed',
            fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:15,
            background: allAnswered ? 'var(--acc)' : 'var(--btn-bg)',
            color:      allAnswered ? '#fff' : 'var(--text-faint)',
            opacity: allAnswered ? 1 : 0.6,
          }}>
            Finish →
          </button>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  const solved_count = ratings.filter(r => r.solved).length;
  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—';
  const avgDiff = avg(ratings.filter(r => r.difficulty).map(r => r.difficulty));
  const avgSat  = avg(ratings.filter(r => r.satisfaction).map(r => r.satisfaction));

  const exportData = {
    tester:   testerName || 'anonymous',
    exported: new Date().toISOString(),
    summary: { total, solved: solved_count, avgDifficulty: avgDiff, avgSatisfaction: avgSat },
    ratings,
    survey,
  };

  return (
    <div style={wrap}>
      <div style={inner}>
        {header}
        <div style={{ fontFamily:"'DM Serif Display', serif", fontStyle:'italic', fontSize:40, lineHeight:1 }}>
          Thank you{testerName ? `, ${testerName}` : ''}!
        </div>
        <div style={{ color:'var(--text-muted)', fontSize:15, lineHeight:1.6 }}>
          You completed {solved_count} of {total} puzzles. Average difficulty rating: {avgDiff}/5. Average satisfaction: {avgSat}/5.
        </div>

        <div style={{ background:'var(--surface)', border:'1px solid var(--surface-border)',
                      borderRadius:16, padding:20 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:12 }}>Share your feedback</div>
          <div style={{ color:'var(--text-muted)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>
            Click the button below to copy your results as JSON. Send it to the developer via email or message.
          </div>
          <button onClick={exportResults} style={{
            width:'100%', padding:13, border:'none', borderRadius:12,
            background:'var(--acc)', color:'#fff',
            fontFamily:"'Hanken Grotesk', sans-serif", fontWeight:800, fontSize:14, cursor:'pointer',
          }}>
            Copy results to clipboard
          </button>
        </div>

        <details>
          <summary style={{ cursor:'pointer', color:'var(--text-faint)', fontSize:13 }}>
            Preview feedback JSON
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
  );
}
