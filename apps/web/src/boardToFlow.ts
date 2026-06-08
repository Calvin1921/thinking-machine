// apps/web/src/boardToFlow.ts
import type { Board, Node as BNode } from "@tm/core/schema";
import { SEED_FACETS } from "@tm/core/schema";
import type { Node as FlowNode, Edge as FlowEdge } from "@xyflow/react";

export interface ThinkNodeData {
  label: string;
  kind: BNode["kind"];
  rootType?: string;
  preview: string;        // first line of the node's own content — shown on the card
  filledFacets: string[]; // names of the lenses that have content
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
  const nodes = board.nodes.map((n) => ({
    id: n.id,
    type: "think",
    position: { x: n.x, y: n.y },
    data: {
      label: n.label,
      kind: n.kind,
      rootType: n.rootType,
      preview: firstContent(n.facets),
      filledFacets: SEED_FACETS.filter((f) => (n.facets[f]?.length ?? 0) > 0),
    },
  }));

  const edges = board.edges.map((e, i) => ({
    id: `e${i}`,
    source: e.from,
    target: e.to,
    animated: e.type === "dependency",
    style: e.type === "dependency"
      ? { stroke: "#f0a868", strokeDasharray: "5 5" }
      : { stroke: "#5ce0c6" },
    data: { type: e.type },
  }));

  return { nodes, edges };
}
