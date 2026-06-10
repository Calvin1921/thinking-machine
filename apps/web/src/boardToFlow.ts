// apps/web/src/boardToFlow.ts
import type { Board, Node as BNode } from "@tm/core/schema";
import { SEED_FACETS } from "@tm/core/schema";
import { MarkerType, type Node as FlowNode, type Edge as FlowEdge } from "@xyflow/react";
import { radialEdgeRewires } from "./radialLayout.js";

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
  const sectionLayout = new Map((board.sections ?? []).map((s) => [s.id, s.layout]));
  const nodeSection = new Map(board.nodes.map((n) => [n.id, n.sectionId]));
  // decomposition children, in order, per parent
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from].push(e.to);
  const childCount: Record<string, number> = {};
  for (const id of Object.keys(kids)) childCount[id] = kids[id].length;

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

  // --- layout-aware edges ---
  // The layout already encodes the relationship, so edges follow it:
  //   tree → hierarchy (parent→child) · funnel → sequence between stages ·
  //   timeline → sequence left→right within each lane · grid → none (position says it all) ·
  //   radial → hierarchy with handles picked by geometry (the side facing the other node),
  //   with band-packed children drawn from their nearest neighbor (see rewiresFor below).
  const TEAL = "#5ce0c6", AMBER = "#f0a868";
  const npos = new Map(board.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  // Handle pair for an edge whose endpoints can be anywhere around each other (radial):
  // pick the dominant axis of the source→target vector and exit/enter the facing sides.
  const geoHandles = (from: string, to: string): { s: string; t: string } => {
    const a = npos.get(from), b = npos.get(to);
    if (!a || !b) return { s: "r", t: "l" };
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { s: "r", t: "l" } : { s: "ls", t: "rt" };
    return dy >= 0 ? { s: "b", t: "t" } : { s: "ts", t: "bt" };
  };
  const edges: FlowEdge[] = [];
  let ei = 0;
  const push = (from: string, to: string, handles: { s: string; t: string }, kind: "hierarchy" | "sequence" | "dependency") => {
    edges.push({
      id: `e${ei++}`, source: from, target: to,
      sourceHandle: handles.s, targetHandle: handles.t,
      animated: kind === "dependency",
      markerEnd: kind === "sequence" ? { type: MarkerType.ArrowClosed, color: TEAL, width: 16, height: 16 } : undefined,
      style: kind === "dependency" ? { stroke: AMBER, strokeDasharray: "5 5" } : { stroke: TEAL },
      data: { type: kind },
    });
  };

  const roots = board.sections?.length
    ? board.sections.filter((s) => s.kind === "graph" && s.rootId).map((s) => ({ root: s.rootId!, layout: s.layout }))
    : [{ root: board.rootId, layout: board.layout }];

  // Radial band-packed nodes keep ALL their hierarchy edges, but a straight parent→child
  // line into a band would pierce the rows in between — so each band child draws from its
  // nearest geometric neighbor instead (row arcs, outward fans, staircase steps, chain
  // threads — see radialEdgeRewires). Ring-mode levels are untouched (no map entry).
  // The plan is recomputed structurally on the (sub-)board, with the uniform cell recovered
  // from stored node sizes when every member shares one size.
  const rewiresFor = (root: string): Map<string, string> => {
    let sub = board;
    if (board.sections?.length) {
      const sec = board.sections.find((s) => s.rootId === root);
      const members = board.nodes.filter((n) => n.sectionId === sec?.id);
      const ids = new Set(members.map((n) => n.id));
      sub = { ...board, rootId: root, nodes: members, edges: board.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
    }
    const first = sub.nodes[0];
    const uniform = first?.w != null && first?.h != null && sub.nodes.every((n) => n.w === first.w && n.h === first.h);
    return radialEdgeRewires(sub, uniform ? { w: first.w!, h: first.h! } : undefined);
  };

  const V = { s: "b", t: "t" }, H = { s: "r", t: "l" };   // the classic down / right pairs
  for (const { root, layout } of roots) {
    if (layout === "grid") continue;                                    // none — spatial only
    if (layout === "funnel") {                                          // sequence: root→stage→stage
      const seq = [root, ...(kids[root] ?? [])];
      for (let i = 0; i + 1 < seq.length; i++) push(seq[i], seq[i + 1], V, "sequence");
    } else if (layout === "timeline") {                                 // sequence per lane, left→right
      for (const lane of kids[root] ?? []) {
        const cells = kids[lane] ?? [];
        for (let j = 0; j + 1 < cells.length; j++) push(cells[j], cells[j + 1], H, "sequence");
      }
    } else {                                                            // tree/radial: full hierarchy
      const radial = layout === "radial";
      const rewire = radial ? rewiresFor(root) : new Map<string, string>();
      const stack = [root];
      while (stack.length) {
        const p = stack.pop()!;
        for (const c of kids[p] ?? []) {
          const from = rewire.get(c) ?? p;
          push(from, c, radial ? geoHandles(from, c) : H, "hierarchy");
          stack.push(c);
        }
      }
    }
  }
  // explicit dependency cross-links: keep them (intentional), except in edge-free grid sections
  for (const e of board.edges) {
    if (e.type !== "dependency") continue;
    const lay = board.sections?.length ? sectionLayout.get(nodeSection.get(e.from) ?? "") : board.layout;
    if (lay === "grid") continue;
    push(e.from, e.to, lay === "radial" ? geoHandles(e.from, e.to) : lay === "funnel" ? V : H, "dependency");
  }

  return { nodes, edges };
}
