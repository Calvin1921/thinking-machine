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
});
