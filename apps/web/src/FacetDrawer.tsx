import { useEffect, useState } from 'react';
import { nodeDraft, type NodeDraft, type NodePatch } from '@tm/core/edit';
import type { Node as BNode } from '@tm/core/schema';
import { editThought } from './api.js';
import { safeHttpUrl } from './safeUrl.js';

export function FacetDrawer({ boardId, node, onClose, onSaved, onDirtyChange, onAddChild, onFocus }: {
  boardId: string; node: BNode; onClose: () => void; onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void; onAddChild: () => void; onFocus: () => void;
}) {
  const [original, setOriginal] = useState(() => nodeDraft(node));
  const [draft, setDraft] = useState(() => nodeDraft(node));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [compare, setCompare] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const latest = nodeDraft(node);
  const changedElsewhere = JSON.stringify(latest) !== JSON.stringify(original);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !saving) { const next = nodeDraft(node); setDraft(next); setOriginal(next); }
  }, [node, dirty, saving]);
  const change = <K extends keyof NodeDraft>(key: K, value: NodeDraft[K]) => {
    setDraft(d => ({ ...d, [key]: value })); setSaved(false); setError('');
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (saving) return;
    const changes: NodePatch = {};
    for (const key of Object.keys(draft) as (keyof NodeDraft)[]) {
      if (draft[key] !== original[key]) Object.assign(changes, { [key]: draft[key] });
    }
    setSaving(true); setError('');
    try {
      const next = await editThought(boardId, node.id, changes, original);
      const normalized = nodeDraft(next.nodes.find(n => n.id === node.id)!);
      setOriginal(normalized); setDraft(normalized); setSaved(true); setCompare(false); onDirtyChange(false); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your draft is still here.'); onSaved(); }
    finally { setSaving(false); }
  };
  return <aside className="drawer" aria-label="Thought details">
    <div className="drawer-heading"><h2>Thought details</h2><button className="btn-ghost" onClick={onClose} aria-label="Close thought details">Close</button></div>
    <div className="detail-actions"><button className="btn-ghost" onClick={onAddChild}>Add related thought</button><button className="btn-ghost" onClick={onFocus}>Focus on this</button></div>
    <form onSubmit={save}>
      <fieldset disabled={saving}>
        <label className="facet">Concept<input className="facet-input" value={draft.label} required onChange={e => change('label', e.target.value)} /></label>
        <label className="facet">Your reasoning<textarea value={draft.description} onChange={e => change('description', e.target.value)} placeholder="What matters here? Add context or a different perspective." /></label>
        <label className="facet">Trade-off / choose this if<textarea value={draft.rationale} onChange={e => change('rationale', e.target.value)} placeholder="When would this option be the right choice?" /></label>
        <label className="facet">Open question<textarea value={draft.gapQuestion} onChange={e => change('gapQuestion', e.target.value)} placeholder="What do we still need to find out?" /></label>
        {draft.gapQuestion && <label className="facet">What is missing?
          <select className="facet-input" value={draft.gapKind} onChange={e => change('gapKind', e.target.value as NodeDraft['gapKind'])}>
            <option value="intent">Intent — what we want</option><option value="structure">Structure — how it fits together</option><option value="reality">Evidence — something to test</option>
          </select>
        </label>}
        <label className="facet">Outcome / next step<textarea value={draft.resolution} onChange={e => change('resolution', e.target.value)} placeholder="What have we decided, or what will we try next?" /></label>
        <p className="field-hint">An outcome does not prove a test passed. Clear the open question only when it has been answered.</p>
        <label className="facet">Status<select className="facet-input" value={draft.status} onChange={e => change('status', e.target.value as NodeDraft['status'])}>
          <option value="">Untracked</option><option value="todo">To do</option><option value="running">In progress</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="blocked">Blocked</option>
        </select></label>
        <details className="source-details"><summary>Sources and image</summary>
          <p className="field-hint">{node.provenance ? `Evidence label: ${node.provenance}.` : 'No evidence label recorded.'} Labels record a caller’s check, not an automatic fact-check.</p>
          {node.sources?.map((source, i) => { const url = safeHttpUrl(source); return <p key={i}>{url ? <a href={url} target="_blank" rel="noreferrer">{source}</a> : source}</p>; })}
          <label className="facet">Image URL<input className="facet-input" value={draft.image} onChange={e => change('image', e.target.value)} placeholder="https://…" /></label>
          <p className="field-hint">Remote images may be blocked by this local app’s content policy.</p>
        </details>
      </fieldset>
      {dirty && changedElsewhere && <div className="conflict-note">
        <p>Updated elsewhere while you were writing. Your draft has been kept.</p>
        <button type="button" className="btn-ghost" onClick={() => setCompare(!compare)}>{compare ? 'Hide latest version' : 'Compare latest version'}</button>
        {compare && <><dl>{(Object.keys(latest) as (keyof NodeDraft)[]).filter(k => latest[k] !== original[k]).map(k => <div key={k}><dt>{({label:'Concept',description:'Reasoning',rationale:'Trade-off',gapKind:'Question type',gapQuestion:'Open question',resolution:'Outcome',status:'Status',image:'Image URL'})[k]}</dt><dd>{latest[k] || '(empty)'}</dd></div>)}</dl>
          <button type="button" className="btn-ghost" onClick={() => { setDraft(latest); setOriginal(latest); setError(''); }}>Discard draft and load latest</button>
          <button type="button" className="btn-ghost" onClick={() => {
            const merged = { ...latest };
            for (const key of Object.keys(draft) as (keyof NodeDraft)[]) if (draft[key] !== original[key]) Object.assign(merged, { [key]: draft[key] });
            setOriginal(latest); setDraft(merged); setCompare(false); setError('');
          }}>Keep my edits for next save</button>
        </>}
      </div>}
      <div className="save-row"><button className="btn-primary" disabled={saving || !dirty || !draft.label.trim()}>{saving ? 'Saving…' : 'Save changes'}</button><span role="status">{saved ? 'Saved to this board' : dirty ? 'Unsaved changes' : 'Up to date'}</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </aside>;
}
