import { useEffect, useRef, useState } from 'react';

export const BOT_LEVELS = [
  { label: 'Beginner', elo: 1320 },
  { label: 'Casual', elo: 1600 },
  { label: 'Club', elo: 1900 },
  { label: 'Expert', elo: 2300 },
];

export default function useChessBot({ enabled, fen, position, elo, gameId, retry, onMove }) {
  const [state, setState] = useState({ status: 'idle', fen: null });
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!enabled) { setState({ status: 'idle', fen: null }); return; }
    let worker, disposed = false, watchdog;
    const fail = () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(watchdog);
      worker?.terminate();
      setState({ status: 'error', fen });
    };
    setState({ status: 'loading', fen });
    try {
      worker = new Worker(`${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`);
      watchdog = setTimeout(fail, 30000);
      worker.onerror = fail;
      worker.onmessageerror = fail;
      worker.onmessage = event => {
        if (disposed || typeof event.data !== 'string') return;
        for (const raw of event.data.split('\n')) {
          const line = raw.trim();
          if (line === 'uciok') {
            worker.postMessage('setoption name Hash value 16');
            worker.postMessage('setoption name UCI_LimitStrength value true');
            worker.postMessage(`setoption name UCI_Elo value ${elo}`);
            worker.postMessage('isready');
          } else if (line === 'readyok') {
            setState({ status: 'thinking', fen });
            worker.postMessage(position);
            worker.postMessage('go movetime 1200');
          } else if (line.startsWith('bestmove ')) {
            const move = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
            if (!move) { fail(); return; }
            try {
              if (onMoveRef.current({ from: move[1], to: move[2], promotion: move[3] }, fen, gameId) === false) { fail(); return; }
            } catch { fail(); return; }
            disposed = true;
            clearTimeout(watchdog);
            worker.terminate();
            return;
          }
        }
      };
      worker.postMessage('uci');
    } catch { fail(); }
    return () => { disposed = true; clearTimeout(watchdog); worker?.terminate(); };
  }, [enabled, fen, position, elo, gameId, retry]);

  return enabled && state.fen === fen ? state.status : enabled ? 'loading' : 'idle';
}
