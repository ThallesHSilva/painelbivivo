import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type UserStatus = "pending" | "approved" | "rejected";
const SQLITE_CONSTRAINT_UNIQUE = 2067;
export const CERTIFICATION_SCOPE_ID = "__operation__";

export type DataSnapshotKind =
  | "quartil"
  | "invasao-carteira"
  | "mapa-parque"
  | "resultados-yoy"
  | "best-guess"
  | "portabilidade-analitica"
  | "torres-servico"
  | "qsc";

export type DataSnapshotInfo = {
  kind: DataSnapshotKind;
  sourceName: string;
  updatedAt: string;
  sizeBytes: number;
  checksum: string;
};

export type DataImportInfo = {
  id: number;
  kind: string;
  sourceName: string;
  uploadedBy: string | null;
  status: "success" | "error";
  sizeBytes: number;
  message: string | null;
  createdAt: string;
};

export type CertificationPreview = {
  partnerId: string;
  payload: unknown;
  updatedAt: string;
  updatedBy: string | null;
};

export type StoredUser = {
  id: number;
  name: string;
  email: string;
  partnerName: string;
  passwordHash: string;
  status: UserStatus;
  createdAt: string;
  reviewedAt: string | null;
  lastLoginAt: string | null;
  emailVerifiedAt: string | null;
};

type UserRow = {
  id: number;
  name: string;
  email: string;
  partner_name: string;
  password_hash: string;
  status: UserStatus;
  created_at: string;
  reviewed_at: string | null;
  last_login_at: string | null;
  email_verified_at: string | null;
};

let database: DatabaseSync | undefined;

function databasePath() {
  const environment = (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  return resolve(environment?.DATABASE_PATH || "data/mapa-parque.sqlite");
}

function getDatabase() {
  if (database) return database;
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5_000 });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      partner_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      role TEXT NOT NULL DEFAULT 'client',
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      last_login_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_users_status_created_at ON users(status, created_at);
    CREATE TABLE IF NOT EXISTS data_snapshots (
      kind TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      source_name TEXT NOT NULL,
      uploaded_by TEXT,
      updated_at TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      checksum TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS data_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      source_name TEXT NOT NULL,
      uploaded_by TEXT,
      status TEXT NOT NULL CHECK (status IN ('success', 'error')),
      size_bytes INTEGER NOT NULL DEFAULT 0,
      checksum TEXT,
      message TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_data_imports_kind_created_at
      ON data_imports(kind, created_at DESC);
    CREATE TABLE IF NOT EXISTS certification_previews (
      partner_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );
  `);
  try {
    db.exec("BEGIN IMMEDIATE");
    const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "role")) {
      db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'gn'");
    }
    if (!columns.some((column) => column.name === "email_verified_at")) {
      db.exec("ALTER TABLE users ADD COLUMN email_verified_at TEXT");
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        sent_at INTEGER NOT NULL,
        window_started_at INTEGER NOT NULL,
        send_count INTEGER NOT NULL DEFAULT 1
      )
    `);
    // Previously restricted accounts need approval before accessing the consolidated panel.
    db.exec(`
      UPDATE users
      SET status = CASE WHEN status = 'approved' AND role IS NOT 'director' THEN 'pending' ELSE status END,
          reviewed_at = CASE WHEN status = 'approved' AND role IS NOT 'director' THEN NULL ELSE reviewed_at END,
          role = 'client'
      WHERE role IS NOT 'client'
    `);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    db.close();
    throw error;
  }
  database = db;
  return database;
}

function mapUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    partnerName: row.partner_name,
    passwordHash: row.password_hash,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    lastLoginAt: row.last_login_at,
    emailVerifiedAt: row.email_verified_at,
  };
}

