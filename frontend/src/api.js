export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
export async function request(path, { token, body, signal, method = 'GET' } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(`${API_URL}/api${path}`, {
    method, signal, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(!form && body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  const data = await response.json().catch(() => ({ error: 'The server returned an unexpected response' }));
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event('session-expired'));
    throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status });
  }
  return data;
}
export function mergeMessages(current, incoming) {
  return [...new Map([...current, ...incoming].map(m => [m._id, m])).values()].sort((a, b) => a.seq - b.seq);
}
export function conversationName(c, userId) { return c.kind === 'group' ? c.name : c.members.find(m => m._id !== userId)?.name || 'Conversation'; }
export function initials(name = '') { return name.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase(); }
