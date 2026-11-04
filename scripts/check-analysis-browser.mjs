// Optional end-to-end smoke check using an installed Chrome and its DevTools API.
// Run after npm run build. No browser automation packages are required.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createChessServer } from '../server/index.js';

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = await mkdtemp(join(tmpdir(), 'carl-analysis-browser-'));
const server = createChessServer();
let chrome, ws;
const timeout = setTimeout(() => { console.error('Browser check timed out'); chrome?.kill(); server.stop(); process.exitCode = 1; }, 90000);
try {
  server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
  const origin = `http://127.0.0.1:${server.http.address().port}`;
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = ''; chrome.on('error', reject); chrome.on('exit', code => reject(new Error(`Chrome exited ${code}: ${stderr.slice(-1000)}`)));
    chrome.stderr.on('data', data => { stderr += data; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
  });
  ws = new WebSocket(endpoint); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0; const pending = new Map(), errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); }
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await call('Target.createTarget', { url: origin });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Runtime.enable', {}, sessionId); await call('Page.enable', {}, sessionId);
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  const waitFor = async expression => {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 100)); }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const clickText = async text => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw Error('Button missing'); b.click(); })()`);
  await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Analysis')");
  await clickText('Analysis');
  await waitFor("document.querySelector('.engine-score span')?.textContent === 'Analysis complete'");
  assert.ok(await evaluate("document.querySelector('.engine-line')?.textContent.length > 0"));
  assert.ok(await evaluate("!!document.querySelector('.best-move-arrow')"));
  await evaluate("document.querySelector('.engine-panel .secondary').click()");
  await waitFor("document.querySelector('.analysis-heading p')?.textContent.includes('Exploring a variation')");
  await clickText('Return to game line');
  await waitFor("document.querySelectorAll('.analysis-moves button').length === 0");
  const pgn = '[White "Ada"]\n[Black "Grace"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *';
  await evaluate(`(() => {const field = document.querySelector('#analysis-pgn'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(pgn)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await clickText('Load PGN');
  await waitFor("document.querySelectorAll('.analysis-moves button').length === 4");
  assert.ok(await evaluate("document.querySelector('.analysis-heading p').textContent.includes('Ada vs Grace')"));
  await evaluate("document.querySelector('.analysis-moves button').click()");
  await waitFor("!!document.querySelector('[aria-label=\"e7 Black pawn\"]')");
  await evaluate("document.querySelector('[aria-label=\"c7 Black pawn\"]').click()");
  await evaluate("document.querySelector('[aria-label=\"c5\"]').click()");
  await waitFor("document.querySelector('.analysis-moves')?.textContent.includes('c5')");
  assert.equal(await evaluate("document.querySelectorAll('.analysis-moves button').length"), 2);
  await clickText('Return to game line');
  await waitFor("document.querySelectorAll('.analysis-moves button').length === 4");
  assert.ok(await evaluate("document.querySelector('.analysis-moves').textContent.includes('Nc6')"));
  await evaluate("document.querySelector('.engine-toggle input').click()");
  await waitFor("document.querySelector('.engine-score span')?.textContent === 'Engine off'");
  assert.equal(await evaluate("!!document.querySelector('.best-move-arrow')"), false);
  await evaluate("document.querySelector('[aria-label=\"Last position\"]').click()");
  await evaluate("document.querySelector('.engine-toggle input').click()");
  await waitFor("document.querySelector('.engine-score span')?.textContent === 'Analysis complete'");
  assert.ok(await evaluate("document.querySelector('.engine-line').textContent.length > 0"));
  const { data } = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile('/tmp/carl-analysis-desktop.png', Buffer.from(data, 'base64'));
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  assert.equal(await evaluate('document.documentElement.scrollWidth > window.innerWidth'), false);
  const mobile = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile('/tmp/carl-analysis-mobile.png', Buffer.from(mobile.data, 'base64'));
  await clickText('Back to play');
  await waitFor("!document.querySelector('.analysis')");
  await waitFor("document.querySelector('.connection')?.textContent === 'Ready to connect'");
  await clickText('Create a private room');
  await waitFor("!!document.querySelector('.room-card')");
  assert.equal(await evaluate("[...document.querySelectorAll('nav button')].find(b=>b.textContent==='Analysis').disabled"), true);
  assert.deepEqual(errors, []);
  console.log('PASS: real browser WASM search, best-move arrow, variation, PGN import, move navigation, engine toggle, mobile layout, and multiplayer analysis lock.');
  console.log('Screenshots: /tmp/carl-analysis-desktop.png and /tmp/carl-analysis-mobile.png');
} finally {
  clearTimeout(timeout); ws?.close();
  if (chrome && chrome.exitCode === null) { chrome.kill(); await Promise.race([once(chrome, 'exit'), new Promise(r => setTimeout(r, 2000))]); }
  server.stop();
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
