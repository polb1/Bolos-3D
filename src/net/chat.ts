import { create } from 'zustand';
import { useWorldStore } from '../world/worldStore';
import { net } from './client';

/** SHA-256 of the admin word: typing it in the chat asks the server for admin mode instead of sending it. */
const ADMIN_HASH = '31ab58d2aafdbdff3c943d84830178119098ab427d9dec9fd24c7c3af4cec832';
const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export const MAX_CHAT = 120;
/** Seconds a line stays over the speaker's head. */
export const BUBBLE_TIME = 12;

export interface ChatLine {
  /** Peer id ('me' for our own lines). */
  from: string;
  name: string;
  text: string;
  /** performance.now() when it arrived. */
  at: number;
  n: number;
}

/** Room chat: the last lines, newest last. */
export const useChatStore = create<{ lines: ChatLine[] }>(() => ({ lines: [] }));

let n = 0;
const add = (from: string, name: string, text: string) =>
  useChatStore.setState((s) => ({ lines: [...s.lines.slice(-29), { from, name, text, at: performance.now(), n: ++n }] }));

/** Cleans a line typed or received: one line, trimmed, capped. */
export const cleanChat = (t: unknown) => (typeof t === 'string' ? t.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_CHAT) : '');

export async function sendChat(text: string) {
  const t = cleanChat(text);
  if (!t) return;
  if (!t.includes(' ') && t.length < 40 && crypto.subtle && (await sha256(t)) === ADMIN_HASH) {
    net.adminLogin(t, (ok) => add('sys', 'Sistema', ok ? 'Modo administrador activado (botón 🛠)' : 'No se pudo activar el modo administrador (¿sin conexión?)'));
    return;
  }
  net.sendGame({ k: 'chat', text: t });
  add('me', useWorldStore.getState().name || 'Tú', t);
}

/** What `id` ('me' for us) said in the last BUBBLE_TIME seconds, or ''. */
export function lastSaid(id: string): string {
  const now = performance.now();
  const lines = useChatStore.getState().lines;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (now - l.at > BUBBLE_TIME * 1000) break;
    if (l.from === id) return l.text;
  }
  return '';
}

net.onGame((from, data) => {
  const m = data as { k?: string; text?: unknown };
  if (m?.k !== 'chat') return;
  const t = cleanChat(m.text);
  if (t) add(from, net.peers.get(from)?.name ?? 'Alguien', t);
});
