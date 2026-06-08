import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ThinkNodeData } from "./boardToFlow.js";

const KIND_BORDER: Record<string, string> = { root: "#c78bff", branch: "#323a47", atom: "#323a47" };

export function ThinkNode({ data, selected }: NodeProps & { data: ThinkNodeData }) {
  return (
    <div className={`think ${data.kind} ${selected ? "sel" : ""}`} style={{ borderColor: KIND_BORDER[data.kind] }}>
      <Handle type="target" position={Position.Left} />
      <div className="t-label">{data.label}</div>
      {data.kind === "root" && data.rootType && <div className="t-sub">{data.rootType}</div>}
      {data.preview
        ? <div className="t-preview">{data.preview}</div>
        : <div className="t-empty">click to add your thinking…</div>}
      {data.filledFacets.length > 0 && (
        <div className="t-facets">
          {data.filledFacets.map((f) => <span key={f}>{f}</span>)}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
