/**
 * Learner-facing case codes. A practice link carries the descriptor query string as a base64url token,
 * so the archetype is not visible in the address bar. This is a convenience, not a security feature:
 * anyone can decode the token, and the answer key is present in the page code.
 */
const toB64 = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
};

export const encodeCase = (query) => toB64(query);
export function decodeCase(token) {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new RangeError('malformed case code');
  return fromB64(token);
}
