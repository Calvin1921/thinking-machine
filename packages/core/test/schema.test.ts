// packages/core/test/schema.test.ts
import { describe, it, expect } from "vitest";
import { BoardSchema, migrate, CURRENT_VERSION } from "../src/schema.js";

describe("schema", () => {
  it("parses a minimal valid board", () => {
    const board = {
      version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
      nodes: [{ id: "app", label: "App", kind: "root", rootType: "objective", x: 0, y: 0, facets: {} }],
      edges: [],
    };
    expect(() => BoardSchema.parse(board)).not.toThrow();
  });

  it("rejects an edge with an unknown type", () => {
    const bad = {
      version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
      nodes: [{ id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {} }],
      edges: [{ from: "app", to: "x", type: "bogus" }],
    };
    expect(() => BoardSchema.parse(bad)).toThrow();
  });

  it("migrate() bumps a version-0 board to current", () => {
    const old = { id: "b1", title: "T", rootId: "app", nodes: [], edges: [] };
    const migrated = migrate(old as any);
    expect(migrated.version).toBe(CURRENT_VERSION);
  });
});
