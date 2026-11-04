import { useEffect, useState } from 'react';
import { parseEngineInfo } from './analysis';

export default function useStockfish({ enabled, fen, position, depth = 16, retry = 0 }) {
  const [result, setResult] = useState({ status: 'off', info: null });
  useEffect(() => {
    if (!enabled) { setResult({ status: 'off', info: null }); return; }
    let worker, disposed = false, watchdog;
    setResult({ status: 'loading', info: null, fen });
    const fail = () => {
      if (!disposed) setResult({ status: 'error', info: null, fen, error: 'Engine could not load or search. Retry, or continue exploring with the engine off.' });
      worker?.terminate(); clearTimeout(watchdog);
    };
    // A new isolated worker per position guarantees late UCI output can never
    // overwrite another position. Debounce quick navigation; cached WASM is reused.
    const debounce = setTimeout(() => {
      try {
        worker = new Worker('/stockfish/stockfish-19-lite-single.js');
        watchdog = setTimeout(fail, 30000);
        worker.onerror = fail;
        worker.onmessageerror = fail;
        worker.onmessage = event => {
          if (disposed || typeof event.data !== 'string') return;
          for (const line of event.data.split('\n')) {
            if (line.trim() === 'uciok') {
              worker.postMessage('setoption name Hash value 16');
              worker.postMessage('setoption name MultiPV value 1');
              worker.postMessage('isready');
            } else if (line.trim() === 'readyok') {
              setResult({ status: 'searching', info: null, fen });
              worker.postMessage(position);
              worker.postMessage(`go depth ${depth} movetime 2500`);
            } else if (line.startsWith('bestmove ')) {
              clearTimeout(watchdog);
              setResult(previous => ({ ...previous, status: 'ready' }));
              worker.terminate();
            } else {
              const info = parseEngineInfo(line, fen);
              if (info) setResult({ status: 'searching', info, fen });
            }
          }
        };
        worker.postMessage('uci');
      } catch { fail(); }
    }, 180);
    return () => { disposed = true; clearTimeout(debounce); clearTimeout(watchdog); worker?.terminate(); };
  }, [enabled, fen, position, depth, retry]);
  // Never render the preceding position's evaluation during effect cleanup.
  return !enabled ? { status: 'off', info: null } : result.fen === fen ? result : { status: 'loading', info: null };
}
