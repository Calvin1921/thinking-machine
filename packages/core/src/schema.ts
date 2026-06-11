// packages/core/src/schema.ts
import { z } from "zod";

export const CURRENT_VERSION = 1;

export const NodeKind = z.enum(["root", "branch", "atom"]);
export const RootType = z.enum(["objective", "cause", "decision", "concept"]);
export const EdgeType = z.enum(["decomposition", "dependency"]);
// Probe/work status for a node. Drives the canvas "scoreboard" colors. Absent = untracked.
export const NodeStatus = z.enum(["todo", "running", "passed", "failed", "blocked"]);
// How the canvas lays the graph out. The neutral foundation defaults to "tree"; a
// methodology can pick another representation (FR-2). Absent = tree.
export const BoardLayout = z.enum(["tree", "funnel", "grid", "timeline", "radial"]);
// A board can hold many sections, each a different representation for a different purpose
// (the "nothing explains in one graph" insight). A graph section lays out its own nodes;
// a note section is just free text. Absent sections[] → the board is a single graph (legacy).
export const SectionKind = z.enum(["graph", "note"]);

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
  sectionId: z.string().optional(),  // which section this node belongs to (graph sections)
  x: z.number(),
  y: z.number(),
  w: z.number().optional(),          // explicit size once the user resizes (else auto)
  h: z.number().optional(),
  // facet key -> list of thought items (strings in v1). Domain-specific keys allowed.
  facets: z.record(z.string(), z.array(z.string())),
});

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: EdgeType,
  // Relationship verb rendered on the edge ("blocks", "feeds", "causes"). A labeled link
  // is a readable proposition (A —blocks→ B); an unlabeled one is just a line. Optional.
  label: z.string().optional(),
});

export const BoardSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  id: z.string().min(1),
  title: z.string().min(1),
  domainHint: z.string().optional(),
  layout: BoardLayout.optional(),
  sections: z.array(SectionSchema).optional(),
  rootId: z.string().min(1),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type Board = z.infer<typeof BoardSchema>;
// `EdgeType` above is the zod enum *value*; ops.ts uses the name as a type too.
// A value and a type may share a name in TS, so expose the inferred union here.
export type EdgeType = z.infer<typeof EdgeType>;
export type NodeStatus = z.infer<typeof NodeStatus>;
export type BoardLayout = z.infer<typeof BoardLayout>;
export type SectionKind = z.infer<typeof SectionKind>;
export type Section = z.infer<typeof SectionSchema>;

export const SEED_FACETS = [
  "definition", "essentials", "dependencies",
  "priorities", "considerations", "perspectives",
] as const;

/** Bring any older/unversioned board up to CURRENT_VERSION. One-way, additive. */
export function migrate(raw: any): Board {
  const b = { ...raw };
  if (b.version === undefined) b.version = CURRENT_VERSION;
  if (b.version > CURRENT_VERSION) {
    throw new Error(`Board version ${b.version} is newer than supported ${CURRENT_VERSION}`);
  }
  b.nodes = (b.nodes ?? []).map((n: any) => ({ facets: {}, x: 0, y: 0, ...n }));
  b.edges = b.edges ?? [];
  return BoardSchema.parse(b);
}
