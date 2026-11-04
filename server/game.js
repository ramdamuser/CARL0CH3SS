import { Chess } from 'chess.js';
import { randomBytes } from 'node:crypto';
export const other = c => c === 'w' ? 'b' : 'w';
export const colorName = c => c === 'w' ? 'White' : 'Black';
export function createGame(minutes = 5) {
  return { id: randomBytes(4).toString('hex').toUpperCase(), chess: new Chess(), players: {}, remaining: { w: minutes * 60000, b: minutes * 60000 }, minutes, lastTick: null, result: null, drawOffer: null, updated: Date.now() };
}
export function tick(g, now = Date.now()) {
  if (!g.lastTick || g.result) return;
  const c = g.chess.turn();
  g.remaining[c] = Math.max(0, g.remaining[c] - (now - g.lastTick));
  g.lastTick = now;
  if (!g.remaining[c]) g.result = `${colorName(other(c))} wins on time`;
}
export function move(g, color, data, now = Date.now()) {
  tick(g, now);
  if (g.result || !g.lastTick) throw new Error('Game is not active.');
  if (g.chess.turn() !== color) throw new Error('Wait for your turn.');
  const m = g.chess.move({ from: data.from, to: data.to, promotion: data.promotion || 'q' });
  if (!m) throw new Error('Illegal move.');
  g.drawOffer = null;
  if (g.chess.isCheckmate()) g.result = `${colorName(color)} wins by checkmate`;
  else if (g.chess.isStalemate()) g.result = 'Draw by stalemate';
  else if (g.chess.isThreefoldRepetition()) g.result = 'Draw by threefold repetition';
  else if (g.chess.isDrawByFiftyMoves()) g.result = 'Draw by the 50-move rule';
  else if (g.chess.isInsufficientMaterial()) g.result = 'Draw by insufficient material';
  g.updated = now;
  return m;
}
export function snapshot(g) {
  return { id: g.id, fen: g.chess.fen(), history: g.chess.history(), lastMove: g.chess.history({ verbose: true }).at(-1), turn: g.chess.turn(), check: g.chess.isCheck(), players: Object.fromEntries(Object.entries(g.players).map(([c, p]) => [c, { name: p.name, connected: !!p.socketId }])), remaining: g.remaining, active: !!g.lastTick && !g.result, result: g.result, minutes: g.minutes, drawOffer: g.drawOffer };
}
