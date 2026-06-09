import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ThinkNodeData } from "./boardToFlow.js";

const KIND_BORDER: Record<string, string> = { root: "#c78bff", branch: "#323a47", atom: "#323a47" };
// Status colors double as the card's left-accent and pill. Absent status falls back to kind.
const STATUS_COLOR: Record<string, string> = {
  running: "#6aa3ff", passed: "#4ade80", failed: "#ff6b6b", blocked: "#f0a868", todo: "#9aa3b2",
};

export function ThinkNode({ id, data, selected }: NodeProps & { data: ThinkNodeData }) {
  const statusColor = data.status ? STATUS_COLOR[data.status] : undefined;
  return (
    <div
      className={`think ${data.kind} ${selected ? "sel" : ""}`}
      style={{ borderColor: statusColor ?? KIND_BORDER[data.kind], borderLeftWidth: statusColor ? 4 : undefined }}
    >
      <Handle type="target" position={Position.Left} />
      {data.image && (
        <img
          className="t-img"
          src={data.image}
          alt=""
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="t-label">{data.label}</div>
      {data.status && (
        <div className="t-status" style={{ color: statusColor, borderColor: statusColor }}>{data.status}</div>
      )}
      {data.kind === "root" && data.rootType && <div className="t-sub">{data.rootType}</div>}
      {data.preview
        ? <div className="t-preview">{data.preview}</div>
        : <div className="t-empty">click to add your thinking…</div>}
      {data.filledFacets.length > 0 && (
        <div className="t-facets">
          {data.filledFacets.map((f) => <span key={f}>{f}</span>)}
        </div>
      )}
      {data.childCount > 0 && (
        <button
          className="t-toggle"
          title={data.collapsed ? `Expand ${data.childCount}` : "Collapse"}
          onClick={(e) => { e.stopPropagation(); data.onToggle?.(id); }}
        >
          {data.collapsed ? `+${data.childCount}` : "–"}
        </button>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
