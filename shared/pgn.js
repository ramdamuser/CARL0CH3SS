import { Chess } from 'chess.js';
export const resultTag = result => result?.startsWith('White wins') ? '1-0' : result?.startsWith('Black wins') ? '0-1' : result?.startsWith('Draw') ? '1/2-1/2' : '*';
export const escapeHeader = value => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
export function gameToPgn(history, headers = {}) {
  const chess = new Chess();
  for (const san of history) chess.move(san);
  for (const [key, value] of Object.entries(headers)) chess.setHeader(key, escapeHeader(value));
  return chess.pgn();
}
