import test from 'node:test';
import assert from 'node:assert/strict';
import { readPgn } from '../src/analysis.js';
import { buildReview, classifyMove, reviewPositions, whiteChance, reviewMovePrefix, reviewSymbol, reviewExplanation, REVIEW_DEPTH, REVIEW_TIME_MS } from '../src/gameReview.js';

test('review positions retain the full move sequence and terminal outcomes', () => {
  const game = readPgn('1. f3 e5 2. g4 Qh4# 0-1');
  const positions = reviewPositions(game);
  assert.equal(positions.length, 5);
  assert.match(positions[2].command, /moves f2f3 e7e5$/);
  assert.deepEqual(positions[4].terminal.type, 'mate');
  assert.equal(positions[4].terminal.value, -1);
  assert.equal(whiteChance(positions[4].terminal), 0);
});

test('labels compare the played move from the mover perspective', () => {
  const equal = { type: 'cp', value: 0, moves: [{ san: 'e4' }] };
  const advantage = { type: 'cp', value: 250, moves: [{ san: 'Nf3' }] };
  assert.equal(classifyMove(equal, advantage, 'e4', 'w').label, 'Best');
  assert.equal(classifyMove(equal, advantage, 'd4', 'b').label, 'Blunder');
  assert.equal(classifyMove(advantage, equal, 'd4', 'w').label, 'Blunder');
  assert.equal(classifyMove(equal, equal, 'd4', 'w').label, 'Excellent');
});

test('review handles games beginning with Black to move', () => {
  const game = readPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/p7/4K3 b - - 0 22"]\n\n22... a1=N *');
  const scores = [
    { type: 'cp', value: 0, moves: [{ san: 'a1=N' }] },
    { type: 'cp', value: -50, moves: [{ san: 'Kd2' }] },
  ];
  const review = buildReview(game, scores);
  assert.equal(review.moves[0].mover, 'Black');
  assert.equal(review.moves[0].label, 'Best');
  assert.equal(review.counts.Black.Best, 1);
  assert.equal(review.counts.White.Best, 0);
});

test('classification counts are separate for White and Black', () => {
  const game = readPgn('1. e4 e5 *');
  const scores = [
    { type: 'cp', value: 0, moves: [{ san: 'e4' }] },
    { type: 'cp', value: 15, moves: [{ san: 'e5' }] },
    { type: 'cp', value: 0, moves: [{ san: 'Nf3' }] },
  ];
  const review = buildReview(game, scores);
  assert.equal(review.counts.White.Best, 1);
  assert.equal(review.counts.Black.Best, 1);
  assert.equal(Object.values(review.counts.White).reduce((sum, count) => sum + count, 0), 1);
  assert.equal(Object.values(review.counts.Black).reduce((sum, count) => sum + count, 0), 1);
  assert.equal(classifyMove(scores[0], { type: 'cp', value: -50 }, 'd4', 'w').label, 'Inaccuracy');
});

test('review uses depth 16 and gives numbered feedback with a better move', () => {
  assert.equal(REVIEW_DEPTH, 16);
  assert.equal(REVIEW_TIME_MS, 2500);
  const game = readPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/p7/4K3 b - - 0 22"]\n\n22... a1=N *');
  assert.equal(reviewMovePrefix(game.initialFen, 0), '22…');
  assert.equal(reviewSymbol('Mistake'), '?');
  assert.equal(reviewSymbol('Blunder'), '??');
  const feedback = reviewExplanation(game, 0, { label: 'Mistake', best: 'a1=Q', beforeChance: .7, afterChance: .45, loss: .25 });
  assert.equal(feedback, '22…a1=N lost the advantage; 22…a1=Q was stronger.');
  const weaker = reviewExplanation(game, 0, { label: 'Inaccuracy', best: 'a1=Q', beforeChance: .5, afterChance: .43, loss: .07 });
  assert.equal(weaker, '22…a1=N weakened the position; 22…a1=Q was stronger.');
  assert.equal(reviewSymbol('Inaccuracy'), '?!');
});
