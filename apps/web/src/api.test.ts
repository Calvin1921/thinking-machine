import { afterEach, describe, expect, it, vi } from 'vitest';
import { addNode, editThought } from './api.js';

afterEach(() => vi.unstubAllGlobals());
describe('save failures', () => {
  it('rejects a server validation error so a composer can retain its input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Missing parent' }), { status: 400 })));
    await expect(addNode('demo', 'My idea', 'gone', 'branch')).rejects.toThrow('Missing parent');
  });
  it('surfaces conflicts rather than treating a JSON error as a saved board', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Changed elsewhere' }), { status: 409 })));
    await expect(editThought('demo', 'root', { label: 'New' }, { label: 'Old' })).rejects.toThrow('Changed elsewhere');
  });
  it('handles non-JSON server errors with a useful recovery message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })));
    await expect(addNode('demo', 'My idea', 'root', 'branch')).rejects.toThrow('HTTP 503');
  });
});
