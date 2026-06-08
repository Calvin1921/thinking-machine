// apps/web/src/boardToFlow.test.ts
import { describe, it, expect } from "vitest";
import { boardToFlow } from "./boardToFlow.js";
import { newBoard, addNode, linkNodes } from "@tm/core";

describe("boardToFlow", () => {
  it("maps nodes and typed edges", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "FE", parentId: "root", kind: "branch" });
    const fe = b.nodes.find((n) => n.label === "FE")!.id;
    b = addNode(b, { label: "API", parentId: "root", kind: "atom" });
    const api = b.nodes.find((n) => n.label === "API")!.id;
    b = linkNodes(b, fe, api, "dependency");

    const { nodes, edges } = boardToFlow(b);
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toMatchObject({ id: "root", type: "think", position: { x: 0, y: 0 } });
    const dep = edges.find((e) => e.source === fe && e.target === api)!;
    expect(dep.data?.type).toBe("dependency");
    expect(dep.animated).toBe(true);
  });
});
