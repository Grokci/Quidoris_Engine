#!/usr/bin/env bun
import * as path from "node:path";
import * as fs from "node:fs/promises";

type LauncherOpts = {
  port: number;
  daemonPort: number;
  projectRoot: string;
};

function json(data: any, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

async function fileExists(p: string) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function fetchDaemon(pathname: string, req: Request, daemonPort: number) {
  const url = new URL(req.url);
  const target = new URL(`http://127.0.0.1:${daemonPort}${pathname}${url.search}`);

  // For SSE/streaming, we forward the raw body and stream the response back.
  const init: RequestInit = {
    method: req.method,
    headers: req.headers,
    body: (req.method === "GET" || req.method === "HEAD") ? undefined : req.body,
    redirect: "manual",
  };

  return await fetch(target, init);
}

async function checkDaemon(daemonPort: number) {
  try {
    const r = await fetch(`http://127.0.0.1:${daemonPort}/v1/health`);
    if (!r.ok) return { ok: false };
    return await r.json();
  } catch {
    return { ok: false };
  }
}

async function startDaemonIfNeeded(opts: { projectRoot: string; daemonPort: number }) {
  const health = await checkDaemon(opts.daemonPort);
  if (health?.ok) return { started: false, health };

  const bunBin = process.execPath; // bun
  const cmd = [bunBin, "run", "quidoris-engine.ts", "daemon", "--port", String(opts.daemonPort)];

  const child = Bun.spawn({
    cmd,
    cwd: opts.projectRoot,
    stdout: "inherit",
    stderr: "inherit",
    detached: true,
  });

  // Best-effort: don't keep the parent alive because of this child
  try { child.unref(); } catch {}

  // Wait up to ~5s for health
  const start = Date.now();
  while (Date.now() - start < 5200) {
    const h = await checkDaemon(opts.daemonPort);
    if (h?.ok) return { started: true, health: h };
    await new Promise((r) => setTimeout(r, 250));
  }

  return { started: true, health: { ok: false } };
}

export async function startLauncher(opts: LauncherOpts) {
  const distDir = path.join(opts.projectRoot, "ui", "dist");
  const indexHtmlPath = path.join(distDir, "index.html");

  if (!(await fileExists(indexHtmlPath))) {
    console.warn(`[Launcher] UI build not found at ${indexHtmlPath}`);
    console.warn(`[Launcher] Run: cd ui && bun install && bun run build`);
  }

  console.log(`[Launcher] Serving UI on http://127.0.0.1:${opts.port}`);
  console.log(`[Launcher] Daemon target: http://127.0.0.1:${opts.daemonPort}`);

  return Bun.serve({
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url);
      const p = url.pathname;

      // Start daemon endpoint (called by login button)
      if (req.method === "POST" && p === "/__launcher/daemon/start") {
        const r = await startDaemonIfNeeded({ projectRoot: opts.projectRoot, daemonPort: opts.daemonPort });
        return json(r, { status: 200 });
      }

      if (req.method === "GET" && p === "/__launcher/daemon/status") {
        const health = await checkDaemon(opts.daemonPort);
        return json({ ok: Boolean(health?.ok), health }, { status: 200 });
      }

      // Proxy API calls to daemon
      if (p.startsWith("/v1/")) {
        const resp = await fetchDaemon(p, req, opts.daemonPort);
        return resp;
      }

      // Static UI
      // If requesting an actual file under dist, serve it; otherwise serve index.html (SPA).
      const tryPath = path.normalize(path.join(distDir, p.replace(/^\/+/, "")));
      if (tryPath.startsWith(distDir) && (await fileExists(tryPath)) && !(await fs.stat(tryPath)).isDirectory()) {
        const file = Bun.file(tryPath);
        return new Response(file);
      }

      if (await fileExists(indexHtmlPath)) {
        return new Response(Bun.file(indexHtmlPath), {
          headers: { "content-type": "text/html" },
        });
      }

      return new Response("UI build missing. Run: cd ui && bun install && bun run build", { status: 500 });
    },
  });
}

// CLI
const argv = process.argv.slice(2);
const port = Number(process.env.UI_PORT ?? argv[0] ?? "5173") || 5173;
const daemonPort = Number(process.env.DAEMON_PORT ?? argv[1] ?? "8787") || 8787;
const projectRoot = process.cwd();

startLauncher({ port, daemonPort, projectRoot });
