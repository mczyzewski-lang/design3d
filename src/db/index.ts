import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

let db: DatabaseSync | null = null;

export type Row = Record<string, any>;
export type Param = SQLInputValue | boolean | undefined;

function norm(params: Param[]): SQLInputValue[] {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

export function openDb(file = config.databasePath): DatabaseSync {
  if (db) return db;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

function conn(): DatabaseSync {
  return db ?? openDb();
}

export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  return conn().prepare(sql).all(...norm(params)) as T[];
}

export function get<T = Row>(sql: string, ...params: Param[]): T | undefined {
  return conn().prepare(sql).get(...norm(params)) as T | undefined;
}

export function run(sql: string, ...params: Param[]): { changes: number; lastInsertRowid: number } {
  const r = conn().prepare(sql).run(...norm(params));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

export function exec(sql: string): void {
  conn().exec(sql);
}

let txDepth = 0;
/** Transakcja (z obsługą zagnieżdżenia przez SAVEPOINT). Synchroniczna. */
export function tx<T>(fn: () => T): T {
  const c = conn();
  const sp = `sp${txDepth}`;
  if (txDepth === 0) c.exec('BEGIN IMMEDIATE');
  else c.exec(`SAVEPOINT ${sp}`);
  txDepth++;
  try {
    const out = fn();
    txDepth--;
    if (txDepth === 0) c.exec('COMMIT');
    else c.exec(`RELEASE ${sp}`);
    return out;
  } catch (e) {
    txDepth--;
    if (txDepth === 0) c.exec('ROLLBACK');
    else c.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  }
}

export const nowIso = (): string => new Date().toISOString();
export const json = (v: unknown): string => JSON.stringify(v ?? null);
export function parseJson<T>(s: string | null | undefined, d: T): T {
  if (!s) return d;
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
}
