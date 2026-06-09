import type { Board } from "@tm/core/schema";
import { tidyLayout } from "./tidyLayout.js";
import { funnelLayout } from "./funnelLayout.js";

const CARD_W = 230;
export const HEADER_H = 64; // space the section title band occupies (shared with App rendering)
const SECTION_GAP = 110;   // vertical gap between sections
const NODE_H = 150;        // assumed node height for bounding-box math
const NOTE_W = 620;        // note panel size
const NOTE_H = 240;

export interface SectionRect {
  id: string;
  title: string;
  kind: "graph" | "note";
  note?: string;
  x: number; y: number; w: number; h: number; // header band origin + section bounds
}

/**
 * Compose a board's sections onto one surface: each section is laid out by its own
 * representation (a graph section via tree/funnel over only its nodes; a note section as
 * a fixed panel), stacked top→bottom with a titled header band. Returns absolute node
 * positions plus a rect per section (for header + background rendering). Deterministic
 * from structure — no measured heights needed — so it never feedback-loops on render.
 */
export function sectionedLayout(board: Board): { nodes: Record<string, { x: number; y: number }>; sections: SectionRect[] } {
  const nodes: Record<string, { x: number; y: number }> = {};
  const sections: SectionRect[] = [];
  let cursorY = 0;

  for (const sec of board.sections ?? []) {
    if (sec.kind === "graph" && sec.rootId) {
      const members = board.nodes.filter((n) => n.sectionId === sec.id);
      const ids = new Set(members.map((n) => n.id));
      const edges = board.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
      const sub = { rootId: sec.rootId, nodes: members, edges, layout: sec.layout } as unknown as Board;
      const pos = sec.layout === "funnel" ? funnelLayout(sub) : tidyLayout(sub);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of Object.keys(pos)) {
        const p = pos[id];
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + CARD_W); maxY = Math.max(maxY, p.y + NODE_H);
      }
      if (!isFinite(minX)) { minX = 0; minY = 0; maxX = CARD_W; maxY = NODE_H; }
      const offX = -minX;                       // left-align the section at x=0
      const offY = cursorY + HEADER_H - minY;   // drop below the header band
      for (const id of Object.keys(pos)) nodes[id] = { x: pos[id].x + offX, y: pos[id].y + offY };
      const w = maxX - minX, h = maxY - minY;
      sections.push({ id: sec.id, title: sec.title, kind: "graph", x: 0, y: cursorY, w, h: h + HEADER_H });
      cursorY += HEADER_H + h + SECTION_GAP;
    } else {
      sections.push({ id: sec.id, title: sec.title, kind: "note", note: sec.note ?? "", x: 0, y: cursorY, w: NOTE_W, h: NOTE_H + HEADER_H });
      cursorY += HEADER_H + NOTE_H + SECTION_GAP;
    }
  }
  return { nodes, sections };
}