export function findUserByEmail(email: string): StoredUser | null {
  const row = getDatabase().prepare("SELECT * FROM users WHERE email = ? LIMIT 1").get(email) as
    UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function createPendingUser(input: {
  name: string;
  email: string;
  partnerName: string;
  passwordHash: string;
}) {
  const createdAt = new Date().toISOString();
  const result = getDatabase()
    .prepare(
      `INSERT INTO users (name, email, partner_name, password_hash, status, role, created_at)
       VALUES (?, ?, ?, ?, 'pending', 'client', ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .run(input.name, input.email, input.partnerName, input.passwordHash, createdAt);
  return result.changes > 0 ? Number(result.lastInsertRowid) : null;
}

export function listUsers(): StoredUser[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM users
       ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC`,
    )
    .all() as UserRow[];
  return rows.map(mapUser);
}

export function updateUserStatus(id: number, status: UserStatus) {
  const result = getDatabase()
    .prepare("UPDATE users SET status = ?, reviewed_at = ? WHERE id = ?")
    .run(status, new Date().toISOString(), id);
  return result.changes > 0;
}

export function updateUserDetails(
  id: number,
  details: { name: string; email: string; partnerName: string },
) {
  try {
    const result = getDatabase()
      .prepare(
        `UPDATE users SET name = ?, partner_name = ?,
        email_verified_at = CASE WHEN email = ? COLLATE NOCASE THEN email_verified_at ELSE NULL END,
        email = ? WHERE id = ?`,
      )
      .run(details.name, details.partnerName, details.email, details.email, id);
    return result.changes > 0 ? "updated" : "not-found";
  } catch (error) {
    if (
      error instanceof Error &&
      "errcode" in error &&
      error.errcode === SQLITE_CONSTRAINT_UNIQUE
    ) {
      return "exists";
    }
    throw error;
  }
}

export function deleteUser(id: number) {
  return getDatabase().prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
}

export function registerUserLogin(id: number) {
  getDatabase()
    .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

const VERIFICATION_COOLDOWN_MS = 60_000;
const VERIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function reserveEmailVerification(user: StoredUser, tokenHash: string, now: number) {
  const result = getDatabase()
    .prepare(
      `
      INSERT INTO email_verifications
        (user_id, email, token_hash, expires_at, sent_at, window_started_at, send_count)
      SELECT id, email, ?, ?, ?, ?, 1 FROM users
      WHERE id = ? AND email = ? COLLATE NOCASE AND email_verified_at IS NULL
      ON CONFLICT(user_id) DO UPDATE SET
        email = excluded.email, token_hash = excluded.token_hash,
        expires_at = excluded.expires_at, sent_at = excluded.sent_at,
        window_started_at = CASE WHEN email_verifications.window_started_at <= ?
          THEN excluded.window_started_at ELSE email_verifications.window_started_at END,
        send_count = CASE WHEN email_verifications.window_started_at <= ?
          THEN 1 ELSE email_verifications.send_count + 1 END
      WHERE email_verifications.sent_at <= ?
        AND (email_verifications.window_started_at <= ? OR email_verifications.send_count < 10)
    `,
    )
    .run(
      tokenHash,
      now + 60 * 60 * 1000,
      now,
      now,
      user.id,
      user.email,
      now - VERIFICATION_WINDOW_MS,
      now - VERIFICATION_WINDOW_MS,
      now - VERIFICATION_COOLDOWN_MS,
      now - VERIFICATION_WINDOW_MS,
    );
  return result.changes > 0;
}

export function expireEmailVerification(tokenHash: string) {
  // Keep send counters after delivery failures so repeated failures cannot bypass limits.
  getDatabase()
    .prepare("UPDATE email_verifications SET expires_at = 0 WHERE token_hash = ?")
    .run(tokenHash);
}

export function confirmEmailVerification(tokenHash: string, now: number) {
  const db = getDatabase();
  try {
    db.exec("BEGIN IMMEDIATE");
    const result = db
      .prepare(
        `
      UPDATE users SET email_verified_at = ?
      WHERE email_verified_at IS NULL AND EXISTS (
        SELECT 1 FROM email_verifications v
        WHERE v.user_id = users.id AND v.email = users.email COLLATE NOCASE
          AND v.token_hash = ? AND v.expires_at > ?
      )
    `,
      )
      .run(new Date(now).toISOString(), tokenHash, now);
    if (result.changes > 0) {
      db.prepare("DELETE FROM email_verifications WHERE token_hash = ?").run(tokenHash);
    }
    db.exec("COMMIT");
    return result.changes > 0;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

export function saveDataSnapshot(input: {
  kind: DataSnapshotKind;
  payload: unknown;
  sourceName: string;
  uploadedBy?: string | null;
  sizeBytes?: number;
  recordImport?: boolean;
}) {
  const db = getDatabase();
  const payload = JSON.stringify(input.payload);
  const updatedAt = new Date().toISOString();
  const checksum = createHash("sha256").update(payload).digest("hex");
  const sizeBytes = input.sizeBytes ?? Buffer.byteLength(payload, "utf8");

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO data_snapshots
        (kind, payload, source_name, uploaded_by, updated_at, size_bytes, checksum)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind) DO UPDATE SET
         payload = excluded.payload,
         source_name = excluded.source_name,
         uploaded_by = excluded.uploaded_by,
         updated_at = excluded.updated_at,
         size_bytes = excluded.size_bytes,
         checksum = excluded.checksum`,
    ).run(
      input.kind,
      payload,
      input.sourceName,
      input.uploadedBy ?? null,
      updatedAt,
      sizeBytes,
      checksum,
    );
    if (input.recordImport !== false) {
      db.prepare(
        `INSERT INTO data_imports
          (kind, source_name, uploaded_by, status, size_bytes, checksum, created_at)
         VALUES (?, ?, ?, 'success', ?, ?, ?)`,
      ).run(input.kind, input.sourceName, input.uploadedBy ?? null, sizeBytes, checksum, updatedAt);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { updatedAt, checksum, sizeBytes };
}

export function recordDataImportSuccess(input: {
  kind: string;
  sourceName: string;
  uploadedBy?: string | null;
  sizeBytes?: number;
  message?: string | null;
}) {
  getDatabase()
    .prepare(
      `INSERT INTO data_imports
        (kind, source_name, uploaded_by, status, size_bytes, message, created_at)
       VALUES (?, ?, ?, 'success', ?, ?, ?)`,
    )
    .run(
      input.kind,
      input.sourceName,
      input.uploadedBy ?? null,
      input.sizeBytes ?? 0,
      input.message ?? null,
      new Date().toISOString(),
    );
}

export function recordDataImportError(input: {
  kind: string;
  sourceName: string;
  uploadedBy?: string | null;
  sizeBytes?: number;
  message: string;
}) {
  getDatabase()
    .prepare(
      `INSERT INTO data_imports
        (kind, source_name, uploaded_by, status, size_bytes, message, created_at)
       VALUES (?, ?, ?, 'error', ?, ?, ?)`,
    )
    .run(
      input.kind,
      input.sourceName,
      input.uploadedBy ?? null,
      input.sizeBytes ?? 0,
      input.message,
      new Date().toISOString(),
    );
}

export function readDataSnapshot<T>(kind: DataSnapshotKind): T | null {
  const row = getDatabase()
    .prepare("SELECT payload FROM data_snapshots WHERE kind = ?")
    .get(kind) as { payload: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.payload) as T;
}

export function listDataSnapshots(): DataSnapshotInfo[] {
  const rows = getDatabase()
    .prepare(
      `SELECT kind, source_name, updated_at, size_bytes, checksum
       FROM data_snapshots ORDER BY kind`,
    )
    .all() as Array<{
    kind: DataSnapshotKind;
    source_name: string;
    updated_at: string;
    size_bytes: number;
    checksum: string;
  }>;
  return rows.map((row) => ({
    kind: row.kind,
    sourceName: row.source_name,
    updatedAt: row.updated_at,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
  }));
}

export function listDataImports(limit = 10): DataImportInfo[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const selection = `SELECT id, kind, source_name, uploaded_by, status, size_bytes, message, created_at
    FROM data_imports`;
  const rows = getDatabase()
    .prepare(`${selection} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(safeLimit) as Array<{
    id: number;
    kind: string;
    source_name: string;
    uploaded_by: string | null;
    status: "success" | "error";
    size_bytes: number;
    message: string | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    sourceName: row.source_name,
    uploadedBy: row.uploaded_by,
    status: row.status,
    sizeBytes: row.size_bytes,
    message: row.message,
    createdAt: row.created_at,
  }));
}

export function getCertificationPreview(partnerId: string): CertificationPreview | null {
  const row = getDatabase()
    .prepare(
      "SELECT partner_id, payload, updated_at, updated_by FROM certification_previews WHERE partner_id = ?",
    )
    .get(partnerId) as
    | { partner_id: string; payload: string; updated_at: string; updated_by: string | null }
    | undefined;
  if (!row) return null;
  return {
    partnerId: row.partner_id,
    payload: JSON.parse(row.payload),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** A prévia da operação tem prioridade; o último registro legado é preservado como ponto de partida. */
export function getOperationCertificationPreview(): CertificationPreview | null {
  const current = getCertificationPreview(CERTIFICATION_SCOPE_ID);
  if (current) return current;
  const latest = getDatabase()
    .prepare(
      "SELECT partner_id FROM certification_previews ORDER BY updated_at DESC, partner_id ASC LIMIT 1",
    )
    .get() as { partner_id: string } | undefined;
  if (!latest) return null;
  const preview = getCertificationPreview(latest.partner_id);
  return preview ? { ...preview, partnerId: CERTIFICATION_SCOPE_ID } : null;
}

export function saveCertificationPreview(input: {
  partnerId: string;
  payload: unknown;
  updatedBy?: string | null;
}) {
  const updatedAt = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO certification_previews (partner_id, payload, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(partner_id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .run(input.partnerId, JSON.stringify(input.payload), updatedAt, input.updatedBy ?? null);
  return { updatedAt };
}
