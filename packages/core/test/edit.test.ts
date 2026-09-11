import { describe, expect, it } from 'vitest';
import { newBoard, addNode, nodeDraft, editNode, NodeEditConflict } from '../src/index.js';

describe('human edits alongside agent updates', () => {
  it('merges a human thought into the latest board without losing agent-created nodes', () => {
    const original = newBoard('Rollout', 'decision');
    const expected = nodeDraft(original.nodes[0]);
    const latest = addNode(original, { label: 'Agent option', parentId: 'root', kind: 'branch' });
    const next = editNode(latest, 'root', { description: 'My concern is review time.', rationale: 'Choose a pilot while quality is unknown.', gapQuestion: 'Do reviewers find drafts useful?', resolution: 'Try a small pilot.' }, expected);
    expect(next.nodes).toHaveLength(2);
    expect(next.nodes[0].description).toContain('review time');
    expect(next.nodes[0].gap?.question).toContain('reviewers');
    expect(next.nodes[0].resolution).toBe('Try a small pilot.');
    expect(next.nodes[0].status).toBeUndefined(); // an outcome is not a passed test
  });
  it('rejects conflicting edits to the same field, while allowing changes to different fields', () => {
    const original = newBoard('Rollout', 'decision');
    const expected = nodeDraft(original.nodes[0]);
    const latest = editNode(original, 'root', { description: 'Agent changed this.' }, expected);
    expect(() => editNode(latest, 'root', { description: 'My unsaved draft.' }, expected)).toThrow(NodeEditConflict);
    const merged = editNode(latest, 'root', { rationale: 'Prefer a small pilot.' }, expected);
    expect(merged.nodes[0].description).toBe('Agent changed this.');
    expect(merged.nodes[0].rationale).toBe('Prefer a small pilot.');
  });
  it('requires original values and rejects blank labels or unexpected fields', () => {
    const b = newBoard('Rollout', 'decision');
    expect(() => editNode(b, 'root', { label: 'Changed' }, {})).toThrow('Missing original');
    expect(() => editNode(b, 'root', { label: ' ' }, nodeDraft(b.nodes[0]))).toThrow();
    expect(() => editNode(b, 'root', { provenance: 'verified' } as any, {})).toThrow();
  });
  it('clears an answered gap explicitly without removing the recorded outcome', () => {
    const b = newBoard('Rollout', 'decision');
    const next = editNode(b, 'root', { gapQuestion: 'Does it work?', resolution: 'Test it.' }, nodeDraft(b.nodes[0]));
    const cleared = editNode(next, 'root', { gapQuestion: '' }, nodeDraft(next.nodes[0]));
    expect(cleared.nodes[0].gap).toBeUndefined();
    expect(cleared.nodes[0].resolution).toBe('Test it.');
  });
});
