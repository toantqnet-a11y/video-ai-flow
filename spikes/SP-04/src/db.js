/**
 * SQLite persistence for the SP-04 queue.
 * All state changes and corresponding outbox events must commit together: clients
 * must never observe an event for a job transition that has not been persisted.
 * Node 22's built-in SQLite binding keeps this proof-of-concept dependency-free.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openQueueDb(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      idem_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      spec_hash TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('pending','running','paused','succeeded','failed','cancelled')),
      attempt INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      available_at INTEGER NOT NULL,
      lease_token TEXT,
      lease_until INTEGER,
      worker_id TEXT,
      result_json TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_available ON jobs(status,available_at,priority);
    CREATE INDEX IF NOT EXISTS idx_jobs_lease ON jobs(status,lease_until);
    CREATE TABLE IF NOT EXISTS dependencies (
      job_id TEXT NOT NULL REFERENCES jobs(id),
      depends_on TEXT NOT NULL REFERENCES jobs(id),
      PRIMARY KEY(job_id,depends_on),
      CHECK(job_id <> depends_on)
    );
    CREATE TABLE IF NOT EXISTS attempts (
      job_id TEXT NOT NULL REFERENCES jobs(id),
      attempt INTEGER NOT NULL,
      worker_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      outcome TEXT,
      PRIMARY KEY(job_id,attempt)
    );
    -- The asset record is a single committed logical revision, not one per attempt.
    -- An expired worker cannot replace this row because completion checks fencing.
    CREATE TABLE IF NOT EXISTS assets (
      logical_key TEXT PRIMARY KEY,
      job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),
      checksum TEXT NOT NULL,
      file_path TEXT NOT NULL,
      committed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      detail_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_job ON outbox(job_id,seq);
  `);
  return db;
}

/** Atomic read-modify-write across threads/processes with SQLite's writer lock. */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const output = fn();
    db.exec('COMMIT');
    return output;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* preserve original failure */ }
    throw error;
  }
}
