import { truncate, parseEnvInt } from "./util.js";
import type { FinalResult } from "./types.js";

export function extractFinal(output: string): FinalResult | null {
  const varMatch = output.match(/FINAL_VAR\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*$/m);
  if (varMatch) return { kind: "var", name: varMatch[1] };

  const m = output.match(/FINAL\(\s*([\s\S]*?)\s*\)\s*$/m);
  if (m) return { kind: "text", value: m[1].trim() };

  return null;
}

export function extractReplBlocks(output: string): string[] {
  const blocks: string[] = [];
  const re = /```repl\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) !== null) blocks.push(m[1]);
  return blocks;
}

export function buildSystemPrompt(params: {
  task: string;
  envSummary: { contextLen: number; indexStats: any | null };
  lastObservation: string;
}) {
  const { task, envSummary, lastObservation } = params;
  const completionPhrase = process.env.COMPLETION_PHRASE ?? "RLM TASK COMPLETE";
  const obsTrunc = parseEnvInt("REPL_OUTPUT_TRUNC_CHARS", 8000);

  return `
You are an RLM operating in an interactive REPL environment.

Key rule:
- Long context + documents are NOT pasted into your prompt tokens by default.
- Use REPL to inspect/search/read; use recursive subcalls over snippets; then finish with FINAL(...).

TASK:
${task}

ENV SUMMARY:
- context_total_length (chars): ${envSummary.contextLen}
- indexed_library: ${envSummary.indexStats ? JSON.stringify(envSummary.indexStats) : "none"}

REPL API:
Context:
- context
- search(query, maxMatches=20) -> [{start,end},...]
- read(start,end) -> string

Docs (FTS-backed):
- list_docs(limit=50, offset=0)
- search_docs(query, limit=10) -> [{id,path,chunk_id,start_byte,end_byte,rank,snippet},...]
- read_doc(id, start_byte, end_byte) -> string (async)

Recursive subcalls (prefer batching/async):
- llm_query(snippet, question) -> Promise<string>
- llm_query_async(snippet, question) -> handle_id
- await_deferred([handle_ids?]) -> {handle_id: result}
- llm_query_many_parallel([{snippet,question},...], concurrency?) -> Promise<string[]>
- llm_query_many_batched([{snippet,question},...]) -> Promise<string[]> (single-call batch, falls back)

Execute REPL code in:
\`\`\`repl
// JS (can use await)
\`\`\`

LAST OBSERVATION:
${truncate(lastObservation || "(none yet)", obsTrunc)}

Finish ONLY with:
- FINAL(your answer)
OR
- FINAL_VAR(variable_name)

After the harness prints your final answer, it will print:
${completionPhrase}
`.trim();
}
