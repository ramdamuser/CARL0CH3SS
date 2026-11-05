import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, RotateCw, Upload, X } from 'lucide-react';
import ChessPiece from './ChessPiece';
import useStockfish from './useStockfish';
import { scrollHistoryItem } from './scrollHistory';
import { readPgn, replay, branchMove, analysisMoveSound, enginePosition, variationPgn, downloadPgn, MAX_PGN_BYTES } from './analysis';

const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export default function AnalysisBoard({ initialPgn, onClose, onMoveSound }) {
  const [original, setOriginal] = useState(() => readPgn(initialPgn));
  const [line, setLine] = useState(() => original.moves);
  const [ply, setPly] = useState(() => original.moves.length);
  const [selected, setSelected] = useState(null), [promotion, setPromotion] = useState(null);
  const [flipped, setFlipped] = useState(false), [dragging, setDragging] = useState(null);
  const [enabled, setEnabled] = useState(true), [depth, setDepth] = useState(16), [retry, setRetry] = useState(0);
  const [pgnText, setPgnText] = useState(''), [error, setError] = useState('');
  const dragFrame = useRef(null), activeMove = useRef(null), analysisMoves = useRef(null), input = useRef(null);
  const chess = useMemo(() => replay(original.initialFen, line.slice(0, ply)), [original.initialFen, line, ply]);
  const fen = chess.fen();
  const position = useMemo(() => enginePosition(original.initialFen, line.slice(0, ply)), [original.initialFen, line, ply]);
  const engine = useStockfish({ enabled: enabled && !chess.isGameOver(), fen, position, depth, retry });
  const info = enabled ? engine.info : null;
  const best = info?.moves[0];
  const last = chess.history({ verbose: true }).at(-1);
  const legal = selected ? chess.moves({ square: selected, verbose: true }) : [];
  const branchIndex = line.findIndex((san, index) => original.moves[index] !== san);
  const isVariation = branchIndex !== -1;
  const terminal = chess.isCheckmate() ? `${chess.turn() === 'w' ? 'Black' : 'White'} wins by checkmate` : chess.isDraw() ? 'Drawn position' : null;
  const score = chess.isCheckmate() ? { type: 'mate', value: chess.turn() === 'w' ? -1 : 1 } : chess.isDraw() ? { type: 'cp', value: 0 } : info;
  const scoreText = chess.isCheckmate() ? (chess.turn() === 'w' ? '0–1' : '1–0') : score ? score.type === 'mate' ? `${score.value < 0 ? '−' : '+'}M${Math.abs(score.value)}` : `${score.value >= 0 ? '+' : ''}${(score.value / 100).toFixed(2)}` : '—';
  const whitePercent = score ? score.type === 'mate' ? score.value > 0 ? 100 : 0 : Math.max(2, Math.min(98, 50 + 48 * Math.tanh(score.value / 500))) : 50;
  const ranks = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
  const files = flipped ? 'hgfedcba' : 'abcdefgh';
  const center = square => ({ x: (files.indexOf(square[0]) + .5) * 100, y: (ranks.indexOf(Number(square[1])) + .5) * 100 });
  const arrowStart = best && center(best.from), arrowEnd = best && center(best.to);
  function stopDrag() { cancelAnimationFrame(dragFrame.current); dragFrame.current = null; setDragging(null); }
  function go(next) { setPly(Math.max(0, Math.min(line.length, next))); setSelected(null); setPromotion(null); stopDrag(); }
  useEffect(() => {
    window.addEventListener('dragend', stopDrag); window.addEventListener('drop', stopDrag);
    return () => { cancelAnimationFrame(dragFrame.current); window.removeEventListener('dragend', stopDrag); window.removeEventListener('drop', stopDrag); };
  }, []);
  useEffect(() => { scrollHistoryItem(analysisMoves.current, activeMove.current); }, [ply]);
  function play(from, to, promote) {
    try {
      const next = branchMove(original, line, ply, { from, to, promotion: promote });
      setLine(next.line); setPly(next.ply); setSelected(null); setPromotion(null); stopDrag();
      onMoveSound?.(analysisMoveSound(original.initialFen, next.line, next.ply));
    } catch { setError('That move is not legal in this position.'); }
  }
  function attempt(from, to) {
    const options = chess.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (!options.length) return;
    if (options.some(m => m.promotion)) setPromotion({ from, to }); else play(from, to);
  }
  function click(square) {
    if (selected && legal.some(m => m.to === square)) attempt(selected, square);
    else setSelected(chess.get(square)?.color === chess.turn() && square !== selected ? square : null);
  }
  function returnToGame() { setLine(original.moves); setPly(isVariation ? Math.min(branchIndex, original.moves.length) : Math.min(ply, original.moves.length)); setSelected(null); setPromotion(null); stopDrag(); }
  function importPgn(text) {
    try { const game = readPgn(text); setOriginal(game); setLine(game.moves); setPly(game.moves.length); setSelected(null); setPromotion(null); setError(''); setPgnText(''); stopDrag(); }
    catch (e) { setError(e.message); }
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > MAX_PGN_BYTES) { setError('Choose a PGN smaller than 100 KB.'); return; }
    try { importPgn(await file.text()); } catch { setError('The file could not be read.'); }
  }
  function moveLabel(index) {
    const fields = original.initialFen.split(' '), offset = fields[1] === 'b' ? 1 : 0;
    const number = Number(fields[5]) + Math.floor((index + offset) / 2);
    return `${number}${(index + offset) % 2 ? '…' : '.'}`;
  }
  return <section className="analysis" onKeyDown={e => {
    if (promotion || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(ply - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(ply + 1); }
  }}>
    <div className="analysis-heading"><div><div className="eyebrow">A SECOND LOOK</div><h2>Find the move you missed.</h2><p>{original.headers.White || 'White'} vs {original.headers.Black || 'Black'} · {isVariation ? 'Exploring a variation' : 'Original game'}</p></div><button className="secondary" onClick={onClose}><ArrowLeft size={16}/> Back to play</button></div>
    <div className="game-layout"><div className="board-section">
      <div className="analysis-board-row"><div className={`evaluation-bar ${flipped ? 'flipped' : ''}`} role="img" aria-label={`Evaluation from White’s perspective: ${scoreText}`}><div className="evaluation-white" style={{ height: `${whitePercent}%` }}/><span>{scoreText}</span></div><div className="board-frame analysis-board-frame"><div className="board" role="group" aria-label="Analysis chessboard">{ranks.flatMap((rank, ri) => [...files].map((file, fi) => {
        const square = file + rank, piece = chess.get(square), target = !dragging && legal.some(m => m.to === square);
        return <button key={square} className={`square ${(file.charCodeAt(0) - 97 + rank) % 2 === 0 ? 'dark-square' : 'light-square'} ${selected === square ? 'selected' : ''} ${last && [last.from, last.to].includes(square) ? 'last-move' : ''} ${piece?.type === 'k' && piece.color === chess.turn() && chess.isCheck() ? 'in-check' : ''} ${dragging === square ? 'dragging-source' : ''}`} aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${names[piece.type]}` : ''}`} aria-pressed={selected === square} onClick={() => click(square)} draggable={piece?.color === chess.turn()} onDragStart={e => {
          const element = e.currentTarget.querySelector('.piece'); if (!element) { e.preventDefault(); return; }
          const bounds = element.getBoundingClientRect(); e.dataTransfer.setDragImage(element, bounds.width / 2, bounds.height / 2);
          e.dataTransfer.setData('text/plain', square); e.dataTransfer.effectAllowed = 'move'; setSelected(null);
          cancelAnimationFrame(dragFrame.current); dragFrame.current = requestAnimationFrame(() => setDragging(square));
        }} onDragEnd={stopDrag} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); stopDrag(); const from = e.dataTransfer.getData('text/plain'); if (/^[a-h][1-8]$/.test(from)) attempt(from, square); }}>
          {fi === 0 && <span className="rank-label">{rank}</span>}{ri === 7 && <span className="file-label">{file}</span>}{piece && <ChessPiece type={piece.type} color={piece.color}/>} {target && <span className={piece ? 'capture-target' : 'move-target'}/>}</button>;
      }))}</div>{best && !dragging && !selected && <svg className="best-move-arrow" viewBox="0 0 800 800" aria-hidden="true"><defs><marker id="analysis-arrow" markerWidth="4" markerHeight="4" refX="2.7" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill="#e6a643"/></marker></defs><line x1={arrowStart.x} y1={arrowStart.y} x2={arrowEnd.x} y2={arrowEnd.y} stroke="#e6a643" strokeWidth="13" strokeLinecap="round" opacity=".8" markerEnd="url(#analysis-arrow)"/></svg>}</div></div>
      <div className="board-toolbar"><span>{terminal || `${chess.turn() === 'w' ? 'White' : 'Black'} to move${chess.isCheck() ? ' · Check' : ''}`}</span><button className="text-button" onClick={() => setFlipped(!flipped)}><RotateCw size={14}/> Flip board</button></div>
      <div className="review-controls" role="group" aria-label="Analysis move navigation"><button className="icon-button" aria-label="Starting position" disabled={!ply} onClick={() => go(0)}><ChevronsLeft size={18}/></button><button className="icon-button" aria-label="Previous analysis move" disabled={!ply} onClick={() => go(ply - 1)}><ChevronLeft size={20}/></button><span>{ply} / {line.length}</span><button className="icon-button" aria-label="Next analysis move" disabled={ply === line.length} onClick={() => go(ply + 1)}><ChevronRight size={20}/></button><button className="icon-button" aria-label="Last position" disabled={ply === line.length} onClick={() => go(line.length)}><ChevronsRight size={18}/></button></div>
      <div className="review-notice">Move either side to explore an alternative. Your recorded game stays intact. Use ← / → to step through moves.</div>
      {isVariation && <button className="secondary return-game" onClick={returnToGame}>Return to game line</button>}
    </div><aside>
      <section className="panel engine-panel"><div className="panel-heading"><span className="eyebrow">STOCKFISH 19 · LITE</span><label className="engine-toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/> Engine</label></div><div className="engine-score"><strong>{scoreText}</strong><span>{terminal || { off: 'Engine off', loading: 'Loading engine…', searching: 'Analyzing…', ready: 'Analysis complete', error: 'Engine unavailable' }[engine.status]}</span></div><p className="muted">Positive favors White · Negative favors Black</p><div className="engine-settings"><label htmlFor="engine-depth">Target depth</label><select id="engine-depth" value={depth} onChange={e => setDepth(Number(e.target.value))}>{[12,16,20].map(d => <option key={d} value={d}>{d}</option>)}</select><span>Reached {info?.depth || '—'}</span></div><p className="time-help">Up to 2.5 seconds per position. Results are estimates.</p>{engine.error && <p role="alert">{engine.error} <button className="text-button" onClick={() => setRetry(retry + 1)}>Retry engine</button></p>}{best && <><h3>Suggested continuation</h3><p className="engine-line">{info.moves.map(m => m.san).join(' ')}</p><button className="secondary" onClick={() => play(best.from, best.to, best.promotion)}>Try {best.san}</button></>}<div className="engine-credits"><a href="https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1" target="_blank" rel="noreferrer">Stockfish.js</a> · <a href="/stockfish/COPYING.txt" target="_blank" rel="noreferrer">GPLv3</a> · <a href="/stockfish/stockfish.js-v19.0.1-source.tar.gz" download>Engine source</a></div></section>
      <section className="panel analysis-history"><div className="moves-heading"><h3>{isVariation ? 'Variation' : 'Game moves'}</h3><span>{line.length} ply</span></div><div className="analysis-moves" ref={analysisMoves}>{line.length ? line.map((san, index) => <button key={index} ref={ply === index + 1 ? activeMove : null} className={ply === index + 1 ? 'current' : ''} aria-current={ply === index + 1 ? 'step' : undefined} onClick={() => go(index + 1)}><small>{moveLabel(index)}</small> {san}</button>) : <p className="muted">Starting position. Make a move to explore.</p>}</div><div className="analysis-downloads"><button className="text-button" onClick={() => downloadPgn(original.pgn, 'carl0ch3ss-game.pgn')}><Download size={14}/> Game PGN</button>{isVariation && <button className="text-button" onClick={() => downloadPgn(variationPgn(original, line), 'carl0ch3ss-variation.pgn')}><Download size={14}/> Variation PGN</button>}</div></section>
      <section className="panel pgn-panel"><h3>Import a game</h3><p className="muted">Paste PGN or open a file. Imports one game’s main line.</p><label className="field-label" htmlFor="analysis-pgn">PGN</label><textarea id="analysis-pgn" rows={5} maxLength={MAX_PGN_BYTES} value={pgnText} onChange={e => setPgnText(e.target.value)} placeholder={'[White "Player 1"]\n[Black "Player 2"]\n\n1. e4 e5 2. Nf3 Nc6 *'}/><div className="pgn-actions"><button className="primary" disabled={!pgnText.trim()} onClick={() => importPgn(pgnText)}>Load PGN</button><button className="secondary" onClick={() => input.current.click()}><Upload size={14}/> Open file</button></div><input hidden ref={input} type="file" accept=".pgn,.txt,application/x-chess-pgn,text/plain" onChange={e => { void importFile(e.target.files[0]); e.target.value = ''; }}/>{error && <p className="time-error" role="alert">{error}</p>}</section>
    </aside></div>
    {promotion && <div className="modal-backdrop"><section className="modal panel" role="dialog" aria-modal="true" aria-label="Choose analysis promotion"><button className="modal-close icon-button" aria-label="Cancel promotion" onClick={() => setPromotion(null)}><X size={20}/></button><h2>Choose your promotion.</h2><div className="promotion-options">{['q','r','b','n'].map(type => <button key={type} aria-label={`Promote to ${names[type]}`} onClick={() => play(promotion.from, promotion.to, type)}><ChessPiece type={type} color={chess.turn()}/><span>{names[type]}</span></button>)}</div></section></div>}
  </section>;
}
