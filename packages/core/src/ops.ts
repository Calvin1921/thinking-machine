// packages/core/src/ops.ts
import { Board, Node, EdgeType, NodeStatus, NodeProvenance, ContentKind, Volatility, BoardLayout, Section, SectionKind, AltFraming, AltFramingSchema } from "./schema.js";
import { placeChildren } from "./layout.js";

// Resets to 0 on every process restart; uniqueness is guaranteed by the live-board
// collision check (board.nodes.some(...)) below, not by this counter.
let counter = 0;
/** Slugify text to an id base, truncating on a word boundary so ids never cut mid-word
 *  (a hard mid-word slice made generated ids unpredictable for callers). */
function slugify(text: string, fallback: string): string {
  const full = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (full.length <= 64) return full || fallback;
  return full.slice(0, 64).replace(/-[^-]*$/, "") || fallback;
}

/** Deterministic-enough id without Date.now/Math.random (unavailable in some runtimes). */
function genId(board: Board, label: string): string {
  const base = slugify(label, "node");
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
  const node: Node = { id, label: input.label, kind: input.kind, x: pt.x, y: pt.y, facets: {}, sectionId: parent.sectionId };
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

/** Set a node's explicit size (from a resize). */
export function setNodeSize(board: Board, nodeId: string, w: number, h: number): Board {
  requireNode(board, nodeId);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, w, h } : n)) };
}

export interface LayoutUpdate {
  positions?: Record<string, { x: number; y: number }>;
  sizes?: Record<string, { w: number; h: number }>;
  sectionPositions?: Record<string, { x: number; y: number }>;
  sectionSizes?: Record<string, { w: number; h: number }>;
}

/**
 * Apply a whole layout pass — node positions/sizes and section positions/sizes — in ONE
 * immutable update. Used by Tidy/seed so dozens of placements commit atomically instead of
 * racing as parallel single-field writes that clobber each other on the board file.
 */
export function applyLayout(board: Board, u: LayoutUpdate): Board {
  const nodes = board.nodes.map((n) => {
    const p = u.positions?.[n.id]; const s = u.sizes?.[n.id];
    if (!p && !s) return n;
    return { ...n, ...(p ? { x: p.x, y: p.y } : {}), ...(s ? { w: s.w, h: s.h } : {}) };
  });
  const sections = (board.sections ?? []).map((sec) => {
    const p = u.sectionPositions?.[sec.id]; const s = u.sectionSizes?.[sec.id];
    if (!p && !s) return sec;
    return { ...sec, ...(p ? { x: p.x, y: p.y } : {}), ...(s ? { w: s.w, h: s.h } : {}) };
  });
  return { ...board, nodes, sections };
}

/** Attach (or clear) an optional image URL on a node. Empty string clears it. */
export function setNodeImage(board: Board, nodeId: string, image: string): Board {
  requireNode(board, nodeId);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, image: image || undefined } : n)) };
}

/** Set (or clear) a node's "pick this if X" rationale. Empty string clears it. */
export function setNodeRationale(board: Board, nodeId: string, text: string): Board {
  requireNode(board, nodeId);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, rationale: text || undefined } : n)) };
}

/** Set (or clear) a node's probe/work status. Empty string clears it; any other value is validated. */
export function setNodeStatus(board: Board, nodeId: string, status: NodeStatus | ""): Board {
  requireNode(board, nodeId);
  const next = status === "" ? undefined : NodeStatus.parse(status);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, status: next } : n)) };
}

/** Set (or clear) a node's content provenance/trust badge. Empty string clears it. */
export function setNodeProvenance(board: Board, nodeId: string, prov: NodeProvenance | ""): Board {
  requireNode(board, nodeId);
  const next = prov === "" ? undefined : NodeProvenance.parse(prov);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, provenance: next } : n)) };
}

export interface VerificationInput {
  provenance: NodeProvenance;
  contentKind?: ContentKind;
  sources?: string[];
  verifiedAt?: string;   // ISO-8601, supplied by the CLI/MCP boundary
  volatility?: Volatility;
}

/**
 * Record a Claude-in-the-loop verification result on a node (spec §2.4). Sets provenance
 * and merges any provided metadata; leaves unprovided fields untouched. Time is supplied
 * by the caller (core never reads the clock).
 */
