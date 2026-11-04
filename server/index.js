import express from 'express';
import { validateTimeControl, timeControlKey } from '../shared/time-controls.js';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createGame, move, tick, snapshot, other, colorName, queuePremove, runPremoves } from './game.js';

export function createChessServer({ chooseColor = () => randomInt(2) === 0 ? 'w' : 'b' } = {}) {
  const app = express();
  const http = createServer(app);
  const io = new Server(http, { cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }, maxHttpBufferSize: 4096 });
  const games = new Map();
  const queue = new Map();
  const broadcast = g => {
    if (g.result) g.premoves = { w: [], b: [] };
    for (const color of ['w', 'b']) {
      const id = g.players[color]?.socketId;
      if (id) io.to(id).emit('state', snapshot(g, color));
    }
  };
  const cleanQueue = socket => queue.delete(socket.id);
  function seat(socket, g, c, name) {
    const token = randomBytes(24).toString('hex');
    g.players[c] = { name: String(name || 'Guest').trim().slice(0, 24) || 'Guest', token, socketId: socket.id };
    socket.data.game = g.id; socket.data.color = c; socket.join(g.id);
    socket.emit('seated', { id: g.id, color: c, token });
    if (g.players.w && g.players.b) g.lastTick = Date.now();
    broadcast(g);
  }
  io.on('connection', socket => {
    let lastRequest = 0;
    const action = (event, handler) => socket.on(event, (data = {}, ack) => {
      try {
        if (!data || typeof data !== 'object') throw new Error('Invalid request.');
        if (Date.now() - lastRequest < 80) throw new Error('Please wait a moment.');
        lastRequest = Date.now();
        handler(data);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (error) { if (typeof ack === 'function') ack({ error: error.message }); else socket.emit('notice', error.message); }
    });
    const available = () => {
      const old = games.get(socket.data.game);
      if (old && !old.result) throw new Error('Finish or leave your current game first.');
      if (old) socket.leave(old.id);
      cleanQueue(socket);
    };
    const current = () => {
      const g = games.get(socket.data.game);
      if (!g || g.players[socket.data.color]?.socketId !== socket.id) throw new Error('Join a game first.');
      return g;
    };
    action('create', d => {
      const { minutes, increment } = validateTimeControl(d);
      available();
      const g = createGame(minutes, increment);
      games.set(g.id, g);
      seat(socket, g, ['w', 'b'].includes(d.color) ? d.color : chooseColor(), d.name);
    });
    action('join', d => {
      const g = games.get(String(d.id).trim().toUpperCase());
      if (!g) throw new Error('Room not found. Check the code or create a new game.');
      const c = !g.players.w ? 'w' : !g.players.b ? 'b' : null;
      if (!c || g.result) throw new Error('This room is full or has ended.');
      available(); seat(socket, g, c, d.name);
    });
    action('quick', d => {
      const control = validateTimeControl(d);
      const preference = d.color === undefined ? 'random' : d.color;
      if (!['random', 'w', 'b'].includes(preference)) throw new Error('Choose Random, White, or Black.');
      const key = timeControlKey(control);
      const opponentPreference = preference === 'random' ? 'random' : other(preference);
      available();
      // One entry per player preserves FIFO order even when several want the same color.
      const match = [...queue].find(([id, entry]) =>
        entry.key === key && entry.color === opponentPreference && io.sockets.sockets.has(id));
      if (match) {
        const [id, entry] = match;
        const waiting = io.sockets.sockets.get(id);
        queue.delete(id);
        const g = createGame(control.minutes, control.increment); games.set(g.id, g);
        const waitingColor = preference === 'random' ? chooseColor() : opponentPreference;
        seat(waiting, g, waitingColor, entry.name); seat(socket, g, other(waitingColor), d.name);
      } else {
        queue.set(socket.id, { key, color: preference, name: d.name });
        socket.emit('queued');
      }
    });
    action('cancelQueue', () => cleanQueue(socket));
    action('resume', d => {
      const g = games.get(d.id);
      const c = g && ['w', 'b'].find(c => g.players[c]?.token === d.token);
      if (!c) throw new Error('Your saved room has expired. Start a new game.');
      const previous = io.sockets.sockets.get(g.players[c].socketId);
      if (previous && previous.id !== socket.id) { previous.leave(g.id); previous.data.game = null; previous.emit('notice', 'Your game was opened in another tab.'); }
      g.players[c].socketId = socket.id;
      socket.data.game = g.id; socket.data.color = c; socket.join(g.id);
      socket.emit('seated', { id: g.id, color: c, token: d.token }); broadcast(g);
    });
    action('leave', () => { const g = current(); if (!g.result) throw new Error('Finish or resign your game first.'); socket.leave(g.id); g.players[socket.data.color].socketId = null; socket.data.game = null; socket.data.color = null; });
    action('move', d => {
      const g = current(), now = Date.now();
      try {
        move(g, socket.data.color, d, now);
        runPremoves(g, now, color => io.to(g.players[color]?.socketId).emit('notice', 'Premove is no longer legal. Your remaining premoves were cleared.'));
      } finally { broadcast(g); }
    });
    action('premove', d => { const g = current(); tick(g); try { queuePremove(g, socket.data.color, d); } finally { broadcast(g); } });
    action('cancelPremoves', () => { const g = current(); g.premoves[socket.data.color] = []; broadcast(g); });
    action('resign', () => { const g = current(); tick(g); if (!g.result) g.result = g.lastTick ? `${colorName(other(socket.data.color))} wins by resignation` : 'Room closed'; broadcast(g); });
    action('draw', () => { const g = current(); tick(g); if (!g.lastTick || g.result) throw new Error('Game is not active.'); if (g.drawOffer === other(socket.data.color)) g.result = 'Draw by agreement'; else g.drawOffer = socket.data.color; broadcast(g); });
    socket.on('disconnect', () => {
      cleanQueue(socket);
      const g = games.get(socket.data.game);
      if (g && g.players[socket.data.color]?.socketId === socket.id) { g.players[socket.data.color].socketId = null; g.premoves[socket.data.color] = []; g.updated = Date.now(); broadcast(g); }
    });
  });
  const timer = setInterval(() => {
    for (const [id, g] of games) {
      if (g.lastTick && !g.result) { tick(g); broadcast(g); }
      if ((!g.lastTick || g.result) && Date.now() - g.updated > 3600000 && Object.values(g.players).every(p => !p.socketId)) games.delete(id);
    }
  }, 250);
  timer.unref();
  io.on('close', () => clearInterval(timer));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
  app.get('*', (_req, res) => res.sendFile(fileURLToPath(new URL('../dist/index.html', import.meta.url))));
  return { http, io, games, stop: () => { clearInterval(timer); io.close(); } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { http } = createChessServer();
  http.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () => console.log('CARL0CH3SS server ready on port ' + (process.env.PORT || 3001)));
}
