import AnalysisBoard from './AnalysisBoard';
import Piece from './ChessPiece';
import { gameToPgn, downloadPgn } from './analysis';
import { resultTag } from '../shared/pgn';
import { buildTimeline } from './history';
import { projectedBoard, canPlan } from '../shared/premoves';
import { formatClock } from './clock';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import TimeControl from './TimeControl';
import { validateTimeControl, timeControlLabel, timeControlCategory } from '../shared/time-controls';
import { createSoundPlayer, soundForTransition } from './sounds';
import { scrollHistoryItem } from './scrollHistory';
import useChessBot, { BOT_LEVELS } from './useChessBot';
import { enginePosition } from './analysis';
import { io } from 'socket.io-client';
import { ArrowUpRight, ArrowRight, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Copy, Check, Clock3, Flag, Handshake, RotateCw, Users, Zap, X, Sun, Moon, Volume2, VolumeX, Globe2, BookOpen, Swords, Link2 } from 'lucide-react';

const socket = io({ autoConnect: false });
const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const colorName = c => c === 'w' ? 'White' : 'Black';

function readSession() { try { return JSON.parse(sessionStorage.getItem('carl-room')); } catch { return null; } }
function localState(chess) {
  let result = null;
  if (chess.isCheckmate()) result = `${colorName(chess.turn() === 'w' ? 'b' : 'w')} wins by checkmate`;
  else if (chess.isStalemate()) result = 'Draw by stalemate';
  else if (chess.isThreefoldRepetition()) result = 'Draw by threefold repetition';
  else if (chess.isDrawByFiftyMoves()) result = 'Draw by the 50-move rule';
  else if (chess.isInsufficientMaterial()) result = 'Draw by insufficient material';
  return { fen: chess.fen(), history: chess.history(), lastMove: chess.history({verbose: true}).at(-1), turn: chess.turn(), check: chess.isCheck(), result };
}
export default function App() {
  const practice = useRef(new Chess());
  const sound = useRef(null);
  const previousSoundState = useRef(null);
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem('carl-muted') === 'true'; } catch { return false; } });
  useEffect(() => {
    const player = createSoundPlayer(); sound.current = player;
    const unlock = () => { void player.unlock(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); player.dispose(); sound.current = null; };
  }, []);
  useEffect(() => {
    sound.current?.setMuted(muted);
    try { localStorage.setItem('carl-muted', String(muted)); } catch { /* storage unavailable */ }
  }, [muted]);
  const [local, setLocal] = useState(() => localState(practice.current));
  const [botMode, setBotMode] = useState(false), [botSide, setBotSide] = useState('w'), [humanColor, setHumanColor] = useState('w');
  const [botLevel, setBotLevel] = useState(0), [botGameId, setBotGameId] = useState(0), [botRetry, setBotRetry] = useState(0);
  const botGameIdRef = useRef(0);
  const [game, setGame] = useState(null), [seat, setSeat] = useState(null);
  const [connected, setConnected] = useState(false), [queued, setQueued] = useState(false), [busy, setBusy] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('carl-name') || 'Guest');
  const [timeControl, setTimeControl] = useState({ minutes: 5, increment: 0 });
  const [color, setColor] = useState('random');
  let validTimeControl = true;
  try { validateTimeControl(timeControl); } catch { validTimeControl = false; }
  const [room, setRoom] = useState(() => new URLSearchParams(location.search).get('room') || '');
  const [tab, setTab] = useState('play'), [modal, setModal] = useState(() => new URLSearchParams(location.search).has('room') ? 'join' : null), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null), [promotion, setPromotion] = useState(null), [flipped, setFlipped] = useState(false);
  const [dark, setDark] = useState(false), [copied, setCopied] = useState(false);
  const moveScroll = useRef(null);
  const activeHistoryMove = useRef(null);
  const [reviewPly, setReviewPly] = useState(null);
  const [draggingSquare, setDraggingSquare] = useState(null);
  const dragFrame = useRef(null);
  function endDrag() {
    cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    setDraggingSquare(null);
  }
  useEffect(() => {
    window.addEventListener('dragend', endDrag);
    window.addEventListener('drop', endDrag);
    return () => {
      cancelAnimationFrame(dragFrame.current);
      window.removeEventListener('dragend', endDrag);
      window.removeEventListener('drop', endDrag);
    };
  }, []);
  useEffect(() => { endDrag(); }, [game?.fen, local.fen, tab]);
  const state = game || local;
  const [analysisPgn, setAnalysisPgn] = useState(() => gameToPgn([]));
  const analysisAllowed = (!game || !!game.result) && (!botMode || !!local.result) && !queued && !busy;
  function currentPgn() {
    return game?.pgn || gameToPgn(state.history, { Event: botMode ? 'CARL0CH3SS bot game' : 'CARL0CH3SS practice', White: botMode && humanColor === 'b' ? 'Stockfish' : 'White', Black: botMode && humanColor === 'w' ? 'Stockfish' : 'Black', Result: resultTag(state.result) });
  }
  function openAnalysis() {
    if (!analysisAllowed) return;
    setAnalysisPgn(currentPgn()); setTab('analysis'); setSelected(null); setPromotion(null); endDrag();
  }
  const historyKey = state.history.join(' ');
  const timeline = useMemo(() => buildTimeline(historyKey ? historyKey.split(' ') : []), [historyKey]);
  const viewedPly = reviewPly === null ? state.history.length : Math.min(reviewPly, state.history.length);
  const reviewing = reviewPly !== null && viewedPly < state.history.length;
  const displayed = reviewing ? timeline[viewedPly] : state;
  function viewPosition(ply) {
    setReviewPly(ply >= state.history.length ? null : Math.max(0, ply));
    setSelected(null); setPromotion(null); endDrag();
  }
  useEffect(() => { setReviewPly(null); }, [game?.id]);
  const [clockNow, setClockNow] = useState(() => performance.now());
  useEffect(() => {
    if (!game?.active) return;
    const timer = setInterval(() => setClockNow(performance.now()), 50);
    return () => clearInterval(timer);
  }, [game?.active]);
  useEffect(() => {
    const event = soundForTransition(previousSoundState.current, state);
    previousSoundState.current = state;
    if (event) sound.current?.play(event);
  }, [state]);
  const chess = useMemo(() => new Chess(state.fen), [state.fen]);
  const botTurn = !game && botMode && !local.result && local.turn !== humanColor;
  const botPosition = useMemo(() => enginePosition(new Chess().fen(), local.history), [local.history]);
  const botStatus = useChessBot({
    enabled: botTurn, fen: local.fen, position: botPosition, elo: BOT_LEVELS[botLevel].elo,
    gameId: botGameId, retry: botRetry,
    onMove: (botMove, fen, gameId) => {
      if (botGameIdRef.current !== gameId || practice.current.fen() !== fen) return true;
      try { practice.current.move(botMove); setLocal(localState(practice.current)); return true; }
      catch { setNotice('The bot move could not be played. Try again.'); return false; }
    },
  });
  const canMove = !reviewing && !state.result && (!game ? !botMode || state.turn === humanColor : connected && game.active && seat?.color === state.turn);
  const canPremove = !reviewing && !!game && connected && game.active && !game.result && seat?.color !== state.turn;
  const premoves = game?.premoves || [];
  const board = useMemo(() => projectedBoard(displayed.fen, reviewing ? [] : game?.premoves || []), [displayed.fen, reviewing, game?.premoves]);
  const ownColor = game ? seat?.color : botMode ? humanColor : state.turn;
  const legal = useMemo(() => {
    const from = draggingSquare || selected;
    if (reviewing || !canMove || !from) return [];
    return chess.moves({ square: from, verbose: true });
  }, [chess, selected, draggingSquare, canMove, reviewing]);
  function send(event, data = {}) {
    if (!socket.connected) { setNotice('Connecting to the game server. Please try again shortly.'); return; }
    setBusy(true);
    socket.timeout(5000).emit(event, data, (error, response) => { setBusy(false); if (error || response?.error) setNotice(response?.error || 'The server did not respond. Please try again.'); });
  }
  useEffect(() => {
    const onConnect = () => { previousSoundState.current = null; setConnected(true); const saved = readSession(); if (saved) socket.emit('resume', saved, response => { if (response?.error) { sessionStorage.removeItem('carl-room'); setGame(null); setSeat(null); setNotice(response.error); } }); };
    const onSeat = data => { previousSoundState.current = null; sessionStorage.setItem('carl-room', JSON.stringify(data)); setSeat(data); botGameIdRef.current += 1; setBotMode(false); setQueued(false); setFlipped(data.color === 'b'); setSelected(null); setModal(null); };
    const onState = data => setGame({ ...data, receivedAt: performance.now() });
    const onDisconnect = () => { setConnected(false); setQueued(false); };
    socket.on('connect', onConnect).on('disconnect', onDisconnect).on('seated', onSeat).on('state', onState).on('queued', () => setQueued(true)).on('notice', setNotice);
    socket.connect();
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, []);
  useEffect(() => { localStorage.setItem('carl-name', name); }, [name]);
  useEffect(() => { setSelected(null); setPromotion(null); }, [state.fen]);
  useEffect(() => {
    const container = moveScroll.current;
    if (!container) return;
    if (reviewing) scrollHistoryItem(container, activeHistoryMove.current);
    else container.scrollTop = container.scrollHeight;
  }, [viewedPly, reviewing, tab]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); } }, [notice]);
  function makeMove(from, to, promote) {
    if (reviewing) return;
    if (canPremove) send('premove', { from, to, promotion: promote, ply: state.history.length });
    else if (game) send('move', { from, to, promotion: promote });
    else { try { practice.current.move({ from, to, promotion: promote || 'q' }); setLocal(localState(practice.current)); } catch { setNotice('That move is not legal.'); } }
    setSelected(null); setPromotion(null);
  }
  function attempt(from, to) {
    if (busy) return;
    if (canPremove) {
      if (!canPlan(board, ownColor, from, to)) return;
      if (board.get(from)?.type === 'p' && ['1', '8'].includes(to[1])) setPromotion({ from, to, color: ownColor });
      else makeMove(from, to);
      return;
    }
    if (!canMove) return;
    const options = chess.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (!options.length) return;
    if (options.some(m => m.promotion)) setPromotion({ from, to, color: ownColor }); else makeMove(from, to);
  }
  function clickSquare(square) {
    if ((!canMove && !canPremove) || busy) return;
    if (selected && (canPremove ? canPlan(board, ownColor, selected, square) : legal.some(m => m.to === square))) attempt(selected, square);
    else setSelected(board.get(square)?.color === ownColor && selected !== square ? square : null);
  }
  function reset() { setReviewPly(null); practice.current = new Chess(); setLocal(localState(practice.current)); setSelected(null); }
  function startBot() { botGameIdRef.current += 1; setBotGameId(botGameIdRef.current); setHumanColor(botSide); setBotMode(true); setFlipped(botSide === 'b'); setNotice(''); reset(); }
  function stopBot() { botGameIdRef.current += 1; setBotMode(false); setFlipped(false); reset(); }
  function backToLobby() { send('leave'); sessionStorage.removeItem('carl-room'); setGame(null); setSeat(null); reset(); setModal(null); }
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${location.origin}/?room=${game.id}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setNotice(`Room code: ${game.id}. Copy it from the game panel.`); }
  }
  const ranks = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
  const files = flipped ? 'hgfedcba' : 'abcdefgh';
  const topColor = flipped ? 'w' : 'b', bottomColor = flipped ? 'b' : 'w';
  const liveStatus = state.result || (game && !game.active ? 'Waiting for your opponent' : `${colorName(state.turn)} to move${state.check ? ' · Check!' : ''}`);
  const status = reviewing ? `${viewedPly === 0 ? 'Starting position' : `Reviewing ply ${viewedPly}`} · ${colorName(displayed.turn)} to move${displayed.check ? ' · Check!' : ''}` : liveStatus;
  function player(c, bottom) {
    const p = game?.players[c];
    return <div className={`player-row ${bottom ? 'bottom-player' : ''}`}><div className={`avatar ${c}`}><Piece type="k" color={c}/></div><div className="player-info"><strong>{game ? p?.name || 'Waiting for a friend…' : botMode ? c === humanColor ? 'You' : 'Stockfish bot' : bottom ? 'You, at the board' : 'The other side'} {seat?.color === c && <span className="you">YOU</span>}</strong><span>{game ? p ? p.connected ? 'Connected' : 'Disconnected · clock continues' : 'Share your room to get started' : botMode ? c === humanColor ? 'Untimed · your move' : botStatus === 'error' ? 'Engine unavailable' : botStatus === 'loading' || botStatus === 'thinking' ? 'Thinking…' : 'Untimed bot' : 'Local practice · play both sides'}</span></div><div className={`clock ${game?.active && state.turn === c ? 'ticking' : ''}`}><Clock3 size={17}/>{game ? formatClock(game.remaining[c] - (game.active && state.turn === c && connected ? Math.max(0, clockNow - game.receivedAt) : 0)) : '∞'}</div></div>;
  }
  return <div className={dark ? 'app dark' : 'app'}>
    <header><a className="brand" href="/" aria-label="CARL0CH3SS home"><span className="brand-icon">♞</span>CARL<span className="brand-zero">0</span>CH3SS<span className="brand-dot">.</span></a><nav><button className={tab === 'play' ? 'nav-active' : ''} onClick={() => setTab('play')}>Play chess</button><button className={tab === 'analysis' ? 'nav-active' : ''} disabled={!analysisAllowed} title={analysisAllowed ? 'Analyze or import a game' : 'Analysis is available outside multiplayer games and matchmaking'} onClick={openAnalysis}>Analysis</button><button className={tab === 'guide' ? 'nav-active' : ''} onClick={() => setTab('guide')}>How to play <ArrowUpRight size={13}/></button></nav><div className="header-right"><span className="connection"><i className={connected ? '' : 'offline'}/>{connected ? 'Ready to connect' : 'Reconnecting'}</span><button className="icon-button" aria-label={muted ? "Unmute game sounds" : "Mute game sounds"} title={muted ? "Unmute game sounds" : "Mute game sounds"} aria-pressed={!muted} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button><button className="icon-button" aria-label="Toggle color theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button><span className="guest-avatar">{(name || 'G')[0].toUpperCase()}</span></div></header>
    <main><div className="intro"><div><div className="eyebrow"><span/> THE WORLD CAN WAIT A MOVE.</div><h1>Your next move<span>.</span></h1><p>A little focus. A friendly rivalry. A really good game.</p></div><div className="intro-note"><span>64 squares.</span><span>Endless possibilities.</span><svg viewBox="0 0 60 45"><path d="M5 5Q53 0 42 30M30 24l12 8 10-12"/></svg></div></div>
    {tab === 'analysis' && analysisAllowed ? <AnalysisBoard initialPgn={analysisPgn} onClose={() => setTab('play')} onMoveSound={event => sound.current?.play(event)}/> : tab === 'guide' ? <section className="guide panel"><div className="eyebrow">THE ESSENTIALS</div><h2>A game worth slowing down for.</h2><p>White moves first. Take turns moving one piece, and protect your king. Win by putting the opposing king in check with no legal escape.</p><div className="guide-grid">{Object.entries(names).map(([p,n]) => <article key={p}><Piece type={p} color="b"/><h3>{n}</h3><p>{{p:'Moves one square forward, or two from its starting square. Captures diagonally. Reaching the last rank earns a promotion.',n:'Moves in an L: two squares in one direction and one across. Can jump over pieces.',b:'Travels diagonally as far as the path is clear.',r:'Travels along ranks and files as far as the path is clear.',q:'Combines the rook and bishop: straight or diagonal movement.',k:'Moves one square in any direction. Cannot move into check. Castle by moving the king two squares when allowed.'}[p]}</p></article>)}</div><p>Special moves, en passant, and castling are validated automatically. Repetition and the 50-move rule end games automatically here. In local practice, you control both sides without a clock.</p><button className="primary" onClick={() => setTab('play')}>Back to the board <ArrowRight size={17}/></button></section> : <div className="game-layout"><section className="board-section">{player(topColor, false)}<div className="board-frame"><div className="board" role="group" aria-label={reviewing ? `Chessboard reviewing ply ${viewedPly}` : "Chessboard"} onContextMenu={e => { if (!reviewing && premoves.length) { e.preventDefault(); send('cancelPremoves'); setSelected(null); } }}>{ranks.flatMap((rank, ri) => [...files].map((file, fi) => {
      const square = file + rank, piece = board.get(square), target = legal.some(m => m.to === square);
      const isLast = displayed.lastMove && [displayed.lastMove.from, displayed.lastMove.to].includes(square);
      return <button key={square} aria-label={`${square}${piece ? ` ${colorName(piece.color)} ${names[piece.type]}` : ''}${target ? ', legal destination' : ''}`} aria-pressed={selected === square} className={`square ${draggingSquare === square ? 'dragging-source' : ''} ${(file.charCodeAt(0) - 97 + rank) % 2 === 0 ? 'dark-square' : 'light-square'} ${selected === square ? 'selected' : ''} ${isLast ? 'last-move' : ''} ${!reviewing && premoves.some(m => m.to === square || m.from === square) ? 'premove-square' : ''} ${piece?.type === 'k' && piece.color === displayed.turn && displayed.check ? 'in-check' : ''}`} onClick={() => clickSquare(square)} draggable={!!piece && !busy && (canMove || canPremove) && piece.color === ownColor} onDragStart={e => {
        const pieceElement = e.currentTarget.querySelector('.piece');
        if (!pieceElement) { e.preventDefault(); return; }
        const bounds = pieceElement.getBoundingClientRect();
        // Snapshot only the transparent piece span, not its square button.
        e.dataTransfer.setDragImage(pieceElement, bounds.width / 2, bounds.height / 2);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', square);
        setSelected(null);
        // Let the browser capture the piece before hiding its board copy.
        cancelAnimationFrame(dragFrame.current);
        dragFrame.current = requestAnimationFrame(() => {
          dragFrame.current = null;
          setDraggingSquare(square);
        });
      }} onDragEnd={endDrag} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); endDrag(); const from = e.dataTransfer.getData('text/plain'); if (/^[a-h][1-8]$/.test(from)) attempt(from, square); }}>
        {fi === 0 && <span className="rank-label">{rank}</span>}{ri === 7 && <span className="file-label">{file}</span>}{piece && <Piece type={piece.type} color={piece.color}/>} {target && <span className={piece ? 'capture-target' : 'move-target'}/>}</button>;
    }))}</div></div>{game?.active && !reviewing && <div className="premove-panel"><span>{premoves.length ? `${premoves.length} premove${premoves.length === 1 ? '' : 's'} queued · 0.1s each` : 'On your opponent’s turn, click or drag to queue premoves · 0.1s each'}</span>{premoves.length > 0 && <><button className="text-button" disabled={busy || !connected} onClick={() => { send('cancelPremoves'); setSelected(null); }}>Clear premoves <X size={13}/></button><ol>{premoves.map((m, i) => <li key={i}>{m.from} → {m.to}{m.promotion ? ` = ${m.promotion.toUpperCase()}` : ''}</li>)}</ol></>}</div>}{player(bottomColor, true)}<div className="board-toolbar"><span><span className="tiny-dot"/>{status}</span><div><button className="text-button" onClick={() => setFlipped(!flipped)}><RotateCw size={14}/> Flip board</button>{!game && <button className="icon-button" title={botMode ? "New bot game" : "Reset practice board"} aria-label={botMode ? "New bot game" : "Reset practice board"} onClick={botMode ? startBot : reset}><RotateCw size={15}/></button>}</div></div><div className="review-controls" role="group" aria-label="Move navigation"><button className="icon-button" aria-label="Go to starting position" title="Starting position" disabled={viewedPly === 0} onClick={() => viewPosition(0)}><ChevronsLeft size={18}/></button><button className="icon-button" aria-label="Previous move" title="Previous move" disabled={viewedPly === 0} onClick={() => viewPosition(viewedPly - 1)}><ChevronLeft size={20}/></button><span aria-live="polite">{viewedPly} / {state.history.length}</span><button className="icon-button" aria-label="Next move" title="Next move" disabled={!reviewing} onClick={() => viewPosition(viewedPly + 1)}><ChevronRight size={20}/></button><button className="text-button" aria-label="Return to latest position" disabled={!reviewing} onClick={() => viewPosition(state.history.length)}><ChevronsRight size={18}/>{game?.active ? 'Live board' : 'Latest'}</button></div>{reviewing && <div className="review-notice" role="status">Review mode · {game?.active ? `Clocks and queued premoves continue. Live: ${liveStatus}.` : 'Return to the latest position to play.'}</div>}<div className="board-footnote"><span>♞</span> Find your rhythm. Make your move.</div></section>
    <aside><section className="panel play-panel"><div className="panel-heading"><span className="eyebrow">{game ? 'AT THE BOARD' : 'LET’S PLAY'}</span><Swords size={20}/></div><h2>{game ? game.result ? 'A game well played.' : game.active ? 'Game on.' : 'Better with a friend.' : botMode ? local.result ? 'Game finished.' : 'Playing the bot.' : 'Good chess. Good company.'}</h2><p className="muted">{game ? `${timeControlLabel(game)} · ${timeControlCategory(game)} · You play ${colorName(seat?.color || 'w')}` : botMode ? `${BOT_LEVELS[botLevel].label} · You play ${colorName(humanColor)} · Untimed` : 'An old game. A fresh start. Your way to play.'}</p>
    {!game ? <><div className="bot-card"><strong>Play the computer</strong><div className="bot-settings"><label htmlFor="bot-level">Difficulty<select id="bot-level" value={botLevel} onChange={e => setBotLevel(Number(e.target.value))}>{BOT_LEVELS.map((level, index) => <option key={level.elo} value={index}>{level.label}</option>)}</select></label><label htmlFor="bot-side">Your pieces<select id="bot-side" value={botSide} disabled={botMode} onChange={e => setBotSide(e.target.value)}><option value="w">White</option><option value="b">Black</option></select></label></div>{botMode ? <><p className="bot-state" role="status">{local.result || (botStatus === 'error' ? 'The bot could not move. Try again.' : botTurn ? 'Bot is thinking…' : 'Your turn.')}</p>{botStatus === 'error' && <button className="secondary" onClick={() => setBotRetry(value => value + 1)}>Retry bot turn</button>}<button className="secondary" onClick={startBot}>New bot game</button><button className="text-button" onClick={stopBot}>Exit bot game</button></> : <button className="secondary" disabled={queued} onClick={startBot}>Play bot</button>}</div><fieldset className="online-controls" disabled={botMode} aria-label="Online multiplayer"><label className="field-label" htmlFor="name">Your name</label><input id="name" maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="Enter a guest name"/><TimeControl value={timeControl} onChange={setTimeControl} disabled={queued || busy}/><div className="color-select"><label htmlFor="color">Your pieces</label><select id="color" disabled={queued || busy} value={color} onChange={e => setColor(e.target.value)}><option value="random">Random color</option><option value="w">White</option><option value="b">Black</option></select></div><button disabled={!connected || busy || queued || !validTimeControl} className="primary quick" onClick={() => send('quick', {name, ...timeControl, color})}><Zap size={17}/>{queued ? `Finding opponent · ${timeControlLabel(timeControl)} · ${color === 'random' ? 'Random' : colorName(color)}…` : 'Find an opponent'}{!queued && <ArrowRight size={17}/>}</button>{queued && <button className="text-button cancel" onClick={() => { send('cancelQueue'); setQueued(false); }}>Cancel matchmaking</button>}<div className="divider"><span>or keep it friendly</span></div><button className="secondary" disabled={!connected || busy || queued || !validTimeControl} onClick={() => send('create', {name, ...timeControl, color})}><Users size={17}/>Create a private room<ArrowUpRight size={16}/></button><button className="join-link" disabled={queued} onClick={() => setModal('join')}>Have a room code? <strong>Join a friend <ChevronRight size={13}/></strong></button></fieldset></> : <><div className="room-card"><span>ROOM CODE</span><strong>{game.id}</strong><button className="secondary" onClick={copyLink}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Link copied' : 'Copy invite link'}</button></div>{!game.result && <div className="game-actions"><button className="secondary" disabled={!game.active || busy} onClick={() => send('draw')}><Handshake size={16}/>{game.drawOffer && game.drawOffer !== seat?.color ? 'Accept draw' : game.drawOffer ? 'Draw offered' : 'Offer draw'}</button><button className="secondary" onClick={() => setModal('resign')}><Flag size={16}/>{game.active ? 'Resign' : 'Close room'}</button></div>}{game.result && <><p className="result">{game.result}</p><button className="primary" onClick={openAnalysis}>Analyze game <BookOpen size={16}/></button><button className="secondary" onClick={() => downloadPgn(currentPgn(), 'carl0ch3ss-game.pgn')}>Export PGN</button><button className="primary" onClick={backToLobby}>Play another game <ArrowRight size={16}/></button></>}</>}
    <div className="privacy-note"><span/> No sign-up. Just chess.</div></section>
    <section className="panel moves-panel"><div className="moves-heading"><h3><BookOpen size={16}/> Move history</h3><span>{state.history.length} ply</span></div><div className="move-table"><div className="move-columns"><span>#</span><span>White</span><span>Black</span></div>{state.history.length ? <div className="move-scroll" ref={moveScroll}>{Array.from({length: Math.ceil(state.history.length / 2)}, (_, i) => <div className="move-line" key={i}><span>{i+1}.</span>{[0, 1].map(side => {
      const index = i * 2 + side, san = state.history[index], ply = index + 1;
      return san ? <button key={side} className={`history-move ${viewedPly === ply ? 'current' : ''}`} ref={viewedPly === ply ? activeHistoryMove : null} aria-current={viewedPly === ply ? 'step' : undefined} aria-label={`View move ${i + 1}, ${side === 0 ? 'White' : 'Black'}: ${san}`} onClick={() => viewPosition(ply)}>{san}</button> : <span key={side}>—</span>;
    })}</div>)}</div> : <div className="empty-history"><span>↳</span><p>Every great game starts<br/>with a single move.</p></div>}</div><div className="history-footer"><span className="tiny-dot"/>{reviewing ? `Reviewing ${viewedPly} of ${state.history.length} ply` : game ? 'Moves synced live · Click a move to review' : 'Click a move to review'}</div></section><div className="small-note"><Globe2 size={16}/><span>Different places. Same board.</span></div></aside></div>}
    </main><footer><span className="footer-brand">CARL0CH3SS.</span><span>Made for the love of the game.</span><span>Stay curious. Play fair. <span className="footer-pawn">♟</span></span></footer>
    {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16}/></button></div>}
    {(modal || promotion) && <div className="modal-backdrop"><section className="modal panel" role="dialog" aria-modal="true" aria-label={promotion ? 'Choose promotion piece' : modal === 'join' ? 'Join a friend' : 'Leave game'}><button className="modal-close icon-button" aria-label="Close dialog" onClick={() => { setModal(null); setPromotion(null); }}><X size={20}/></button>{promotion ? <><h2>A well-earned promotion.</h2><p>Choose your new piece.</p><div className="promotion-options">{['q','r','b','n'].map(p => <button key={p} aria-label={`Promote to ${names[p]}`} onClick={() => makeMove(promotion.from, promotion.to, p)}><Piece type={p} color={promotion.color || state.turn}/><span>{names[p]}</span></button>)}</div></> : modal === 'join' ? <form onSubmit={e => { e.preventDefault(); send('join', {id: room, name}); }}><Link2 size={25}/><h2>Meet at the board.</h2><p>Enter your friend’s room code to join their game.</p><label htmlFor="room" className="field-label">Room code</label><input autoFocus id="room" required value={room} maxLength={8} onChange={e => setRoom(e.target.value.toUpperCase())} placeholder="e.g. A1B2C3D4"/><button className="primary" disabled={busy || !connected}>Join game <ArrowRight size={17}/></button></form> : <><h2>{game?.active ? 'Resign this game?' : 'Close this room?'}</h2><p>{game?.active ? 'Your opponent will win by resignation.' : 'Your invite link will no longer accept players.'}</p><button className="primary" onClick={() => { send('resign'); setModal(null); }}>Confirm {game?.active ? 'resignation' : 'close'}</button></>}</section></div>}
  </div>;
}
