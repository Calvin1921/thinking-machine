// apps/web/src/boardToFlow.ts
import type { Board, Node as BNode } from "@tm/core/schema";
import { SEED_FACETS } from "@tm/core/schema";
import type { Node as FlowNode, Edge as FlowEdge } from "@xyflow/react";

export interface ThinkNodeData {
  label: string;
  kind: BNode["kind"];
  rootType?: string;
  status?: BNode["status"]; // probe/work status — colors the card
  image?: string;         // optional image URL rendered atop the card
  preview: string;        // the node's own content (full, untruncated) — shown on the card
  filledFacets: string[]; // names of the lenses that have content
  childCount: number;     // number of decomposition children (for the collapse toggle)
  sized?: boolean;        // node has an explicit user size → fill the node element
  collapsed?: boolean;    // injected at render time
  onToggle?: (id: string) => void; // injected at render time
  [key: string]: unknown;
}

/** The node's headline content: prefer the definition, else the first non-empty lens. */
function firstContent(facets: BNode["facets"]): string {
  const order = ["definition", ...SEED_FACETS.filter((f) => f !== "definition")];
  for (const f of order) {
    const v = facets[f];
    if (v && v.length) return v[0];
  }
  return "";
}

export function boardToFlow(board: Board): { nodes: FlowNode<ThinkNodeData>[]; edges: FlowEdge[] } {
  // Funnel flows top→bottom (bottom→top handles); tree flows left→right (right→left).
  // With sections, each edge follows ITS section's layout, not the board's.
  const sectionLayout = new Map((board.sections ?? []).map((s) => [s.id, s.layout]));
  const nodeSection = new Map(board.nodes.map((n) => [n.id, n.sectionId]));
  const handlesFor = (fromId: string) => {
    const layout = board.sections?.length ? sectionLayout.get(nodeSection.get(fromId) ?? "") : board.layout;
    const vertical = layout === "funnel" || layout === "grid"; // both flow top→bottom
    return { sourceHandle: vertical ? "b" : "r", targetHandle: vertical ? "t" : "l" };
  };
  const childCount: Record<string, number> = {};
  for (const n of board.nodes) childCount[n.id] = 0;
  for (const e of board.edges) if (e.type === "decomposition") childCount[e.from] = (childCount[e.from] ?? 0) + 1;

  const nodes = board.nodes.map((n) => {
    const sized = n.w != null && n.h != null;
    return {
      id: n.id,
      type: "think",
      position: { x: n.x, y: n.y },
      ...(sized ? { width: n.w, height: n.h, style: { width: n.w, height: n.h } } : {}),
      data: {
        label: n.label,
        kind: n.kind,
        rootType: n.rootType,
        status: n.status,
        image: n.image,
        preview: firstContent(n.facets),
        filledFacets: SEED_FACETS.filter((f) => (n.facets[f]?.length ?? 0) > 0),
        childCount: childCount[n.id] ?? 0,
        sized,
      },
    };
  });

  const edges = board.edges.map((e, i) => ({
    id: `e${i}`,
    source: e.from,
    target: e.to,
    ...handlesFor(e.from),
    animated: e.type === "dependency",
    style: e.type === "dependency"
      ? { stroke: "#f0a868", strokeDasharray: "5 5" }
      : { stroke: "#5ce0c6" },
    data: { type: e.type },
  }));

  return { nodes, edges };
}
