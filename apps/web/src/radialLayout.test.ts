// apps/web/src/radialLayout.test.ts
import { describe, it, expect } from "vitest";
import { radialLayout, radialEdgeRewires } from "./radialLayout.js";
import { boardToFlow } from "./boardToFlow.js";
import { newBoard, addNode } from "@tm/core";
import type { Board } from "@tm/core/schema";

const CARD_W = 230, DEFAULT_H = 120;
const center = (p: { x: number; y: number }, h = DEFAULT_H) => ({ x: p.x + CARD_W / 2, y: p.y + h / 2 });

/**
 * 12 sectors × 5 categories (the first one wide: 10 companies, the rest 5), plus 3 product
 * atoms under the first company of the first three sectors (depth-4 chains) — the
 * genai-mega-wheel stress shape, ~440 nodes with uneven wedges, multi-card band rows,
 * band-edge branch companies AND tiny-wedge chains all present at once.
 */
function megaWheel(): Board {
  let b = newBoard("Mega", "concept");
  for (let s = 0; s < 12; s++) {
    b = addNode(b, { label: `S${s}`, parentId: "root", kind: "branch" });
    const sid = b.nodes.at(-1)!.id;
    for (let c = 0; c < 5; c++) {
      b = addNode(b, { label: `S${s}C${c}`, parentId: sid, kind: "branch" });
      const cid = b.nodes.at(-1)!.id;
      for (let l = 0; l < (c === 0 ? 10 : 5); l++) {
        b = addNode(b, { label: `S${s}C${c}L${l}`, parentId: cid, kind: "atom" });
        if (s < 3 && c === 0 && l === 0) {
          const lid = b.nodes.at(-1)!.id;
          for (let p = 0; p < 3; p++) b = addNode(b, { label: `S${s}P${p}`, parentId: lid, kind: "atom" });
        }
      }
    }
  }
  return b;
}

/** Straight segment a→b vs axis-aligned rect (Liang-Barsky); true if they intersect. */
function segHitsRect(ax: number, ay: number, bx: number, by: number, r: { x: number; y: number; w: number; h: number }): boolean {
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, ax - r.x) && clip(dx, r.x + r.w - ax) && clip(-dy, ay - r.y) && clip(dy, r.y + r.h - ay);
}

/** root with `sectors` children, each with `leaves` atoms — a mini ecosystem map. */
function ecosystem(sectors: number, leaves: number): Board {
  let b = newBoard("Eco", "concept");
  for (let i = 0; i < sectors; i++) {
    b = addNode(b, { label: `S${i}`, parentId: "root", kind: "branch" });
    const sid = b.nodes.at(-1)!.id;
    for (let j = 0; j < leaves; j++) b = addNode(b, { label: `S${i}L${j}`, parentId: sid, kind: "atom" });
  }
  return b;
}

