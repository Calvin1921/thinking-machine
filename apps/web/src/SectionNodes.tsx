import type { NodeProps } from "@xyflow/react";

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
export function SectionBox({ data }: NodeProps & { data: SectionBoxData }) {
  return (
    <div className={`sec-box ${data.kind}`} style={{ width: data.w, height: data.h }}>
      <div className="sec-header">
        <span className="sec-title">{data.title}</span>
        <span className="sec-purpose">{data.purpose}</span>
      </div>
      {data.kind === "note" && (
        data.note
          ? <div className="note-body">{data.note}</div>
          : <div className="note-empty">empty note — set text via `tm note`…</div>
      )}
    </div>
  );
}
