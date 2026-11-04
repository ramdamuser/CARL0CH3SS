import test from 'node:test';
import assert from 'node:assert/strict';
import { soundForTransition } from '../src/sounds.js';
const base = { id: 'room', history: [], check: false, result: null };
test('clock updates, initial snapshots, room changes are silent', () => {
  assert.equal(soundForTransition(null, base), null);
  assert.equal(soundForTransition(base, {...base, remaining: {w:100}}), null);
  assert.equal(soundForTransition(base, {...base, id:'other', history:['e4']}), null);
  assert.equal(soundForTransition(base, {...base, history:['e4','e5']}), 'move');
});
test('legal move audio distinguishes captures including en passant and prioritizes check and game end', () => {
  const moved = {...base, history:['e4']};
  assert.equal(soundForTransition(base,moved),'move');
  assert.equal(soundForTransition(base,{...moved,lastMove:{captured:'p',flags:'e'}}),'capture');
  assert.equal(soundForTransition(base,{...moved,check:true,lastMove:{captured:'p'}}),'check');
  assert.equal(soundForTransition(base,{...moved,check:true,result:'White wins by checkmate'}),'end');
  assert.equal(soundForTransition(base,{...base,result:'Black wins on time'}),'end');
  const ended = {...base,result:'Draw by agreement'};
  assert.equal(soundForTransition(ended,{...ended}),null);
});
