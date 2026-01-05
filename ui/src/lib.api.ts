export type Provider = "local_cli" | "hf" | "openai_compat";

export type Health = {
  ok: boolean;
  version?: string;
  uptime_ms?: number;
  fts_ready?: boolean;
  db_path?: string;
};

export async function health(): Promise<Health> {
  const res = await fetch("/v1/health", { credentials: "include" });
  if (!res.ok) throw new Error(`health_failed:${res.status}`);
  return await res.json();
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch("/v1/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let msg = `login_failed:${res.status}`;
    try {
      const data = await res.json();
      msg = data?.error?.message ?? msg;
    } catch {}
    throw new Error(msg);
  }
}

export async function waitForDaemon(opts?: { timeoutMs?: number; intervalMs?: number }) {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const intervalMs = opts?.intervalMs ?? 400;
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const h = await health();
      if (h?.ok) return h;
    } catch {}
    if (Date.now() - start > timeoutMs) {
      throw new Error("daemon_unreachable");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}


export async function startDaemon(): Promise<{ started: boolean; health?: any }> {
  const res = await fetch("/__launcher/daemon/start", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`start_daemon_failed:${res.status}`);
  return await res.json();
}
