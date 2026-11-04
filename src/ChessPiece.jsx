const glyphs = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export default function ChessPiece({ type, color }) {
  return <span aria-hidden="true" className={`piece ${color}`}>{glyphs[type]}</span>;
}
