import { parseEngineInfo } from './analysis.js';
import { REVIEW_DEPTH, REVIEW_TIME_MS, reviewPositions } from './gameReview.js';

export function analyzeGame(game, { onProgress = () => {}, signal } = {}) {
  const positions = reviewPositions(game);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Review cancelled', 'AbortError')); return; }
    let worker, index = 0, latest = null, watchdog, finished = false;
    const scores = Array(positions.length);
    const cleanup = () => { clearTimeout(watchdog); worker?.terminate(); signal?.removeEventListener('abort', abort); };
    const fail = error => { if (finished) return; finished = true; cleanup(); reject(error); };
    const abort = () => fail(new DOMException('Review cancelled', 'AbortError'));
    const armWatchdog = () => { clearTimeout(watchdog); watchdog = setTimeout(() => fail(new Error('The engine stopped responding. Try the review again.')), 30000); };
    const next = () => {
      while (index < positions.length && positions[index].terminal) {
        scores[index] = positions[index].terminal;
        index++;
        onProgress(index, positions.length);
      }
      if (index === positions.length) { finished = true; cleanup(); resolve(scores); return; }
      latest = null;
      armWatchdog();
      worker.postMessage(positions[index].command);
      worker.postMessage(`go depth ${REVIEW_DEPTH} movetime ${REVIEW_TIME_MS}`);
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      worker = new Worker(`${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`);
      worker.onerror = () => fail(new Error('The engine could not load. Try the review again.'));
      worker.onmessageerror = worker.onerror;
      worker.onmessage = event => {
        if (finished || typeof event.data !== 'string') return;
        for (const raw of event.data.split('\n')) {
          if (finished) return;
          const line = raw.trim();
          if (line === 'uciok') {
            worker.postMessage('setoption name Hash value 16');
            worker.postMessage('setoption name MultiPV value 1');
            worker.postMessage('isready');
          } else if (line === 'readyok') next();
          else if (line.startsWith('info ')) {
            const info = parseEngineInfo(line, positions[index].fen);
            if (info && (!latest || info.depth >= latest.depth)) latest = info;
          } else if (line.startsWith('bestmove ')) {
            if (!latest) { fail(new Error('The engine did not return an evaluation. Try the review again.')); return; }
            scores[index] = latest;
            index++;
            onProgress(index, positions.length);
            next();
          }
        }
      };
      armWatchdog();
      worker.postMessage('uci');
    } catch { fail(new Error('The engine could not start. Try the review again.')); }
  });
}
