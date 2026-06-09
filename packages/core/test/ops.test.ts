// packages/core/test/ops.test.ts
import { describe, it, expect } from "vitest";
import { newBoard } from "../src/board.js";
import { addNode, linkNodes, setFacet, promoteFacetItem, decompose, setNodeImage, setNodeStatus, setBoardLayout, addSection, setSectionNote, setSectionLayout, setSectionPos, setNodeSize, setSectionSize, growSubtree } from "../src/ops.js";
import type { GrowNode } from "../src/ops.js";

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

  it("setNodeImage attaches an image url, and an empty string clears it", () => {
    let b = newBoard("App", "objective");
    b = setNodeImage(b, "root", "https://example.com/pic.png");
    expect(b.nodes[0].image).toBe("https://example.com/pic.png");
    b = setNodeImage(b, "root", "");
    expect(b.nodes[0].image).toBeUndefined();
  });

  it("setNodeImage throws on an unknown node", () => {
    const b = newBoard("App", "objective");
    expect(() => setNodeImage(b, "nope", "x")).toThrow();
  });

  it("setNodeStatus sets a valid status, clears on empty, and rejects garbage", () => {
    let b = newBoard("App", "objective");
    b = setNodeStatus(b, "root", "passed");
    expect(b.nodes[0].status).toBe("passed");
    b = setNodeStatus(b, "root", "");
    expect(b.nodes[0].status).toBeUndefined();
    expect(() => setNodeStatus(b, "root", "done" as never)).toThrow();
    expect(() => setNodeStatus(b, "nope", "todo")).toThrow();
  });

  it("addSection makes a graph section with its own root, and a note section with text", () => {
    let b = newBoard("Workspace", "concept");
    b = addSection(b, { title: "Roadmap", kind: "graph", layout: "funnel" });
    const gs = b.sections!.at(-1)!;
    expect(gs.kind).toBe("graph");
    expect(gs.layout).toBe("funnel");
    const root = b.nodes.find((n) => n.id === gs.rootId)!;
    expect(root.kind).toBe("root");
    expect(root.sectionId).toBe(gs.id);
    // grown children inherit the section
    b = growSubtree(b, gs.rootId!, { nodes: [{ label: "Phase 1", kind: "atom" }] });
    expect(b.nodes.find((n) => n.label === "Phase 1")!.sectionId).toBe(gs.id);

    b = addSection(b, { title: "Notes", kind: "note" });
    const ns = b.sections!.at(-1)!;
    expect(ns.kind).toBe("note");
    b = setSectionNote(b, ns.id, "remember to ship");
    expect(b.sections!.find((s) => s.id === ns.id)!.note).toBe("remember to ship");
    expect(() => setSectionLayout(b, ns.id, "funnel")).toThrow(); // not a graph
    expect(() => setSectionNote(b, gs.id, "x")).toThrow();        // not a note

    b = setSectionPos(b, gs.id, 700, 300);
    const moved = b.sections!.find((x) => x.id === gs.id)!;
    expect([moved.x, moved.y]).toEqual([700, 300]);
    expect(() => setSectionPos(b, "nope", 0, 0)).toThrow();

    b = setSectionSize(b, gs.id, 480, 360);
    const sized = b.sections!.find((x) => x.id === gs.id)!;
    expect([sized.w, sized.h]).toEqual([480, 360]);
  });

  it("setNodeSize stores an explicit node size", () => {
    let b = newBoard("App", "objective");
    b = setNodeSize(b, "root", 300, 180);
    expect([b.nodes[0].w, b.nodes[0].h]).toEqual([300, 180]);
    expect(() => setNodeSize(b, "nope", 1, 1)).toThrow();
  });

  it("setBoardLayout sets funnel, resets on tree/empty, rejects garbage", () => {
    let b = newBoard("App", "objective");
    b = setBoardLayout(b, "funnel");
    expect(b.layout).toBe("funnel");
    b = setBoardLayout(b, "tree");
    expect(b.layout).toBeUndefined();
    b = setBoardLayout(b, "funnel");
    b = setBoardLayout(b, "");
    expect(b.layout).toBeUndefined();
    expect(() => setBoardLayout(b, "spiral" as never)).toThrow();
  });

  it("growSubtree builds a nested multi-level subtree with facets + cross-links", () => {
    let b = newBoard("App", "objective");
    b = growSubtree(b, "root", {
      nodes: [
        {
          label: "A",
          kind: "branch",
          children: [
            {
              label: "B",
              kind: "branch",
              facets: { definition: ["the B thing"] },
              children: [{ label: "C", kind: "atom" }],
            },
          ],
        },
        { label: "D", kind: "branch" },
      ],
      edges: [{ fromLabel: "D", toLabel: "A", type: "dependency" }],
    });

    // root + A + B + C + D
    expect(b.nodes).toHaveLength(5);

    const id = (label: string) => b.nodes.find((n) => n.label === label)!.id;
    const hasDecomp = (from: string, to: string) =>
      b.edges.some((e) => e.from === id(from) && e.to === id(to) && e.type === "decomposition");

    // tree shape: root->A, A->B, B->C, root->D
    expect(b.edges).toContainEqual({ from: "root", to: id("A"), type: "decomposition" });
    expect(b.edges).toContainEqual({ from: "root", to: id("D"), type: "decomposition" });
    expect(hasDecomp("A", "B")).toBe(true);
    expect(hasDecomp("B", "C")).toBe(true);

    // facet landed on B specifically
    expect(b.nodes.find((n) => n.label === "B")!.facets.definition).toEqual(["the B thing"]);
    expect(b.nodes.find((n) => n.label === "A")!.facets.definition).toBeUndefined();

    // cross-link D -> A
    expect(b.edges).toContainEqual({ from: id("D"), to: id("A"), type: "dependency" });
  });

  it("growSubtree throws when the subtree exceeds 300 nodes", () => {
    const b = newBoard("App", "objective");
    const nodes: GrowNode[] = Array.from({ length: 301 }, (_, i) => ({ label: `n${i}`, kind: "atom" as const }));
    expect(() => growSubtree(b, "root", { nodes })).toThrow(/too many nodes/);
  });

  it("growSubtree throws on an unresolved cross-link label", () => {
    const b = newBoard("App", "objective");
    expect(() =>
      growSubtree(b, "root", {
        nodes: [{ label: "A", kind: "branch" }],
        edges: [{ fromLabel: "A", toLabel: "ghost", type: "dependency" }],
      }),
    ).toThrow(/unknown label "ghost"/);
  });

  it("addNode throws on an unknown parent", () => {
    const b = newBoard("App", "objective");
    expect(() => addNode(b, { label: "x", parentId: "nope", kind: "atom" })).toThrow();
  });
});
