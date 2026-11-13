import { useEffect, useRef, useState } from 'react';
import { MAX_CHAT, sendChat, useChatStore } from '../net/chat';
import { useNetStore } from '../net/client';

const SHOW_MS = 12000;

/** Room chat over every screen: recent lines fade out; Enter or 💬 opens the box. */
export function ChatUI() {
  const lines = useChatStore((s) => s.lines);
  const status = useNetStore((s) => s.status);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [, tick] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => tick((t) => t + 1), 1000);
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement?.tagName;
      if (e.code === 'Enter' && !open && el !== 'INPUT' && el !== 'BUTTON' && el !== 'TEXTAREA') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (status !== 'online') return null;
  const now = performance.now();
  const shown = open ? lines.slice(-8) : lines.filter((l) => now - l.at < SHOW_MS).slice(-4);
  const close = () => {
    setOpen(false);
    setText('');
  };
  // Keys typed here must not reach the games (WASD, Space, Esc…).
  const stop = (e: React.KeyboardEvent) => e.nativeEvent.stopPropagation();
  return (
    <div className="chat">
      {shown.length > 0 && (
        <ul className="chat-lines" aria-live="polite">
          {shown.map((l) => (
            <li key={l.n} className={l.from === 'me' ? 'me' : ''}>
              <b>{l.name}:</b> {l.text}
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            sendChat(text);
            close();
          }}
        >
          <input
            ref={input}
            value={text}
            maxLength={MAX_CHAT}
            placeholder="Escribe y pulsa Enter"
            aria-label="Mensaje del chat"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              stop(e);
              if (e.code === 'Escape') close();
            }}
            onKeyUp={stop}
            onBlur={() => !text && setOpen(false)}
          />
          <button className="btn primary small" type="submit">Enviar</button>
        </form>
      ) : (
        <button className="chat-open" onClick={() => setOpen(true)} aria-label="Abrir el chat" title="Chat (Enter)">
          💬
        </button>
      )}
    </div>
  );
}
