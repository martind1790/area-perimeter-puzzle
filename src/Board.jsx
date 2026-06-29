import { useRef } from 'react';
import { isAdj } from './gameUtils.js';

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
export function Board({ puzzle, geom, grid, mode, dark, onDragStart, onUpdate }) {
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

      {puzzle.regions.map(reg => (
        <div key={`lbl_${reg.id}`} style={{
          position:'absolute',
          left: reg.clueC * step + cell / 2,
          top:  reg.clueR * step + cell / 2,
          transform:'translate(-50%,-50%)',
          zIndex:4, pointerEvents:'none',
          display:'flex', flexDirection:'column', alignItems:'center',
        }}>
          <div style={{ fontWeight:800, fontSize:aF, color:CLUE_INK, lineHeight:1,
                        fontFamily:"'Hanken Grotesk', sans-serif" }}>
            {reg.area}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:2, marginTop:1 }}>
            <span style={{ width:ring, height:ring, borderRadius:'50%',
                           border:`1.5px solid ${CLUE_INK}`, opacity:.45,
                           display:'inline-block', flexShrink:0 }} />
            <span style={{ fontWeight:700, fontSize:pF, color:CLUE_INK, opacity:.7,
                           lineHeight:1, fontFamily:"'Hanken Grotesk', sans-serif" }}>
              {reg.perim}
            </span>
          </div>
        </div>
      ))}
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
