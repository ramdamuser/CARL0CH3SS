import { Chess } from 'chess.js';
export const MAX_PREMOVES = 20;
export function projectedBoard(fen, moves = []) {
  const board = new Map(new Chess(fen).board().flat().filter(Boolean).map(p => [p.square, { ...p }]));
  for (const m of moves) {
    const piece = board.get(m.from);
    if (!piece) continue;
    board.delete(m.from);
    board.set(m.to, { ...piece, square: m.to, type: m.promotion || piece.type });
    if (piece.type === 'k' && Math.abs(m.to.charCodeAt(0) - m.from.charCodeAt(0)) === 2) {
      const rank = m.from[1], from = (m.to[0] === 'g' ? 'h' : 'a') + rank, to = (m.to[0] === 'g' ? 'f' : 'd') + rank;
      const rook = board.get(from);
      if (rook?.type === 'r' && rook.color === piece.color) { board.delete(from); board.set(to, { ...rook, square: to }); }
    }
  }
  return board;
}
// Premove planning checks shape/ownership, not check or blockers: the opponent's
// future moves are unknown. Full chess.js legality is required at execution.
export function canPlan(board, color, from, to) {
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) || from === to) return false;
  const p = board.get(from), target = board.get(to);
  if (!p || p.color !== color || target?.color === color || target?.type === 'k') return false;
  const dx = Math.abs(to.charCodeAt(0) - from.charCodeAt(0)), dy = Number(to[1]) - Number(from[1]), ay = Math.abs(dy);
  switch (p.type) {
    case 'p': { const direction = color === 'w' ? 1 : -1; return (dy === direction && dx <= 1) || (dx === 0 && dy === direction * 2 && from[1] === (color === 'w' ? '2' : '7')); }
    case 'n': return dx * ay === 2;
    case 'b': return dx === ay;
    case 'r': return dx === 0 || ay === 0;
    case 'q': return dx === ay || dx === 0 || ay === 0;
    case 'k': return Math.max(dx, ay) === 1 || (from === (color === 'w' ? 'e1' : 'e8') && dy === 0 && dx === 2);
    default: return false;
  }
}
