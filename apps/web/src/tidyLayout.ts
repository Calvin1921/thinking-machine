import type { Board } from "@tm/core/schema";

const DX = 340;            // horizontal gap per depth level (fits the wider cards)
const GAP = 36;            // vertical gap between stacked leaf slots
const DEFAULT_H = 120;     // assumed height when a node hasn't been measured yet

/**
 * Tidy tree layout over the decomposition edges: root at left, depth → x columns,
 * each parent vertically centered over its children. Dependency cross-links are
 * ignored for positioning (they're the hairball), so the tree reads as a clean flow.
 *
 * Stacking is height-aware: each leaf occupies a vertical slot of its own measured
 * height + GAP, so variable-height cards (with images / long text) never overlap.
 * `heights[id]` is the measured pixel height of each node; missing → DEFAULT_H.
 * Returns the new top-left {x,y} per node id.
 */
export function tidyLayout(board: Board, heights: Record<string, number> = {}): Record<string, { x: number; y: number }> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);

  const h = (id: string) => heights[id] || DEFAULT_H;
  const pos: Record<string, { x: number; y: number }> = {};
  const seen = new Set<string>();
  let cursor = 0; // next free vertical pixel for the upcoming leaf slot

  // Returns the vertical center this node should sit at.
  const place = (id: string, depth: number): number => {
    if (seen.has(id)) return pos[id] ? pos[id].y + h(id) / 2 : 0; // guard shared nodes / cycles
    seen.add(id);
    const cs = kids[id] ?? [];
    let center: number;
    if (cs.length === 0) {
      center = cursor + h(id) / 2;        // claim a slot the size of this card
      cursor += h(id) + GAP;
    } else {
      const centers = cs.map((c) => place(c, depth + 1));
      center = (Math.min(...centers) + Math.max(...centers)) / 2;
    }
    pos[id] = { x: depth * DX, y: center - h(id) / 2 }; // store as top-left for React Flow
    return center;
  };

  place(board.rootId, 0);
  // orphans not reachable from the root: stack them below in their own slots
  for (const n of board.nodes) {
    if (!pos[n.id]) { pos[n.id] = { x: 0, y: cursor }; cursor += h(n.id) + GAP; }
  }
  return pos;
}
