import type { Board } from "@tm/core/schema";

const CARD_W = 230;
const DEFAULT_H = 120;
const R0 = 430;                    // radius of the first ring (depth 1)
const DR = 360;                    // radius added per further ring
const RING_GAP = 60;               // min chord clearance between adjacent cards on a ring
const MIN_SECTOR = Math.PI / 12;   // 15° — a tiny subtree still gets a readable wedge
const START = -Math.PI / 2;        // 12 o'clock; angles grow clockwise (screen y points down)
const ORPHAN_GAP = 40;

/**
 * Radial / ecosystem layout: the root sits at the CENTER; each of its direct children owns
 * an angular SECTOR sized proportionally to its subtree's leaf count (clamped to MIN_SECTOR
 * so small sectors stay readable, then renormalized to a full circle). Every node sits on
 * the ring for its depth (R = R0 + (depth-1)*DR) at the midpoint of its descendants' angular
 * span — leaves divide their parent's span evenly, so siblings fan out side by side.
 *
 * No-overlap guarantee: for each ring we look at the smallest angular gap between adjacent
 * nodes actually on that ring and grow the ring's radius until the chord between those two
 * centers fits a card width + clearance (chord = 2R·sin(gap/2) ≥ need). Rings also stay
 * monotonically outward by at least a card height. Deterministic — no measurement loops.
 * Returns top-left {x,y} per node id, centered on the root at (0,0).
 */
export function radialLayout(
  board: Board,
  heights: Record<string, number> = {},
  cell?: { w: number; h: number },   // uniform cell → equal cards, even rings
): Record<string, { x: number; y: number }> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);

  const cw = cell ? cell.w : CARD_W;
  const h = (id: string) => (cell ? cell.h : heights[id] || DEFAULT_H);
  const maxH = cell ? cell.h : Math.max(DEFAULT_H, ...Object.values(heights).map((v) => v || 0));
  const pos: Record<string, { x: number; y: number }> = {};

  // Leaf count per subtree (memoized single DFS, cycle-safe).
  const leafCount: Record<string, number> = {};
  const countLeaves = (id: string, trail: Set<string>): number => {
    if (leafCount[id] !== undefined) return leafCount[id];
    if (trail.has(id)) return 0;                    // cycle guard
    trail.add(id);
    const cs = kids[id] ?? [];
    const n = cs.length === 0 ? 1 : Math.max(1, cs.reduce((s, c) => s + countLeaves(c, trail), 0));
    trail.delete(id);
    leafCount[id] = n;
    return n;
  };

  // Recursively hand each node the midpoint of its angular span; children split the span
  // proportionally to their own leaf counts (so leaves end up evenly spaced in a sector).
  const angle: Record<string, number> = {};
  const depthOf: Record<string, number> = {};
  const assign = (id: string, a0: number, a1: number, depth: number): void => {
    if (angle[id] !== undefined) return;            // shared node / cycle guard
    angle[id] = (a0 + a1) / 2;
    depthOf[id] = depth;
    const cs = kids[id] ?? [];
    if (!cs.length) return;
    const total = cs.reduce((s, c) => s + countLeaves(c, new Set()), 0) || 1;
    let a = a0;
    for (const c of cs) {
      const span = (a1 - a0) * (countLeaves(c, new Set()) / total);
      assign(c, a, a + span, depth + 1);
      a += span;
    }
  };

  // Level-1 sectors: proportional to leaf count, clamped to MIN_SECTOR, renormalized to 2π.
  const top = kids[board.rootId] ?? [];
  const weights = top.map((c) => countLeaves(c, new Set()));
  const totalLeaves = weights.reduce((s, w) => s + w, 0) || 1;
  let spans = weights.map((w) => Math.max((2 * Math.PI * w) / totalLeaves, MIN_SECTOR));
  const spanSum = spans.reduce((s, v) => s + v, 0) || 1;
  spans = spans.map((s) => (s * 2 * Math.PI) / spanSum);

  depthOf[board.rootId] = 0;
  let a = START;
  top.forEach((c, i) => { assign(c, a, a + spans[i], 1); a += spans[i]; });

  // Ring radii: start at R0 + (d-1)*DR, then grow until the tightest adjacent pair on the
  // ring fits a card chord, and never come closer than a card height to the inner ring.
  const byDepth = new Map<number, string[]>();
  let maxDepth = 0;
  for (const id of Object.keys(angle)) {
    const d = depthOf[id];
    maxDepth = Math.max(maxDepth, d);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  const need = cw + RING_GAP;                       // min center-to-center chord on a ring
  const radius: number[] = [0];                     // depth 0 = root at the center
  for (let d = 1; d <= maxDepth; d++) {
    let r = Math.max(R0 + (d - 1) * DR, radius[d - 1] + maxH + RING_GAP);
    const ring = (byDepth.get(d) ?? []).map((id) => angle[id]).sort((p, q) => p - q);
    if (ring.length > 1) {
      let minGap = ring[0] + 2 * Math.PI - ring[ring.length - 1];   // wraparound gap
      for (let i = 1; i < ring.length; i++) minGap = Math.min(minGap, ring[i] - ring[i - 1]);
      if (minGap > 1e-9 && minGap < Math.PI) r = Math.max(r, need / (2 * Math.sin(minGap / 2)));
    }
    radius.push(r);
  }

  // Place: node center on its ring, stored as top-left for React Flow. Root dead center.
  pos[board.rootId] = { x: -cw / 2, y: -h(board.rootId) / 2 };
  for (const id of Object.keys(angle)) {
    const r = radius[depthOf[id]];
    pos[id] = { x: r * Math.cos(angle[id]) - cw / 2, y: r * Math.sin(angle[id]) - h(id) / 2 };
  }

  // Orphans (no parent) get parked below the outermost ring so nothing is lost.
  const hasParent = new Set<string>();
  for (const list of Object.values(kids)) for (const c of list) hasParent.add(c);
  let cursor = (radius[maxDepth] ?? 0) + maxH + 80;
  for (const n of board.nodes) {
    if (!pos[n.id] && !hasParent.has(n.id)) { pos[n.id] = { x: -cw / 2, y: cursor }; cursor += h(n.id) + ORPHAN_GAP; }
  }
  return pos;
}
