import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { ThinkNodeData } from "./boardToFlow.js";

// Wayfinder (DESIGN.md): root = violet, others = quiet line; selection wins with cyan.
const KIND_BORDER: Record<string, string> = { root: "#a78bfa", branch: "#1d2735", atom: "#1d2735" };
// Status colors double as the card's left-accent and pill. Absent status falls back to kind.
const STATUS_COLOR: Record<string, string> = {
  running: "#6aa3ff", passed: "#34d399", failed: "#ff6b6b", blocked: "#f5a623", todo: "#8499b3",
};

export function ThinkNode({ id, data, selected }: NodeProps & { data: ThinkNodeData }) {
  const statusColor = data.status ? STATUS_COLOR[data.status] : undefined;
  return (
    <div
      className={`think ${data.kind} ${selected ? "sel" : ""} ${data.sized ? "sized" : ""}`}
      title="double-click to dive in"
      style={{ borderColor: selected ? "#22d3ee" : (statusColor ?? KIND_BORDER[data.kind]), borderLeftWidth: statusColor ? 4 : undefined }}
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
        <div className="t-label">{data.label}</div>
        {data.status && (
          <div className="t-status" style={{ color: statusColor, borderColor: statusColor }}>{data.status}</div>
        )}
        {data.provenance && (
          <div className={`t-prov prov-${data.provenance}`}>{data.provenance}</div>
        )}
        {data.kind === "root" && data.rootType && <div className="t-sub">{data.rootType}</div>}
        {data.preview
          ? <div className="t-preview">{data.preview}</div>
          : <div className="t-empty">click to add your thinking…</div>}
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
