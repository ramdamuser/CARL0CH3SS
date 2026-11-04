import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { once } from 'node:events';
import { createChessServer } from '../server/index.js';
const pause = () => new Promise(r=>setTimeout(r,100));
const request = async (s,event,data={}) => { await pause(); return new Promise((resolve,reject)=>s.timeout(2000).emit(event,data,(err,res)=>err?reject(err):resolve(res))); };
test('private room, synchronized moves, seat security, reconnect, draw agreement', async t => {
  const server=createChessServer(); server.http.listen(0,'127.0.0.1'); await once(server.http,'listening');
  const url=`http://127.0.0.1:${server.http.address().port}`;
  const clients=[]; const connect=async()=>{const s=io(url,{transports:['websocket'],forceNew:true});clients.push(s);await once(s,'connect');return s;};
  t.after(()=>{clients.forEach(s=>s.disconnect());server.stop();});
  const a=await connect(), b=await connect(), outsider=await connect();
  const seatPromise=once(a,'seated'); assert.equal((await request(a,'create',{name:'Alice',minutes:5,color:'w'})).ok,true);
  const [seat]=await seatPromise;
  assert.equal((await request(b,'join',{id:seat.id,name:'Bob'})).ok,true);
  assert.match((await request(outsider,'join',{id:seat.id})).error,/full/);
  assert.match((await request(b,'move',{from:'e7',to:'e5'})).error,/turn/);
  const synced=once(b,'state'); assert.equal((await request(a,'move',{from:'e2',to:'e4'})).ok,true);
  await synced; assert.equal(server.games.get(seat.id).chess.history()[0],'e4');
  assert.match((await request(outsider,'resume',{id:seat.id,token:'wrong'})).error,/expired/);
  a.disconnect(); await pause(); const replacement=await connect();
  assert.equal((await request(replacement,'resume',seat)).ok,true);
  assert.equal((await request(b,'move',{from:'e7',to:'e5'})).ok,true);
  await request(replacement,'draw'); await request(b,'draw');
  assert.equal(server.games.get(seat.id).result,'Draw by agreement');
});
test('quick matching groups equal time controls and cancellation removes queued player',async t=>{
  const server=createChessServer();server.http.listen(0,'127.0.0.1');await once(server.http,'listening');
  const clients=[];const connect=async()=>{const s=io(`http://127.0.0.1:${server.http.address().port}`,{forceNew:true});clients.push(s);await once(s,'connect');return s;};
  t.after(()=>{clients.forEach(s=>s.disconnect());server.stop();});
  const a=await connect(),b=await connect();await request(a,'quick',{minutes:5});await request(b,'quick',{minutes:10});assert.equal(server.games.size,0);
  await request(b,'cancelQueue'); const paired=once(b,'seated');await request(b,'quick',{minutes:5});await paired;assert.equal(server.games.size,1);
});

for (const assignedColor of ['w', 'b']) {
  for (const mode of ['quick', 'private']) {
    test(`${mode} randomly assigns ${assignedColor} to the first player and the opposite to the second`, { timeout: 10000 }, async t => {
      let rolls = 0;
      const server = createChessServer({ chooseColor: () => { rolls++; return assignedColor; } });
      server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
      const clients = [];
      t.after(() => { clients.forEach(s => s.disconnect()); server.stop(); });
      const connect = async () => {
        const s = io(`http://127.0.0.1:${server.http.address().port}`, { forceNew: true });
        clients.push(s); await once(s, 'connect'); return s;
      };
      const a = await connect(), b = await connect();
      const firstSeat = once(a, 'seated'), secondSeat = once(b, 'seated');
      if (mode === 'quick') {
        await request(a, 'quick', { name: 'First', minutes: 5 });
        await request(b, 'quick', { name: 'Second', minutes: 5 });
      } else {
        await request(a, 'create', { name: 'First', minutes: 5, color: 'random' });
        const [host] = await firstSeat;
        await request(b, 'join', { id: host.id, name: 'Second' });
      }
      const [first] = await firstSeat, [second] = await secondSeat;
      assert.equal(rolls, 1);
      assert.equal(first.color, assignedColor);
      assert.equal(second.color, assignedColor === 'w' ? 'b' : 'w');
      assert.equal(first.id, second.id);
      const game = server.games.get(first.id);
      assert.equal(game.players[first.color].name, 'First');
      assert.equal(game.players[second.color].name, 'Second');
      // White still moves first, regardless of join order.
      const white = first.color === 'w' ? a : b;
      assert.equal((await request(white, 'move', { from: 'e2', to: 'e4' })).ok, true);
      // Reconnection preserves the assigned color rather than rerolling it.
      const replacement = await connect();
      const restored = once(replacement, 'seated');
      await request(replacement, 'resume', first);
      assert.equal((await restored)[0].color, assignedColor);
      assert.equal(rolls, 1);
    });
  }
}

