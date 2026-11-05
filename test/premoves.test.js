import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createGame, move, queuePremove, runPremoves, snapshot } from '../server/game.js';
import { projectedBoard, canPlan, premoveDestinations } from '../shared/premoves.js';
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


test('available squares include friendly recaptures and ignore blockers and check', () => {
  const board = projectedBoard(new Chess().fen());
  assert.deepEqual(premoveDestinations(board, 'w', 'e2'), ['d3', 'e3', 'f3', 'e4']);
  assert.deepEqual(premoveDestinations(board, 'b', 'e7'), ['e5', 'd6', 'e6', 'f6']);
  for (const [from, to] of [['a1', 'a2'], ['a1', 'a8'], ['c1', 'h6'], ['d1', 'd8'], ['e1', 'e2'], ['e1', 'g1'], ['e1', 'c1'], ['g1', 'e2']]) {
    assert.ok(canPlan(board, 'w', from, to), `${from}-${to}`);
  }
  for (const [from, to] of [['e2', 'e5'], ['e2', 'd4'], ['e2', 'e1'], ['g1', 'g3'], ['a1', 'b3'], ['c1', 'c2'], ['e1', 'e3'], ['e1', 'e1'], ['a9', 'a8'], ['a7', 'a6']]) {
    assert.equal(canPlan(board, 'w', from, to), false, `${from}-${to}`);
  }
  const checked = projectedBoard('4k3/8/8/8/8/8/4r3/R3K3 b Q - 0 1');
  assert.ok(canPlan(checked, 'w', 'a1', 'a8'));
  assert.ok(canPlan(checked, 'w', 'e1', 'd2'));
});

test('recapture onto a friendly occupied square executes after that piece is taken', () => {
  const g = started();
  g.chess = new Chess('r3k3/8/8/3p4/4P3/8/5N2/4K3 b - - 0 1');
  queue(g, 'w', 'f2', 'e4');
  queue(g, 'w', 'e4', 'c5');
  const preview = projectedBoard(g.chess.fen(), g.premoves.w);
  assert.equal(preview.get('c5').type, 'n');
  assert.equal(preview.has('e4'), false);
  move(g, 'b', { from: 'd5', to: 'e4' }, 2000);
  runPremoves(g, 2000);
  assert.equal(g.chess.get('e4').type, 'n');
  assert.deepEqual(g.chess.history(), ['dxe4', 'Nxe4']);
  assert.equal(g.premoves.w.length, 1);
});

test('friendly-square premove cancels if the opponent does not capture', () => {
  const g = started();
  g.chess = new Chess('r3k3/8/8/3p4/4P3/8/5N2/4K3 b - - 0 1');
  queue(g, 'w', 'f2', 'e4');
  queue(g, 'w', 'e4', 'c5');
  move(g, 'b', { from: 'e8', to: 'f8' }, 2000);
  runPremoves(g, 2000);
  assert.equal(g.chess.get('e4').type, 'p');
  assert.equal(g.chess.get('f2').type, 'n');
  assert.equal(g.premoves.w.length, 0);
  assert.equal(g.remaining.w, 300000);
});

test('pawn premove can anticipate a capture on an empty square', () => {
  const g = started();
  g.chess = new Chess('4k3/8/3r4/8/4P3/8/8/4K3 b - - 0 1');
  queue(g, 'w', 'e4', 'd5');
  move(g, 'b', { from: 'd6', to: 'd5' }, 2000);
  runPremoves(g, 2000);
  assert.equal(g.chess.get('d5').type, 'p');
  assert.equal(g.chess.get('d5').color, 'w');
});

test('en passant premove executes and its preview removes the captured pawn', () => {
  const g = started();
  g.chess = new Chess('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
  queue(g, 'w', 'e5', 'd6');
  move(g, 'b', { from: 'd7', to: 'd5' }, 2000);
  const preview = projectedBoard(g.chess.fen(), g.premoves.w);
  assert.equal(preview.has('d5'), false);
  assert.equal(preview.get('d6').type, 'p');
  runPremoves(g, 2000);
  assert.equal(g.chess.get('d5'), undefined);
  assert.equal(g.chess.get('d6').color, 'w');
});

test('castling and capture promotion premoves execute with correct piece placement', () => {
  const g = started();
  g.chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  queue(g, 'b', 'e8', 'c8');
  move(g, 'w', { from: 'e1', to: 'g1' }, 2000);
  runPremoves(g, 2000);
  assert.equal(g.chess.get('c8').type, 'k');
  assert.equal(g.chess.get('d8').type, 'r');
  const h = started();
  h.chess = new Chess('4k3/8/8/8/8/8/1p6/R3K3 w - - 0 1');
  queue(h, 'b', 'b2', 'a1', 'n');
  move(h, 'w', { from: 'e1', to: 'f1' }, 2000);
  runPremoves(h, 2000);
  assert.equal(h.chess.get('a1').type, 'n');
  assert.equal(h.chess.get('a1').color, 'b');
});
