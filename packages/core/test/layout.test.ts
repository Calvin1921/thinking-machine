// packages/core/test/layout.test.ts
import { describe, it, expect } from "vitest";
import { placeChildren } from "../src/layout.js";

describe("placeChildren", () => {
  it("fans children out to the right of the parent", () => {
    const parent = { x: 100, y: 100 };
    const pts = placeChildren(parent, 3);
    expect(pts).toHaveLength(3);
    expect(pts.every((p) => p.x > parent.x)).toBe(true);
    // middle child roughly level with parent, others above/below
    expect(pts[1].y).toBeCloseTo(parent.y, 0);
    expect(pts[0].y).toBeLessThan(pts[2].y);
  });
});
