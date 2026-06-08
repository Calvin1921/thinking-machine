// packages/core/src/schema.ts
import { z } from "zod";

export const CURRENT_VERSION = 1;

export const NodeKind = z.enum(["root", "branch", "atom"]);
export const RootType = z.enum(["objective", "cause", "decision", "concept"]);
export const EdgeType = z.enum(["decomposition", "dependency"]);

export const NodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: NodeKind,
  rootType: RootType.optional(),
  image: z.string().optional(),
  x: z.number(),
  y: z.number(),
  // facet key -> list of thought items (strings in v1). Domain-specific keys allowed.
  facets: z.record(z.string(), z.array(z.string())),
});

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: EdgeType,
});

export const BoardSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  id: z.string().min(1),
  title: z.string().min(1),
  domainHint: z.string().optional(),
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
