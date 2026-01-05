import { Database } from "bun:sqlite";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { ensureAuthTables, countUsers, createUser, findUserByEmail, verifyPassword, createSession, getUserForSessionToken, touchLastLogin, revokeSession } from "./auth.js";
import { FtsIndex } from "../index/ftsIndex.js";

type DaemonOpts = {
  port: number;
  engineDbPath: string;
  indexDbPath: string;
  version: string;
};

function json(data: any, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

function err(code: string, message: string, httpStatus = 400, details?: any) {
  return json({ error: { code, message, details, request_id: crypto.randomUUID() } }, { status: httpStatus });
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("="); 
    if (!k) continue;
    out[k] = rest.join("="); 
  }
  return out;
}

function setCookie(name: string, value: string, opts?: { maxAgeSec?: number; httpOnly?: boolean }) {
  const parts = [`${name}=${value}`, "Path=/", "SameSite=Lax"];
  if (opts?.maxAgeSec != null) parts.push(`Max-Age=${opts.maxAgeSec}`);
  if (opts?.httpOnly !== false) parts.push("HttpOnly");
  return parts.join("; ");
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function startDaemon(opts: DaemonOpts) {
  const startedAt = Date.now();

  // Ensure engine DB exists + minimal tables
  const engineDb = new Database(opts.engineDbPath);
  engineDb.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;`);
  ensureAuthTables(engineDb);

  // Index DB is optional (library features)
  const index = new FtsIndex(opts.indexDbPath);

  console.log(`[Daemon] Engine DB: ${opts.engineDbPath}`);
  console.log(`[Daemon] Index  DB: ${opts.indexDbPath}`);
  console.log(`[Daemon] Listening on http://127.0.0.1:${opts.port}`);

  const server = Bun.serve({
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;

      // CORS for local UI (optional; safe for localhost)
      const corsHeaders = {
        "access-control-allow-origin": req.headers.get("origin") ?? "*",
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      } as Record<string, string>;

      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

      // --- Health ---
      if (req.method === "GET" && pathname === "/v1/health") {
        return json({
          ok: true,
          version: opts.version,
          uptime_ms: Date.now() - startedAt,
          fts_ready: true,
          db_path: opts.engineDbPath,
          index_path: opts.indexDbPath,
        }, { headers: corsHeaders });
      }

      // --- Auth helpers ---
      const cookies = parseCookies(req.headers.get("cookie"));
      const sessionToken = cookies["qid_session"] ?? null;

      if (req.method === "GET" && pathname === "/v1/auth/me") {
        if (!sessionToken) return err("unauthorized", "Not signed in", 401);
        const user = getUserForSessionToken(engineDb, sessionToken);
        if (!user) return err("unauthorized", "Session expired", 401);
        return json({ user: { id: user.id, email: user.email, display_name: user.display_name } }, { headers: corsHeaders });
      }

      if (req.method === "POST" && pathname === "/v1/auth/logout") {
        if (sessionToken) revokeSession(engineDb, sessionToken);
        return json({ ok: true }, {
          headers: { ...corsHeaders, "set-cookie": setCookie("qid_session", "", { maxAgeSec: 0 }) },
        });
      }

      if (req.method === "POST" && pathname === "/v1/auth/register") {
        const body = await readJson(req);
        const email = body?.email?.trim?.();
        const password = body?.password;
        if (!email || !password) return err("invalid_request", "email and password required", 400);
        if (findUserByEmail(engineDb, email)) return err("conflict", "User already exists", 409);

        const user = createUser(engineDb, email, String(password));
        const sess = createSession(engineDb, user.id, 1000 * 60 * 60 * 24 * 30); // 30d
        touchLastLogin(engineDb, user.id);

        return json({ ok: true, user: { id: user.id, email: user.email } }, {
          headers: { ...corsHeaders, "set-cookie": setCookie("qid_session", sess.token, { maxAgeSec: 60 * 60 * 24 * 30 }) },
        });
      }

      if (req.method === "POST" && pathname === "/v1/auth/login") {
        const body = await readJson(req);
        const email = body?.email?.trim?.();
        const password = body?.password;
        if (!email) return err("invalid_request", "email required", 400);

        let user = findUserByEmail(engineDb, email);

        // Local-first UX: if this is the first login on a fresh install, auto-create the first user.
        if (!user && countUsers(engineDb) === 0) {
          if (!password) return err("invalid_request", "password required for first user", 400);
          user = createUser(engineDb, email, String(password));
        }

        if (!user) return err("unauthorized", "Invalid credentials", 401);
        if (user.status !== "active") return err("forbidden", "User disabled", 403);

        // If user has a password hash, enforce it. If null, allow local-trust mode.
        if (user.password_hash) {
          if (!password) return err("unauthorized", "Invalid credentials", 401);
          const ok = verifyPassword(String(password), user.password_hash);
          if (!ok) return err("unauthorized", "Invalid credentials", 401);
        }

        const sess = createSession(engineDb, user.id, 1000 * 60 * 60 * 24 * 30);
        touchLastLogin(engineDb, user.id);

        return json({ ok: true, user: { id: user.id, email: user.email } }, {
          headers: { ...corsHeaders, "set-cookie": setCookie("qid_session", sess.token, { maxAgeSec: 60 * 60 * 24 * 30 }) },
        });
      }

      // --- Minimal doc search (backed by index DB) ---
      if (req.method === "GET" && pathname === "/v1/docs/search") {
        const q = url.searchParams.get("q") ?? "";
        const limit = Number(url.searchParams.get("limit") ?? "10") || 10;
        if (!q.trim()) return err("invalid_request", "q required", 400);
        const hits = index.search(q, limit);
        return json({ hits }, { headers: corsHeaders });
      }

      // Fallback: Not implemented (keeps parity with OpenAPI while we build out)
      if (pathname.startsWith("/v1/")) {
        return err("not_implemented", `Endpoint not implemented: ${pathname}`, 501);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return server;
}
