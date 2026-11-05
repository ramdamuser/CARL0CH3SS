import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollHistoryItem } from '../src/scrollHistory.js';

test('move history scrolls inside its panel without scrolling the page', () => {
  const container = { scrollTop: 40, getBoundingClientRect: () => ({ top: 100, bottom: 200 }) };
  const below = { getBoundingClientRect: () => ({ top: 210, bottom: 230 }) };
  scrollHistoryItem(container, below);
  assert.equal(container.scrollTop, 70);
  const above = { getBoundingClientRect: () => ({ top: 80, bottom: 95 }) };
  scrollHistoryItem(container, above);
  assert.equal(container.scrollTop, 50);
  scrollHistoryItem(container, { getBoundingClientRect: () => ({ top: 110, bottom: 150 }) });
  assert.equal(container.scrollTop, 50);
});
