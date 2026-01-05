import { Database } from "bun:sqlite";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export type User = {
  id: string;
  email: string;
  display_name?: string | null;
  password_hash?: string | null;
  created_at_ms: number;
  last_login_at_ms?: number | null;
  status: "active" | "disabled";
};

function nowMs() { return Date.now(); }

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const iterations = 210_000; // PBKDF2-HMAC-SHA256; reasonable baseline for local auth
  const keylen = 32;
  const derived = pbkdf2Sync(password, salt, iterations, keylen, "sha256");
  return `pbkdf2$${iterations}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [alg, iterStr, saltB64, hashB64] = parts;
  if (alg !== "pbkdf2") return false;
  const iterations = Number(iterStr);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function ensureAuthTables(db: Database) {
  // Minimal subset; full schema lives in docs/db_schema.sql. We create essentials defensively.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT,
      created_at_ms INTEGER NOT NULL,
      last_login_at_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      revoked_at_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);
}

function ulidLike() {
  // Simple sortable-ish id (not strict ULID) good enough for local IDs
  return `${nowMs().toString(36)}_${randomBytes(10).toString("hex")}`;
}

export function findUserByEmail(db: Database, email: string): User | null {
  const row = db.query(`SELECT * FROM users WHERE email = ? LIMIT 1;`).get(email) as any;
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    display_name: row.display_name ?? null,
    password_hash: row.password_hash ?? null,
    created_at_ms: Number(row.created_at_ms),
    last_login_at_ms: row.last_login_at_ms ?? null,
    status: (row.status ?? "active") as any,
  };
}

export function countUsers(db: Database): number {
  const row = db.query(`SELECT COUNT(*) AS n FROM users;`).get() as any;
  return Number(row?.n ?? 0);
}

export function createUser(db: Database, email: string, password: string): User {
  const id = ulidLike();
  const created_at_ms = nowMs();
  const password_hash = hashPassword(password);

  db.query(`
    INSERT INTO users (id, email, password_hash, created_at_ms, status)
    VALUES (?, ?, ?, ?, 'active');
  `).run(id, email, password_hash, created_at_ms);

  return {
    id,
    email,
    password_hash,
    created_at_ms,
    status: "active",
    display_name: null,
    last_login_at_ms: null,
  };
}

export function createSession(db: Database, user_id: string, ttlMs: number) {
  const id = ulidLike();
  const token = randomBytes(24).toString("base64url");
  const token_hash = sha256Hex(token);
  const created_at_ms = nowMs();
  const expires_at_ms = created_at_ms + ttlMs;

  db.query(`
    INSERT INTO sessions (id, user_id, token_hash, created_at_ms, expires_at_ms)
    VALUES (?, ?, ?, ?, ?);
  `).run(id, user_id, token_hash, created_at_ms, expires_at_ms);

  return { id, token, token_hash, created_at_ms, expires_at_ms };
}

export function getUserForSessionToken(db: Database, token: string): User | null {
  const token_hash = sha256Hex(token);
  const row = db.query(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at_ms IS NULL
      AND s.expires_at_ms > ?
    LIMIT 1;
  `).get(token_hash, nowMs()) as any;

  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    display_name: row.display_name ?? null,
    password_hash: row.password_hash ?? null,
    created_at_ms: Number(row.created_at_ms),
    last_login_at_ms: row.last_login_at_ms ?? null,
    status: (row.status ?? "active") as any,
  };
}

export function touchLastLogin(db: Database, user_id: string) {
  db.query(`UPDATE users SET last_login_at_ms = ? WHERE id = ?;`).run(nowMs(), user_id);
}

export function revokeSession(db: Database, token: string) {
  const token_hash = sha256Hex(token);
  db.query(`UPDATE sessions SET revoked_at_ms = ? WHERE token_hash = ?;`).run(nowMs(), token_hash);
}
