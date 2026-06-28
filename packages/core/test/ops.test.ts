// packages/core/test/ops.test.ts
import { describe, it, expect } from "vitest";
import { newBoard } from "../src/board.js";
import { addNode, linkNodes, setNodeDescription, decompose, setNodeImage, setNodeLabel, setNodeStatus, setBoardLayout, addSection, setSectionNote, setSectionLayout, setSectionPos, setNodeSize, setSectionSize, applyLayout, growSubtree, setNodeProvenance, setGuideMode, detectCollisions, setVerification, computeStale, markStale, TTL_DAYS, setNodeRationale, setAltFraming, shouldSuggestAlt, subtreeIds, ancestorPath } from "../src/ops.js";
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

  it("linkNodes stores a relationship verb, and re-linking updates it", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "FE", parentId: "root", kind: "branch" });
    b = addNode(b, { label: "API", parentId: "root", kind: "atom" });
    const fe = b.nodes.find((n) => n.label === "FE")!.id;
    const api = b.nodes.find((n) => n.label === "API")!.id;
    b = linkNodes(b, fe, api, "dependency", "calls");
    expect(b.edges).toContainEqual({ from: fe, to: api, type: "dependency", label: "calls" });
    b = linkNodes(b, fe, api, "dependency", "queries");   // same edge → label updates, no duplicate
    expect(b.edges.filter((e) => e.from === fe && e.to === api)).toHaveLength(1);
    expect(b.edges).toContainEqual({ from: fe, to: api, type: "dependency", label: "queries" });
    b = linkNodes(b, fe, api, "dependency");              // unlabeled re-link keeps the verb
    expect(b.edges).toContainEqual({ from: fe, to: api, type: "dependency", label: "queries" });
  });

  it("setNodeDescription sets and clears a node's body text", () => {
    let b = newBoard("App", "objective");
    b = setNodeDescription(b, "root", "the user-facing layer");
    expect(b.nodes[0].description).toBe("the user-facing layer");
    b = setNodeDescription(b, "root", "   ");          // blank clears
    expect(b.nodes[0].description).toBeUndefined();
  });

  it("setNodeLabel renames a node, keeps id, and ignores a blank label", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Frontend", parentId: "root", kind: "branch" });
    const child = b.nodes.find((n) => n.label === "Frontend")!;
    b = setNodeLabel(b, child.id, "Web client");
    const renamed = b.nodes.find((n) => n.id === child.id)!;
    expect(renamed.label).toBe("Web client");
    expect(renamed.id).toBe(child.id);                       // id is a stable reference — never re-slugged
    b = setNodeLabel(b, child.id, "   ");                    // blank/whitespace is rejected (label is required)
    expect(b.nodes.find((n) => n.id === child.id)!.label).toBe("Web client");
  });

  it("decompose commits children with descriptions + edges in one shot", () => {
    let b = newBoard("App", "objective");
    b = decompose(b, "root", {
      decomposition: [
        { label: "FE", kind: "branch", description: "the front end" },
        { label: "BE", kind: "branch" },
      ],
      edges: [{ fromLabel: "FE", toLabel: "BE", type: "dependency" }],
    });
    expect(b.nodes).toHaveLength(3);
    expect(b.edges.filter((e) => e.type === "decomposition")).toHaveLength(2);
    expect(b.edges.filter((e) => e.type === "dependency")).toHaveLength(1);
    expect(b.nodes.find((n) => n.label === "FE")!.description).toBe("the front end");
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

  it("setNodeRationale sets and clears a node's rationale", () => {
    let b = newBoard("App", "objective");
    b = setNodeRationale(b, "root", "pick this if you want zero-config deploys");
    expect(b.nodes.find((n) => n.id === "root")!.rationale).toBe("pick this if you want zero-config deploys");
    b = setNodeRationale(b, "root", "");
    expect(b.nodes.find((n) => n.id === "root")!.rationale).toBeUndefined();
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

  it("setSectionNote appends with a newline in add mode, and still overwrites by default", () => {
    let b = newBoard("Workspace", "concept");
    b = addSection(b, { title: "Notes", kind: "note" });
    const ns = b.sections!.at(-1)!;
    b = setSectionNote(b, ns.id, "first line", "add"); // add to empty note: no leading newline
    expect(b.sections!.find((s) => s.id === ns.id)!.note).toBe("first line");
    b = setSectionNote(b, ns.id, "second line", "add");
    expect(b.sections!.find((s) => s.id === ns.id)!.note).toBe("first line\nsecond line");
    b = setSectionNote(b, ns.id, "fresh"); // default mode = set
    expect(b.sections!.find((s) => s.id === ns.id)!.note).toBe("fresh");
  });

  it("section root ids survive long titles intact (slug cap covers <slug>-root)", () => {
    let b = newBoard("Workspace", "concept");
    b = addSection(b, { title: "Tech Stack Decisions For The New Platform", kind: "graph" });
    const gs = b.sections!.at(-1)!;
    expect(gs.rootId).toBe("tech-stack-decisions-for-the-new-platform-root");
  });

  it("setNodeSize stores an explicit node size", () => {
    let b = newBoard("App", "objective");
    b = setNodeSize(b, "root", 300, 180);
    expect([b.nodes[0].w, b.nodes[0].h]).toEqual([300, 180]);
    expect(() => setNodeSize(b, "nope", 1, 1)).toThrow();
  });

  it("applyLayout commits node positions + sizes + section positions in one pass", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Child", parentId: "root", kind: "atom" });
    b = addSection(b, { title: "Notes", kind: "note" });
    const child = b.nodes.find((n) => n.label === "Child")!;
    const sid = b.sections!.at(-1)!.id;
    b = applyLayout(b, {
      positions: { [child.id]: { x: 12, y: 34 } },
      sizes: { [child.id]: { w: 240, h: 130 } },
      sectionPositions: { [sid]: { x: 100, y: 200 } },
    });
    const c = b.nodes.find((n) => n.id === child.id)!;
    expect([c.x, c.y, c.w, c.h]).toEqual([12, 34, 240, 130]);
    expect([b.sections!.find((s) => s.id === sid)!.x, b.sections!.find((s) => s.id === sid)!.y]).toEqual([100, 200]);
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
              description: "the B thing",
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

    // description landed on B specifically
    expect(b.nodes.find((n) => n.label === "B")!.description).toBe("the B thing");
    expect(b.nodes.find((n) => n.label === "A")!.description).toBeUndefined();

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

  it("setNodeProvenance sets and clears a node's provenance", () => {
    let b = newBoard("App", "objective");
    b = setNodeProvenance(b, "root", "drafted");
    expect(b.nodes.find((n) => n.id === "root")!.provenance).toBe("drafted");
    b = setNodeProvenance(b, "root", "");
    expect(b.nodes.find((n) => n.id === "root")!.provenance).toBeUndefined();
  });

  it("setGuideMode toggles the board flag, omitting it when off", () => {
    let b = newBoard("App", "objective");
    b = setGuideMode(b, true);
    expect(b.guideMode).toBe(true);
    b = setGuideMode(b, false);
    expect(b.guideMode).toBeUndefined();
  });

  it("detectCollisions reports proposed labels that match existing nodes (case-insensitive)", () => {
    let b = newBoard("Web App", "objective");
    b = decompose(b, "root", { decomposition: [{ label: "Frontend", kind: "branch" }] });
    const hits = detectCollisions(b, ["frontend", "Backend"]);
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe("frontend");
    expect(b.nodes.find((n) => n.id === hits[0].existingId)!.label).toBe("Frontend");
  });

  it("detectCollisions returns empty when nothing matches", () => {
    const b = newBoard("Web App", "objective");
    expect(detectCollisions(b, ["Backend", "Data"])).toEqual([]);
  });

  it("setVerification writes provenance + sources + verifiedAt onto a node", () => {
    let b = newBoard("App", "objective");
    b = setVerification(b, "root", {
      provenance: "verified", contentKind: "factual",
      sources: ["https://a.com", "https://b.com"],
      verifiedAt: "2026-06-24T10:00:00.000Z", volatility: "weeks",
    });
    const n = b.nodes.find((x) => x.id === "root")!;
    expect(n.provenance).toBe("verified");
    expect(n.contentKind).toBe("factual");
    expect(n.sources).toEqual(["https://a.com", "https://b.com"]);
    expect(n.verifiedAt).toBe("2026-06-24T10:00:00.000Z");
    expect(n.volatility).toBe("weeks");
  });

  it("setVerification rejects an invalid provenance", () => {
    const b = newBoard("App", "objective");
    expect(() => setVerification(b, "root", { provenance: "bogus" as any })).toThrow();
  });

  it("partial merge preserves prior fields when only some optional fields are updated", () => {
    let b = newBoard("App", "objective");
    // First call: set multiple fields
    b = setVerification(b, "root", {
      provenance: "verified",
      sources: ["https://a.com"],
      verifiedAt: "2026-06-24T00:00:00.000Z",
    });
    const n1 = b.nodes.find((x) => x.id === "root")!;
    expect(n1.provenance).toBe("verified");
    expect(n1.sources).toEqual(["https://a.com"]);
    expect(n1.verifiedAt).toBe("2026-06-24T00:00:00.000Z");

    // Second call: update only provenance, should preserve sources and verifiedAt
    b = setVerification(b, "root", { provenance: "stale" });
    const n2 = b.nodes.find((x) => x.id === "root")!;
    expect(n2.provenance).toBe("stale");
    expect(n2.sources).toEqual(["https://a.com"]); // preserved
    expect(n2.verifiedAt).toBe("2026-06-24T00:00:00.000Z"); // preserved
  });

  it("empty sources array replaces prior sources, not drops them", () => {
    let b = newBoard("App", "objective");
    // First call: set sources
    b = setVerification(b, "root", {
      provenance: "verified",
      sources: ["https://a.com"],
    });
    expect(b.nodes.find((x) => x.id === "root")!.sources).toEqual(["https://a.com"]);

    // Second call: explicitly set sources to empty array
    b = setVerification(b, "root", {
      provenance: "verified",
      sources: [],
    });
    const n = b.nodes.find((x) => x.id === "root")!;
    expect(n.sources).toEqual([]); // should be empty, not the old array
  });

  it("computeStale flags a verified node past its volatility TTL, not a fresh one", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Old", parentId: "root", kind: "branch" });
    b = addNode(b, { label: "New", parentId: "root", kind: "branch" });
    const oldId = b.nodes.find((n) => n.label === "Old")!.id;
    const newId = b.nodes.find((n) => n.label === "New")!.id;
    // volatile TTL = 7 days
    b = setVerification(b, oldId, { provenance: "verified", verifiedAt: "2026-06-01T00:00:00.000Z", volatility: "volatile" });
    b = setVerification(b, newId, { provenance: "verified", verifiedAt: "2026-06-23T00:00:00.000Z", volatility: "volatile" });
    const stale = computeStale(b, "2026-06-24T00:00:00.000Z");
    expect(stale).toEqual([oldId]);
    expect(TTL_DAYS.volatile).toBe(7);
  });

  it("markStale downgrades only verified-and-expired nodes to stale", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Opinion", parentId: "root", kind: "branch" });
    const opId = b.nodes.find((n) => n.label === "Opinion")!.id;
    // an old informed-opinion must NOT be staled
    b = setVerification(b, opId, { provenance: "informed-opinion", verifiedAt: "2020-01-01T00:00:00.000Z", volatility: "volatile" });
    b = setVerification(b, "root", { provenance: "verified", verifiedAt: "2020-01-01T00:00:00.000Z", volatility: "volatile" });
    const after = markStale(b, "2026-06-24T00:00:00.000Z");
    expect(after.nodes.find((n) => n.id === "root")!.provenance).toBe("stale");
    expect(after.nodes.find((n) => n.id === opId)!.provenance).toBe("informed-opinion");
  });

  it("subtreeIds + ancestorPath drive Focus-dive", () => {
    let b = newBoard("App", "objective");   // root
    b = decompose(b, "root", { decomposition: [{ label: "A", kind: "branch" }, { label: "B", kind: "atom" }] });
    const aId = b.nodes.find((n) => n.label === "A")!.id;
    b = decompose(b, aId, { decomposition: [{ label: "A1", kind: "atom" }, { label: "A2", kind: "atom" }] });
    const a1 = b.nodes.find((n) => n.label === "A1")!.id;
    // diving into A shows A + A1 + A2, not B or root
    const sub = subtreeIds(b, aId);
    expect([...sub].sort()).toEqual([aId, a1, b.nodes.find((n) => n.label === "A2")!.id].sort());
    expect(sub.has("root")).toBe(false);
    expect(sub.has(b.nodes.find((n) => n.label === "B")!.id)).toBe(false);
    // breadcrumb from root to A1
    expect(ancestorPath(b, a1)).toEqual(["root", aId, a1]);
  });

  it("Pathfinder alt framing: set/clear + suggest only above the divergence threshold", () => {
    let b = newBoard("App", "objective");           // default layout = tree
    expect(shouldSuggestAlt(b)).toBe(false);         // nothing set
    b = setAltFraming(b, { layout: "radial", intent: "show the hub & spokes", divergence: 0.7 });
    expect(b.altFraming!.layout).toBe("radial");
    expect(shouldSuggestAlt(b)).toBe(true);          // divergent + different from tree
    b = setAltFraming(b, { layout: "radial", intent: "x", divergence: 0.2 });
    expect(shouldSuggestAlt(b)).toBe(false);         // below threshold -> suppressed (no nag)
    b = setAltFraming(b, { layout: "tree", intent: "x", divergence: 0.9 });
    expect(shouldSuggestAlt(b)).toBe(false);         // same as current layout -> suppressed
    b = setAltFraming(b, null);
    expect(b.altFraming).toBeUndefined();            // cleared
  });

  it("truncates long ids on a word boundary, never mid-word", () => {
    let b = newBoard("App", "objective");
    const long = "resolved freelance ai work now sequenced to the product over the next quarter";
    b = addNode(b, { label: long, parentId: "root", kind: "atom" });
    const id = b.nodes.find((n) => n.label === long)!.id;
    expect(id.length).toBeLessThanOrEqual(64);
    const fullSlug = long.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    expect(fullSlug.startsWith(id)).toBe(true);     // id is a clean prefix
    expect(fullSlug[id.length]).toBe("-");          // cut fell on a word boundary, not mid-word
  });

  it("records a refuted verdict and never auto-stales it", () => {
    let b = newBoard("App", "objective");
    // a checked-and-FALSE factual claim -> refuted, with the disproving sources
    b = setVerification(b, "root", {
      provenance: "refuted", contentKind: "factual",
      sources: ["https://example.com/correction"],
      verifiedAt: "2020-01-01T00:00:00.000Z", volatility: "volatile",
    });
    expect(b.nodes.find((n) => n.id === "root")!.provenance).toBe("refuted");
    // refuted is a terminal verdict: staleness only downgrades `verified`
    const after = markStale(b, "2026-06-24T00:00:00.000Z");
    expect(after.nodes.find((n) => n.id === "root")!.provenance).toBe("refuted");
  });
});
