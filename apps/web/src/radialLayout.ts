import type { Board } from "@tm/core/schema";

const CARD_W = 230;
const DEFAULT_H = 120;
const R0 = 430;                    // radius of the first ring (depth 1)
const DR = 360;                    // radius added per further ring
const RING_GAP = 60;               // min chord clearance between adjacent cards on a ring
const ROW_GAP = 40;                // radial gap between rows of an arc band (also the bump margin)
const MIN_SECTOR = Math.PI / 12;   // 15° — a tiny subtree still gets a readable wedge
const START = -Math.PI / 2;        // 12 o'clock; angles grow clockwise (screen y points down)
const ORPHAN_GAP = 40;
const BAND_EXTRA = 2 * DR;         // band a depth (≥2) when one shared ring would overshoot its natural radius by > 2 rings
const BAND_GROW_CAP = 3;           // band base may grow to fit a wedge only up to 3× the natural radius
const BAND_GROW_MIN_KIDS = 3;      // only parents with ≥3 children may push the band base outward to fit their wedge
const EPS = 1e-6;

/**
 * Radial / ecosystem layout: the root sits at the CENTER; each of its direct children owns
 * an angular SECTOR sized proportionally to its subtree's leaf count (clamped to MIN_SECTOR
 * so small sectors stay readable, then renormalized to a full circle). Deeper nodes split
 * their parent's span proportionally to their own leaf counts.
 *
 * Each depth is placed in one of two modes, decided per depth:
 *
 * RING (small wheels): every node at depth d sits on one shared ring. The ring starts at its
 * natural radius (R0 + (d-1)*DR, at least a card height outside the previous depth) and grows
 * until the tightest adjacent angular gap fits a card chord (2R·sin(gap/2) ≥ cardW + RING_GAP).
 *
 * ARC BANDS (dense wheels, HK-AI-ecosystem style): TRIGGER — when the chord rule would push
 * the shared ring more than BAND_EXTRA (= 2·DR, two ring-widths) beyond its natural radius,
 * the depth switches to bands (depth 1 always stays a ring — the sectors ARE the wheel hub).
 * Each parent packs its depth-d LEAF children inside its own angular wedge across multiple
 * concentric rows: row k sits at bandBase + k*(hypot(cardW, maxH) + ROW_GAP); per-row capacity
 * is floor(span·R_row / pitch) with pitch = cardW + RING_GAP, and the row's cards are spread
 * EVENLY across the whole wedge (angular step = span/m, never below pitch/R thanks to the
 * capacity cap) so bands read as uniformly filled annular blocks with no leftover clumps.
 * The band base is shared by the whole depth (so depth still reads radially) and grows just
 * enough that every parent with ≥3 children fits one card per row inside its wedge (capped at
 * BAND_GROW_CAP× natural). Leaf cards never leave the parent's wedge, so neighboring wedges
 * can never collide no matter how their bands overlap radially.
 *
 * BRANCH children of a band parent (companies that themselves have product atoms) sit on the
 * OUTER edge of their parent's band — a one-card radial column on their OWN span midline,
 * starting just outside the last leaf row and bumped outward in rowStep increments until the
 * card clears every already-placed rect. Their subtrees keep the assigned angular sub-spans.
 * Putting branches outside (not inside) the leaf rows means the radial chain to their own
 * children continues outward without ever piercing the leaf rows.
 *
 * TINY wedges (span·base < pitch even after growth — only parents with few children, since
 * span ∝ leaf count): all children stack as a single radial chain on the wedge midline,
 * starting at the band base (just outside the parent's level) and bump-lifted per card only
 * past rects it would actually touch — never escaping the sector's angular range and never
 * chained above unrelated bands.
 *
 * No-overlap guarantee: ring mode via the chord rule; band leaf rows because the even angular
 * step is ≥ pitch/R (cards ≥ cardW + RING_GAP apart in-row, exceeding the hypot(cardW, cardH)
 * axis-aligned threshold), rows across all wedges share one radius grid stepping by
 * hypot + ROW_GAP, and edge cards stay ≥ half a pitch inside their wedge; branch columns and
 * tiny chains are placed with an explicit rect-clearance check against everything already
 * placed. Each depth starts ≥ hypot outside the previous depth. Deterministic — no
 * measurement loops. Returns top-left {x,y} per node id, centered on the root at (0,0).
 */
