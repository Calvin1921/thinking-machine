import { z } from 'zod';
import { NodeSchema, type Board, type Node } from './schema.js';

// Normalized editable fields; blank optional values are cleared on save.
export const NodeDraftSchema = z.object({
  label: z.string().trim().min(1),
  description: z.string(),
  rationale: z.string(),
  status: z.enum(['', 'todo', 'running', 'passed', 'failed', 'blocked']),
  gapKind: z.enum(['intent', 'structure', 'reality']),
  gapQuestion: z.string(),
  resolution: z.string(),
  image: z.string(),
}).strict();
export const NodePatchSchema = NodeDraftSchema.partial();
export type NodeDraft = z.infer<typeof NodeDraftSchema>;
export type NodePatch = Partial<NodeDraft>;

export function nodeDraft(node: Node): NodeDraft {
  return {
    label: node.label, description: node.description ?? '', rationale: node.rationale ?? '',
    status: node.status ?? '', gapKind: node.gap?.kind ?? 'reality',
    gapQuestion: node.gap?.question ?? '', resolution: node.resolution ?? '', image: node.image ?? '',
  };
}

export class NodeEditConflict extends Error {}

/** Apply only changed fields, rejecting stale edits to those fields under the store lock. */
export function editNode(board: Board, nodeId: string, rawChanges: NodePatch, rawExpected: NodePatch): Board {
  const changes = NodePatchSchema.parse(rawChanges);
  const expected = NodePatchSchema.parse(rawExpected);
  const node = board.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error('This thought no longer exists. Reload the board.');
  const current = nodeDraft(node);
  for (const key of Object.keys(changes) as (keyof NodeDraft)[]) {
    if (!(key in expected)) throw new Error(`Missing original value for ${key}`);
    if (current[key] !== expected[key]) {
      throw new NodeEditConflict('This thought changed elsewhere. Your draft is still here; compare it with the latest version before saving.');
    }
  }
  const draft = NodeDraftSchema.parse({ ...current, ...changes });
  const next = NodeSchema.parse({
    ...node, label: draft.label, description: draft.description || undefined,
    rationale: draft.rationale || undefined, status: draft.status || undefined,
    gap: draft.gapQuestion.trim() ? { kind: draft.gapKind, question: draft.gapQuestion.trim() } : undefined,
    resolution: draft.resolution.trim() || undefined, image: draft.image.trim() || undefined,
  });
  return { ...board, nodes: board.nodes.map(n => n.id === nodeId ? next : n) };
}
