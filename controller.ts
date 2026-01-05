import { parseEnvInt, truncate } from "./util.js";
import { callLLM } from "./llm/cliAdapter.js";
import { extractFinal, extractReplBlocks, buildSystemPrompt } from "./prompt.js";
import type { RlmEnvironment } from "./env/replEnv.js";

export async function runRlm(task: string, env: RlmEnvironment) {
  const maxSteps = parseEnvInt("MAX_STEPS", 30);
  const completionPhrase = process.env.COMPLETION_PHRASE ?? "RLM TASK COMPLETE";

  const envSummary = {
    contextLen: env.context.length,
    indexStats: (env.index ? env.index.stats() : null),
  };

  console.log(`[Quidoris Engine] Starting`);
  console.log(`[Quidoris Engine] Steps budget: ${maxSteps}`);
  console.log(`[Quidoris Engine] Context length: ${envSummary.contextLen.toLocaleString()} chars`);
  if (envSummary.indexStats) console.log(`[Quidoris Engine] Index: ${JSON.stringify(envSummary.indexStats)}`);

  let lastObservation = "";

  for (let step = 1; step <= maxSteps; step++) {
    console.log(`\n[Quidoris Engine] === Step ${step}/${maxSteps} ===`);

    const prompt = buildSystemPrompt({
      task,
      envSummary,
      lastObservation,
    });

    const modelOut = await callLLM(prompt);

    const fin = extractFinal(modelOut);
    if (fin) {
      let finalText = "";
      if (fin.kind === "text") finalText = fin.value;
      else {
        const v = env.getVar(fin.name);
        finalText = typeof v === "string" ? v : JSON.stringify(v, null, 2);
      }

      console.log(`\n[Quidoris Engine] FINAL detected.\n`);
      console.log(finalText.trim());
      console.log(`\n${completionPhrase}`);
      return;
    }

    const replBlocks = extractReplBlocks(modelOut);
    if (replBlocks.length === 0) {
      lastObservation =
        "No ```repl``` blocks and no FINAL/FINAL_VAR found. You must either run REPL code or finish with FINAL(...).";
      console.log(`[Quidoris Engine] ${lastObservation}`);
      continue;
    }

    const observations: string[] = [];
    for (let i = 0; i < replBlocks.length; i++) {
      const code = replBlocks[i];
      console.log(`\n[Quidoris Engine] Running REPL block ${i + 1}/${replBlocks.length} (chars=${code.length})`);
      const res = await env.runRepl(code);

      console.log(`\n[Quidoris Engine][repl stdout]\n${res.printed.trim() ? res.printed : "(empty)"}`);
      if (!res.ok) console.log(`\n[Quidoris Engine][repl error]\n${res.error ?? "(unknown error)"}`);

      observations.push(
        res.ok
          ? `REPL block ${i + 1} ok.\nstdout:\n${res.printed}`.trim()
          : `REPL block ${i + 1} failed.\nstdout:\n${res.printed}\nerror:\n${res.error ?? ""}`.trim()
      );
    }

    lastObservation = observations.join("\n\n---\n\n");
  }

  console.log(`\n[Quidoris Engine] Max steps reached without FINAL. Exiting.`);
  console.log(`\n${completionPhrase}`);
}
