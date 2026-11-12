const required = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_MAILBOX'];
export function missingSettings(env) { return required.filter(key => !env[key]?.trim()); }

export async function synchronize(store, env, request = fetch) {
  if (missingSettings(env).length) throw new Error('Falta configurar la conexión de Microsoft 365. Consultá el README.');
  const cutoff = new Date().toISOString();
  const previous = store.meta('lastSync');
  const since = new Date(previous ? Date.parse(previous) - 300_000 : Date.now() - 30 * 86_400_000).toISOString();
  const tokenResponse = await request(`https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!tokenResponse.ok) throw new Error(`Microsoft rechazó la autenticación (${tokenResponse.status}). Revisá la configuración con TI.`);
  const { access_token: token } = await tokenResponse.json();
  if (!token) throw new Error('Microsoft no devolvió un token de acceso.');
  const query = new URLSearchParams({
    '$filter': `receivedDateTime ge ${since}`,
    '$select': 'id,conversationId,subject,from,receivedDateTime,bodyPreview,webLink',
    '$top': '100', '$orderby': 'receivedDateTime asc'
  });
  let next = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MS_MAILBOX)}/mailFolders/inbox/messages?${query}`;
  const messages = [];
  const visited = new Set();
  while (next) {
    const url = new URL(next);
    if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/')) throw new Error('Microsoft devolvió una paginación no válida.');
    if (visited.has(next) || visited.size >= 100) throw new Error('La sincronización excedió el límite de páginas. No se adelantó el último corte.');
    visited.add(next);
    const response = await request(next, { headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      const detail = response.status === 429 ? ' Se reintentará en el próximo ciclo.' : ' Revisá permisos y acceso de red.';
      throw new Error(`No se pudo consultar Outlook (${response.status}).${detail}`);
    }
    const page = await response.json();
    if (!Array.isArray(page.value)) throw new Error('Respuesta de Outlook no válida.');
    messages.push(...page.value);
    next = page['@odata.nextLink'] || null;
  }
  store.merge(messages, cutoff);
  return { messages: messages.length, lastSync: cutoff };
}
