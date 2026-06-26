// packages/core/test/schema.test.ts
import { describe, it, expect } from "vitest";
import { BoardSchema, NodeProvenance, ContentKind, Volatility, migrate, CURRENT_VERSION } from "../src/schema.js";

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

  it("accepts a node provenance and a board guideMode", () => {
    const board = {
      version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app", guideMode: true,
      nodes: [{ id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {}, provenance: "drafted" }],
      edges: [],
    };
    expect(() => BoardSchema.parse(board)).not.toThrow();
    expect(NodeProvenance.options).toContain("informed-opinion");
    expect(NodeProvenance.options).toContain("refuted");
  });

  it("rejects an unknown provenance value", () => {
    const bad = {
      version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
      nodes: [{ id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {}, provenance: "bogus" }],
      edges: [],
    };
    expect(() => BoardSchema.parse(bad)).toThrow();
  });

  it("accepts the C-prime verification fields on a node", () => {
    const board = {
      version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
      nodes: [{
        id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {},
        provenance: "verified", contentKind: "factual",
        verifiedAt: "2026-06-24T00:00:00.000Z", sources: ["https://example.com"],
        volatility: "weeks",
      }],
      edges: [],
    };
    expect(() => BoardSchema.parse(board)).not.toThrow();
    expect(ContentKind.options).toEqual(["factual", "subjective"]);
    expect(Volatility.options).toEqual(["static", "weeks", "volatile"]);
  });

  it("rejects an unknown contentKind", () => {
    const bad = {
      version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
      nodes: [{ id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {}, contentKind: "vibes" }],
      edges: [],
    };
    expect(() => BoardSchema.parse(bad)).toThrow();
  });

  it("accepts a rationale and an ISO verifiedAt; rejects a non-ISO verifiedAt", () => {
    const base = (verifiedAt: string, rationale?: string) => ({
      version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
      nodes: [{ id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {},
        provenance: "verified", verifiedAt, ...(rationale ? { rationale } : {}) }],
      edges: [],
    });
    expect(() => BoardSchema.parse(base("2026-06-24T00:00:00.000Z", "pick this if you want zero-config"))).not.toThrow();
    expect(() => BoardSchema.parse(base("banana"))).toThrow();
  });
});
