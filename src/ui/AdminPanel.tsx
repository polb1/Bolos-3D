import { useAdminStore, net } from '../net/client';
import { DECOR_KINDS, DEFAULT_CONFIG, GAME_PLACES, MAX_DECOR, type DecorKind, type GamePlace, type HallConfig } from '../net/protocol';
import { DECOR } from '../world3d/decor';
import { worldRef } from '../world/instance';
import { useWorldStore } from '../world/worldStore';

const GAMES: Record<GamePlace, string> = { bowling: 'Bolera', airhockey: 'Air hockey', darts: 'Dardos', pool: 'Billar', arcade: 'Recreativas', foosball: 'Futbolín' };

let timer = 0;
/** Shows the change at once and publishes it to everyone a moment later (colour pickers fire a lot). */
function update(patch: Partial<HallConfig>) {
  const cfg = { ...useAdminStore.getState().config, ...patch };
  useAdminStore.setState({ config: cfg });
  clearTimeout(timer);
  timer = window.setTimeout(() => net.sendConfig(cfg), 250);
}

function place(kind: DecorKind) {
  const w = worldRef.current;
  const { decor } = useAdminStore.getState().config;
  if (!w || !('decorSpot' in w)) return useWorldStore.getState().showToast('La decoración se coloca en el local 3D');
  if (decor.length >= MAX_DECOR) return useWorldStore.getState().showToast(`Máximo ${MAX_DECOR} decoraciones`);
  update({ decor: [...decor, w.decorSpot(kind, Math.floor(Math.random() * 60))] });
}

/** Admin tools (unlocked from the chat): room colours, open/closed games and decorations, shared with everyone. */
export function AdminPanel() {
  const { admin, panel, config } = useAdminStore();
  if (!admin) return null;
  if (!panel)
    return (
      <button className="admin-btn" title="Administrador" aria-label="Abrir panel de administrador" onClick={() => useAdminStore.setState({ panel: true })}>
        🛠
      </button>
    );
  const color = (key: 'wall' | 'floor' | 'light', label: string) => (
    <label className="admin-color">
      <input type="color" value={config[key]} onChange={(e) => update({ [key]: e.target.value })} />
      {label}
    </label>
  );
  return (
    <aside className="admin-panel" aria-label="Panel de administrador">
      <header>
        <b>🛠 Administrador</b>
        <button className="icon-btn" aria-label="Cerrar" onClick={() => useAdminStore.setState({ panel: false })}>✕</button>
      </header>
      <p className="admin-note">Los cambios se ven para todos los que entren al local.</p>

      <h3>Colores de la sala</h3>
      <div className="admin-row">
        {color('wall', 'Paredes')}
        {color('floor', 'Suelo')}
        {color('light', 'Luz')}
      </div>
      <button className="btn ghost small" onClick={() => update({ wall: DEFAULT_CONFIG.wall, floor: DEFAULT_CONFIG.floor, light: DEFAULT_CONFIG.light })}>
        Colores originales
      </button>

      <h3>Juegos abiertos</h3>
      <div className="admin-games">
        {GAME_PLACES.map((g) => (
          <label key={g}>
            <input
              type="checkbox"
              checked={!config.closed.includes(g)}
              onChange={(e) => update({ closed: e.target.checked ? config.closed.filter((c) => c !== g) : [...config.closed, g] })}
            />
            {GAMES[g]}
          </label>
        ))}
      </div>

      <h3>Decoración</h3>
      <p className="admin-note">Ponte delante de una pared (o donde quieras el mueble) y elige:</p>
      <div className="admin-decor">
        {DECOR_KINDS.map((k) => (
          <button key={k} className="btn menu small" onClick={() => place(k)}>
            {DECOR[k].name}
          </button>
        ))}
      </div>
      {config.decor.length > 0 && (
        <>
          <ul className="admin-list">
            {config.decor.map((d, i) => (
              <li key={i}>
                {DECOR[d.kind].name}
                <button className="icon-btn" aria-label={`Quitar ${DECOR[d.kind].name}`} onClick={() => update({ decor: config.decor.filter((_, j) => j !== i) })}>✕</button>
              </li>
            ))}
          </ul>
          <button className="btn ghost small" onClick={() => update({ decor: [] })}>Quitar toda la decoración</button>
        </>
      )}
    </aside>
  );
}
