// packages/core/test/ops.test.ts
import { describe, it, expect } from "vitest";
import { newBoard } from "../src/board.js";
import { addNode, linkNodes, setFacet, promoteFacetItem, decompose } from "../src/ops.js";

describe("ops", () => {
  it("addNode appends a node and a decomposition edge to its parent", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Frontend", parentId: "root", kind: "branch" });
    expect(b.nodes).toHaveLength(2);
    const child = b.nodes.find((n) => n.label === "Frontend")!;
    expect(child.x).toBeGreaterThan(b.nodes[0].x);
    expect(b.edges).toContainEqual({ from: "root", to: child.id, type: "decomposition" });
  });

  it("linkNodes adds a dependency cross-link", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "FE", parentId: "root", kind: "branch" });
    b = addNode(b, { label: "API", parentId: "root", kind: "atom" });
    const fe = b.nodes.find((n) => n.label === "FE")!.id;
    const api = b.nodes.find((n) => n.label === "API")!.id;
    b = linkNodes(b, fe, api, "dependency");
    expect(b.edges).toContainEqual({ from: fe, to: api, type: "dependency" });
  });

  it("setFacet replaces a facet's items", () => {
    let b = newBoard("App", "objective");
    b = setFacet(b, "root", "essentials", ["one", "two"], "set");
    expect(b.nodes[0].facets.essentials).toEqual(["one", "two"]);
    b = setFacet(b, "root", "essentials", ["three"], "add");
    expect(b.nodes[0].facets.essentials).toEqual(["one", "two", "three"]);
  });

  it("promoteFacetItem turns a facet item into a child node", () => {
    let b = newBoard("App", "objective");
    b = setFacet(b, "root", "dependencies", ["Deployment"], "set");
    b = promoteFacetItem(b, "root", "dependencies", 0);
    expect(b.nodes.find((n) => n.label === "Deployment")).toBeTruthy();
    expect(b.nodes[0].facets.dependencies).toEqual([]); // removed from facet
  });

  it("decompose commits children + edges + facets in one shot", () => {
    let b = newBoard("App", "objective");
    b = decompose(b, "root", {
      decomposition: [
        { label: "FE", kind: "branch" },
        { label: "BE", kind: "branch" },
      ],
      edges: [{ fromLabel: "FE", toLabel: "BE", type: "dependency" }],
      facets: { considerations: ["scope creep"] },
    });
    expect(b.nodes).toHaveLength(3);
    expect(b.edges.filter((e) => e.type === "decomposition")).toHaveLength(2);
    expect(b.edges.filter((e) => e.type === "dependency")).toHaveLength(1);
    expect(b.nodes[0].facets.considerations).toContain("scope creep");
  });

  it("addNode throws on an unknown parent", () => {
    const b = newBoard("App", "objective");
    expect(() => addNode(b, { label: "x", parentId: "nope", kind: "atom" })).toThrow();
  });
});
