import { useState, useRef, useEffect } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { ThinkNodeData } from "./boardToFlow.js";

// Wayfinder (docs/DESIGN.md): root = violet, others = quiet line; selection wins with cyan.
const KIND_BORDER: Record<string, string> = { root: "#a78bfa", branch: "#1d2735", atom: "#1d2735" };
// Status colors double as the card's left-accent and pill. Absent status falls back to kind.
const STATUS_COLOR: Record<string, string> = {
  running: "#6aa3ff", passed: "#34d399", failed: "#ff6b6b", blocked: "#f5a623", todo: "#8499b3",
};

// Inline editing (docs/DESIGN.md anti-slop gate: "editing is inline"). A selected node's label and
// body become click-to-edit; Enter/blur commits, Esc cancels. Events are stopped so the canvas
// never reads them as a dive / drag / keyboard-nav while you type.
type Field = "label" | "desc";

export function ThinkNode({ id, data, selected }: NodeProps & { data: ThinkNodeData }) {
  const statusColor = data.status ? STATUS_COLOR[data.status] : undefined;
  const [edit, setEdit] = useState<Field | null>(null);
  const [draft, setDraft] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  // Deselecting a node mid-edit commits the open draft (blur won't fire if the node unmounts).
  useEffect(() => { if (!selected && edit) commit(); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (edit) fieldRef.current?.focus(); }, [edit]);

  const begin = (field: Field) => { setDraft(field === "label" ? data.label : data.preview); setEdit(field); };
  const commit = () => {
    if (edit === "label") { const v = draft.trim(); if (v && v !== data.label) data.onRename?.(id, v); }
    else if (edit === "desc") { if (draft !== data.preview) data.onDescribe?.(id, draft); }
    setEdit(null);
  };
  const cancel = () => setEdit(null);
  // Keep the canvas out of it: no drag, no dive, no j/k/Esc nav while a field has focus.
  const guard = { onMouseDown: stop, onClick: stop, onDoubleClick: stop };
  const onKey = (e: React.KeyboardEvent, multiline: boolean) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
    else if (e.key === "Enter" && (!multiline || (e.metaKey || e.ctrlKey))) { e.preventDefault(); commit(); }
  };

  return (
    <div
      className={`think ${data.kind} ${selected ? "sel" : ""} ${data.sized ? "sized" : ""}`}
      title={selected ? "click the title or body to edit · double-click to dive in" : "double-click to dive in"}
      style={{
        // gap = frontier: amber dashed edge (reuses the dependency accent — no new color).
        borderColor: selected ? "#22d3ee" : data.gap ? "#f0a868" : (statusColor ?? KIND_BORDER[data.kind]),
        borderStyle: data.gap && !selected ? "dashed" : undefined,
        borderLeftWidth: statusColor ? 4 : undefined,
      }}
    >
      <NodeResizer isVisible={selected} minWidth={150} minHeight={56} lineClassName="nr-line" handleClassName="nr-handle" />
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="target" position={Position.Top} id="t" />
      {/* radial layout picks handles by geometry, so every side needs both directions */}
      <Handle type="target" position={Position.Right} id="rt" />
      <Handle type="target" position={Position.Bottom} id="bt" />
      <div className="t-body">
        {data.image && (
          <img
            className="t-img"
            src={data.image}
            alt=""
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        {edit === "label" ? (
          <input
            ref={fieldRef as React.RefObject<HTMLInputElement>}
            className="t-label t-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commit}
            onKeyDown={(e) => onKey(e, false)}
            {...guard}
          />
        ) : (
          <div className="t-label" onClick={selected ? () => begin("label") : undefined}>{data.label}</div>
        )}
        {data.status && (
          <div className="t-status" style={{ color: statusColor, borderColor: statusColor }}>{data.status}</div>
        )}
        {data.provenance && (
          <div className={`t-prov prov-${data.provenance}`}>{data.provenance}</div>
        )}
        {data.gap && (
          <div className="t-gap" title={`frontier: the map honestly stops here (${data.gap.kind} gap)`}>
            <span className="t-gap-kind">⚑ {data.gap.kind}</span> {data.gap.question}
          </div>
        )}
        {data.resolution && (
          <div className="t-resolution" title="resolved — the recorded outcome">✓ {data.resolution}</div>
        )}
        {data.kind === "root" && data.rootType && <div className="t-sub">{data.rootType}</div>}
        {edit === "desc" ? (
          <textarea
            ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
            className="t-preview t-edit"
            value={draft}
            placeholder="What this node means — the thinking it holds…"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => onKey(e, true)}
            {...guard}
          />
        ) : data.preview ? (
          <div className="t-preview" onClick={selected ? () => begin("desc") : undefined}>{data.preview}</div>
        ) : (
          <div className="t-empty" onClick={selected ? () => begin("desc") : undefined}>click to add your thinking…</div>
        )}
      </div>
      {data.childCount > 0 && (
        <button
          className="t-toggle"
          title={data.collapsed ? `Expand ${data.childCount}` : "Collapse"}
          onClick={(e) => { e.stopPropagation(); data.onToggle?.(id); }}
        >
          {data.collapsed ? `+${data.childCount}` : "–"}
        </button>
      )}
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="source" position={Position.Left} id="ls" />
      <Handle type="source" position={Position.Top} id="ts" />
    </div>
  );
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();
