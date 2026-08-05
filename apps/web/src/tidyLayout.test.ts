// apps/web/src/tidyLayout.test.ts
import { describe, it, expect } from "vitest";
import { tidyLayout } from "./tidyLayout.js";
import { newBoard, addNode } from "@tm/core";

describe("tidyLayout", () => {
  it("places depth in x columns and centers a parent over its children", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "A", parentId: "root", kind: "branch" });
    b = addNode(b, { label: "B", parentId: "root", kind: "branch" });
    const a = b.nodes.find((n) => n.label === "A")!.id;
    const bb = b.nodes.find((n) => n.label === "B")!.id;

    const pos = tidyLayout(b); // no measured heights → default
    expect(pos.root.x).toBe(0);
    expect(pos[a].x).toBeGreaterThan(pos.root.x);
    expect(pos[bb].x).toBe(pos[a].x);
    // parent's center is the average of its children's centers
    const DEFAULT_H = 120;
    const rootCenter = pos.root.y + DEFAULT_H / 2;
    const childCenters = [pos[a].y + DEFAULT_H / 2, pos[bb].y + DEFAULT_H / 2];
    expect(rootCenter).toBeCloseTo((childCenters[0] + childCenters[1]) / 2);
  });

  it("stacks variable-height siblings without overlap", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Tall", parentId: "root", kind: "branch" });
    b = addNode(b, { label: "Short", parentId: "root", kind: "branch" });
    const tall = b.nodes.find((n) => n.label === "Tall")!.id;
    const short = b.nodes.find((n) => n.label === "Short")!.id;
    const heights = { [tall]: 300, [short]: 80 };

    const pos = tidyLayout(b, heights);
    const tops = [pos[tall], pos[short]].sort((p, q) => p.y - q.y);
    const upper = tops[0] === pos[tall] ? tall : short;
    const lower = tops[1] === pos[tall] ? tall : short;
    // the lower card's top must clear the upper card's bottom
    expect(pos[lower].y).toBeGreaterThanOrEqual(pos[upper].y + heights[upper]);
  });

  it("with a cell, measured heights win over the cell height fallback", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "A", parentId: "root", kind: "branch" });
    b = addNode(b, { label: "B", parentId: "root", kind: "branch" });
    const a = b.nodes.find((n) => n.label === "A")!.id;
    const bb = b.nodes.find((n) => n.label === "B")!.id;
    const cell = { w: 230, h: 400 };

    const pos = tidyLayout(b, { [a]: 100, [bb]: 100 }, new Set(), cell);
    // columns still align to the cell width…
    expect(pos[a].x).toBe(cell.w + 110);
    expect(pos[bb].x).toBe(cell.w + 110);
    // …but slots stack at the measured 100px, not the 400px cell height
    const gap = Math.abs(pos[bb].y - pos[a].y);
    expect(gap).toBeLessThan(cell.h);
    expect(gap).toBeGreaterThanOrEqual(100);
  });

  it("a collapsed node lays out as a leaf and its hidden children stay unplaced", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Open", parentId: "root", kind: "branch" });
    b = addNode(b, { label: "Folded", parentId: "root", kind: "branch" });
    const open = b.nodes.find((n) => n.label === "Open")!.id;
    const folded = b.nodes.find((n) => n.label === "Folded")!.id;
    b = addNode(b, { label: "Hidden1", parentId: folded, kind: "atom" });
    b = addNode(b, { label: "Hidden2", parentId: folded, kind: "atom" });
    const hidden = b.nodes.filter((n) => n.label.startsWith("Hidden")).map((n) => n.id);

    const pos = tidyLayout(b, {}, new Set([folded]), { w: 230, h: 120 });
    expect(pos[folded]).toBeDefined();
    // no phantom space reserved: hidden children get no new positions at all
    for (const id of hidden) expect(pos[id]).toBeUndefined();
    // the two visible siblings stack one slot apart, not spread over hidden extent
    expect(Math.abs(pos[folded].y - pos[open].y)).toBeLessThanOrEqual(120 + 36);
  });
});