test('matchmaking separates increments and publishes the exact custom time control', { timeout: 10000 }, async t => {
  const server = createChessServer(); server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
  const clients = [];
  t.after(() => { clients.forEach(s => s.disconnect()); server.stop(); });
  const connect = async () => {
    const s = io(`http://127.0.0.1:${server.http.address().port}`, { forceNew: true });
    clients.push(s); await once(s, 'connect'); return s;
  };
  const a = await connect(), b = await connect(), c = await connect();
  await request(a, 'quick', { minutes: 5, increment: 0 });
  await request(b, 'quick', { minutes: 5, increment: 5 });
  assert.equal(server.games.size, 0);
  const paired = once(b, 'seated');
  let latest; b.on('state', state => { latest = state; });
  await request(c, 'quick', { minutes: 5, increment: 5 });
  await paired;
  assert.equal(server.games.size, 1);
  assert.equal(latest.minutes, 5); assert.equal(latest.increment, 5);
  assert.equal((await request(a, 'create', { minutes: .5, increment: 3 })).ok, true);
  const custom = [...server.games.values()].find(g => g.minutes === .5);
  assert.equal(custom.increment, 3);
  assert.equal(custom.remaining.w, 30000);
});

test('invalid requested time controls are rejected instead of silently becoming five minutes', { timeout: 10000 }, async t => {
  const server = createChessServer(); server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
  const client = io(`http://127.0.0.1:${server.http.address().port}`, { forceNew: true });
  t.after(() => { client.disconnect(); server.stop(); }); await once(client, 'connect');
  for (const event of ['quick', 'create']) {
    assert.match((await request(client, event, { minutes: 0, increment: 0 })).error, /minutes/);
    assert.match((await request(client, event, { minutes: 5, increment: -1 })).error, /increment/);
  }
  assert.equal(server.games.size, 0);
});

for (const firstColor of ['random', 'w', 'b']) {
  for (const secondColor of ['random', 'w', 'b']) {
    test(`color compatibility: ${firstColor} queued before ${secondColor}`, { timeout: 10000 }, async t => {
      const server = createChessServer(); server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
      const clients = [];
      t.after(() => { clients.forEach(s => s.disconnect()); server.stop(); });
      const connect = async () => {
        const s = io(`http://127.0.0.1:${server.http.address().port}`, { forceNew: true }); clients.push(s);
        await once(s, 'connect'); return s;
      };
      const a = await connect(), b = await connect();
      await request(a, 'quick', { name: 'First', minutes: 5, color: firstColor });
      await request(b, 'quick', { name: 'Second', minutes: 5, color: secondColor });
      const compatible = firstColor === 'random' ? secondColor === 'random' : secondColor !== 'random' && firstColor !== secondColor;
      assert.equal(server.games.size, compatible ? 1 : 0);
      if (compatible) {
        const game = [...server.games.values()][0];
        if (firstColor !== 'random') {
          assert.equal(game.players[firstColor].name, 'First');
          assert.equal(game.players[secondColor].name, 'Second');
        } else assert.deepEqual(Object.keys(game.players).sort(), ['b', 'w']);
      }
    });
  }
}

test('same-color queue preserves FIFO players and cancellation removes only its own entry', { timeout: 10000 }, async t => {
  const server = createChessServer(); server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
  const clients = [];
  t.after(() => { clients.forEach(s => s.disconnect()); server.stop(); });
  const connect = async () => {
    const s = io(`http://127.0.0.1:${server.http.address().port}`, { forceNew: true }); clients.push(s);
    await once(s, 'connect'); return s;
  };
  const a = await connect(), b = await connect(), c = await connect(), d = await connect(), e = await connect();
  await request(a, 'quick', { name: 'First', color: 'b' });
  await request(b, 'quick', { name: 'Cancelled', color: 'b' });
  await request(c, 'quick', { name: 'Third', color: 'b' });
  assert.equal(server.games.size, 0);
  await request(b, 'cancelQueue');
  await request(d, 'quick', { name: 'White one', color: 'w' });
  await request(e, 'quick', { name: 'White two', color: 'w' });
  const games = [...server.games.values()];
  assert.equal(games.length, 2);
  assert.equal(games[0].players.b.name, 'First');
  assert.equal(games[1].players.b.name, 'Third');
  assert.equal(games[0].players.w.name, 'White one');
  assert.equal(games[1].players.w.name, 'White two');
});

test('private premove queue executes automatically, cancels, and clears on disconnect', { timeout: 10000 }, async t => {
  const server = createChessServer(); server.http.listen(0, '127.0.0.1'); await once(server.http, 'listening');
  const clients = [];
  t.after(() => { clients.forEach(s => s.disconnect()); server.stop(); });
  const connect = async () => {
    const s = io(`http://127.0.0.1:${server.http.address().port}`, { forceNew: true }); clients.push(s);
    await once(s, 'connect'); return s;
  };
  const a = await connect(), b = await connect();
  let whiteState, blackState;
  a.on('state', s => { whiteState = s; }); b.on('state', s => { blackState = s; });
  const seated = once(a, 'seated'); await request(a, 'create', { color: 'w' });
  const [seat] = await seated; await request(b, 'join', { id: seat.id });
  await request(b, 'premove', { from: 'e7', to: 'e5', ply: 0 });
  await request(b, 'premove', { from: 'g8', to: 'f6', ply: 0 });
  await pause();
  assert.equal(whiteState.premoves.length, 0); assert.equal(blackState.premoves.length, 2);
  await request(a, 'move', { from: 'e2', to: 'e4' });
  const g = server.games.get(seat.id);
  assert.deepEqual(g.chess.history(), ['e4', 'e5']); assert.equal(g.remaining.b, 299900);
  assert.equal(g.premoves.b.length, 1);
  await request(b, 'cancelPremoves'); assert.equal(g.premoves.b.length, 0);
  await request(b, 'premove', { from: 'g8', to: 'f6', ply: 2 });
  b.disconnect(); await pause(); assert.equal(g.premoves.b.length, 0);
});
