import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createGame, move, queuePremove, runPremoves, snapshot } from '../server/game.js';
import { projectedBoard, canPlan } from '../shared/premoves.js';
import { formatClock } from '../src/clock.js';
const started = (increment = 0) => { const g = createGame(5, increment); g.lastTick = 1000; return g; };
const queue = (g, color, from, to, promotion) => queuePremove(g, color, { from, to, promotion, ply: g.chess.history().length });

test('multiple premoves execute on successive turns, each costing 100ms before increment', () => {
  const g = started(2);
  queue(g, 'b', 'e7', 'e5'); queue(g, 'b', 'g8', 'f6'); queue(g, 'b', 'f6', 'g4');
  for (const [i, to] of ['e4', 'd4', 'c4'].entries()) {
    const now = 2000 + i * 1000;
    move(g, 'w', { from: `${to[0]}2`, to }, now); runPremoves(g, now);
    assert.equal(g.premoves.b.length, 2 - i);
    assert.equal(g.remaining.b, 300000 + (i + 1) * 1900);
  }
  assert.deepEqual(g.chess.history(), ['e4', 'e5', 'd4', 'Nf6', 'c4', 'Ng4']);
});

test('invalid premove clears its sequence without spending time or awarding increment', () => {
  const g = started(2); queue(g, 'b', 'd8', 'h4'); queue(g, 'b', 'e7', 'e5');
  move(g, 'w', { from: 'e2', to: 'e4' }, 2000);
  let cancelled; runPremoves(g, 2000, color => { cancelled = color; });
  assert.equal(cancelled, 'b'); assert.equal(g.premoves.b.length, 0);
  assert.equal(g.remaining.b, 300000); assert.deepEqual(g.chess.history(), ['e4']);
});

test('100ms or less remaining flags before the premove and cannot be rescued by increment', () => {
  for (const remaining of [50, 100]) {
    const g = started(10); queue(g, 'b', 'e7', 'e5'); g.remaining.b = remaining;
    move(g, 'w', { from: 'e2', to: 'e4' }, 2000); runPremoves(g, 2000);
    assert.equal(g.result, 'White wins on time'); assert.equal(g.remaining.b, 0);
    assert.deepEqual(g.chess.history(), ['e4']); assert.equal(g.premoves.b.length, 0);
  }
});

test('queues are private, limited, and cannot be submitted on own turn or a stale position', () => {
  const g = started();
  assert.throws(() => queue(g, 'w', 'e2', 'e4'), /your turn/);
  assert.throws(() => queuePremove(g, 'b', { from: 'e7', to: 'e5', ply: 2 }), /position changed/);
  assert.throws(() => queue(g, 'b', 'e2', 'e4'), /your pieces/);
  for (let i = 0; i < 20; i++) queue(g, 'b', i % 2 ? 'f6' : 'g8', i % 2 ? 'g8' : 'f6');
  assert.throws(() => queue(g, 'b', 'g8', 'f6'), /20 premoves/);
  assert.equal(snapshot(g, 'b').premoves.length, 20);
  assert.equal(snapshot(g, 'w').premoves.length, 0);
  assert.equal(snapshot(g).premoves.length, 0);
});

test('premove promotion preserves selected piece and castling projects the rook', () => {
  const g = started(); g.chess = new Chess('4k3/8/8/8/8/8/p7/4K3 w - - 0 1');
  queue(g, 'b', 'a2', 'a1', 'n');
  move(g, 'w', { from: 'e1', to: 'f1' }, 2000); runPremoves(g, 2000);
  assert.equal(g.chess.get('a1').type, 'n'); assert.equal(g.remaining.b, 299900);
  const board = projectedBoard('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', [{ from: 'e8', to: 'g8' }]);
  assert.equal(board.get('f8').type, 'r'); assert.equal(board.has('h8'), false);
  assert.equal(canPlan(board, 'b', 'f8', 'f6'), true);
});

test('clock formatting shows tenths strictly below twenty seconds and clamps at zero', () => {
  for (const [ms, expected] of [[60000, '1:00'], [20000, '0:20'], [19999, '0:19.9'], [19100, '0:19.1'], [9900, '0:09.9'], [100, '0:00.1'], [0, '0:00.0'], [-500, '0:00.0']]) assert.equal(formatClock(ms), expected);
});
