export function formatClock(ms) {
  ms = Math.max(0, ms);
  if (ms < 20000) return `0:${(Math.floor(ms / 100) / 10).toFixed(1).padStart(4, '0')}`;
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