export function radialLayout(
  board: Board,
  heights: Record<string, number> = {},
  cell?: { w: number; h: number },   // uniform cell → equal cards, even rings
): Record<string, { x: number; y: number }> {
  return compute(board, heights, cell).pos;
}

/**
 * Edge re-routing plan, exported for the renderer (boardToFlow). EVERY decomposition child
 * keeps exactly one drawn hierarchy edge, but inside arc bands a straight parent→child line
 * would often pierce the rows or columns in between. So band children are wired by GEOMETRIC
 * VALIDATION, in placement order per brood: a child draws straight from its parent whenever
 * that line passes no other card; otherwise it threads from the nearest already-wired
 * sibling whose line is unobstructed. The result is a spanning tree of short, local,
 * crossing-free segments — inner rows fan from the parent, outer rows fan from the row
 * below, chains and staircases thread card to card.
 *
 * The map holds child → drawn-from substitute; children absent from the map draw straight
 * from their parent (all ring-mode levels — small wheels are untouched). Recomputed
 * structurally from the board so the renderer needs no layout handshake; pass the same
 * uniform cell the board was arranged with.
 */
export function radialEdgeRewires(board: Board, cell?: { w: number; h: number }): Map<string, string> {
  return compute(board, {}, cell).rewire;
}

function compute(
  board: Board,
  heights: Record<string, number>,
  cell?: { w: number; h: number },
): { pos: Record<string, { x: number; y: number }>; rewire: Map<string, string> } {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);

  const cw = cell ? cell.w : CARD_W;
  const h = (id: string) => (cell ? cell.h : heights[id] || DEFAULT_H);
  const maxH = cell ? cell.h : Math.max(DEFAULT_H, ...Object.values(heights).map((v) => v || 0));
  const pos: Record<string, { x: number; y: number }> = {};
  const rewire = new Map<string, string>();

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

  // Recursively hand each node its angular span; children split the span proportionally to
  // their own leaf counts (so leaves end up evenly spaced in a sector). Span + parent are
  // kept so band mode can pack children inside the parent's wedge.
  const angle: Record<string, number> = {};
  const span0: Record<string, number> = {};
  const span1: Record<string, number> = {};
  const depthOf: Record<string, number> = {};
  const parentOf: Record<string, string> = {};
  const assign = (id: string, a0: number, a1: number, depth: number, parent: string): void => {
    if (angle[id] !== undefined) return;            // shared node / cycle guard
    angle[id] = (a0 + a1) / 2;
    span0[id] = a0;
    span1[id] = a1;
    depthOf[id] = depth;
    parentOf[id] = parent;
    const cs = kids[id] ?? [];
    if (!cs.length) return;
    const total = cs.reduce((s, c) => s + countLeaves(c, new Set()), 0) || 1;
    let a = a0;
    for (const c of cs) {
      const w = (a1 - a0) * (countLeaves(c, new Set()) / total);
      assign(c, a, a + w, depth + 1, id);
      a += w;
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
  span0[board.rootId] = START;
  span1[board.rootId] = START + 2 * Math.PI;
  let a = START;
  top.forEach((c, i) => { assign(c, a, a + spans[i], 1, board.rootId); a += spans[i]; });

  const byDepth = new Map<number, string[]>();
  let maxDepth = 0;
  for (const id of Object.keys(angle)) {
    const d = depthOf[id];
    maxDepth = Math.max(maxDepth, d);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }

  const place = (id: string, r: number, at: number): void => {
    pos[id] = { x: r * Math.cos(at) - cw / 2, y: r * Math.sin(at) - h(id) / 2 };
  };
  // Children of `p` at depth `d` in their original order.
  const childrenAt = (p: string, d: number): string[] =>
    (kids[p] ?? []).filter((c) => depthOf[c] === d && parentOf[c] === p);

  const need = cw + RING_GAP;                       // min center-to-center pitch (chord or arc)
  // Cards are AXIS-ALIGNED rects: two centers ≥ hypot(w,h) apart can never overlap regardless
  // of direction (dx² + dy² ≥ w² + h² forbids dx < w AND dy < h). Radial steps must use this,
  // not just the card height — a radial stack near 3 o'clock separates cards horizontally.
  const safe = Math.hypot(cw, maxH);
  const rowStep = safe + ROW_GAP;

  // Would a card for `id` centered at (r, at) come within ROW_GAP of any placed rect?
  const blocked = (id: string, r: number, at: number): boolean => {
    const x = r * Math.cos(at) - cw / 2, y = r * Math.sin(at) - h(id) / 2, hh = h(id);
    for (const q of Object.keys(pos)) {
      const p = pos[q], qh = h(q);
      if (x < p.x + cw + ROW_GAP && p.x < x + cw + ROW_GAP && y < p.y + qh + ROW_GAP && p.y < y + hh + ROW_GAP) return true;
    }
    return false;
  };

  const center = (id: string) => ({ x: pos[id].x + cw / 2, y: pos[id].y + h(id) / 2 });
  const dist2 = (a: string, b: string): number => {
    const A = center(a), B = center(b);
    return (A.x - B.x) ** 2 + (A.y - B.y) ** 2;
  };
  // Straight segment a→b (center to center) vs every other placed rect (Liang–Barsky,
  // rects shrunk by ½px so shared borders don't count). True when nothing is pierced.
  const lineClear = (a: string, b: string): boolean => {
    const A = center(a), B = center(b);
    const dx = B.x - A.x, dy = B.y - A.y;
    for (const q of Object.keys(pos)) {
      if (q === a || q === b) continue;
      const r = pos[q];
      const x0 = r.x + 0.5, y0 = r.y + 0.5, x1 = r.x + cw - 0.5, y1 = r.y + h(q) - 0.5;
      let t0 = 0, t1 = 1, hit = true;
      for (const [pp, qq] of [[-dx, A.x - x0], [dx, x1 - A.x], [-dy, A.y - y0], [dy, y1 - A.y]] as const) {
        if (Math.abs(pp) < 1e-12) { if (qq < 0) { hit = false; break; } continue; }
        const t = qq / pp;
        if (pp < 0) { if (t > t1) { hit = false; break; } if (t > t0) t0 = t; }
        else { if (t < t0) { hit = false; break; } if (t < t1) t1 = t; }
      }
      if (hit) return false;
    }
    return true;
  };

  let prevMax = 0;                                  // outermost row/ring center radius so far
  for (let d = 1; d <= maxDepth; d++) {
    const ids = byDepth.get(d) ?? [];
    const natural = Math.max(R0 + (d - 1) * DR, prevMax + safe + RING_GAP);
    // Radius one shared ring would need under the chord rule.
    const ring = ids.map((id) => angle[id]).sort((p, q) => p - q);
    let chordR = 0;
    if (ring.length > 1) {
      let minGap = ring[0] + 2 * Math.PI - ring[ring.length - 1];   // wraparound gap
      for (let i = 1; i < ring.length; i++) minGap = Math.min(minGap, ring[i] - ring[i - 1]);
      if (minGap > EPS && minGap < Math.PI) chordR = need / (2 * Math.sin(minGap / 2));
    }
    let depthMax = natural;

    if (d === 1 || chordR <= natural + BAND_EXTRA) {
      // RING mode — exactly the original single-ring behavior.
      const r = Math.max(natural, chordR);
      for (const id of ids) place(id, r, angle[id]);
      depthMax = r;
    } else {
      // BAND mode — pack each parent's children inside its own wedge.
      const parents: string[] = [];
      const seen = new Set<string>();
      for (const id of ids) { const p = parentOf[id]; if (!seen.has(p)) { seen.add(p); parents.push(p); } }
      const widthOf = (p: string) => span1[p] - span0[p];

      // Shared band base: grow so every ≥3-child wedge fits one card per row (capped 3×
      // natural) — but only ACCEPT the growth if some wedge then fits ≥2 cards per row.
      // Growth that buys nothing but 1-wide columns is pointless: a tucked chain gives the
      // same column without inflating the whole wheel (the depth-4 product-atom case).
      let r0 = natural;
      for (const p of parents) {
        if (childrenAt(p, d).length < BAND_GROW_MIN_KIDS) continue;
        const req = need / widthOf(p);
        if (req <= BAND_GROW_CAP * natural) r0 = Math.max(r0, req);
      }
      if (!parents.some((p) => Math.floor((widthOf(p) * r0) / need + EPS) >= 2)) r0 = natural;
      depthMax = r0;

      // PASS 1 — tier-A leaf rows, evenly spread across each wedge. Analytic, no checks
      // needed: even step ≥ pitch/R within a row, all wedges share one radius grid, and
      // edge cards stay ≥ half a pitch inside the wedge boundary.
      // PASS 2 (collected here, placed after) — radial columns with rect-clearance bumps:
      // branch children on their own span midline just outside the leaf rows, and whole
      // chains on the wedge midline for tiny wedges.
      const cols: { at: number; ids: string[]; start: number }[] = [];
      const broodOrder: Record<string, string[]> = {};  // children in placement order, for wiring
      for (const p of parents) {
        const w = widthOf(p);
        const cs = childrenAt(p, d);
        const mid = (span0[p] + span1[p]) / 2;
        if (w * r0 + EPS < need) {
          // TINY wedge → one chain anchored on the PARENT's placed angle (= its span midline
          // for ring/column parents; for parents that themselves live in a chain, the same
          // thread), branches LAST so a branch's own next-depth chain continues straight up
          // without the connecting edge piercing stacked siblings.
          const pc = pos[p];
          const at = pc ? Math.atan2(pc.y + h(p) / 2, pc.x + cw / 2) : mid;
          const ordered = [...cs.filter((c) => (kids[c] ?? []).length === 0), ...cs.filter((c) => (kids[c] ?? []).length > 0)];
          cols.push({ at, ids: ordered, start: r0 });
          broodOrder[p] = ordered;
          continue;
        }
        const leaves = cs.filter((c) => (kids[c] ?? []).length === 0);
        const branches = cs.filter((c) => (kids[c] ?? []).length > 0);
        let end = r0 - rowStep;                     // last leaf row (none yet)
        for (let i = 0, k = 0; i < leaves.length; k++) {
          const r = r0 + k * rowStep;
          const cap = Math.max(1, Math.floor((w * r) / need + EPS));
          const m = Math.min(cap, leaves.length - i);
          const step = w / m;                       // EVEN spread (≥ need/r since m ≤ w·r/need)
          for (let j = 0; j < m; j++) place(leaves[i + j], r, mid + (j - (m - 1) / 2) * step);
          end = r;
          i += m;
        }
        if (leaves.length) depthMax = Math.max(depthMax, end);
        for (const c of branches) cols.push({ at: (span0[c] + span1[c]) / 2, ids: [c], start: end + rowStep });
        broodOrder[p] = [...leaves, ...branches];   // rows inner→outer, then band-edge columns
      }
      for (const col of cols) {
        let r = Math.max(col.start, r0);
        for (const c of col.ids) {
          while (blocked(c, r, col.at)) r += rowStep;
          place(c, r, col.at);
          depthMax = Math.max(depthMax, r);
          r += rowStep;
        }
      }
      // WIRING (after the whole depth is placed — see radialEdgeRewires): each child keeps
      // one drawn edge; prefer the straight line from the parent, else thread from the
      // nearest already-wired sibling whose line is unobstructed, else from the nearest
      // placed card anywhere with a clear line (tight clusters of near-coincident columns).
      // Deeper depths always sit ≥ hypot beyond this one, so later placement can never
      // invalidate these segments.
      for (const p of parents) {
        const wired: string[] = [];
        for (const c of broodOrder[p]) {
          if (!(pos[p] && lineClear(p, c))) {
            const near = [...wired].sort((a, b2) => dist2(a, c) - dist2(b2, c));
            let src = near.find((s) => lineClear(s, c));
            if (!src) {
              const all = Object.keys(pos).filter((q) => q !== c && q !== p)
                .sort((a, b2) => dist2(a, c) - dist2(b2, c));
              src = all.find((s) => lineClear(s, c)) ?? near[0] ?? all[0];
            }
            if (src) rewire.set(c, src);
          }
          wired.push(c);
        }
      }
    }
    prevMax = depthMax;
  }

  // Place root dead center (stored as top-left for React Flow).
  pos[board.rootId] = { x: -cw / 2, y: -h(board.rootId) / 2 };

  // Orphans (no parent) get parked below the outermost ring so nothing is lost.
  const hasParent = new Set<string>();
  for (const list of Object.values(kids)) for (const c of list) hasParent.add(c);
  let cursor = prevMax + safe + 80;
  for (const n of board.nodes) {
    if (!pos[n.id] && !hasParent.has(n.id)) { pos[n.id] = { x: -cw / 2, y: cursor }; cursor += h(n.id) + ORPHAN_GAP; }
  }
  return { pos, rewire };
}
