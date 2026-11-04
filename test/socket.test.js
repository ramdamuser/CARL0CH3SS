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
