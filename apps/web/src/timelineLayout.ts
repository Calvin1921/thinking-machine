import type { Board } from "@tm/core/schema";

const CARD_W = 230;
const ROOT_GAP = 150;     // root title down to the first lane
const LABEL_X = 0;        // lane-label (row header) column
const ITEMS_X = 270;      // where the item columns begin (after the lane label)
const COL_W = 290;        // width per time/column step
const INDENT = 24;        // per-depth indent inside a column cell
const ROW_GAP = 14;       // vertical gap when a cell stacks sub-items
const LANE_GAP = 64;      // vertical gap between lanes
const DEFAULT_H = 120;

/**
 * Timeline / swimlane layout: the root's children are horizontal LANES (rows); each lane's
 * children are CELLS flowing left→right across columns (the time / sequence axis). A cell's
 * own subtree stacks vertically within its column. Columns align across lanes, so it reads
 * as a Gantt-style swimlane grid (roadmap by phase, org chart by level, etc.).
 * Returns top-left {x,y} per node id.
 */
export function timelineLayout(
  board: Board,
  heights: Record<string, number> = {},
  cell?: { w: number; h: number },   // uniform cell → equal cards, aligned columns + rows
): Record<string, { x: number; y: number }> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);

  const itemsX = cell ? cell.w + 40 : ITEMS_X;
  const colW = cell ? cell.w + 60 : COL_W;
  const h = (id: string) => (cell ? cell.h : heights[id] || DEFAULT_H);
  const pos: Record<string, { x: number; y: number }> = {};

  pos[board.rootId] = { x: LABEL_X, y: 0 };
  const lanes = kids[board.rootId] ?? [];
  let cursor = ROOT_GAP;

  for (const lane of lanes) {
    const laneY = cursor;
    pos[lane] = { x: LABEL_X, y: laneY };   // row header on the left
    let laneBottom = laneY + h(lane);

    (kids[lane] ?? []).forEach((item, j) => {
      const colX = itemsX + j * colW;
      // stack the item + its descendants vertically within this column cell
      let y = laneY;
      const place = (id: string, depth: number): void => {
        pos[id] = { x: colX + depth * INDENT, y };
        y += h(id) + ROW_GAP;
        for (const c of kids[id] ?? []) place(c, depth + 1);
      };
      place(item, 0);
      laneBottom = Math.max(laneBottom, y);
    });

    cursor = laneBottom + LANE_GAP;
  }
  return pos;
}
