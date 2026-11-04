import { useState } from 'react';
import { TIME_PRESETS, timeControlCategory, timeControlLabel, validateTimeControl } from '../shared/time-controls';
export default function TimeControl({ value, onChange, disabled }) {
  const [category, setCategory] = useState('Blitz');
  let error;
  try { validateTimeControl(value); } catch (e) { error = e.message; }
  return <section className="time-control" aria-label="Time control">
    <div className="label-row"><span className="field-label">Time control</span><span className="time-summary">{error ? 'Custom' : `${timeControlLabel(value)} · ${timeControlCategory(value)}`}</span></div>
    <div className="time-categories" role="group" aria-label="Time control categories">
      {[...Object.keys(TIME_PRESETS), 'Custom'].map(name => <button key={name} type="button" aria-pressed={category === name} disabled={disabled} className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{name}</button>)}
    </div>
    {category === 'Custom' ? <div className="custom-time">
      <label htmlFor="time-minutes">Minutes per player<input id="time-minutes" type="number" min="0.5" max="180" step="0.5" disabled={disabled} value={value.minutes} aria-describedby="time-help" onChange={e => onChange({...value, minutes: e.target.value === '' ? '' : Number(e.target.value)})}/></label>
      <label htmlFor="time-increment">Increment (seconds)<input id="time-increment" type="number" min="0" max="60" step="1" disabled={disabled} value={value.increment} aria-describedby="time-help" onChange={e => onChange({...value, increment: e.target.value === '' ? '' : Number(e.target.value)})}/></label>
    </div> : <div className="time-options expanded">{TIME_PRESETS[category].map(([minutes, increment]) => <button type="button" key={`${minutes}+${increment}`} disabled={disabled} aria-pressed={value.minutes === minutes && value.increment === increment} className={value.minutes === minutes && value.increment === increment ? 'chosen' : ''} onClick={() => onChange({minutes, increment})}><strong>{increment ? `${minutes} + ${increment}` : <>{minutes}<small> min</small></>}</strong><span>{increment ? `+${increment}s per move` : 'No increment'}</span></button>)}</div>}
    <p id="time-help" className={`time-help ${error ? 'time-error' : ''}`} role={error ? 'status' : undefined}>{error || 'Minutes to start + seconds added after each move.'}</p>
  </section>;
}
