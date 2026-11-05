export default function ChessPiece({ type, color }) {
  return <img aria-hidden="true" alt="" draggable="false" className={`piece ${color}`} src={`${import.meta.env.BASE_URL}pieces/cburnett/${color}${type.toUpperCase()}.svg`}/>;
}
