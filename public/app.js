const $ = id => document.getElementById(id);
const statuses = ['Pendiente', 'Por confirmar', 'En curso', 'Completado'];
const priorities = ['Gerencia', 'Equipo interno', 'Contratistas', 'Sin clasificar'];
let state = { tasks: [] };
let selected = null;
let view = 'board';
let refreshing = false;
let accessToken = sessionStorage.getItem('hys-token') || '';
const date = value => new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } });
  const result = await response.json();
  if (response.status === 401) {
    $('login').hidden = false;
    state = { tasks: [] }; render(); $('freshness').textContent = ''; $('detail').close();
    throw new Error(result.error);
  }
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.');
  $('login').hidden = true;
  return result;
}
function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
function render() {
  ['pending', 'confirm', 'active', 'done'].forEach((id, index) => { $(id).textContent = state.tasks.filter(task => task.status === statuses[index]).length; });
  const query = $('search').value.toLocaleLowerCase('es');
  const tasks = state.tasks.filter(task => `${task.subject} ${task.sender} ${task.owner}`.toLocaleLowerCase('es').includes(query) && (!$('priority').value || task.priority === $('priority').value));
  tasks.sort((a, b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || b.receivedAt.localeCompare(a.receivedAt));
  $('tasks').replaceChildren();
  $('tasks').className = view;
  for (const status of statuses) {
    const column = text('div', '', 'column');
    const group = tasks.filter(task => task.status === status);
    const title = text('h2', status); title.append(text('span', group.length)); column.append(title);
    if (!group.length) column.append(text('p', state.tasks.length ? 'Sin tareas en esta vista' : 'Todavía no hay conversaciones', 'empty'));
    for (const task of group) {
      const card = text('button', '', 'card');
      card.append(text('span', task.priority, 'tag'), text('h3', task.subject), text('p', task.sender), text('p', task.owner ? `Responsable: ${task.owner}` : 'Sin responsable'), text('p', date(task.receivedAt)));
      if (task.needsReview) card.append(text('p', '● Actualización por revisar', 'review'));
      card.addEventListener('click', () => open(task)); column.append(card);
    }
    $('tasks').append(column);
  }
}
function open(task) {
  selected = task.id;
  $('subject').textContent = task.subject;
  $('sender').textContent = `${task.sender} · ${task.senderEmail}`;
  $('preview').textContent = task.preview;
  let safe = false;
  try { const url = new URL(task.url); safe = url.protocol === 'https:' && (url.hostname === 'outlook.office.com' || url.hostname === 'outlook.office365.com' || url.hostname === 'outlook.live.com'); } catch {}
  $('source').hidden = !safe;
  $('source').removeAttribute('href');
  if (safe) $('source').href = task.url;
  $('status').value = task.status; $('editPriority').value = task.priority;
  $('owner').value = task.owner; $('notes').value = task.notes; $('reply').value = task.suggestedReply;
  $('reviewed').checked = !task.needsReview; $('saveError').textContent = '';
  $('detail').showModal();
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    state = await api('/api/state');
    $('sync').disabled = !state.configured || state.syncing;
    $('freshness').textContent = state.lastSync ? `Última sincronización: ${date(state.lastSync)} (Argentina) · Consulta automática cada ${state.intervalMinutes} minutos` : 'Sin sincronización de Outlook verificada';
    if (!state.configured) notice('Conexión pendiente: configurá Microsoft 365 en el servidor. No se muestran datos de ejemplo ni registros reconstruidos del PDF.');
    else if (state.lastError) notice(state.lastError, true);
    else notice(state.syncing ? 'Consultando Outlook…' : 'Los cambios se guardan en el servidor. Los correos se incorporan como casos por confirmar.');
    render();
  } catch (error) { notice(error.message, true); }
  finally { refreshing = false; }
}
$('sync').addEventListener('click', async () => {
  $('sync').disabled = true; notice('Consultando Outlook…');
  try { await api('/api/sync', { method: 'POST' }); await refresh(); }
  catch (error) { notice(error.message, true); $('sync').disabled = false; }
});
$('edit').addEventListener('submit', async event => {
  event.preventDefault(); $('save').disabled = true;
  try {
    await api(`/api/tasks/${encodeURIComponent(selected)}`, { method: 'PATCH', body: JSON.stringify({ status: $('status').value, priority: $('editPriority').value, owner: $('owner').value, notes: $('notes').value, suggestedReply: $('reply').value, needsReview: !$('reviewed').checked }) });
    $('detail').close(); await refresh();
  } catch (error) { $('saveError').textContent = error.message; }
  finally { $('save').disabled = false; }
});
$('close').addEventListener('click', () => $('detail').close());
$('search').addEventListener('input', render); $('priority').addEventListener('change', render);
for (const mode of ['board', 'list']) $(mode + 'View').addEventListener('click', () => {
  view = mode;
  $('boardView').classList.toggle('selected', mode === 'board'); $('listView').classList.toggle('selected', mode === 'list'); render();
});
$('login').addEventListener('submit', async event => { event.preventDefault(); accessToken = $('token').value; sessionStorage.setItem('hys-token', accessToken); $('token').value = ''; await refresh(); });
await refresh();
setInterval(refresh, 15000);
