export function parseEnvInt(name: string, fallback: number) {
  const raw = process.env[name];
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function truncate(s: string, maxChars: number) {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `\n…(truncated, total ${s.length} chars)…`;
}

export function parseShellArgs(input: string | undefined): string[] {
  const s = (input ?? "").trim();
  if (!s) return [];
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let mode: "none" | "single" | "double" = "none";

  while (i < s.length) {
    const ch = s[i];

    if (mode === "single") {
      if (ch === "'") mode = "none";
      else cur += ch;
      i++;
      continue;
    }

    if (mode === "double") {
      if (ch === '"') {
        mode = "none";
        i++;
        continue;
      }
      if (ch === "\\" && i + 1 < s.length) {
        cur += s[i + 1];
        i += 2;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }

    if (/\s/.test(ch)) {
      if (cur) out.push(cur), (cur = "");
      i++;
      continue;
    }
    if (ch === "'") {
      mode = "single";
      i++;
      continue;
    }
    if (ch === '"') {
      mode = "double";
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < s.length) {
      cur += s[i + 1];
      i += 2;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur) out.push(cur);
  return out;
}

export function redactCmdForLog(cmd: string[]): string[] {
  const secretFlag = /^(--?(api[-_]?key|key|token|secret|password|bearer))$/i;
  const secretInline = /(api[-_]?key|token|secret|password)=/i;

  const out = [...cmd];
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    if (secretFlag.test(a) && i + 1 < out.length) {
      out[i + 1] = "***REDACTED***";
      i++;
      continue;
    }
    if (secretInline.test(a)) {
      const idx = a.indexOf("=");
      if (idx !== -1) out[i] = a.slice(0, idx + 1) + "***REDACTED***";
    }
  }
  return out;
}

export function applyTemplate(s: string, vars: Record<string, string>): string {
  return s.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

export function extractJsonFromText(text: string): any | null {
  const t = text.trim();
  if (!t) return null;

  const startIdx = (() => {
    const o = t.indexOf("{");
    const a = t.indexOf("[");
    if (o === -1) return a;
    if (a === -1) return o;
    return Math.min(o, a);
  })();
  if (startIdx === -1) return null;

  const stack: string[] = [];
  for (let i = startIdx; i < t.length; i++) {
    const ch = t[i];
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      const top = stack.pop();
      if (!top) continue;
      if ((top === "{" && ch !== "}") || (top === "[" && ch !== "]")) continue;
      if (stack.length === 0) {
        const candidate = t.slice(startIdx, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
