import vm from "node:vm";
import * as fs from "node:fs/promises";
import type { FtsIndex } from "../index/ftsIndex.js";
import type { LlmRequest, ReplRunResult } from "../types.js";
import { parseEnvInt, truncate } from "../util.js";
import { callLLM } from "../llm/cliAdapter.js";
import { runWithConcurrency } from "./concurrency.js";
import { llmQueryManyBatched } from "./subcalls.js";

export class RlmEnvironment {
  public readonly context: string;
  public readonly index: FtsIndex | null;

  private readonly replOutputTrunc: number;
  private readonly replTimeoutMs: number;
  private readonly ctx: vm.Context;

  private recursionDepth = 0;
  private readonly maxRecDepth: number;

  private readonly deferred: Map<string, Promise<string>> = new Map();
  private deferredCounter = 0;

  constructor(params: { context: string; index: FtsIndex | null }) {
    this.context = params.context;
    this.index = params.index;

    this.replOutputTrunc = parseEnvInt("REPL_OUTPUT_TRUNC_CHARS", 8000);
    this.replTimeoutMs = parseEnvInt("REPL_TIMEOUT_MS", 2000);
    this.maxRecDepth = parseEnvInt("MAX_RECURSION_DEPTH", 1);

    const printed: string[] = [];
    const print = (...args: any[]) => printed.push(args.map(String).join(" "));
    const maxConc = parseEnvInt("MAX_SUBCALL_CONCURRENCY", 6);

    // Context ops
    const search = (query: string, maxMatches = 20) => {
      const q = String(query);
      const matches: Array<{ start: number; end: number }> = [];
      let idx = 0;
      while (idx < this.context.length && matches.length < maxMatches) {
        const found = this.context.indexOf(q, idx);
        if (found === -1) break;
        matches.push({ start: found, end: found + q.length });
        idx = found + Math.max(1, q.length);
      }
      return matches;
    };

    const read = (start: number, end: number) =>
      this.context.slice(Math.max(0, start), Math.max(0, end));

    // Doc ops (FTS-backed)
    const list_docs = (limit = 50, offset = 0) => this.index?.list_docs(limit, offset) ?? [];
    const search_docs = (query: string, limit = 10) => this.index?.search_docs(String(query), limit) ?? [];
    const read_doc = async (id: string, start_byte: number, end_byte: number) => {
      if (!this.index) throw new Error("No index loaded.");
      const meta = this.index.get_doc(String(id));
      if (!meta) throw new Error(`Unknown doc id: ${id}`);
      const buf = new Uint8Array(await fs.readFile(String(meta.path)));
      const s = Math.max(0, Math.floor(start_byte));
      const e = Math.min(buf.length, Math.floor(end_byte));
      return new TextDecoder().decode(buf.slice(s, e));
    };

    // Subcall primitives
    const llm_query = async (snippet: string, question: string) => {
      if (this.recursionDepth >= this.maxRecDepth) {
        return `[llm_query blocked: max recursion depth ${this.maxRecDepth} reached]`;
      }
      this.recursionDepth++;
      try {
        const subModel = process.env.LLM_SUBMODEL || process.env.LLM_MODEL || "devstral";
        const subPrompt = [
          "You are a sub-LLM called by an RLM harness.",
          "Answer the question using ONLY the provided snippet.",
          "Be concise and factual. If missing info, say what's missing.",
          "",
          "QUESTION:",
          String(question),
          "",
          "SNIPPET:",
          String(snippet),
        ].join("\n");
        return (await callLLM(subPrompt, subModel)).trim();
      } finally {
        this.recursionDepth--;
      }
    };

    const llm_query_async = (snippet: string, question: string) => {
      const id = `q${++this.deferredCounter}`;
      this.deferred.set(id, llm_query(snippet, question));
      return id;
    };

    const await_deferred = async (ids?: string[]) => {
      const keys = ids?.length ? ids : Array.from(this.deferred.keys());
      const out: Record<string, string> = {};
      await Promise.all(
        keys.map(async (k) => {
          const p = this.deferred.get(k);
          if (!p) return;
          out[k] = await p;
          this.deferred.delete(k);
        })
      );
      return out;
    };

    const llm_query_many_parallel = async (requests: LlmRequest[], concurrency = maxConc) => {
      if (this.recursionDepth >= this.maxRecDepth) {
        return requests.map(() => `[blocked: max recursion depth ${this.maxRecDepth}]`);
      }
      this.recursionDepth++;
      try {
        return await runWithConcurrency(
          requests,
          Math.max(1, Math.floor(concurrency)),
          async (r) => llm_query(r.snippet, r.question)
        );
      } finally {
        this.recursionDepth--;
      }
    };

    const llm_query_many_batched = async (requests: LlmRequest[]) => {
      if (this.recursionDepth >= this.maxRecDepth) {
        return requests.map(() => `[blocked: max recursion depth ${this.maxRecDepth}]`);
      }
      this.recursionDepth++;
      try {
        const subModel = process.env.LLM_SUBMODEL || process.env.LLM_MODEL || "devstral";
        const batched = await llmQueryManyBatched(requests, subModel);
        if (batched) return batched;
        return await llm_query_many_parallel(requests, maxConc);
      } finally {
        this.recursionDepth--;
      }
    };

    // VM context (not a hardened sandbox)
    this.ctx = vm.createContext({
      Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp,
      print,
      state: () => ({
        context_total_length: this.context.length,
        index_loaded: Boolean(this.index),
        max_recursion_depth: this.maxRecDepth,
        max_subcall_concurrency: maxConc,
      }),
      // env
      context: this.context,
      search,
      read,
      // docs
      list_docs,
      search_docs,
      read_doc,
      // subcalls
      llm_query,
      llm_query_async,
      await_deferred,
      llm_query_many_parallel,
      llm_query_many_batched,
    });

    (this.ctx as any).__printed = printed;
  }

  async runRepl(code: string): Promise<ReplRunResult> {
    const printed: string[] = (this.ctx as any).__printed;
    printed.length = 0;

    const wrapped = `(async () => {\n${code}\n})()`;

    try {
      const script = new vm.Script(wrapped, { filename: "quidoris_repl.js" });
      const result = script.runInContext(this.ctx, { timeout: this.replTimeoutMs });
      if (result && typeof (result as any).then === "function") await result;

      const out = printed.join("\n");
      return { ok: true, printed: truncate(out, this.replOutputTrunc) };
    } catch (e: any) {
      const err = e?.stack ? String(e.stack) : String(e);
      const out = printed.join("\n");
      return { ok: false, printed: truncate(out, this.replOutputTrunc), error: truncate(err, this.replOutputTrunc) };
    }
  }

  getVar(name: string): unknown {
    return (this.ctx as any)[name];
  }
}
