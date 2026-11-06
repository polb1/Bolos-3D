/**
 * Room server for the online hall: everyone who opens the game with the same
 * `?sala=` (default "local") shares one room, sees the others walk around and
 * can exchange minigame messages. It only relays validated state; it runs no game logic.
 *
 * Run: npm run server   (PORT env, default 8787)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { cleanRoom, MAX_MSG_BYTES, MAX_PLAYERS, parseClient, type Peer, type ServerMsg } from '../src/net/protocol.ts';

interface Client {
  ws: WebSocket;
  peer: Peer | null; // null until it says hello
  room: string;
  /** Messages in the current one-second window (simple flood guard). */
  burst: number;
}

const MAX_PER_SECOND = 40;

const DIST = join(import.meta.dirname, '..', 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

/** Serves the built game (dist/) so one host gives both the page and the room on the same domain. */
const serveStatic = async (req: IncomingMessage, res: ServerResponse) => {
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    return res.writeHead(400).end();
  }
  const file = normalize(join(DIST, path === '/' ? 'index.html' : path));
  if (!file.startsWith(DIST + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache }).end(body);
  } catch {
    res.writeHead(404).end('No encontrado (¿has hecho npm run build?)');
  }
};

export function startServer(port = 8787) {
  const rooms = new Map<string, Set<Client>>();
  const server = createServer(serveStatic);
  const wss = new WebSocketServer({ server, maxPayload: MAX_MSG_BYTES });
  server.listen(port);
  let nextId = 1;

  const send = (c: Client, m: ServerMsg) => c.ws.readyState === c.ws.OPEN && c.ws.send(JSON.stringify(m));
  const others = (c: Client) => [...(rooms.get(c.room) ?? [])].filter((o) => o !== c && o.peer);
  const broadcast = (c: Client, m: ServerMsg) => others(c).forEach((o) => send(o, m));

  const timer = setInterval(() => rooms.forEach((set) => set.forEach((c) => (c.burst = 0))), 1000);

  wss.on('connection', (ws, req) => {
    const room = cleanRoom(new URL(req.url ?? '/', 'http://x').searchParams.get('sala'));
    const set = rooms.get(room) ?? new Set<Client>();
    if (set.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t: 'full' } satisfies ServerMsg));
      ws.close();
      return;
    }
    rooms.set(room, set);
    const c: Client = { ws, peer: null, room, burst: 0 };
    set.add(c);

    ws.on('message', (buf) => {
      if (++c.burst > MAX_PER_SECOND) return;
      const m = parseClient(buf.toString());
      if (!m) return;
      if (m.t === 'hello') {
        if (c.peer) return;
        c.peer = { id: `p${nextId++}`, name: m.name, outfit: m.outfit, x: 21.5, y: 27.2, dir: 3, moving: false, place: 'world' };
        send(c, { t: 'welcome', id: c.peer.id, room, peers: others(c).map((o) => o.peer!) });
        broadcast(c, { t: 'join', peer: c.peer });
      } else if (!c.peer) return;
      else if (m.t === 'pos') {
        const { t: _, ...pos } = m;
        Object.assign(c.peer, pos);
        broadcast(c, { t: 'pos', id: c.peer.id, ...pos });
      } else if (m.t === 'game') broadcast(c, { t: 'game', id: c.peer.id, data: m.data });
    });

    ws.on('close', () => {
      set.delete(c);
      if (c.peer) broadcast(c, { t: 'leave', id: c.peer.id });
      if (!set.size) rooms.delete(room);
    });
    ws.on('error', () => ws.close());
  });

  return {
    wss,
    rooms,
    close: () =>
      new Promise<void>((done) => {
        clearInterval(timer);
        wss.clients.forEach((ws) => ws.terminate());
        wss.close(() => server.close(() => done()));
      }),
  };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const port = Number(process.env.PORT) || 8787;
  startServer(port);
  console.log(`Sala online escuchando en ws://localhost:${port}  (?sala=nombre para salas distintas)`);
}
