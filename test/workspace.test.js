import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { Store } from '../src/store.js';
import { synchronize } from '../src/graph.js';

const env = { MS_TENANT_ID: 'test-tenant', MS_CLIENT_ID: 'test-client', MS_CLIENT_SECRET: 'test-secret', MS_MAILBOX: 'test@example.com' };
const message = (id, received = '2026-11-01T12:00:00Z') => ({ id: `message-${id}`, conversationId: id, receivedDateTime: received, subject: `Solicitud ${id}`, from: { emailAddress: { name: 'Equipo', address: 'equipo@example.com' } }, bodyPreview: 'Revisar requisitos' });
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'hys-test-'));
  const store = new Store(directory);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return store;
}
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('sync deduplicates a thread and preserves manual decisions when new mail arrives', t => {
  const store = fixture(t);
  store.merge([message('a')], '2026-11-02T00:00:00Z');
  store.patch('a', { notes: 'Esperando evidencia', status: 'En curso', priority: 'Gerencia', suggestedReply: 'Gracias', owner: 'Raúl', needsReview: false });
  store.merge([message('a'), message('a', '2026-11-03T00:00:00Z')], '2026-11-04T00:00:00Z');
  assert.equal(store.list().length, 1);
  const task = store.list()[0];
  assert.equal(task.notes, 'Esperando evidencia');
  assert.equal(task.status, 'En curso');
  assert.equal(task.priority, 'Gerencia');
  assert.equal(task.suggestedReply, 'Gracias');
  assert.equal(task.needsReview, true);
});

test('sync follows Graph pagination, orders updates and commits only after all pages', async t => {
  const store = fixture(t); let count = 0;
  const request = async (url, options) => {
    count++;
    if (count === 1) { assert.equal(options.method, 'POST'); return json({ access_token: 'fake-token' }); }
    assert.equal(options.headers.Authorization, 'Bearer fake-token');
    if (count === 2) return json({ value: [message('a', '2026-11-03T00:00:00Z')], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' });
    assert.equal(store.meta('lastSync'), null);
    return json({ value: [message('b'), message('a')] });
  };
  const result = await synchronize(store, env, request);
  assert.equal(result.messages, 3); assert.equal(count, 3);
  assert.equal(store.list().length, 2);
  assert.equal(store.list().find(task => task.id === 'a').receivedAt, '2026-11-03T00:00:00Z');
  assert.equal(store.meta('lastSync'), result.lastSync);
});

test('failure on a later page leaves existing data and watermark intact', async t => {
  const store = fixture(t); const cutoff = '2026-11-02T00:00:00Z';
  store.merge([message('old')], cutoff); let count = 0;
  await assert.rejects(synchronize(store, env, async () => {
    count++;
    if (count === 1) return json({ access_token: 'fake-token' });
    if (count === 2) return json({ value: [message('new')], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' });
    return new Response('', { status: 403 });
  }), /403/);
  assert.equal(store.meta('lastSync'), cutoff); assert.deepEqual(store.list().map(task => task.id), ['old']);
});

test('pagination cannot forward mailbox token to a foreign host', async t => {
  const store = fixture(t); let count = 0;
  await assert.rejects(synchronize(store, env, async () => {
    count++;
    if (count === 1) return json({ access_token: 'fake-token' });
    return json({ value: [], '@odata.nextLink': 'https://attacker.invalid/collect' });
  }), /paginación no válida/);
  assert.equal(count, 2); assert.equal(store.meta('lastSync'), null);
});

test('tasks survive database close and reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hys-persist-'));
  try {
    const first = new Store(directory); first.merge([message('persist')], '2026-11-02T00:00:00Z'); first.close();
    const second = new Store(directory);
    try { assert.equal(second.list()[0].id, 'persist'); } finally { second.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('HTTP workflow protects records, validates edits and reports missing Graph connection', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hys-http-'));
  const store = new Store(directory); store.merge([message('http')], '2026-11-02T00:00:00Z'); store.close();
  const token = 'test-access-token-at-least-32-characters';
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATA_DIR: directory, DASHBOARD_TOKEN: token, MS_CLIENT_ID: '', MS_TENANT_ID: '', MS_CLIENT_SECRET: '', MS_MAILBOX: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } rmSync(directory, { recursive: true, force: true }); });
  const output = await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000); timer.unref(); })]);
  const port = String(output[0]).match(/puerto (\d+)/)?.[1]; assert.ok(port);
  const base = `http://127.0.0.1:${port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  const initial = await (await fetch(`${base}/api/state`, { headers })).json();
  assert.equal(initial.configured, false); assert.equal(initial.tasks.length, 1);
  assert.equal((await fetch(`${base}/api/sync`, { method: 'POST', headers })).status, 503);
  assert.equal((await fetch(`${base}/api/tasks/http`, { method: 'PATCH', headers, body: JSON.stringify({ notes: 'Guardado', status: 'En curso' }) })).status, 200);
  assert.equal((await fetch(`${base}/api/tasks/http`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'inventado' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/tasks/http`, { method: 'PATCH', headers, body: '{' })).status, 400);
  assert.equal((await fetch(`${base}/api/state`, { headers: { ...headers, Origin: 'https://foreign.invalid' } })).status, 403);
  const final = await (await fetch(`${base}/api/state`, { headers })).json(); assert.equal(final.tasks[0].notes, 'Guardado');
  const page = await fetch(base); assert.match(await page.text(), /Pendientes H&S/); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
