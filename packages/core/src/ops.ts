// packages/core/src/ops.ts
import { Board, Node, EdgeType, NodeStatus, NodeProvenance, ContentKind, Volatility, BoardLayout, Section, SectionKind, AltFraming, AltFramingSchema, Gap } from "./schema.js";
import type { GrowNode, GrowInput } from "./schema.js";
export type { GrowNode, GrowInput };
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

export interface AddNodeInput { label: string; parentId: string; kind: "branch" | "atom"; description?: string; }

export function addNode(board: Board, input: AddNodeInput): Board {
  const parent = requireNode(board, input.parentId);
  const [pt] = placeChildren(parent, 1);
  const id = genId(board, input.label);
  const node: Node = { id, label: input.label, kind: input.kind, x: pt.x, y: pt.y, sectionId: parent.sectionId, ...(input.description ? { description: input.description } : {}) };
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
    const root: Node = { id: rootId, label: input.title, kind: "root", x: 0, y: 0, sectionId: id };
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

/** All node ids in the decomposition subtree rooted at `rootId` (inclusive), cycle-safe.
 *  Drives Focus-dive: re-rooting the canvas onto a node shows exactly this set. */
export function subtreeIds(board: Board, rootId: string): Set<string> {
  const kids: Record<string, string[]> = {};
  for (const e of board.edges) if (e.type === "decomposition") (kids[e.from] ??= []).push(e.to);
  const out = new Set<string>();
  const q = [rootId];
  while (q.length) {
    const id = q.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of kids[id] ?? []) q.push(c);
  }
  return out;
}

/** Path of node ids from the board root down to `id` (inclusive) via decomposition edges —
 *  the Focus-dive breadcrumb. */
export function ancestorPath(board: Board, id: string): string[] {
  const parent: Record<string, string> = {};
  for (const e of board.edges) if (e.type === "decomposition") parent[e.to] = e.from;
  const path = [id];
  let cur = id;
  const seen = new Set([id]);
  while (parent[cur] && !seen.has(parent[cur])) { cur = parent[cur]; seen.add(cur); path.unshift(cur); }
  return path;
}

/** Rename a node's headline. The id is a stable reference (never re-slugged); a blank label is rejected. */
export function setNodeLabel(board: Board, nodeId: string, label: string): Board {
  requireNode(board, nodeId);
  const next = label.trim();
  if (!next) return board;
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, label: next } : n)) };
}

/** Plant (or with null, clear) a frontier flag on a node: "can't map past here — this is
 *  the question that unblocks it." The honest alternative to fabricating children. */
export function setNodeGap(board: Board, nodeId: string, gap: Gap | null): Board {
  requireNode(board, nodeId);
  return {
    ...board,
    nodes: board.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      if (gap) return { ...n, gap };
      const { gap: _cleared, ...rest } = n;
      return rest;
    }),
  };
}

/** Close a node: record the outcome, set the verdict status, clear any open gap.
 *  Closure is what turns a board from a sketch into a reusable answer (it feeds recall). */
export function resolveNode(
  board: Board,
  nodeId: string,
  outcome: string,
  status: "passed" | "failed" = "passed",
): Board {
  requireNode(board, nodeId);
  const resolution = outcome.trim();
  if (!resolution) throw new Error("resolveNode: outcome must be non-empty");
  return {
    ...board,
    nodes: board.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const { gap: _cleared, ...rest } = n;
      return { ...rest, resolution, status };
    }),
  };
}

/** Set (or clear, with empty) a node's body text. */
export function setNodeDescription(board: Board, nodeId: string, description: string): Board {
  requireNode(board, nodeId);
  const next = description.trim() ? description : undefined;
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, description: next } : n)) };
}

export interface DecomposeInput {
  decomposition: { label: string; kind: "branch" | "atom"; description?: string }[];
  edges?: { fromLabel: string; toLabel: string; type: EdgeType; label?: string }[];
}

/** Commit a full LLM proposal: children (each with optional body text) + cross-edges in one shot. */
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
      nodes: [...b.nodes, { id, label: child.label, kind: child.kind, x: pts[i].x, y: pts[i].y, sectionId: parent.sectionId, ...(child.description ? { description: child.description } : {}) }],
      edges: [...b.edges, { from: parent.id, to: id, type: "decomposition" as const }],
    };
  });
  for (const e of input.edges ?? []) {
    const from = labelToId[e.fromLabel], to = labelToId[e.toLabel];
    if (!from || !to) throw new Error(`decompose edge references unknown child label`);
    b = linkNodes(b, from, to, e.type, e.label);
  }
  return b;
}

// GrowNode/GrowInput live in schema.ts next to their zod schemas (one concept, one home);
// re-exported above for callers that import them from ops.

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
        nodes: [...b.nodes, { id, label: child.label, kind: child.kind, x: pts[i].x, y: pts[i].y, sectionId: parentNode.sectionId, ...(child.description ? { description: child.description } : {}) }],
        edges: [...b.edges, { from: parent, to: id, type: "decomposition" as const }],
      };
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
