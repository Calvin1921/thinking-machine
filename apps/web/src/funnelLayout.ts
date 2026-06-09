import type { Board } from "@tm/core/schema";

const CARD_W = 230;        // approx card width, for centering
const MIN_SLOT = 300;      // min horizontal room per child — guarantees no overlap
const TOP_WIDTH = 1500;    // horizontal spread of the first (widest) band
const STEP = 200;          // width removed per band → the taper (clamped by MIN_SLOT*n)
const ROOT_DROP = 210;     // gap from root down to the first stage band
const BAND_H = 430;        // vertical distance between stage bands
const STAGE_TO_CHILD = 170;// gap from a stage card down to its probe row
const DEFAULT_H = 150;
const GAP = 40;

/**
 * Funnel layout: the root's direct children are the funnel's stages, stacked
 * top→bottom in edge order down a centered spine. Each stage's probe children spread
 * across a centered row whose width tapers every band (TOP_WIDTH - i*STEP), clamped so
 * it never shrinks below the width its cards need (MIN_SLOT*n) — wide intake at the top
 * narrowing to a steady channel, overlap-free. Deeper descendants (rare) fall back to a
 * stacked column to the right of their parent. Dependency edges are ignored for
 * positioning. Returns top-left {x,y} per node id.
 */
export function funnelLayout(
  board: Board,
  heights: Record<string, number> = {},
): Record<string, { x: number; y: number }> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);

  const h = (id: string) => heights[id] || DEFAULT_H;
  const pos: Record<string, { x: number; y: number }> = {};

  // Lay a horizontal, centered row of `ids` at vertical `y`, spread across `width`.
  const row = (ids: string[], y: number, width: number) => {
    const n = ids.length;
    if (n === 0) return;
    const slot = width / n;
    ids.forEach((id, k) => {
      const cx = -width / 2 + slot * (k + 0.5);   // center of this child's slot
      pos[id] = { x: cx - CARD_W / 2, y };
      placeDeep(id, cx - CARD_W / 2, y);
    });
  };

  // Fallback for any level-3+ descendants: stack them in a column to the parent's right.
  const placeDeep = (parent: string, px: number, py: number) => {
    let cursor = py;
    for (const c of kids[parent] ?? []) {
      if (pos[c]) continue;
      pos[c] = { x: px + CARD_W + 70, y: cursor };
      cursor += h(c) + GAP;
      placeDeep(c, px + CARD_W + 70, pos[c].y);
    }
  };

  pos[board.rootId] = { x: -CARD_W / 2, y: 0 };
  const stages = kids[board.rootId] ?? [];
  stages.forEach((stageId, i) => {
    const stageY = ROOT_DROP + i * BAND_H;
    pos[stageId] = { x: -CARD_W / 2, y: stageY };     // stage cards form the central spine
    const cs = kids[stageId] ?? [];
    const width = Math.max(MIN_SLOT * Math.max(cs.length, 1), TOP_WIDTH - i * STEP);
    row(cs, stageY + STAGE_TO_CHILD, width);
  });

  // Orphans (no parent) get parked below the funnel so nothing is lost.
  const hasParent = new Set<string>();
  for (const list of Object.values(kids)) for (const c of list) hasParent.add(c);
  let cursor = ROOT_DROP + stages.length * BAND_H + 80;
  for (const n of board.nodes) {
    if (!pos[n.id] && !hasParent.has(n.id)) { pos[n.id] = { x: -CARD_W / 2, y: cursor }; cursor += h(n.id) + GAP; }
  }
  return pos;
}
