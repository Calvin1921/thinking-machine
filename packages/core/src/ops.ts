// packages/core/src/ops.ts
import { Board, Node, EdgeType } from "./schema.js";
import { placeChildren } from "./layout.js";

// Resets to 0 on every process restart; uniqueness is guaranteed by the live-board
// collision check (board.nodes.some(...)) below, not by this counter.
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

export function updateNodePosition(board: Board, nodeId: string, x: number, y: number): Board {
  requireNode(board, nodeId);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)) };
}

/** Attach (or clear) an optional image URL on a node. Empty string clears it. */
export function setNodeImage(board: Board, nodeId: string, image: string): Board {
  requireNode(board, nodeId);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, image: image || undefined } : n)) };
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

export interface GrowNode {
  label: string;
  kind: "branch" | "atom";
  facets?: Record<string, string[]>;   // e.g. { definition: ["..."] }
  children?: GrowNode[];                // recursive
}
export interface GrowInput {
  nodes: GrowNode[];
  edges?: { fromLabel: string; toLabel: string; type: EdgeType }[];  // cross-links by label
}

const GROW_MAX_NODES = 300;

/** Total GrowNodes in a forest, counting all descendants. */
function countGrowNodes(nodes: GrowNode[]): number {
  return nodes.reduce((n, g) => n + 1 + countGrowNodes(g.children ?? []), 0);
}

/**
 * Create a whole multi-level subtree under `parentId` in one immutable op.
 * Each GrowNode becomes a node linked to its parent by a decomposition edge,
 * with its facets seeded; children fan out to the right of their parent.
 * After the tree is built, `input.edges` add cross-links resolved by label
 * (last-created wins on duplicate labels).
 */
export function growSubtree(board: Board, parentId: string, input: GrowInput): Board {
  requireNode(board, parentId);
  if (countGrowNodes(input.nodes) > GROW_MAX_NODES) {
    throw new Error("growSubtree: too many nodes (>300)");
  }

  const labelToId: Record<string, string> = {};
  let b = board;

  const growLevel = (siblings: GrowNode[], parent: string): void => {
    const parentNode = requireNode(b, parent);
    const pts = placeChildren(parentNode, siblings.length);
    siblings.forEach((child, i) => {
      const id = genId(b, child.label);
      labelToId[child.label] = id;   // last-created wins on duplicate labels
      b = {
        ...b,
        nodes: [...b.nodes, { id, label: child.label, kind: child.kind, x: pts[i].x, y: pts[i].y, facets: {} }],
        edges: [...b.edges, { from: parent, to: id, type: "decomposition" as const }],
      };
      for (const [facet, items] of Object.entries(child.facets ?? {})) {
        b = setFacet(b, id, facet, items, "set");
      }
      if (child.children?.length) growLevel(child.children, id);
    });
  };

  growLevel(input.nodes, parentId);

  for (const e of input.edges ?? []) {
    const from = labelToId[e.fromLabel], to = labelToId[e.toLabel];
    if (!from || !to) {
      throw new Error(`growSubtree edge references unknown label "${from ? e.toLabel : e.fromLabel}"`);
    }
    b = linkNodes(b, from, to, e.type);
  }
  return b;
}
