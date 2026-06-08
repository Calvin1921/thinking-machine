import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ThinkNodeData } from "./boardToFlow.js";

const KIND_BORDER: Record<string, string> = { root: "#c78bff", branch: "#323a47", atom: "#323a47" };

export function ThinkNode({ data, selected }: NodeProps & { data: ThinkNodeData }) {
  return (
    <div className={`think ${data.kind} ${selected ? "sel" : ""}`} style={{ borderColor: KIND_BORDER[data.kind] }}>
      <Handle type="target" position={Position.Left} />
      <div className="t-label">{data.label}</div>
      <div className="t-sub">{data.sub}</div>
      <div className="t-dots">
        {data.filledFacets.map((on, i) => <i key={i} className={on ? "on" : ""} />)}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
