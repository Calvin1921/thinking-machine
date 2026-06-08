// apps/web/src/boardToFlow.ts
import type { Board, Node as BNode } from "@tm/core/schema";
import { SEED_FACETS } from "@tm/core/schema";
import type { Node as FlowNode, Edge as FlowEdge } from "@xyflow/react";

export interface ThinkNodeData {
  label: string;
  kind: BNode["kind"];
  rootType?: string;
  sub: string;
  filledFacets: boolean[]; // one per seed facet, for the preview dots
  [key: string]: unknown;
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
      sub: n.kind === "root" ? (n.rootType ?? "root") : n.kind,
      filledFacets: SEED_FACETS.map((f) => (n.facets[f]?.length ?? 0) > 0),
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
