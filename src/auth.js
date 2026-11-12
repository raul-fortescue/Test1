import { timingSafeEqual } from 'node:crypto';

export function authorized(req, env) {
  const token = env.DASHBOARD_TOKEN || '';
  if (!token) return true;
  const actual = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
