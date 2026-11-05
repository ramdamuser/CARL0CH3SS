import { Chess } from 'chess.js';

export const REVIEW_DEPTH = 16;
export const REVIEW_TIME_MS = 2500;
const CACHE_VERSION = 2;
const REVIEW_LABELS = ['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'];

export function reviewPositions(game) {
  const chess = new Chess(game.initialFen);
  const positions = [{ fen: chess.fen(), command: `position fen ${game.initialFen}`, terminal: terminalScore(chess) }];
  const uci = [];
  for (const san of game.moves) {
    const move = chess.move(san);
    uci.push(move.from + move.to + (move.promotion || ''));
    positions.push({ fen: chess.fen(), command: `position fen ${game.initialFen} moves ${uci.join(' ')}`, terminal: terminalScore(chess) });
  }
  return positions;
}

function terminalScore(chess) {
  if (chess.isCheckmate()) return { type: 'mate', value: chess.turn() === 'w' ? -1 : 1, moves: [], depth: 0 };
  if (chess.isDraw()) return { type: 'cp', value: 0, moves: [], depth: 0 };
  return null;
}

export function whiteChance(score) {
  if (score.type === 'mate') return score.value > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-score.value / 220));
}

export function classifyMove(before, after, san, mover) {
  const sign = mover === 'w' ? 1 : -1;
  const beforeChance = mover === 'w' ? whiteChance(before) : 1 - whiteChance(before);
  const afterChance = mover === 'w' ? whiteChance(after) : 1 - whiteChance(after);
  const loss = Math.max(0, beforeChance - afterChance);
  const best = before.moves?.[0]?.san;
  const label = san === best ? 'Best' : loss <= .01 ? 'Excellent' : loss <= .035 ? 'Good' : loss <= .09 ? 'Inaccuracy' : loss <= .2 ? 'Mistake' : 'Blunder';
  return { label, loss, best: best || null, beforeChance, afterChance, mover: sign === 1 ? 'White' : 'Black' };
}

export function reviewMovePrefix(initialFen, index) {
  const fields = initialFen.split(' ');
  const offset = fields[1] === 'b' ? 1 : 0;
  const number = Number(fields[5]) + Math.floor((index + offset) / 2);
  return `${number}${(index + offset) % 2 ? '…' : '.'}`;
}

export function reviewSymbol(label) {
  return { Best: '★', Excellent: '✓', Good: '✓', Inaccuracy: '?!', Mistake: '?', Blunder: '??' }[label] || '';
}

export function reviewExplanation(game, index, move) {
  const prefix = reviewMovePrefix(game.initialFen, index);
  const played = `${prefix}${game.moves[index]}`;
  const better = move.best && move.best !== game.moves[index] ? `${prefix}${move.best}` : null;
  if (['Inaccuracy', 'Mistake', 'Blunder'].includes(move.label)) {
    const consequence = move.beforeChance >= .6 && move.afterChance <= .5
      ? 'lost the advantage'
      : 'weakened the position';
    return `${played} ${consequence}${better ? `; ${better} was stronger` : ''}.`;
  }
  if (better) return `${played} kept the position close to the best line; ${better} was another option.`;
  return `${played} was the engine's top choice.`;
}

export function buildReview(game, scores) {
  if (scores.length !== game.moves.length + 1 || scores.some(score => !score)) throw new Error('The review is incomplete.');
  const moves = game.moves.map((san, index) => classifyMove(scores[index], scores[index + 1], san, index % 2 === (game.initialFen.split(' ')[1] === 'b' ? 1 : 0) ? 'w' : 'b'));
  const counts = Object.fromEntries(['White', 'Black'].map(side => [side, Object.fromEntries(REVIEW_LABELS.map(label => [label, moves.filter(move => move.mover === side && move.label === label).length]))]));
  return { scores, moves, counts };
}

function cacheKey(game) {
  const source = `${CACHE_VERSION}|${REVIEW_DEPTH}|${REVIEW_TIME_MS}|${game.pgn}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `carl-review-${CACHE_VERSION}-${(hash >>> 0).toString(16)}`;
}

export function loadReview(game) {
  try {
    const entry = JSON.parse(localStorage.getItem(cacheKey(game)));
    return entry?.pgn === game.pgn && entry.depth === REVIEW_DEPTH && entry.time === REVIEW_TIME_MS && entry.review?.moves?.length === game.moves.length ? entry.review : null;
  } catch { return null; }
}

export function saveReview(game, review) {
  try { localStorage.setItem(cacheKey(game), JSON.stringify({ pgn: game.pgn, depth: REVIEW_DEPTH, time: REVIEW_TIME_MS, review })); }
  catch { /* Storage may be disabled or full; the current review still works. */ }
}
