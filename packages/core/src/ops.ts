// packages/core/src/ops.ts
import { Board, Node, EdgeType } from "./schema.js";
import { placeChildren } from "./layout.js";

let counter = 0;
/** Deterministic-enough id without Date.now/Math.random (unavailable in some runtimes). */
function genId(board: Board, label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "node";
  let id = base;
  while (board.nodes.some((n) => n.id === id)) id = `${base}-${++counter}`;
  return id;
}

function requireNode(board: Board, id: string): Node {
  const n = board.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`No node with id "${id}"`);
  return n;
}

export interface AddNodeInput { label: string; parentId: string; kind: "branch" | "atom"; }

export function addNode(board: Board, input: AddNodeInput): Board {
  const parent = requireNode(board, input.parentId);
  const [pt] = placeChildren(parent, 1);
  const id = genId(board, input.label);
  const node: Node = { id, label: input.label, kind: input.kind, x: pt.x, y: pt.y, facets: {} };
  return {
    ...board,
    nodes: [...board.nodes, node],
    edges: [...board.edges, { from: parent.id, to: id, type: "decomposition" }],
  };
}

export function linkNodes(board: Board, from: string, to: string, type: EdgeType): Board {
  requireNode(board, from); requireNode(board, to);
  if (board.edges.some((e) => e.from === from && e.to === to && e.type === type)) return board;
  return { ...board, edges: [...board.edges, { from, to, type }] };
}

export function setFacet(board: Board, nodeId: string, facet: string, items: string[], mode: "set" | "add"): Board {
  const node = requireNode(board, nodeId);
  const current = node.facets[facet] ?? [];
  const next = mode === "set" ? items : [...current, ...items];
  const nodes = board.nodes.map((n) => (n.id === nodeId ? { ...n, facets: { ...n.facets, [facet]: next } } : n));
  return { ...board, nodes };
}

export function promoteFacetItem(board: Board, nodeId: string, facet: string, index: number): Board {
  const node = requireNode(board, nodeId);
  const items = node.facets[facet] ?? [];
  const label = items[index];
  if (label === undefined) throw new Error(`No item ${index} in facet "${facet}"`);
  const remaining = items.filter((_, i) => i !== index);
  const withRemoved = setFacet(board, nodeId, facet, remaining, "set");
  return addNode(withRemoved, { label, parentId: nodeId, kind: "branch" });
}

export interface DecomposeInput {
  decomposition: { label: string; kind: "branch" | "atom" }[];
  edges?: { fromLabel: string; toLabel: string; type: EdgeType }[];
  facets?: Record<string, string[]>;
}

/** Commit a full LLM proposal: children, cross-edges, and facet seeds in one shot. */
export function decompose(board: Board, nodeId: string, input: DecomposeInput): Board {
  const parent = requireNode(board, nodeId);
  const pts = placeChildren(parent, input.decomposition.length);
  const labelToId: Record<string, string> = {};
  let b = board;
  input.decomposition.forEach((child, i) => {
    const id = genId(b, child.label);
    labelToId[child.label] = id;
    b = {
      ...b,
      nodes: [...b.nodes, { id, label: child.label, kind: child.kind, x: pts[i].x, y: pts[i].y, facets: {} }],
      edges: [...b.edges, { from: parent.id, to: id, type: "decomposition" as const }],
    };
  });
  for (const e of input.edges ?? []) {
    const from = labelToId[e.fromLabel], to = labelToId[e.toLabel];
    if (!from || !to) throw new Error(`decompose edge references unknown child label`);
    b = linkNodes(b, from, to, e.type);
  }
  for (const [facet, items] of Object.entries(input.facets ?? {})) {
    b = setFacet(b, nodeId, facet, items, "add");
  }
  return b;
}
