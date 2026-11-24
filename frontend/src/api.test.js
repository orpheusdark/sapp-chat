import { describe, it, expect, vi, afterEach } from 'vitest';
import { mergeMessages, conversationName, request } from './api.js';
describe('message reconciliation', () => {
  it('deduplicates REST responses and socket delivery while preserving server order', () => {
    expect(mergeMessages([{ _id: 'b', seq: 2 }, { _id: 'a', seq: 1 }], [{ _id: 'b', seq: 2, text: 'confirmed' }, { _id: 'c', seq: 3 }])).toEqual([{ _id: 'a', seq: 1 }, { _id: 'b', seq: 2, text: 'confirmed' }, { _id: 'c', seq: 3 }]);
  });
  it('names direct conversations for the other member and groups for their title', () => {
    expect(conversationName({ kind: 'direct', members: [{ _id: 'me', name: 'Me' }, { _id: 'you', name: 'Taylor' }] }, 'me')).toBe('Taylor');
    expect(conversationName({ kind: 'group', name: 'Studio' }, 'me')).toBe('Studio');
  });
});
describe('API boundary', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends authentication and JSON body and surfaces API errors', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Only admins can add people' }) }); vi.stubGlobal('fetch', fetcher);
    await expect(request('/conversations/a/members', { method: 'POST', token: 'token', body: { userId: 'b' } })).rejects.toThrow('Only admins');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
    expect(fetcher.mock.calls[0][1].body).toBe('{"userId":"b"}');
  });
  it('does not set a JSON content type for image forms', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }); vi.stubGlobal('fetch', fetcher);
    await request('/images', { method: 'POST', body: new FormData() });
    expect(fetcher.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  });
});
