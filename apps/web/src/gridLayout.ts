import type { Board } from "@tm/core/schema";

const CARD_W = 230;
const COL_W = 340;        // width per grid column
const INDENT = 26;        // per-depth indent inside a block
const ROW_GAP = 16;       // vertical gap between stacked nodes in a block
const ROOT_GAP = 200;     // gap from root down to the grid
const DEFAULT_H = 120;

/**
 * Grid layout: the root's children become "blocks" laid out in ONE horizontal row (one
 * column each — never wrapped, so same-level siblings always stay on the same line and the
 * hierarchy reads true), and each block stacks its own subtree vertically beneath it. With
 * a uniform cell, the per-level rows line up across columns → a clean capability/value-chain
 * matrix. Returns top-left {x,y} per node id.
 */
export function gridLayout(
  board: Board,
  heights: Record<string, number> = {},
  cell?: { w: number; h: number },   // uniform cell → equal cards, aligned columns
): Record<string, { x: number; y: number }> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);

  const cw = cell ? cell.w : CARD_W;
  const colW = cell ? cell.w + 60 : COL_W;
  const h = (id: string) => (cell ? cell.h : heights[id] || DEFAULT_H);
  const pos: Record<string, { x: number; y: number }> = {};

  const blocks = kids[board.rootId] ?? [];
  const cols = Math.max(1, blocks.length);   // one column per top-level sibling — no wrapping

  // Lay a node's whole subtree as an indented vertical list anchored at column x `colX`,
  // starting at `y`. Returns the y just past the last placed node.
  const layoutBlock = (id: string, colX: number, y: number, depth: number): number => {
    pos[id] = { x: colX + depth * INDENT, y };
    let cursor = y + h(id) + ROW_GAP;
    for (const c of kids[id] ?? []) cursor = layoutBlock(c, colX, cursor, depth + 1);
    return cursor;
  };

  // every top-level sibling on the same horizontal line (one row), its subtree below it
  blocks.forEach((b, i) => layoutBlock(b, i * colW, ROOT_GAP, 0));

  // Root sits centered above the row.
  pos[board.rootId] = { x: (cols * colW) / 2 - cw / 2, y: 0 };
  return pos;
}
