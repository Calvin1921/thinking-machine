import type { Board } from "@tm/core/schema";

const CARD_W = 230;        // approx card width, for centering
const ROOT_DROP = 230;     // gap from root down to the first stage band
const BAND_H = 380;        // vertical distance between stage bands
const STAGE_TO_CHILD = 165;// gap from a stage card down to its probe row
const TOP_WIDTH = 1240;    // horizontal spread of the first (widest) band
const SHRINK = 0.16;       // each band narrows by this fraction → the funnel taper
const MIN_WIDTH = 260;     // narrowest band (the "paying customers" tip)
const DEFAULT_H = 130;
const GAP = 40;

/**
 * Funnel layout: the root's direct children are the funnel's stages, stacked
 * top→bottom in edge order. Each stage's probe children spread across a row whose
 * width shrinks every band, so the nodes themselves draw a funnel — wide intake at
 * the top, narrowing to the few at the bottom. Deeper descendants (rare) fall back to
 * a stacked column to the right of their parent. Dependency edges are ignored for
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
    if (n === 1) { pos[ids[0]] = { x: -CARD_W / 2, y }; placeDeep(ids[0], -CARD_W / 2, y); return; }
    const slot = width / n;
    ids.forEach((id, k) => {
      const cx = -width / 2 + slot * (k + 0.5);
      pos[id] = { x: cx - CARD_W / 2, y };
      placeDeep(id, cx - CARD_W / 2, y);
    });
  };

  // Fallback for any level-3+ descendants: stack them in a column to the parent's right.
  const placeDeep = (parent: string, px: number, py: number) => {
    const cs = kids[parent] ?? [];
    let cursor = py;
    for (const c of cs) {
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
    pos[stageId] = { x: -CARD_W / 2, y: stageY };
    const width = Math.max(MIN_WIDTH, TOP_WIDTH * (1 - i * SHRINK));
    row(kids[stageId] ?? [], stageY + STAGE_TO_CHILD, width);
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
