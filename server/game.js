import { gameToPgn, resultTag } from '../shared/pgn.js';
import { MAX_PREMOVES, projectedBoard, canPlan } from '../shared/premoves.js';
import { Chess } from 'chess.js';
import { randomBytes } from 'node:crypto';
import { validateTimeControl } from '../shared/time-controls.js';
export const other = c => c === 'w' ? 'b' : 'w';
export const colorName = c => c === 'w' ? 'White' : 'Black';
export function createGame(minutes = 5, increment = 0) {
  validateTimeControl({ minutes, increment });
  return { id: randomBytes(4).toString('hex').toUpperCase(), chess: new Chess(), players: {}, premoves: { w: [], b: [] }, remaining: { w: minutes * 60000, b: minutes * 60000 }, minutes, increment, lastTick: null, result: null, drawOffer: null, updated: Date.now() };
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
  g.remaining[color] += g.increment * 1000;
  g.drawOffer = null;
  if (g.chess.isCheckmate()) g.result = `${colorName(color)} wins by checkmate`;
  else if (g.chess.isStalemate()) g.result = 'Draw by stalemate';
  else if (g.chess.isThreefoldRepetition()) g.result = 'Draw by threefold repetition';
  else if (g.chess.isDrawByFiftyMoves()) g.result = 'Draw by the 50-move rule';
  else if (g.chess.isInsufficientMaterial()) g.result = 'Draw by insufficient material';
  g.updated = now;
  return m;
}
export function queuePremove(g, color, data) {
  if (g.result || !g.lastTick) throw new Error('Game is not active.');
  if (g.chess.turn() === color) throw new Error('It is your turn. Make a move instead.');
  if (data.ply !== g.chess.history().length) throw new Error('The position changed. Queue your premove again.');
  if (g.premoves[color].length >= MAX_PREMOVES) throw new Error('You can queue up to 20 premoves.');
  const board = projectedBoard(g.chess.fen(), g.premoves[color]);
  if (!canPlan(board, color, data.from, data.to)) throw new Error('Choose a valid premove for your pieces.');
  const promotes = board.get(data.from).type === 'p' && ['1', '8'].includes(data.to[1]);
  if (promotes && !['q', 'r', 'b', 'n'].includes(data.promotion)) throw new Error('Choose a promotion piece.');
  g.premoves[color].push({ from: data.from, to: data.to, ...(promotes ? { promotion: data.promotion } : {}) });
}
export function runPremoves(g, now = Date.now(), onCancel = () => {}) {
  while (!g.result) {
    const color = g.chess.turn(), queued = g.premoves[color];
    if (!queued.length) break;
    const next = queued[0];
    const legal = g.chess.moves({ verbose: true }).some(m => m.from === next.from && m.to === next.to && m.promotion === next.promotion);
    if (!legal) { g.premoves[color] = []; onCancel(color); break; }
    queued.shift();
    g.remaining[color] = Math.max(0, g.remaining[color] - 100);
    if (!g.remaining[color]) { g.result = `${colorName(other(color))} wins on time`; break; }
    move(g, color, next, now);
  }
  if (g.result) g.premoves = { w: [], b: [] };
}
export function snapshot(g, viewer) {
  const pgn = g.result ? gameToPgn(g.chess.history(), {
    Event: 'CARL0CH3SS', White: g.players.w?.name || 'White', Black: g.players.b?.name || 'Black',
    Result: resultTag(g.result), TimeControl: `${g.minutes * 60}+${g.increment}`, Termination: g.result,
  }) : null;
  return { pgn, premoves: viewer ? g.premoves[viewer] : [], id: g.id, fen: g.chess.fen(), history: g.chess.history(), lastMove: g.chess.history({ verbose: true }).at(-1), turn: g.chess.turn(), check: g.chess.isCheck(), players: Object.fromEntries(Object.entries(g.players).map(([c, p]) => [c, { name: p.name, connected: !!p.socketId }])), remaining: g.remaining, active: !!g.lastTick && !g.result, result: g.result, minutes: g.minutes, increment: g.increment, drawOffer: g.drawOffer };
}