export function setVerification(board: Board, nodeId: string, input: VerificationInput): Board {
  requireNode(board, nodeId);
  const provenance = NodeProvenance.parse(input.provenance);
  return {
    ...board,
    nodes: board.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            provenance,
            ...(input.contentKind !== undefined ? { contentKind: ContentKind.parse(input.contentKind) } : {}),
            ...(input.sources !== undefined ? { sources: input.sources } : {}),
            ...(input.verifiedAt !== undefined ? { verifiedAt: input.verifiedAt } : {}),
            ...(input.volatility !== undefined ? { volatility: Volatility.parse(input.volatility) } : {}),
          }
        : n,
    ),
  };
}

export const TTL_DAYS: Record<Volatility, number> = { static: 3650, weeks: 30, volatile: 7 };
const DAY_MS = 86_400_000;

/**
 * Ids of `verified` nodes whose verifiedAt + TTL(volatility) is earlier than `now`.
 * Pure: parses the supplied ISO strings; never reads the clock. `now` comes from the
 * CLI/MCP boundary. Nodes with no volatility use the `weeks` bucket.
 */
export function computeStale(board: Board, now: string, ttlDays: Record<Volatility, number> = TTL_DAYS): string[] {
  const nowMs = Date.parse(now);
  return board.nodes
    .filter((n) => n.provenance === "verified" && n.verifiedAt)
    .filter((n) => Date.parse(n.verifiedAt!) + ttlDays[n.volatility ?? "weeks"] * DAY_MS < nowMs)
    .map((n) => n.id);
}

/** Downgrade every expired `verified` node (see computeStale) to `stale`. */
export function markStale(board: Board, now: string, ttlDays: Record<Volatility, number> = TTL_DAYS): Board {
  const ids = new Set(computeStale(board, now, ttlDays));
  if (ids.size === 0) return board;
  return { ...board, nodes: board.nodes.map((n) => (ids.has(n.id) ? { ...n, provenance: "stale" } : n)) };
}

/** Turn the Guide posture on/off for the board. Off omits the flag (Explore is the default). */
export function setGuideMode(board: Board, on: boolean): Board {
  return { ...board, guideMode: on ? true : undefined };
}

/** Set the board's canvas layout. Empty string resets to the default (tree). */
export function setBoardLayout(board: Board, layout: BoardLayout | ""): Board {
  return { ...board, layout: layout === "" || layout === "tree" ? undefined : BoardLayout.parse(layout) };
}

// Pathfinder: only surface the alternative framing once its message diverges enough from the
// current view — below this, the alt is a near-duplicate and would just nag (Build-1b finding).
export const SUGGEST_DIVERGENCE = 0.35;

/** Set (or clear, with null) the Pathfinder alternative framing — the "road not taken". */
export function setAltFraming(board: Board, input: AltFraming | null): Board {
  if (!input) { const { altFraming, ...rest } = board; return rest; }
  return { ...board, altFraming: AltFramingSchema.parse(input) };
}

/** Whether the canvas should offer the alternative framing: present, divergent enough, and
 *  actually different from the current layout. */
export function shouldSuggestAlt(board: Board): boolean {
  const a = board.altFraming;
  if (!a) return false;
  return a.divergence >= SUGGEST_DIVERGENCE && a.layout !== (board.layout ?? "tree");
}

function genSectionId(board: Board, title: string): string {
  const base = slugify(title, "section");
  const existing = board.sections ?? [];
  let id = base;
  while (existing.some((s) => s.id === id)) id = `${base}-${++counter}`;
  return id;
}

export interface AddSectionInput { title: string; kind: SectionKind; layout?: BoardLayout; note?: string; }

/**
 * Add a section to the board — a self-contained view for one purpose. A `graph` section
 * gets its own root node (so it lays out independently); a `note` section holds free text.
 * The new section is appended last; read board.sections[last].id for its id.
 */
export function addSection(board: Board, input: AddSectionInput): Board {
  const id = genSectionId(board, input.title);
  if (input.kind === "graph") {
    const rootId = genId(board, `${input.title}-root`);
    const root: Node = { id: rootId, label: input.title, kind: "root", x: 0, y: 0, facets: {}, sectionId: id };
    const section: Section = { id, title: input.title, kind: "graph", layout: input.layout, rootId };
    return { ...board, sections: [...(board.sections ?? []), section], nodes: [...board.nodes, root] };
  }
  const section: Section = { id, title: input.title, kind: "note", note: input.note ?? "" };
  return { ...board, sections: [...(board.sections ?? []), section] };
}

