import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorized } from '../src/auth.js';

const env = { AUTH_MODE: 'azure-easyauth', MS_TENANT_ID: 'expected-tenant', ALLOWED_USER_EMAILS: 'raul@example.com' };
const request = (email = 'raul@example.com', tenant = 'expected-tenant') => ({ headers: {
  'x-ms-client-principal': Buffer.from(JSON.stringify({ auth_typ: 'aad', claims: [{ typ: 'preferred_username', val: email }, { typ: 'tid', val: tenant }] })).toString('base64')
} });
test('private cloud access requires tenant and explicit user authorization', () => {
  assert.equal(authorized(request(), env), true);
  assert.equal(authorized(request('RAUL@example.com'), env), true);
  assert.equal(authorized(request('other@example.com'), env), false);
  assert.equal(authorized(request('raul@example.com', 'foreign-tenant'), env), false);
  assert.equal(authorized({ headers: {} }, env), false);
  assert.equal(authorized({ headers: { 'x-ms-client-principal': 'invalid' } }, env), false);
  assert.equal(authorized(request(), { ...env, ALLOWED_USER_EMAILS: '' }), false);
});
