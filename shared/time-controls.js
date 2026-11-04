export const TIME_PRESETS = {
  Bullet: [[1, 0], [1, 1], [2, 1]],
  Blitz: [[3, 0], [3, 2], [5, 0], [5, 5]],
  Rapid: [[10, 0], [10, 5], [15, 10], [30, 0]],
  Classical: [[60, 0], [60, 30], [90, 30]],
};
export function validateTimeControl({ minutes = 5, increment = 0 } = {}) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < .5 || minutes > 180 || !Number.isInteger(minutes * 2)) {
    throw new Error('Choose 0.5–180 minutes, in half-minute steps.');
  }
  if (typeof increment !== 'number' || !Number.isInteger(increment) || increment < 0 || increment > 60) {
    throw new Error('Choose a whole-number increment from 0–60 seconds.');
  }
  return { minutes, increment };
}
export const timeControlKey = ({ minutes, increment }) => `${minutes}+${increment}`;
export const timeControlLabel = ({ minutes, increment = 0 }) => increment ? `${minutes} + ${increment}` : `${minutes} min`;
// App categories use starting time plus an estimated 40 increments.
export function timeControlCategory({ minutes, increment = 0 }) {
  const seconds = minutes * 60 + increment * 40;
  return seconds < 180 ? 'Bullet' : seconds < 600 ? 'Blitz' : seconds < 3600 ? 'Rapid' : 'Classical';
}
