import type { LlmRequest } from "../types.js";
import { extractJsonFromText } from "../util.js";
import { callLLM } from "../llm/cliAdapter.js";

export async function llmQueryManyBatched(requests: LlmRequest[], model: string): Promise<string[] | null> {
  const payload = requests.map((r, i) => ({ id: i, question: r.question, snippet: r.snippet }));
  const prompt = [
    "You are a sub-LLM in an RLM harness.",
    "Answer each item using ONLY its snippet. If insufficient, say what's missing.",
    "Return ONLY a JSON array of strings in the same order as the items.",
    "",
    "ITEMS_JSON:",
    JSON.stringify(payload),
  ].join("\n");

  const out = await callLLM(prompt, model);

  try {
    const parsed = JSON.parse(out);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  } catch {
    const extracted = extractJsonFromText(out);
    if (Array.isArray(extracted) && extracted.every((x) => typeof x === "string")) return extracted;
  }
  return null;
}
