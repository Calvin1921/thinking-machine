import { useCallback, useEffect, useState } from "react";
import { listBoards, createBoard, onBoardChange, type BoardSummary, type RootType } from "./api.js";

const ROOT_TYPES: RootType[] = ["objective", "cause", "decision", "concept"];

/** Coarse relative time without pulling in a date lib. */
function editedAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function CollectionView({ onOpen }: { onOpen: (id: string) => void }) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [rootType, setRootType] = useState<RootType>("objective");

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const refresh = useCallback(async () => { try { setBoards(await listBoards()); setError(''); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onBoardChange(refresh), [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    if (saving) return;
    setSaving(true); setError('');
    try { const { id } = await createBoard(t, rootType); setTitle(""); setCreating(false); onOpen(id); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="collection">
      <header className="coll-head">
        <h1>Thinking Machine</h1>
        {!creating && (
          <button className="btn-primary" onClick={() => setCreating(true)}>+ New canvas</button>
        )}
      </header>

      {error && <p className="form-error" role="alert">{error} <button className="btn-ghost" onClick={refresh}>Retry</button></p>}
      <p className="collection-intro">A place for your thinking and your agents. Map options, add your perspective, and keep track of what still needs an answer.</p>
      {creating && (
        <form className="new-form" onSubmit={submit}>
          <input
            aria-label="Board title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Canvas title…"
          />
          <select aria-label="Board purpose" value={rootType} onChange={(e) => setRootType(e.target.value as RootType)}>
            {ROOT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn-primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</button>
          <button className="btn-ghost" type="button" onClick={() => { setCreating(false); setTitle(""); }}>Cancel</button>
        </form>
      )}

      {boards === null ? (
        <div className="coll-empty">Loading…</div>
      ) : boards.length === 0 && !creating ? (
        <div className="coll-empty">
          No canvases yet — create your first.
          <button className="btn-primary" onClick={() => setCreating(true)}>+ New canvas</button>
        </div>
      ) : (
        <div className="grid">
          {boards.map((b) => (
            <button key={b.id} className="card" onClick={() => onOpen(b.id)}>
              <div className="card-top">
                <span className={`chip ${b.rootType ?? "concept"}`}>{b.rootType ?? "board"}</span>
                <span className="card-meta">{b.nodeCount} {b.nodeCount === 1 ? "node" : "nodes"}</span>
              </div>
              <div className="card-title">{b.title}</div>
              <div className="card-edited">edited {editedAgo(b.updatedAt)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
