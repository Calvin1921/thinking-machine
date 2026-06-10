// apps/web/src/radialLayout.test.ts
import { describe, it, expect } from "vitest";
import { radialLayout } from "./radialLayout.js";
import { newBoard, addNode } from "@tm/core";
import type { Board } from "@tm/core/schema";

const CARD_W = 230, DEFAULT_H = 120;
const center = (p: { x: number; y: number }, h = DEFAULT_H) => ({ x: p.x + CARD_W / 2, y: p.y + h / 2 });

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
    // 12 sectors × 5 categories × 5 leaves = 373 nodes — the genai-mega-wheel shape.
    // One shared leaf ring would need R ≈ 14k px; bands must keep it tight.
    let b = newBoard("Mega", "concept");
    for (let s = 0; s < 12; s++) {
      b = addNode(b, { label: `S${s}`, parentId: "root", kind: "branch" });
      const sid = b.nodes.at(-1)!.id;
      for (let c = 0; c < 5; c++) {
        b = addNode(b, { label: `S${s}C${c}`, parentId: sid, kind: "branch" });
        const cid = b.nodes.at(-1)!.id;
        for (let l = 0; l < 5; l++) b = addNode(b, { label: `S${s}C${c}L${l}`, parentId: cid, kind: "atom" });
      }
    }
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

  it("keeps small wheels in pure ring mode (no banding regression)", () => {
    // HK-AI-ecosystem shape: 6 sectors × 5 leaves — all leaves must share ONE ring radius.
    const b = ecosystem(6, 5);
    const pos = radialLayout(b);
    const rs = b.nodes.filter((n) => n.kind === "atom").map((n) => Math.hypot(center(pos[n.id]).x, center(pos[n.id]).y));
    for (const v of rs) expect(v).toBeCloseTo(rs[0], 6);
  });
});
