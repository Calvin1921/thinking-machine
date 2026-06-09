import type { NodeProps } from "@xyflow/react";

export interface SectionHeaderData { title: string; purpose: string; [key: string]: unknown }
export interface NoteData { title: string; note: string; [key: string]: unknown }

/** A titled band that labels a section and states its purpose (graph kind / note). */
export function SectionHeaderNode({ data }: NodeProps & { data: SectionHeaderData }) {
  return (
    <div className="sec-header" title={data.title}>
      <span className="sec-title">{data.title}</span>
      <span className="sec-purpose">{data.purpose}</span>
    </div>
  );
}

/** A free-text note panel — the section kind for narrative that no graph captures. */
export function NoteNode({ data }: NodeProps & { data: NoteData }) {
  return (
    <div className="note-card">
      {data.note ? <div className="note-body">{data.note}</div> : <div className="note-empty">empty note — set text via the drawer or `tm note`…</div>}
    </div>
  );
}
