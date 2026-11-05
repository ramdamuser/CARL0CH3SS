import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('bundled Stockfish WASM loads and returns a legal best move through UCI', { timeout: 20000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'carl-stockfish-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'package.json'), '{"type":"commonjs"}');
  for (const suffix of ['js', 'wasm']) await copyFile(new URL(`../public/stockfish/stockfish-19-lite-single.${suffix}`, import.meta.url), join(directory, `stockfish-19-lite-single.${suffix}`));
  const child = spawn(process.execPath, [join(directory, 'stockfish-19-lite-single.js')]);
  t.after(() => child.kill());
  let output = '', errors = '';
  child.stderr.on('data', data => { errors += data; });
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => { if (code !== null) reject(new Error(`Engine exited ${code}: ${errors}`)); });
    child.stdout.on('data', data => {
      output += data;
      if (output.includes('uciok') && !output.includes('STARTED_TEST')) {
        output += 'STARTED_TEST';
        child.stdin.write('setoption name UCI_LimitStrength value true\nsetoption name UCI_Elo value 1320\nisready\nposition startpos moves e2e4\ngo depth 6\n');
      }
      if (/bestmove [a-h][1-8][a-h][1-8]/.test(output)) resolve();
    });
    child.stdin.write('uci\n');
  });
  assert.match(output, /readyok/);
  assert.match(output, /option name UCI_LimitStrength type check/);
  assert.match(output, /option name UCI_Elo type spin default 1320 min 1320 max 3190/);
  assert.match(output, /info depth 6/);
  const { Chess } = await import('chess.js');
  const chess = new Chess(); chess.move('e4');
  const best = output.match(/bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
  assert.ok(chess.move({ from: best[1], to: best[2], promotion: best[3] }));
});
