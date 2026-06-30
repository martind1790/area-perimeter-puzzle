import { useRef } from 'react';
import { isAdj, calcStats } from './gameUtils.js';

// Clue cells always have light pastel backgrounds regardless of theme.
const CLUE_INK = '#1a1a1a';

/**
 * Interactive game board. Handles drag-to-paint and erase interactions.
 *
 * Props:
 *   puzzle      — puzzle object with rows, cols, regions
 *   geom        — { size, cell, step, px } from getGeom()
 *   grid        — 2D array of region IDs (-1 = empty)
 *   mode        — 'fill' | 'erase'
 *   dark        — boolean
 *   onDragStart — called with current grid snapshot before each drag
 *   onUpdate    — called with (newGrid, regionId | null) on each paint
 */
export function Board({ puzzle, geom, grid, mode, dark, onDragStart, onUpdate, showProgress = true, errorCells = null }) {
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
  const liveStats  = showProgress ? calcStats(grid, size, puzzle.regions) : null;
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
    if (mode === 'erase') { dragColorRef.current = null; paintAt(pos.r, pos.c); return; }
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
      {Array.from({ length: size }, (_, r) =>
        Array.from({ length: size }, (_, c) => (
          <div key={`${r}_${c}`} style={{
            position:'absolute', left:c*step, top:r*step,
            width:cell, height:cell,
            background: grid[r][c] >= 0 ? colorOf[grid[r][c]] : emptyColor,
            borderRadius:radius, transition:'background .12s ease',
          }} />
        ))
      )}

      {/* Error overlays — shown for cells still in conflict with the solution */}
      {errorCells && Array.from(errorCells).map(key => {
        const [r, c] = key.split(',').map(Number);
        // Only show the overlay while the cell is still wrong
        if (grid[r]?.[c] === puzzle.solution?.[r]?.[c]) return null;
        return (
          <div key={`err_${key}`} style={{
            position:'absolute', left:c*step, top:r*step,
            width:cell, height:cell, borderRadius:radius,
            background:'rgba(217,91,84,0.25)',
            border:'2px solid rgba(217,91,84,0.7)',
            pointerEvents:'none', zIndex:3, boxSizing:'border-box',
          }} />
        );
      })}

      {(() => {
        // Compute once outside the per-region map
        const gridFull = liveStats !== null && !grid.some(row => row.some(v => v === -1));
        const GOOD = '#2a9e68', BAD = '#d95b54';

        return puzzle.regions.map(reg => {
          const cur     = liveStats?.[reg.id];
          const started = cur && cur.area > 1;
          const complete = cur && cur.area === reg.area && cur.perim === reg.perim;

          // Area is wrong if: too many cells placed, or grid is full and count doesn't match
          const areaErr = cur && (cur.area > reg.area || (gridFull && cur.area !== reg.area));
          // Perimeter is wrong if: area is exactly right but perim differs, or grid full and perim differs
          const perimErr = cur && ((cur.area === reg.area && cur.perim !== reg.perim) || (gridFull && cur.perim !== reg.perim));

          const areaInk  = complete ? GOOD : areaErr  ? BAD : CLUE_INK;
          const perimInk = complete ? GOOD : perimErr ? BAD : CLUE_INK;

          return (
            <div key={`lbl_${reg.id}`} style={{
              position:'absolute',
              left: reg.clueC * step + cell / 2,
              top:  reg.clueR * step + cell / 2,
              transform:'translate(-50%,-50%)',
              zIndex:4, pointerEvents:'none',
              display:'flex', flexDirection:'column', alignItems:'center',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                <span style={{ width:ring, height:ring, background:areaInk,
                               display:'inline-block', flexShrink:0 }} />
                <span style={{ fontWeight:800, fontSize:aF, lineHeight:1,
                               fontFamily:"'Hanken Grotesk', sans-serif" }}>
                  {started && !complete ? (
                    <><span style={{ color:areaInk }}>{cur.area}</span>
                      <span style={{ color:CLUE_INK, opacity:.35 }}>/{reg.area}</span></>
                  ) : (
                    <span style={{ color:areaInk }}>{reg.area}</span>
                  )}
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:3, marginTop:2 }}>
                <svg width={ring} height={ring} viewBox="0 0 14 14" fill="none"
                     style={{ opacity: complete ? 1 : 0.55, display:'inline-block', flexShrink:0, verticalAlign:'middle' }}>
                  <rect x="1" y="1" width="12" height="12" stroke={perimInk}
                        strokeWidth="1.5" strokeDasharray="3 2"/>
                </svg>
                <span style={{ fontWeight:700, fontSize:pF, lineHeight:1,
                               fontFamily:"'Hanken Grotesk', sans-serif" }}>
                  {started && !complete ? (
                    <><span style={{ color:perimInk, opacity:.7 }}>{cur.perim}</span>
                      <span style={{ color:CLUE_INK, opacity:.28 }}>/{reg.perim}</span></>
                  ) : (
                    <span style={{ color:perimInk, opacity: complete ? 1 : .7 }}>{reg.perim}</span>
                  )}
                </span>
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}

/**
 * Non-interactive preview board used on the home and win screens.
 */
export function StaticBoard({ puzzle, cellPx, gap, dark }) {
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
