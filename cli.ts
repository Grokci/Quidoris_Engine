import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseEnvInt } from "./util.js";
import { FtsIndex } from "./index/ftsIndex.js";
import { indexLibrary } from "./index/indexer.js";
import { RlmEnvironment } from "./env/replEnv.js";
import { runRlm } from "./controller.js";
import { startDaemon } from "./daemon/server.js";

type Args = {
  task: string;
  contextFile?: string;
  contextStdin?: boolean;
  libraryDir?: string;
  reindex?: boolean;
};

function parseArgs(argv: string[]): Args {
  let task = "";
  let contextFile: string | undefined;
  let contextStdin = false;
  let libraryDir: string | undefined;
  let reindex = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--task" && i + 1 < argv.length) task = argv[++i];
    else if (a === "--context-file" && i + 1 < argv.length) contextFile = argv[++i];
    else if (a === "--context-stdin") contextStdin = true;
    else if (a === "--library-dir" && i + 1 < argv.length) libraryDir = argv[++i];
    else if (a === "--reindex") reindex = true;
    else if (!a.startsWith("--") && !task) task = a;
    else if (!a.startsWith("--") && task && !contextFile && !contextStdin) task = `${task} ${a}`.trim();
  }

  if (!task.trim()) {
    throw new Error(
      `Missing --task.\nExamples:\n  bun run quidoris-engine.ts --task "Question" --library-dir ./docs\n  bun run quidoris-engine.ts --task "Question" --context-file ./big.txt`
    );
  }
  return { task: task.trim(), contextFile, contextStdin, libraryDir, reindex };
}

async function readAllStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) chunks.push(chunk);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(buf);
}

export async function main() {
  const argv = process.argv.slice(2);

  // Subcommand: daemon
  if (argv[0] === "daemon") {
    const portArgIdx = argv.indexOf("--port");
    const port = portArgIdx !== -1 && argv[portArgIdx + 1] ? Number(argv[portArgIdx + 1]) : Number(process.env.PORT ?? "8787");
    const engineDbPath = process.env.ENGINE_DB_PATH ?? path.resolve(process.cwd(), "quidoris_engine.sqlite");
    const indexDbPath = process.env.INDEX_PATH ?? path.resolve(process.cwd(), "rlm_index.sqlite");
    const version = process.env.VERSION ?? "0.1.0";

    await startDaemon({
      port: Number.isFinite(port) && port > 0 ? port : 8787,
      engineDbPath,
      indexDbPath,
      version,
    });

    // keep process alive
    await new Promise(() => {});
  }

  const args = parseArgs(argv);
let context = "";
  if (args.contextFile) context = await fs.readFile(args.contextFile, "utf8");
  else if (args.contextStdin) context = await readAllStdin();

  const indexPath = process.env.INDEX_PATH ?? path.resolve(process.cwd(), "rlm_index.sqlite");

  let index: FtsIndex | null = null;

  if (args.libraryDir) {
    index = new FtsIndex(indexPath);

    if (args.reindex) {
      console.log(`[Index] Forced reindex requested. Clearing existing index...`);
      const db = index._raw();
      db.exec(`DELETE FROM docs_fts; DELETE FROM doc_chunks; DELETE FROM docs;`);
    }

    await indexLibrary(index, args.libraryDir);
  }

  const env = new RlmEnvironment({ context, index });
  await runRlm(args.task, env);

  index?.close();
}
