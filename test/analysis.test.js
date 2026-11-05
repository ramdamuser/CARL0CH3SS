import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { readPgn, replay, gameToPgn, variationPgn, branchMove, analysisMoveSound, enginePosition, parseEngineInfo } from '../src/analysis.js';

test('analysis move sounds follow the played move without sounding for the starting position', () => {
  const start = new Chess().fen();
  assert.equal(analysisMoveSound(start, [], 0), null);
  assert.equal(analysisMoveSound(start, ['e4'], 1), 'move');
  assert.equal(analysisMoveSound(start, ['e4', 'd5', 'exd5'], 3), 'capture');
  assert.equal(analysisMoveSound('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['Ra8+'], 1), 'check');
  assert.equal(analysisMoveSound(start, ['f3', 'e5', 'g4', 'Qh4#'], 4), 'end');
});
import { resultTag } from '../shared/pgn.js';
import { createGame, snapshot } from '../server/game.js';

test('PGN round-trip retains names, moves, result, and escaped guest names', () => {
  const pgn = gameToPgn(['e4', 'e5', 'Nf3'], { White: 'Tony "The Knight"', Black: 'Friend', Result: '1-0' });
  const game = readPgn(pgn);
  assert.deepEqual(game.moves, ['e4','e5','Nf3']);
  assert.equal(game.headers.White, 'Tony "The Knight"');
  assert.equal(game.headers.Result, '1-0');
  assert.equal(game.pgn, pgn);
  assert.equal(resultTag('Draw by agreement'), '1/2-1/2');
  assert.equal(resultTag('Black wins on time'), '0-1');
});

test('PGN custom setup preserves black-to-move and supports promotion', () => {
  const game = readPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/p7/4K3 b - - 0 22"]\n\n22... a1=N *');
  assert.equal(game.initialFen, '4k3/8/8/8/8/8/p7/4K3 b - - 0 22');
  assert.equal(replay(game.initialFen, game.moves).get('a1').type, 'n');
  assert.deepEqual(readPgn(variationPgn(game, game.moves)).moves, ['a1=N']);
});

test('alternative lines preserve the original, truncate only the branch, and export legally', () => {
  const game = readPgn('1. e4 e5 2. Nf3 Nc6 *');
  const same = branchMove(game, game.moves, 1, { from: 'e7', to: 'e5' });
  assert.equal(same.line, game.moves); assert.equal(same.ply, 2);
  const alternative = branchMove(game, game.moves, 1, { from: 'c7', to: 'c5' });
  assert.deepEqual(alternative.line, ['e4', 'c5']);
  assert.deepEqual(game.moves, ['e4','e5','Nf3','Nc6']);
  assert.deepEqual(readPgn(variationPgn(game, alternative.line)).moves, ['e4', 'c5']);
  assert.throws(() => branchMove(game, game.moves, 1, { from: 'e7', to: 'e4' }));
});

test('PGN validation rejects invalid and oversized input without accepting illegal moves', () => {
  for (const text of ['', 'invalid text', '1. e4 e4 *', 'x'.repeat(100001)]) assert.throws(() => readPgn(text));
  assert.deepEqual(readPgn('*').moves, []);
});

test('engine position command carries move history and converts SAN to UCI', () => {
  assert.equal(enginePosition(new Chess().fen(), ['e4','e5','Nf3']), `position fen ${new Chess().fen()} moves e2e4 e7e5 g1f3`);
});

test('engine scores normalize to White, parse mate, and discard malformed or bounded output', () => {
  const black = new Chess(); black.move('e4');
  const info = parseEngineInfo('info depth 12 score cp 35 nodes 123 pv e7e5 g1f3', black.fen());
  assert.equal(info.value, -35); assert.equal(info.depth, 12);
  assert.deepEqual(info.moves.map(m => m.san), ['e5', 'Nf3']);
  assert.equal(parseEngineInfo('info depth 9 score mate -3 pv e7e5', black.fen()).value, 3);
  assert.equal(parseEngineInfo('info depth 9 score cp 12 lowerbound pv e7e5', black.fen()), null);
  assert.equal(parseEngineInfo('info depth 9 score cp 12 pv e2e5', black.fen()), null);
  assert.equal(parseEngineInfo('readyok', black.fen()), null);
});

test('completed online games export PGN with correct result and time control', () => {
  const game = createGame(3, 2); game.players = { w: { name: 'Alice' }, b: { name: 'Bob' } };
  game.chess.move('e4');
  assert.equal(snapshot(game, 'w').pgn, null);
  game.result = 'Black wins by resignation';
  const parsed = readPgn(snapshot(game, 'w').pgn);
  assert.equal(parsed.headers.Result, '0-1'); assert.equal(parsed.headers.TimeControl, '180+2');
  assert.equal(parsed.headers.White, 'Alice'); assert.deepEqual(parsed.moves, ['e4']);
});
