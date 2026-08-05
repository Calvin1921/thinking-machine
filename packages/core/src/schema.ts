// packages/core/src/schema.ts
import { z } from "zod";

export const CURRENT_VERSION = 1;

export const NodeKind = z.enum(["root", "branch", "atom"]);
export const RootType = z.enum(["objective", "cause", "decision", "concept"]);
export const EdgeType = z.enum(["decomposition", "dependency"]);
// Probe/work status for a node. Drives the canvas "scoreboard" colors. Absent = untracked.
export const NodeStatus = z.enum(["todo", "running", "passed", "failed", "blocked"]);
// Content provenance / trust level (spec §2.4). `verified` is reserved for factual content
// that passed a source-check; `refuted` is factual content that was source-checked and found
// FALSE (the negative counterpart of `verified`); subjective content tops out at
// `informed-opinion`; past-TTL content downgrades to `stale`. Phase 1 only ever sets `drafted`.
// Absent = untracked.
export const NodeProvenance = z.enum(["drafted", "verified", "refuted", "informed-opinion", "stale"]);
// Whether a node's content is checkable against sources (factual) or a judgment call
// (subjective). Drives whether background verification runs at all (spec §2.4).
export const ContentKind = z.enum(["factual", "subjective"]);
// How fast a factual claim goes stale — drives the TTL bucket for the `stale` downgrade.
export const Volatility = z.enum(["static", "weeks", "volatile"]);
// How the canvas lays the graph out. The neutral foundation defaults to "tree"; a
// methodology can pick another representation (FR-2). Absent = tree.
export const BoardLayout = z.enum(["tree", "funnel", "grid", "timeline", "radial", "concentric"]);
// A board can hold many sections, each a different representation for a different purpose
// (the "nothing explains in one graph" insight). A graph section lays out its own nodes;
// a note section is just free text. Absent sections[] → the board is a single graph (legacy).
export const SectionKind = z.enum(["graph", "note"]);

// A gap flag: the judge (or user) marking the frontier — "I can't map past here; this is
// the question that unblocks it." intent = what you want is unclear; structure = the domain
// shape is unknown; reality = only the real world can answer (a fact/market/user).
export const GapKind = z.enum(["intent", "structure", "reality"]);
export const GapSchema = z.object({
  kind: GapKind,
  question: z.string().min(1),
});

export const SectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: SectionKind,
  layout: BoardLayout.optional(),   // graph sections: how this section lays out
  rootId: z.string().optional(),    // graph sections: this section's own root node id
  note: z.string().optional(),      // note sections: the markdown/plain text body
  x: z.number().optional(),         // section origin on the surface (set once it's placed/dragged)
  y: z.number().optional(),
  w: z.number().optional(),         // explicit container size once the user resizes (else computed)
  h: z.number().optional(),
});

export const NodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: NodeKind,
  rootType: RootType.optional(),
  image: z.string().optional(),
  status: NodeStatus.optional(),
  provenance: NodeProvenance.optional(),
  contentKind: ContentKind.optional(),
  verifiedAt: z.string().datetime().optional(),   // ISO-8601; tightened in Phase 3 (cached payloads cross the trust boundary)
  sources: z.array(z.string()).optional(),
  rationale: z.string().optional(),   // "pick this if X" — why you'd choose this option
  volatility: Volatility.optional(),
  sectionId: z.string().optional(),  // which section this node belongs to (graph sections)
  x: z.number(),
  y: z.number(),
  w: z.number().optional(),          // explicit size once the user resizes (else auto)
  h: z.number().optional(),
  // The node's body text — what it means / the thinking it holds. (Replaces the old
  // multi-lens `facets`; the model is now one axis: decompose into children.)
  description: z.string().optional(),
  // Frontier flag: the honest "I can't map past here" marker + the unblocking question.
  gap: GapSchema.optional(),
  // Closure: the recorded outcome once this node's question/probe/decision is settled.
  resolution: z.string().optional(),
});

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: EdgeType,
  // Relationship verb rendered on the edge ("blocks", "feeds", "causes"). A labeled link
  // is a readable proposition (A —blocks→ B); an unlabeled one is just a line. Optional.
  label: z.string().optional(),
});

// Pathfinder (the "offer the alternative" behavior): the strongest ALTERNATIVE
// representation for this board's content — the road not taken. `intent` is the main idea
// that would justify it; `divergence` (0..1) is how different the alt's MESSAGE is from the
// current layout's. The canvas only surfaces it above SUGGEST_DIVERGENCE so it never nags.
export const AltFramingSchema = z.object({
  layout: BoardLayout,
  intent: z.string().min(1),
  divergence: z.number().min(0).max(1),
});

