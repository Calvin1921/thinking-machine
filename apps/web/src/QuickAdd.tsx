import { useRef, useState } from 'react';
import type { Board } from '@tm/core/schema';
import { addNode } from './api.js';

export function QuickAdd({ board, boardId, parentId, onParentChange, onAdded }: {
  board: Board; boardId: string; parentId: string; onParentChange: (id: string) => void;
  onAdded: (board: Board, id: string, parentId: string) => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = text.trim();
    if (!label || saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const next = await addNode(boardId, label, parentId, 'branch');
      const added = next.nodes.at(-1)!;
      onAdded(next, added.id, parentId);
      setText(''); setMessage(`Added “${label}”. Select it to add details.`);
      input.current?.focus();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add your thought. Try again.'); }
    finally { setSaving(false); }
  };
  return <form className="quickadd" onSubmit={submit} aria-label="Add your thought">
    <div className="composer-fields">
      <label className="parent-field">Add under
        <select value={parentId} onChange={e => onParentChange(e.target.value)} disabled={saving}>
          {board.nodes.map(n => <option key={n.id} value={n.id}>{n.id === board.rootId ? 'Whole board' : n.label}</option>)}
        </select>
      </label>
      <label className="thought-field" htmlFor="new-thought">Your thought
        <input id="new-thought" ref={input} value={text} onChange={e => { setText(e.target.value); setMessage(''); }}
          placeholder="An option, concern, question, or idea…" disabled={saving} required />
      </label>
      <button className="btn-primary" disabled={saving || !text.trim()}>{saving ? 'Adding…' : 'Add thought'}</button>
    </div>
    <p className={error ? 'form-error' : 'composer-hint'} role={error ? 'alert' : 'status'}>
      {error || message || 'Your ideas and agent updates share this board. Select a concept to build on it.'}
    </p>
  </form>;
}
