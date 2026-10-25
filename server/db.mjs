import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function openDatabase(dir) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "space.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#b8c99b', archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS paths (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', type TEXT NOT NULL CHECK(type IN ('modules','map')), archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS modules (id TEXT PRIMARY KEY, path_id TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE, title TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS steps (id TEXT PRIMARY KEY, path_id TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE, module_id TEXT REFERENCES modules(id), title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_started', position INTEGER NOT NULL DEFAULT 0, x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, path_id TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE, source TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE, target TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE, UNIQUE(source,target), CHECK(source<>target));
    CREATE TABLE IF NOT EXISTS notes (step_id TEXT PRIMARY KEY REFERENCES steps(id) ON DELETE CASCADE, content TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}', revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS study_sessions (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id), path_id TEXT REFERENCES paths(id), step_id TEXT REFERENCES steps(id), date TEXT NOT NULL, minutes INTEGER NOT NULL CHECK(minutes>0), notes TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS sessions_date ON study_sessions(date);
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', type TEXT NOT NULL CHECK(type IN ('exercises','book','paper')), url TEXT NOT NULL DEFAULT '', file_id TEXT REFERENCES files(id), tags TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS material_subjects (material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE, subject_id TEXT NOT NULL REFERENCES subjects(id), PRIMARY KEY(material_id,subject_id));
    CREATE TABLE IF NOT EXISTS step_materials (step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE, material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE, PRIMARY KEY(step_id,material_id));
    PRAGMA user_version=1;
  `);
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
