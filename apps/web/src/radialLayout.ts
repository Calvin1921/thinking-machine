import type { Board } from "@tm/core/schema";

const CARD_W = 230;
const DEFAULT_H = 120;
const R0 = 430;                    // radius of the first ring (depth 1)
const DR = 360;                    // radius added per further ring
const RING_GAP = 60;               // min chord clearance between adjacent cards on a ring
const ROW_GAP = 40;                // radial gap between rows of an arc band
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
 * Each parent packs its depth-d children inside its own angular wedge across multiple
 * concentric rows: row k sits at bandBase + k*(hypot(cardW, maxH) + ROW_GAP); per-row capacity is
 * floor(span·R_row / pitch) with pitch = cardW + RING_GAP, rows centered angularly on the
 * wedge and filled outward. The band base is shared by the whole depth (so depth still reads
 * radially) and grows just enough that every parent with ≥3 children fits one card per row
 * inside its wedge (capped at BAND_GROW_CAP× natural). MIXED children: branch children pack into the
 * earliest rows (they keep their assigned angular sub-spans for their own subtrees), leaf
 * children fill the rows under/after them — cards never leave the parent's wedge, so
 * neighboring wedges can never collide no matter how their bands overlap radially.
 * TINY wedges (span·base < pitch even after growth — only parents with few children, since
 * span ∝ leaf count): their children stack as a single radial column on the wedge midline,
 * lifted just above any tier-A band within a card's reach of the column; angularly adjacent
 * tiny columns chain one after another radially (incl. wraparound) so their span-overflowing
 * cards never touch.
 *
 * No-overlap guarantee: ring mode via the chord rule; band mode because row spacing is exactly
 * one pitch (cards spaced ≥ cardW + RING_GAP center-to-center, which exceeds the
 * hypot(cardW, cardH) axis-aligned overlap threshold) and rows step by that same hypot; every
 * card stays within its parent's wedge and tiny columns sit radially clear of everything else
 * at their depth. Each depth starts ≥ hypot outside the previous depth. Deterministic — no
 * measurement loops. Returns top-left {x,y} per node id, centered on the root at (0,0).
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
  // Children of `p` at depth `d`, branches first (each class keeps its original order):
  // branches land in the earliest band rows, leaves fill under them.
  const bandChildren = (p: string, d: number): string[] => {
    const cs = (kids[p] ?? []).filter((c) => depthOf[c] === d && parentOf[c] === p);
    return [...cs.filter((c) => (kids[c] ?? []).length > 0), ...cs.filter((c) => (kids[c] ?? []).length === 0)];
  };

  const need = cw + RING_GAP;                       // min center-to-center pitch (chord or arc)
  // Cards are AXIS-ALIGNED rects: two centers ≥ hypot(w,h) apart can never overlap regardless
  // of direction (dx² + dy² ≥ w² + h² forbids dx < w AND dy < h). Radial steps must use this,
  // not just the card height — a radial stack near 3 o'clock separates cards horizontally.
  const safe = Math.hypot(cw, maxH);
  const rowStep = safe + ROW_GAP;
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

      // Shared band base: grow so every ≥3-child wedge fits one card per row (capped 3× natural).
      let r0 = natural;
      for (const p of parents) {
        if (bandChildren(p, d).length < BAND_GROW_MIN_KIDS) continue;
        const req = need / widthOf(p);
        if (req <= BAND_GROW_CAP * natural) r0 = Math.max(r0, req);
      }
      depthMax = r0;

      const tiny: string[] = [];
      const bands: { s0: number; s1: number; end: number }[] = [];
      for (const p of parents) {
        const w = widthOf(p);
        if (w * r0 + EPS < need) { tiny.push(p); continue; }
        // Tier A: rows of floor(span·r / pitch) cards, pitch-spaced, centered on the wedge.
        const ordered = bandChildren(p, d);
        const mid = (span0[p] + span1[p]) / 2;
        let end = r0;
        for (let i = 0, k = 0; i < ordered.length; k++) {
          const r = r0 + k * rowStep;
          const cap = Math.max(1, Math.floor((w * r) / need + EPS));
          const m = Math.min(cap, ordered.length - i);
          const step = need / r;                    // pitch as an angle on this row
          for (let j = 0; j < m; j++) place(ordered[i + j], r, mid + (j - (m - 1) / 2) * step);
          end = r;
          i += m;
        }
        bands.push({ s0: span0[p], s1: span1[p], end });
        depthMax = Math.max(depthMax, end);
      }

      // Tiny wedges: single radial column on the wedge midline, lifted just above any tier-A
      // band within a card's reach of the column; angularly adjacent columns chain radially
      // (incl. wraparound) so their span-overflowing cards never touch.
      if (tiny.length) {
        tiny.sort((p, q) => (span0[p] + span1[p]) / 2 - (span0[q] + span1[q]) / 2);
        const mids = tiny.map((p) => (span0[p] + span1[p]) / 2);
        const close = (x: number, y: number): boolean => {
          let g = Math.abs(x - y);
          g = Math.min(g, 2 * Math.PI - g);
          return g < Math.PI && 2 * r0 * Math.sin(g / 2) < need;
        };
        const clusters: number[][] = [];
        for (let i = 0; i < tiny.length; i++) {
          if (i > 0 && close(mids[i], mids[i - 1])) clusters[clusters.length - 1].push(i);
          else clusters.push([i]);
        }
        if (clusters.length > 1 && close(mids[0], mids[mids.length - 1])) {
          const last = clusters.pop()!;
          clusters[0] = [...last, ...clusters[0]];  // wraparound: merge into one radial chain
        }
        // wrap-aware angular distance from a point to a wedge interval
        const distTo = (mid: number, s0: number, s1: number): number => {
          const dd = ((mid - s0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          return dd <= s1 - s0 ? 0 : Math.min(dd - (s1 - s0), 2 * Math.PI - dd);
        };
        for (const cl of clusters) {
          let base = r0;
          for (const idx of cl)
            for (const b of bands)
              if (distTo(mids[idx], b.s0, b.s1) * r0 < need) base = Math.max(base, b.end + rowStep);
          let r = base;
          for (const idx of cl) {
            for (const c of bandChildren(tiny[idx], d)) {
              place(c, r, mids[idx]);
              depthMax = Math.max(depthMax, r);
              r += rowStep;
            }
          }
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
  return pos;
}
