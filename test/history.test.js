import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { buildTimeline } from '../src/history.js';

test('history includes the starting board and each move without mutating the live game', () => {
  const live = new Chess();
  for (const san of ['e4', 'e5', 'Nf3', 'Nc6']) live.move(san);
  const fen = live.fen(), history = live.history();
  const timeline = buildTimeline(history);
  assert.equal(timeline.length, 5);
  assert.equal(timeline[0].fen, new Chess().fen());
  assert.equal(timeline[0].lastMove, null);
  assert.equal(new Chess(timeline[1].fen).get('e4').type, 'p');
  assert.equal(new Chess(timeline[1].fen).get('e7').type, 'p');
  assert.equal(timeline[1].turn, 'b');
  assert.equal(timeline[3].lastMove.san, 'Nf3');
  assert.equal(timeline[4].fen, fen);
  assert.equal(live.fen(), fen);
  assert.deepEqual(live.history(), history);
  live.move('Bb5');
  assert.equal(buildTimeline(live.history())[2].fen, timeline[2].fen);
});

test('history reconstructs castling and en passant at their exact move', () => {
  const castle = buildTimeline(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']);
  assert.equal(new Chess(castle[6].fen).get('e1').type, 'k');
  assert.equal(new Chess(castle[7].fen).get('g1').type, 'k');
  assert.equal(new Chess(castle[7].fen).get('f1').type, 'r');
  const ep = buildTimeline(['e4', 'a6', 'e5', 'd5', 'exd6']);
  assert.equal(new Chess(ep[4].fen).get('d5').color, 'b');
  assert.equal(new Chess(ep[5].fen).get('d5'), undefined);
  assert.equal(new Chess(ep[5].fen).get('d6').color, 'w');
});

test('history reconstructs promotion and historical check independently of final checkmate', () => {
  const promoted = buildTimeline(['a8=N'], '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(new Chess(promoted[0].fen).get('a7').type, 'p');
  assert.equal(new Chess(promoted[1].fen).get('a8').type, 'n');
  const mate = buildTimeline(['f3', 'e5', 'g4', 'Qh4#']);
  assert.equal(mate[3].check, false);
  assert.equal(mate[4].check, true);
  assert.equal(mate[4].lastMove.to, 'h4');
  assert.equal(new Chess(mate[4].fen).isCheckmate(), true);
});