export const BoardSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  id: z.string().min(1),
  title: z.string().min(1),
  domainHint: z.string().optional(),
  layout: BoardLayout.optional(),
  altFraming: AltFramingSchema.optional(),
  sections: z.array(SectionSchema).optional(),
  guideMode: z.boolean().optional(),   // Guide posture ON gates interactive prompts (spec §1)
  rootId: z.string().min(1),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

// ---- The judge's output contract: commit children OR name the gap — never both, never
// neither. LLM output is untrusted input; this schema is the boundary it must pass to
// touch a board. The discriminated union makes the honesty rule unrepresentable to break.
export type GrowNode = {
  label: string;
  kind: "branch" | "atom";
  description?: string;
  children?: GrowNode[];
};
export const GrowNodeSchema: z.ZodType<GrowNode> = z.lazy(() =>
  z.object({
    label: z.string().min(1),
    kind: z.enum(["branch", "atom"]),
    description: z.string().optional(),
    children: z.array(GrowNodeSchema).optional(),
  }),
);
export const GrowEdgeSchema = z.object({
  fromLabel: z.string().min(1),
  toLabel: z.string().min(1),
  type: EdgeType,
  label: z.string().optional(),
});
// Boundary schemas for raw proposal input (CLI --json, MCP tools): same guarantees everywhere.
export const GrowInputSchema = z.object({
  nodes: z.array(GrowNodeSchema).min(1),
  edges: z.array(GrowEdgeSchema).optional(),
});
export const DecomposeInputSchema = z.object({
  decomposition: z.array(z.object({ label: z.string().min(1), kind: z.enum(["branch", "atom"]), description: z.string().optional() })).min(1),
  edges: z.array(GrowEdgeSchema).optional(),
});
export const JudgeResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("commit"), nodes: z.array(GrowNodeSchema).min(1), edges: z.array(GrowEdgeSchema).optional() }),
  z.object({ kind: z.literal("gap"), gap: GapSchema }),
]);

export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type Board = z.infer<typeof BoardSchema>;
// `EdgeType` above is the zod enum *value*; ops.ts uses the name as a type too.
// A value and a type may share a name in TS, so expose the inferred union here.
export type EdgeType = z.infer<typeof EdgeType>;
export type NodeStatus = z.infer<typeof NodeStatus>;
export type NodeProvenance = z.infer<typeof NodeProvenance>;
export type ContentKind = z.infer<typeof ContentKind>;
export type Volatility = z.infer<typeof Volatility>;
export type BoardLayout = z.infer<typeof BoardLayout>;
export type SectionKind = z.infer<typeof SectionKind>;
export type Section = z.infer<typeof SectionSchema>;
export type AltFraming = z.infer<typeof AltFramingSchema>;
export type Gap = z.infer<typeof GapSchema>;
export type GapKind = z.infer<typeof GapKind>;
export type GrowEdge = z.infer<typeof GrowEdgeSchema>;
export type JudgeResult = z.infer<typeof JudgeResultSchema>;
export type GrowInput = { nodes: GrowNode[]; edges?: GrowEdge[] };

/** Fold a legacy node's `facets` into a single `description` string so no content is lost
 *  when the multi-lens model is dropped: the `definition` lens leads, other lenses follow as
 *  "key: items" lines. Already-migrated nodes (with `description`, no `facets`) pass through. */
function foldFacets(n: any): string | undefined {
  if (!n.facets || typeof n.facets !== "object") return n.description;
  const f = n.facets as Record<string, string[]>;
  const parts: string[] = [];
  if (Array.isArray(f.definition) && f.definition.length) parts.push(f.definition.join(" "));
  for (const [k, v] of Object.entries(f)) {
    if (k === "definition" || !Array.isArray(v) || !v.length) continue;
    parts.push(`${k}: ${v.join("; ")}`);
  }
  const folded = parts.join("\n").trim();
  return folded || n.description;
}

/** Bring any older/unversioned board up to CURRENT_VERSION. One-way, additive. */
export function migrate(raw: any): Board {
  const b = { ...raw };
  if (b.version === undefined) b.version = CURRENT_VERSION;
  if (b.version > CURRENT_VERSION) {
    throw new Error(`Board version ${b.version} is newer than supported ${CURRENT_VERSION}`);
  }
  b.nodes = (b.nodes ?? []).map((n: any) => {
    const description = foldFacets(n);          // legacy facets -> description (no data lost)
    const { facets, ...rest } = n;              // drop the old facets field
    return { x: 0, y: 0, ...rest, ...(description ? { description } : {}) };
  });
  b.edges = b.edges ?? [];
  return BoardSchema.parse(b);
}
