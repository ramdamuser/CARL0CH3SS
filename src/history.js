import { Chess } from 'chess.js';

// Replay SAN instead of loading isolated boards, preserving castling, en passant,
// promotion, and the check status of every position. Index 0 is the initial board.
export function buildTimeline(history, initialFen) {
  const chess = initialFen ? new Chess(initialFen) : new Chess();
  const position = lastMove => ({ fen: chess.fen(), turn: chess.turn(), check: chess.isCheck(), lastMove });
  const positions = [position(null)];
  for (const san of history) positions.push(position(chess.move(san)));
  return positions;
}
