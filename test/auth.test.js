import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorized } from '../src/auth.js';

test('optional local password is enforced and ignores Azure identity headers', () => {
  const env = { DASHBOARD_TOKEN: 'local-secret', AUTH_MODE: 'azure-easyauth' };
  assert.equal(authorized({ headers: { authorization: 'Bearer local-secret' } }, env), true);
  assert.equal(authorized({ headers: { authorization: 'Bearer wrong' } }, env), false);
  assert.equal(authorized({ headers: { 'x-ms-client-principal': 'anything' } }, env), false);
  assert.equal(authorized({ headers: {} }, {}), true);
});
