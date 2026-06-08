import type { Board } from "@tm/core/schema";

const DX = 320; // horizontal gap per depth level
const DY = 130; // vertical gap between sibling rows

/**
 * Tidy tree layout over the decomposition edges: root at left, depth → x columns,
 * each parent vertically centered over its children. Dependency cross-links are
 * ignored for positioning (they're the hairball), so the tree reads as a clean flow.
 * Returns new {x,y} per node id.
 */
export function tidyLayout(board: Board): Record<string, { x: number; y: number }> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);

  const pos: Record<string, { x: number; y: number }> = {};
  const seen = new Set<string>();
  let row = 0; // next free leaf row

  const place = (id: string, depth: number): number => {
    if (seen.has(id)) return pos[id]?.y ?? 0; // guard shared nodes / cycles
    seen.add(id);
    const cs = kids[id] ?? [];
    let y: number;
    if (cs.length === 0) {
      y = row * DY;
      row += 1;
    } else {
      const ys = cs.map((c) => place(c, depth + 1));
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    pos[id] = { x: depth * DX, y };
    return y;
  };

  place(board.rootId, 0);
  // orphans not reachable from the root: stack them below
  for (const n of board.nodes) {
    if (!pos[n.id]) { pos[n.id] = { x: 0, y: row * DY }; row += 1; }
  }
  return pos;
}
