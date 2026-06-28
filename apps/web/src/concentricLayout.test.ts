import { describe, it, expect } from "vitest";
import { concentricLayout } from "./concentricLayout.js";
import type { Board } from "@tm/core/schema";

const cell = { w: 230, h: 120 };
const center = (p: { x: number; y: number }) => ({ x: p.x + cell.w / 2, y: p.y + cell.h / 2 });
const radius = (p: { x: number; y: number }) => Math.hypot(center(p).x, center(p).y);

function sampleBoard(): Board {
  // root → a, b, c (depth 1); a → a1, a2 (depth 2)
  return {
    version: 1, id: "bd", title: "T", rootId: "root",
    nodes: [
      { id: "root", label: "R", kind: "root", x: 0, y: 0 },
      { id: "a", label: "A", kind: "branch", x: 0, y: 0 },
      { id: "b", label: "B", kind: "atom", x: 0, y: 0 },
      { id: "c", label: "C", kind: "atom", x: 0, y: 0 },
      { id: "a1", label: "A1", kind: "atom", x: 0, y: 0 },
      { id: "a2", label: "A2", kind: "atom", x: 0, y: 0 },
    ],
    edges: [
      { from: "root", to: "a", type: "decomposition" },
      { from: "root", to: "b", type: "decomposition" },
      { from: "root", to: "c", type: "decomposition" },
      { from: "a", to: "a1", type: "decomposition" },
      { from: "a", to: "a2", type: "decomposition" },
    ],
  } as Board;
}

describe("concentricLayout", () => {
  it("centers the root and puts each depth on its own ring", () => {
    const pos = concentricLayout(sampleBoard(), {}, cell);
    expect(radius(pos.root)).toBeCloseTo(0, 5);                 // root at the center
    const r1 = [radius(pos.a), radius(pos.b), radius(pos.c)];
    expect(Math.max(...r1) - Math.min(...r1)).toBeLessThan(1e-6); // depth-1 share one ring
    const r2 = radius(pos.a1);
    expect(r2).toBeGreaterThan(r1[0]);                          // depth-2 sits further out
    expect(radius(pos.a2)).toBeCloseTo(r2, 5);
  });

  it("grows the ring (chord rule) so equal cards never overlap", () => {
    const many: Board = {
      version: 1, id: "bd", title: "T", rootId: "root",
      nodes: [
        { id: "root", label: "R", kind: "root", x: 0, y: 0 },
        ...Array.from({ length: 20 }, (_, i) => ({ id: "n" + i, label: "N" + i, kind: "atom" as const, x: 0, y: 0 })),
      ],
      edges: Array.from({ length: 20 }, (_, i) => ({ from: "root", to: "n" + i, type: "decomposition" as const })),
    } as Board;
    const pts = Object.entries(concentricLayout(many, {}, cell)).filter(([k]) => k !== "root").map(([, p]) => center(p));
    let min = Infinity;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    expect(min).toBeGreaterThanOrEqual(cell.w);                 // ≥ a card width apart
  });
});