function requireSection(board: Board, sectionId: string): Section {
  const s = (board.sections ?? []).find((x) => x.id === sectionId);
  if (!s) throw new Error(`No section with id "${sectionId}"`);
  return s;
}

/** Set or append the text body of a note section. `add` appends with a newline. */
export function setSectionNote(board: Board, sectionId: string, note: string, mode: "set" | "add" = "set"): Board {
  const s = requireSection(board, sectionId);
  if (s.kind !== "note") throw new Error(`Section "${sectionId}" is not a note`);
  const next = mode === "add" && s.note ? `${s.note}\n${note}` : note;
  return { ...board, sections: (board.sections ?? []).map((x) => (x.id === sectionId ? { ...x, note: next } : x)) };
}

/** Move a section's origin on the surface (drag-to-reposition). */
export function setSectionPos(board: Board, sectionId: string, x: number, y: number): Board {
  requireSection(board, sectionId);
  return { ...board, sections: (board.sections ?? []).map((s) => (s.id === sectionId ? { ...s, x, y } : s)) };
}

/** Set a section container's explicit size (from a resize). */
export function setSectionSize(board: Board, sectionId: string, w: number, h: number): Board {
  requireSection(board, sectionId);
  return { ...board, sections: (board.sections ?? []).map((s) => (s.id === sectionId ? { ...s, w, h } : s)) };
}

/** Set the layout of a graph section (tree|funnel). Empty string resets to default (tree). */
export function setSectionLayout(board: Board, sectionId: string, layout: BoardLayout | ""): Board {
  const s = requireSection(board, sectionId);
  if (s.kind !== "graph") throw new Error(`Section "${sectionId}" is not a graph`);
  const next = layout === "" || layout === "tree" ? undefined : BoardLayout.parse(layout);
  return { ...board, sections: (board.sections ?? []).map((x) => (x.id === sectionId ? { ...x, layout: next } : x)) };
}

export function linkNodes(board: Board, from: string, to: string, type: EdgeType, label?: string): Board {
  requireNode(board, from); requireNode(board, to);
  const existing = board.edges.find((e) => e.from === from && e.to === to && e.type === type);
  if (existing) {
    // re-linking with a label updates the verb on the existing edge; without one it's a no-op
    if (label === undefined || existing.label === label) return board;
    return { ...board, edges: board.edges.map((e) => (e === existing ? { ...e, label } : e)) };
  }
  return { ...board, edges: [...board.edges, { from, to, type, ...(label ? { label } : {}) }] };
}

/**
 * Find proposed child labels that collide with an existing node label (case-insensitive).
 * The Guide layer uses this to force a [link / rename / make-facet] choice instead of
 * silently creating a duplicate node — TM is a DAG, not a tree (spec §2.3).
 */
export function detectCollisions(board: Board, labels: string[]): { label: string; existingId: string }[] {
  const byLower = new Map(board.nodes.map((n) => [n.label.toLowerCase(), n.id]));
  const hits: { label: string; existingId: string }[] = [];
  for (const label of labels) {
    const existingId = byLower.get(label.toLowerCase());
    if (existingId) hits.push({ label, existingId });
  }
  return hits;
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
  edges?: { fromLabel: string; toLabel: string; type: EdgeType; label?: string }[];
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
      nodes: [...b.nodes, { id, label: child.label, kind: child.kind, x: pts[i].x, y: pts[i].y, facets: {}, sectionId: parent.sectionId }],
      edges: [...b.edges, { from: parent.id, to: id, type: "decomposition" as const }],
    };
  });
  for (const e of input.edges ?? []) {
    const from = labelToId[e.fromLabel], to = labelToId[e.toLabel];
    if (!from || !to) throw new Error(`decompose edge references unknown child label`);
    b = linkNodes(b, from, to, e.type, e.label);
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
  edges?: { fromLabel: string; toLabel: string; type: EdgeType; label?: string }[];  // cross-links by label, with an optional relationship verb
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
        nodes: [...b.nodes, { id, label: child.label, kind: child.kind, x: pts[i].x, y: pts[i].y, facets: {}, sectionId: parentNode.sectionId }],
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
    b = linkNodes(b, from, to, e.type, e.label);
  }
  return b;
}
