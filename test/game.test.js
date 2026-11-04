import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createGame, move, tick, snapshot } from '../server/game.js';
function started() { const g = createGame(5); g.lastTick = 1000; return g; }
test('server rejects wrong turns and illegal moves without changing position', () => {
  const g = started(); const fen = g.chess.fen();
  assert.throws(() => move(g, 'b', {from:'e7',to:'e5'}, 1100));
  assert.throws(() => move(g, 'w', {from:'e2',to:'e5'}, 1200));
  assert.equal(g.chess.fen(), fen);
});
test('clock charges only the side to move and rejects moves after timeout', () => {
  const g = started(); move(g, 'w', {from:'e2',to:'e4'}, 2000);
  assert.equal(g.remaining.w,299000); tick(g, 3000); assert.equal(g.remaining.b,299000);
  tick(g, 400000); assert.equal(g.result,'White wins on time');
  assert.throws(() => move(g,'b',{from:'e7',to:'e5'},400001));
});
test('checkmate ends the game and records SAN', () => {
  const g = started();
  for (const [i, san] of ['f3','e5','g4','Qh4#'].entries()) { const c = g.chess.turn(); const m = g.chess.moves({verbose:true}).find(m => m.san === san); move(g,c,m,2000+i*1000); }
  assert.equal(g.result,'Black wins by checkmate'); assert.equal(snapshot(g).history.at(-1),'Qh4#');
});
test('threefold repetition is detected using full game history', () => {
  const g = started();
  for (const [i,san] of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'].entries()) move(g,g.chess.turn(),g.chess.moves({verbose:true}).find(m=>m.san===san),2000+i*1000);
  assert.equal(g.result,'Draw by threefold repetition');
});
test('castling, en passant, promotion and fifty-move draw', () => {
  const g = started(); g.chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  move(g,'w',{from:'e1',to:'g1'},2000); assert.equal(g.chess.get('f1').type,'r');
  g.chess = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  move(g,'w',{from:'e5',to:'d6'},3000); assert.equal(g.chess.get('d5'),undefined);
  g.chess = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  move(g,'w',{from:'a7',to:'a8',promotion:'r'},4000); assert.equal(g.chess.get('a8').type,'r');
  g.chess = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 99 1');
  move(g,'w',{from:'a1',to:'a2'},5000); assert.equal(g.result,'Draw by the 50-move rule');
});

test('increment is awarded once to the mover after a legal move, never on invalid moves or timeout', () => {
  const g = createGame(.5, 2); g.lastTick = 1000;
  move(g, 'w', { from: 'e2', to: 'e4' }, 2000);
  assert.equal(g.remaining.w, 31000);
  assert.equal(g.remaining.b, 30000);
  assert.equal(snapshot(g).increment, 2);
  assert.throws(() => move(g, 'b', { from: 'e7', to: 'e4' }, 3000));
  assert.equal(g.remaining.b, 29000);
  move(g, 'b', { from: 'e7', to: 'e5' }, 4000);
  assert.equal(g.remaining.b, 30000);
  assert.throws(() => move(g, 'w', { from: 'd2', to: 'd4' }, 35000));
  assert.equal(g.remaining.w, 0);
  assert.equal(g.result, 'Black wins on time');
});

test('custom time controls validate boundaries and reject malformed values', () => {
  assert.equal(createGame(.5, 0).remaining.w, 30000);
  assert.equal(createGame(180, 60).remaining.b, 10800000);
  for (const minutes of [0, -.5, 181, .75, NaN, Infinity, '5', null]) assert.throws(() => createGame(minutes, 0));
  for (const increment of [-1, 61, .5, NaN, Infinity, '2', null]) assert.throws(() => createGame(5, increment));
});
