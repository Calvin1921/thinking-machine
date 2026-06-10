import type { Board } from "@tm/core/schema";

const CARD_W = 230;
const COL_W = 340;        // width per grid column
const INDENT = 26;        // per-depth indent inside a block
const ROW_GAP = 16;       // vertical gap between stacked nodes in a block
const BLOCK_GAP = 64;     // vertical gap between blocks stacked in one column
const ROOT_GAP = 200;     // gap from root down to the grid
const DEFAULT_H = 120;

/**
 * Grid layout: the root's children become "blocks" packed into a few columns
 * (round-robin), each block laying its own subtree out as a compact indented vertical
 * list. This trades a tree's tall single-column sprawl for a tight 2D matrix — the shape
 * a capability model or value chain wants. Returns top-left {x,y} per node id.
 */
export function gridLayout(
  board: Board,
  heights: Record<string, number> = {},
): Record<string, { x: number; y: number }> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);

  const h = (id: string) => heights[id] || DEFAULT_H;
  const pos: Record<string, { x: number; y: number }> = {};

  const blocks = kids[board.rootId] ?? [];
  const cols = Math.min(4, Math.max(1, blocks.length));
  const colCursor = new Array(cols).fill(ROOT_GAP);

  // Lay a node's whole subtree as an indented vertical list anchored at column x `colX`,
  // starting at `y`. Returns the y just past the last placed node.
  const layoutBlock = (id: string, colX: number, y: number, depth: number): number => {
    pos[id] = { x: colX + depth * INDENT, y };
    let cursor = y + h(id) + ROW_GAP;
    for (const c of kids[id] ?? []) cursor = layoutBlock(c, colX, cursor, depth + 1);
    return cursor;
  };

  blocks.forEach((b, i) => {
    const col = i % cols;
    const bottom = layoutBlock(b, col * COL_W, colCursor[col], 0);
    colCursor[col] = bottom + BLOCK_GAP;
  });

  // Root sits centered above the grid.
  pos[board.rootId] = { x: (cols * COL_W) / 2 - CARD_W / 2, y: 0 };
  return pos;
}
