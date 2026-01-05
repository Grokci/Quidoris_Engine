import { parseEnvInt, parseShellArgs, redactCmdForLog, applyTemplate, extractJsonFromText } from "../util.js";

export async function callLLM(prompt: string, modelOverride?: string): Promise<string> {
  const cmd = process.env.LLM_CMD || "mistral";
  const model = modelOverride ?? (process.env.LLM_MODEL || "devstral");
  const format = (process.env.LLM_OUTPUT || "text").toLowerCase(); // text|json

  const argsTemplate =
    process.env.LLM_ARGS_TEMPLATE ?? "chat --model {model} --stdin --output {format}";
  const rendered = applyTemplate(argsTemplate, { model, format });
  const args = parseShellArgs(rendered);

  const fullCmd = [cmd, ...args];
  console.log(`\n[Quidoris Engine] LLM call: ${redactCmdForLog(fullCmd).join(" ")}`);
  console.log(`[Quidoris Engine] Prompt size: ${prompt.length.toLocaleString()} chars`);

  const timeoutMs = parseEnvInt("CLI_TIMEOUT_MS", 180_000);
  const proc = Bun.spawn({
    cmd: fullCmd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdin.write(prompt);
  proc.stdin.end();

  const timeout = setTimeout(() => {
    try { proc.kill(); } catch {}
  }, timeoutMs);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  clearTimeout(timeout);

  if (stderr.trim()) console.error(`[Quidoris Engine][llm stderr]\n${stderr}`);
  if (exitCode !== 0) throw new Error(`[Quidoris Engine] LLM CLI exited with code ${exitCode}.`);

  const out = stdout.trim();

  if (format === "json") {
    const parsed = (() => {
      try { return JSON.parse(out); } catch { return extractJsonFromText(out); }
    })();

    if (parsed) {
      const text =
        (parsed as any)?.output ??
        (parsed as any)?.text ??
        (parsed as any)?.message ??
        (parsed as any)?.choices?.[0]?.message?.content ??
        (parsed as any)?.choices?.[0]?.text;
      if (typeof text === "string") return text.trim();
    }
  }

  return out;
}
