import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { parseClient, parseServer, type ServerMsg } from '../src/net/protocol.ts';
import { startServer } from './server.ts';

const PORT = 18787;
let srv: ReturnType<typeof startServer>;

beforeAll(() => {
  srv = startServer(PORT);
});
afterAll(() => srv.close());

/** A test client that queues every parsed server message. */
function client(room = 'test') {
  const ws = new WebSocket(`ws://localhost:${PORT}/?sala=${room}`);
  const inbox: ServerMsg[] = [];
  const waiters: Array<() => void> = [];
  ws.on('message', (b) => {
    const m = parseServer(b.toString());
    if (m) inbox.push(m);
    waiters.splice(0).forEach((w) => w());
  });
  const next = async <T extends ServerMsg['t']>(t: T): Promise<Extract<ServerMsg, { t: T }>> => {
    for (;;) {
      const i = inbox.findIndex((m) => m.t === t);
      if (i >= 0) return inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>;
      await new Promise<void>((r) => waiters.push(r));
    }
  };
  const open = new Promise<void>((r) => ws.on('open', () => r()));
  const send = (m: object) => ws.send(JSON.stringify(m));
  return { ws, inbox, next, open, send };
}

describe('protocol', () => {
  it('rejects junk and clamps values', () => {
    expect(parseClient('nope')).toBeNull();
    expect(parseClient(JSON.stringify({ t: 'pos', x: 'a', y: 1, dir: 0, place: 'world' }))).toBeNull();
    expect(parseClient(JSON.stringify({ t: 'pos', x: 5, y: 5, dir: 0, place: 'moon' }))).toBeNull();
    expect(parseClient(JSON.stringify({ t: 'pos', x: 1e9, y: -4, dir: 9, place: 'world' }))).toMatchObject({ x: 100, y: 0, dir: 3 });
    expect(parseClient(JSON.stringify({ t: 'hello', name: '  <b>Ana\u0007</b>muy-larga-de-verdad ', outfit: 99 }))).toEqual({
      t: 'hello',
      name: 'bAna/bmuy-larga-',
      outfit: 3,
    });
    expect(parseClient('x'.repeat(5000))).toBeNull();
  });
});

describe('room server', () => {
  it('two players in the same room see each other join, move and leave', async () => {
    const a = client();
    await a.open;
    a.send({ t: 'hello', name: 'Ana', outfit: 1 });
    const wa = await a.next('welcome');
    expect(wa.peers).toEqual([]);

    const b = client();
    await b.open;
    b.send({ t: 'hello', name: 'Bea', outfit: 2 });
    const wb = await b.next('welcome');
    expect(wb.peers.map((p) => p.name)).toEqual(['Ana']);
    expect((await a.next('join')).peer).toMatchObject({ name: 'Bea', outfit: 2 });

    b.send({ t: 'pos', x: 10, y: 12, dir: 2, moving: true, place: 'world' });
    expect(await a.next('pos')).toMatchObject({ id: wb.id, x: 10, y: 12, dir: 2, moving: true });

    a.send({ t: 'game', data: { puck: [1, 2] } });
    expect(await b.next('game')).toEqual({ t: 'game', id: wa.id, data: { puck: [1, 2] } });

    b.ws.close();
    expect(await a.next('leave')).toEqual({ t: 'leave', id: wb.id });
    a.ws.close();
  });

  it('keeps rooms apart and ignores clients that never said hello', async () => {
    const a = client('sala-a');
    const b = client('sala-b');
    const lurker = client('sala-a');
    await Promise.all([a.open, b.open, lurker.open]);
    lurker.send({ t: 'pos', x: 1, y: 1, dir: 0, moving: false, place: 'world' });
    a.send({ t: 'hello', name: 'A', outfit: 0 });
    b.send({ t: 'hello', name: 'B', outfit: 0 });
    expect((await a.next('welcome')).peers).toEqual([]);
    expect((await b.next('welcome')).peers).toEqual([]);
    await new Promise((r) => setTimeout(r, 50));
    expect(a.inbox).toEqual([]);
    [a, b, lurker].forEach((c) => c.ws.close());
  });
});
