// Cross-board references: `[[board-id]]` in facet items and note bodies renders as a
// clickable chip navigating to `#/board/<id>`. No validation against existing boards —
// a dead link just lands on the empty-board error.

export type RefSegment = { kind: "text"; text: string } | { kind: "ref"; boardId: string };

const REF_RE = /\[\[([a-z0-9][a-z0-9-]*)\]\]/g;

/** Split a string into plain-text and board-reference segments. */
export function parseRefs(text: string): RefSegment[] {
  const segments: RefSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(REF_RE)) {
    if (m.index > last) segments.push({ kind: "text", text: text.slice(last, m.index) });
    segments.push({ kind: "ref", boardId: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

/**
 * Render text with `[[board-id]]` tokens as chips linking to `#/board/<id>`.
 * `nodrag` + stopPropagation keep clicks from starting a ReactFlow node drag.
 */
export function RefText({ text }: { text: string }) {
  return (
    <>
      {parseRefs(text).map((seg, i) =>
        seg.kind === "ref" ? (
          <a
            key={i}
            className="ref-chip nodrag"
            href={`#/board/${encodeURIComponent(seg.boardId)}`}
            onClick={(e) => e.stopPropagation()}
          >
            {seg.boardId.replace(/-/g, " ")}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
