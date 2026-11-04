import { escapeHeader } from '../shared/pgn.js';
export { gameToPgn } from '../shared/pgn.js';
import { Chess } from 'chess.js';

export const MAX_PGN_BYTES = 100000;
export function readPgn(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Paste a PGN or choose a .pgn file.');
  if (new TextEncoder().encode(text).length > MAX_PGN_BYTES) throw new Error('Choose a PGN smaller than 100 KB.');
  const chess = new Chess();
  // chess.js 1.x does not parse PGN's escaped quotes in tag values. Temporarily
  // substitute escaped metadata, then restore it without altering the movetext.
  const escapedHeaders = new Map();
  const parseable = text.replace(/^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\s*\]/gm, (tag, key, value) => {
    if (!value.includes('\\')) return tag;
    if (['FEN', 'SetUp', 'Result'].includes(key)) return tag;
    escapedHeaders.set(key, value.replace(/\\(["\\])/g, '$1'));
    return `[${key} "escaped-header"]`;
  });
  try { chess.loadPgn(parseable); } catch { throw new Error('This PGN could not be read. Check its headers and legal move notation.'); }
  for (const [key, value] of escapedHeaders) chess.setHeader(key, value);
  const verbose = chess.history({ verbose: true });
  if (verbose.length > 1000) throw new Error('This board supports games up to 1,000 half-moves.');
  return { pgn: text.trim(), headers: chess.getHeaders(), initialFen: verbose[0]?.before || chess.fen(), moves: chess.history() };
}
export function replay(initialFen, moves) {
  const chess = new Chess(initialFen);
  for (const san of moves) chess.move(san);
  return chess;
}
export function variationPgn(game, moves) {
  const chess = replay(game.initialFen, moves);
  for (const [key, value] of Object.entries(game.headers)) if (!['Result', 'SetUp', 'FEN'].includes(key)) chess.setHeader(key, escapeHeader(value));
  chess.setHeader('Result', chess.isCheckmate() ? chess.turn() === 'w' ? '0-1' : '1-0' : chess.isDraw() ? '1/2-1/2' : '*');
  return chess.pgn();
}
export function branchMove(game, line, ply, move) {
  const chess = replay(game.initialFen, line.slice(0, ply));
  const played = chess.move(move);
  return { line: line[ply] === played.san ? line : [...line.slice(0, ply), played.san], ply: ply + 1 };
}
export function enginePosition(initialFen, moves) {
  const chess = replay(initialFen, moves);
  const uci = chess.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
  return `position fen ${initialFen}${uci.length ? ` moves ${uci.join(' ')}` : ''}`;
}
export function parseEngineInfo(line, fen) {
  if (!line.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(line)) return null;
  const depth = line.match(/\bdepth (\d+)/), score = line.match(/\bscore (cp|mate) (-?\d+)/), pv = line.match(/\bpv (.+)/);
  if (!depth || !score || !pv) return null;
  const chess = new Chess(fen), sign = chess.turn() === 'w' ? 1 : -1;
  const moves = [], tokens = pv[1].trim().split(/\s+/);
  for (const token of tokens.slice(0, 12)) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) break;
    try {
      const m = chess.move({ from: token.slice(0, 2), to: token.slice(2, 4), promotion: token[4] });
      moves.push({ san: m.san, from: m.from, to: m.to, promotion: m.promotion });
    } catch { break; }
  }
  if (!moves.length) return null;
  return { depth: Number(depth[1]), type: score[1], value: Number(score[2]) * sign, moves };
}
export function downloadPgn(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
