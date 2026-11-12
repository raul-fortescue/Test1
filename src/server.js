import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { authorized } from './auth.js';
import { Store } from './store.js';
import { synchronize, missingSettings } from './graph.js';

const env = process.env;
const host = env.HOST || '127.0.0.1';
const port = Number(env.PORT || 3000);
if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Este tablero es solo local. HOST debe ser 127.0.0.1, ::1 o localhost.');
const interval = Number(env.SYNC_INTERVAL_MINUTES || 5);
if (!Number.isFinite(interval) || interval < 1) throw new Error('SYNC_INTERVAL_MINUTES debe ser un número mayor o igual a 1.');
const store = new Store(env.DATA_DIR || './data');
let syncing = null;
let lastError = null;
async function sync() {
  if (syncing) return syncing;
  syncing = synchronize(store, env).then(result => { lastError = null; return result; }).catch(error => { lastError = error.message; throw error; }).finally(() => { syncing = null; });
  return syncing;
}
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);
const statuses = ['Pendiente', 'Por confirmar', 'En curso', 'Completado'];
const priorities = ['Gerencia', 'Equipo interno', 'Contratistas', 'Sin clasificar'];
async function body(req) {
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 32768) throw Object.assign(new Error('Solicitud demasiado grande.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw Object.assign(new Error('JSON no válido.'), { status: 400 }); }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  try {
    const base = `http://${req.headers.host}`;
    const path = new URL(req.url, base).pathname;
    const origin = new URL(base).origin;
    if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Origen no permitido.' });
    // Block cross-site browser requests even for the unauthenticated loopback workflow.
    if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Origen no permitido.' });
    const hostname = new URL(base).hostname;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) return send(403, { error: 'Host no permitido.' });
    if (path.startsWith('/api/') && !authorized(req, env)) return send(401, { error: 'Ingresá la clave de acceso al tablero.' });
    if (req.method === 'GET' && path === '/api/state') return send(200, {
      tasks: store.list(), lastSync: store.meta('lastSync'), syncing: !!syncing, lastError,
      configured: missingSettings(env).length === 0, missingSettings: missingSettings(env), intervalMinutes: interval
    });
    if (req.method === 'POST' && path === '/api/sync') {
      if (missingSettings(env).length) return send(503, { error: 'La conexión de Microsoft 365 todavía no está configurada.' });
      try { return send(200, await sync()); } catch (error) { return send(502, { error: error.message }); }
    }
    if (req.method === 'PATCH' && path.startsWith('/api/tasks/')) {
      const changes = await body(req);
      if (!changes || Array.isArray(changes) || typeof changes !== 'object') return send(400, { error: 'Cambios no válidos.' });
      const allowed = ['status', 'priority', 'owner', 'notes', 'suggestedReply', 'needsReview'];
      if (Object.keys(changes).some(key => !allowed.includes(key)) ||
          ('status' in changes && !statuses.includes(changes.status)) ||
          ('priority' in changes && !priorities.includes(changes.priority)) ||
          ('needsReview' in changes && typeof changes.needsReview !== 'boolean') ||
          ['owner', 'notes', 'suggestedReply'].some(key => key in changes && (typeof changes[key] !== 'string' || changes[key].length > 10000))) return send(400, { error: 'Campos no válidos.' });
      const task = store.patch(decodeURIComponent(path.slice('/api/tasks/'.length)), changes);
      return send(task ? 200 : 404, task || { error: 'Tarea no encontrada.' });
    }
    if (req.method === 'GET' && assets.has(path)) {
      const [name, type] = assets.get(path);
      const content = await readFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
      res.writeHead(200, { 'Content-Type': type }); return res.end(content);
    }
    send(404, { error: 'No encontrado.' });
  } catch (error) { send(error.status || 500, { error: error.status ? error.message : 'No se pudo procesar la solicitud.' }); }
});
server.requestTimeout = 30_000;
server.listen(port, host, () => console.log(`H&S Workspace iniciado en el puerto ${server.address().port}. Microsoft 365: ${missingSettings(env).length ? 'pendiente de configurar' : 'configurado, aún por verificar'}.`));
const timer = setInterval(() => { if (!missingSettings(env).length) sync().catch(() => {}); }, interval * 60000);
if (!missingSettings(env).length) sync().catch(() => {});
function stop() { clearInterval(timer); server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