describe("radialLayout", () => {
  it("puts the root dead center and every depth on its own ring", () => {
    const b = ecosystem(4, 3);
    const pos = radialLayout(b);
    expect(center(pos.root)).toEqual({ x: 0, y: 0 });
    const r = (id: string) => Math.hypot(center(pos[id]).x, center(pos[id]).y);
    const l1 = b.nodes.filter((n) => n.kind === "branch").map((n) => r(n.id));
    const l2 = b.nodes.filter((n) => n.kind === "atom").map((n) => r(n.id));
    // same depth → same radius; deeper ring strictly outside the inner one
    for (const v of l1) expect(v).toBeCloseTo(l1[0], 6);
    for (const v of l2) expect(v).toBeCloseTo(l2[0], 6);
    expect(l2[0]).toBeGreaterThan(l1[0]);
  });

  it("starts the first sector at 12 o'clock, going clockwise", () => {
    const b = ecosystem(4, 1); // equal sectors of 90°: midpoints at -45°, 45°, 135°, 225°
    const pos = radialLayout(b);
    const first = b.nodes.find((n) => n.label === "S0")!.id;
    const c = center(pos[first]);
    expect(c.x).toBeGreaterThan(0);  // -45° → upper-right of the center
    expect(c.y).toBeLessThan(0);
    const second = b.nodes.find((n) => n.label === "S1")!.id;
    const c2 = center(pos[second]);
    expect(c2.x).toBeGreaterThan(0); // 45° → lower-right: clockwise from S0
    expect(c2.y).toBeGreaterThan(0);
  });

  it("never lets two cards on the same ring come closer than a card width", () => {
    const b = ecosystem(6, 6); // 36 leaves on the outer ring — forces the chord bump
    const pos = radialLayout(b);
    const atoms = b.nodes.filter((n) => n.kind === "atom").map((n) => center(pos[n.id]));
    for (let i = 0; i < atoms.length; i++)
      for (let j = i + 1; j < atoms.length; j++) {
        const d = Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y);
        expect(d).toBeGreaterThanOrEqual(CARD_W);
      }
  });

  it("gives a tiny subtree a readable minimum sector and respects the uniform cell", () => {
    let b = ecosystem(2, 10);
    b = addNode(b, { label: "Tiny", parentId: "root", kind: "branch" }); // 1 leaf vs 10+10
    const cell = { w: 300, h: 160 };
    const pos = radialLayout(b, {}, cell);
    const tiny = b.nodes.find((n) => n.label === "Tiny")!.id;
    expect(pos[tiny]).toBeDefined();
    // root centered with the cell size, not the default card size
    expect(pos.root.x).toBeCloseTo(-cell.w / 2);
    expect(pos.root.y).toBeCloseTo(-cell.h / 2);
  });

  it("is deterministic", () => {
    const b = ecosystem(5, 4);
    expect(radialLayout(b)).toEqual(radialLayout(b));
  });

  it("arc-band packs a mega wheel: zero rect overlaps and a sane max radius", () => {
    const b = megaWheel();
    const pos = radialLayout(b);
    // zero axis-aligned rectangle intersections across ALL nodes
    const rects = b.nodes.map((n) => ({ id: n.id, x: pos[n.id].x, y: pos[n.id].y, w: CARD_W, h: DEFAULT_H }));
    const overlaps: string[] = [];
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], c = rects[j];
        if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h)
          overlaps.push(`${a.id}×${c.id}`);
      }
    expect(overlaps).toEqual([]);
    // every card stays within a sane wheel radius
    const maxR = Math.max(...b.nodes.map((n) => Math.hypot(center(pos[n.id]).x, center(pos[n.id]).y)));
    expect(maxR).toBeLessThan(6000);
  });

  it("spreads band rows evenly across the parent's wedge", () => {
    // 3 sectors × 20 leaves → depth 2 goes band mode with multi-card rows per wedge.
    const b = ecosystem(3, 20);
    const pos = radialLayout(b);
    const sectors = b.nodes.filter((n) => n.kind === "branch");
    for (const s of sectors) {
      const leafIds = b.edges.filter((e) => e.from === s.id).map((e) => e.to);
      // group the sector's leaves by row (shared radius)
      const sc = center(pos[s.id]);
      const mid = Math.atan2(sc.y, sc.x);                    // sector midline (wedge center)
      const rows = new Map<number, number[]>();
      for (const id of leafIds) {
        const c = center(pos[id]);
        const r = Math.round(Math.hypot(c.x, c.y));
        // angle RELATIVE to the sector midline, unwrapped to (-π, π] — avoids the atan2 seam
        const at = ((Math.atan2(c.y, c.x) - mid + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        if (!rows.has(r)) rows.set(r, []);
        rows.get(r)!.push(at);
      }
      for (const angles of rows.values()) {
        if (angles.length < 3) continue;
        angles.sort((p, q) => p - q);
        const gaps = angles.slice(1).map((v, i) => v - angles[i]);
        // even distribution: every in-row angular gap equals span/m, not the packed pitch
        for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
      }
    }
  });

  it("draws every hierarchy edge without passing through a foreign card", () => {
    let b = megaWheel();
    const pos = radialLayout(b);
    b = { ...b, layout: "radial", nodes: b.nodes.map((n) => ({ ...n, x: pos[n.id].x, y: pos[n.id].y })) };

    // band children are rewired to a nearest neighbor, never dropped
    const rewire = radialEdgeRewires(b);
    const byLabel = (l: string) => b.nodes.find((n) => n.label === l)!.id;
    expect(rewire.has(byLabel("S0"))).toBe(false);      // sector (ring level) → straight spoke
    expect(rewire.get(byLabel("S0P1"))).toBe(byLabel("S0P0")); // chain threads card-to-card

    const { edges } = boardToFlow(b);
    const hier = edges.filter((e) => e.data?.type === "hierarchy");
    const total = b.edges.filter((e) => e.type === "decomposition").length;
    expect(hier.length).toBe(total);                    // NO edge is dropped, only rerouted
    // every decomposition child keeps exactly one drawn incoming edge
    const incoming = new Map<string, number>();
    for (const e of hier) incoming.set(e.target as string, (incoming.get(e.target as string) ?? 0) + 1);
    for (const e of b.edges) if (e.type === "decomposition") expect(incoming.get(e.to)).toBe(1);

    // zero straight-segment-vs-foreign-rect intersections for DRAWN hierarchy edges
    const rect = new Map(b.nodes.map((n) => [n.id, { x: n.x, y: n.y, w: CARD_W, h: DEFAULT_H }]));
    const EPS = 0.5;
    const crossings: string[] = [];
    for (const e of hier) {
      const a = rect.get(e.source)!, c = rect.get(e.target)!;
      const ax = a.x + CARD_W / 2, ay = a.y + DEFAULT_H / 2;
      const cx = c.x + CARD_W / 2, cy = c.y + DEFAULT_H / 2;
      for (const n of b.nodes) {
        if (n.id === e.source || n.id === e.target) continue;
        const r = rect.get(n.id)!;
        if (segHitsRect(ax, ay, cx, cy, { x: r.x + EPS, y: r.y + EPS, w: r.w - 2 * EPS, h: r.h - 2 * EPS }))
          crossings.push(`${e.source}→${e.target} × ${n.id}`);
      }
    }
    expect(crossings).toEqual([]);
  });

  it("keeps small wheels in pure ring mode (no banding regression)", () => {
    // HK-AI-ecosystem shape: 6 sectors × 5 leaves — all leaves must share ONE ring radius.
    const b = ecosystem(6, 5);
    const pos = radialLayout(b);
    const rs = b.nodes.filter((n) => n.kind === "atom").map((n) => Math.hypot(center(pos[n.id]).x, center(pos[n.id]).y));
    for (const v of rs) expect(v).toBeCloseTo(rs[0], 6);
  });
});
