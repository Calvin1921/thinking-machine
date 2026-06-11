import { NodeResizer, useStore, type NodeProps } from "@xyflow/react";
import { RefText } from "./refLinks.js";

// Section titles are the board's landmarks: they stay readable at any zoom by inverse-
// scaling against the viewport (the Figma/Miro frame-label pattern), capped so a fully
// zoomed-out canvas reads as a map of named regions instead of unbounded text.
const HEADER_SCALE_CAP = 14;

export interface SectionBoxData {
  title: string;
  purpose: string;
  kind: "graph" | "note";
  note?: string;
  w: number;
  h: number;
  [key: string]: unknown;
}

/**
 * A section container — the draggable parent of its nodes. Renders the boundary box, the
 * title/purpose header, and (for note sections) the text body. Dragging an empty part of
 * the box moves the whole section; its child nodes drag independently on top.
 */
export function SectionBox({ data, selected }: NodeProps & { data: SectionBoxData }) {
  const zoom = useStore((s) => s.transform[2]);
  const k = Math.min(Math.max(1 / zoom, 1), HEADER_SCALE_CAP);
  return (
    <div className={`sec-box ${data.kind}`} style={{ width: "100%", height: "100%" }}>
      <NodeResizer isVisible={selected} minWidth={240} minHeight={120} lineClassName="nr-line" handleClassName="nr-handle" />
      <div className="sec-header" style={k > 1 ? { transform: `scale(${k})`, transformOrigin: "0 0" } : undefined}>
        <span className="sec-title">{data.title}</span>
        <span className="sec-purpose">{data.purpose}</span>
      </div>
      {data.kind === "note" && (
        data.note
          ? <div className="note-body"><RefText text={data.note} /></div>
          : <div className="note-empty">empty note — set text via `tm note`…</div>
      )}
    </div>
  );
}
