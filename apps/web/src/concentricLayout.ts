import type { Board } from "@tm/core/schema";

const CARD_W = 230;
const DEFAULT_H = 120;
const R0 = 340;              // radius of the first ring (depth 1)
const DR = 300;             // radius added per deeper ring
const GAP = 60;             // min chord clearance between cards on a ring
const START = -Math.PI / 2; // 12 o'clock; angles grow clockwise (screen y points down)

/**
 * Concentric layout: the root sits at the CENTER and every node at the same DEPTH sits evenly
 * on one shared circle — emphasizing the LAYERS (core → outer), unlike radial which carves
 * per-subtree sectors. Each ring's radius is its natural depth radius, grown if the chord rule
 * needs more room so equal cards never overlap. Returns top-left {x,y} per node id, centered
 * on the root at (0,0).
 */
export function concentricLayout(
  board: Board,
  heights: Record<string, number> = {},
  cell?: { w: number; h: number },   // uniform cell → equal cards, even rings
): Record<string, { x: number; y: number }> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);

  const cw = cell ? cell.w : CARD_W;
  const h = (id: string) => (cell ? cell.h : heights[id] || DEFAULT_H);
  const pos: Record<string, { x: number; y: number }> = {};

  // BFS depth from the root (cycle-safe).
  const depth: Record<string, number> = { [board.rootId]: 0 };
  const queue = [board.rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of kids[id] ?? []) if (depth[c] === undefined) { depth[c] = depth[id] + 1; queue.push(c); }
  }

  // Group by depth, preserving node order for stable angles.
  const byDepth = new Map<number, string[]>();
  let maxDepth = 0;
  for (const n of board.nodes) {
    const d = depth[n.id];
    if (d === undefined || d === 0) continue;       // root + orphans handled separately
    maxDepth = Math.max(maxDepth, d);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n.id);
  }

  const need = cw + GAP;
  for (let d = 1; d <= maxDepth; d++) {
    const ids = byDepth.get(d) ?? [];
    const n = ids.length;
    const natural = R0 + (d - 1) * DR;
    // chord rule: 2r·sin(π/n) ≥ need  →  r ≥ need / (2 sin(π/n))
    const chordR = n > 1 ? need / (2 * Math.sin(Math.PI / n)) : 0;
    const r = Math.max(natural, chordR);
    ids.forEach((id, i) => {
      const a = START + (i * 2 * Math.PI) / n;
      pos[id] = { x: r * Math.cos(a) - cw / 2, y: r * Math.sin(a) - h(id) / 2 };
    });
  }

  // Root dead center (stored as top-left for React Flow).
  pos[board.rootId] = { x: -cw / 2, y: -h(board.rootId) / 2 };

  // Orphans (unreachable from the root) parked below the outermost ring so nothing is lost.
  let cursor = R0 + maxDepth * DR + 80;
  for (const n of board.nodes) {
    if (!pos[n.id]) { pos[n.id] = { x: -cw / 2, y: cursor }; cursor += h(n.id) + 40; }
  }
  return pos;
}
