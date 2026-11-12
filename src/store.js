import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'hys.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  list() {
    return this.db.prepare('SELECT payload FROM tasks').all().map(row => JSON.parse(row.payload));
  }
  meta(key) { return this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key)?.value ?? null; }
  setMeta(key, value) { this.db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)').run(key, value); }
  save(task) { this.db.prepare('INSERT OR REPLACE INTO tasks VALUES (?,?)').run(task.id, JSON.stringify(task)); }
  patch(id, changes) {
    const row = this.db.prepare('SELECT payload FROM tasks WHERE id=?').get(id);
    if (!row) return null;
    const task = { ...JSON.parse(row.payload), ...changes, editedAt: new Date().toISOString() };
    this.save(task);
    return task;
  }
  merge(messages, cutoff) {
    this.db.exec('BEGIN');
    try {
      const tasks = new Map(this.list().map(task => [task.id, task]));
      for (const message of messages) {
        if (!message.conversationId || !message.id || !message.receivedDateTime) continue;
        const old = tasks.get(message.conversationId);
        if (old && old.receivedAt >= message.receivedDateTime) continue;
        const address = message.from?.emailAddress;
        const task = {
          id: message.conversationId,
          subject: message.subject || '(Sin asunto)',
          sender: address?.name || address?.address || 'Sin remitente',
          senderEmail: address?.address || '',
          receivedAt: message.receivedDateTime,
          messageId: message.id,
          url: message.webLink || '',
          preview: message.bodyPreview || '',
          // Incoming messages are candidates, not confirmed requests or AI conclusions.
          status: old?.status || 'Por confirmar',
          priority: old?.priority || 'Sin clasificar',
          owner: old?.owner || '',
          notes: old?.notes || '',
          suggestedReply: old?.suggestedReply || '',
          editedAt: old?.editedAt || null,
          needsReview: true
        };
        tasks.set(task.id, task);
        this.save(task);
      }
      this.setMeta('lastSync', cutoff);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
