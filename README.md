# Quidoris Engine (Bun)

A **commercial-grade RLM harness/runtime** that helps “avoid the rot” and “trust the answer” by:

- Treating long prompts and large corpora as an **external environment** (not model tokens).
- Providing a persistent **REPL environment** the model can use to inspect/search/read.
- Supporting **recursive sub-LLM calls** over snippets with **async + batching**.
- Indexing a 1,000+ document library using **SQLite FTS5** with **incremental reindexing**.

> Default backend config matches Mistral CLI, but the engine is **CLI-agnostic** and **stdin-first**.

## Quickstart

### 1) Install Bun
- https://bun.sh

### 2) Point at your LLM backend (default: Mistral CLI)
```bash
export LLM_CMD="mistral"
export LLM_ARGS_TEMPLATE='chat --model {model} --stdin --output {format}'
export LLM_MODEL="devstral"
export LLM_OUTPUT="text"   # or "json"
```

### 3) Run with a library
```bash
bun run quidoris-engine.ts --task "Find the retention policy and summarize it." --library-dir ./docs
```

### 4) Run with a single big context
```bash
bun run quidoris-engine.ts --task "Answer using the context." --context-file ./big.txt
```

## What makes it “avoid the rot”?
Instead of pasting an ever-growing history + all documents into the model input, the engine:
1) Maintains documents externally (disk + SQLite index).
2) Lets the model **search** and **read slices** as needed.
3) Encourages **batched/async** subcalls over selected evidence.
4) Requires an explicit `FINAL(...)` or `FINAL_VAR(...)` to finish.

## Mermaid flowchart

```mermaid
flowchart TD
  U[User Task] --> H[Quidoris Engine]
  H -->|scan + incremental index| DB[(rlm_index.sqlite<br/>FTS5 + metadata)]
  H -->|stdin prompt| LLM[LLM Backend<br/>CLI-agnostic]
  LLM -->|outputs REPL code blocks| H
  H -->|exec REPL| ENV[Environment<br/>context + doc library]
  ENV -->|search/read| DB
  ENV -->|evidence snippets| H
  H -->|async/batched subcalls: llm_query_many_*| LLM
  LLM -->|FINAL(...)| H
  H --> OUT[Final Answer<br/>+ Completion Phrase]
```

## CLI

```bash
bun run quidoris-engine.ts   --task "..."   [--library-dir ./docs]   [--context-file ./big.txt | --context-stdin]   [--reindex]
```

## Env vars (core)
- `LLM_CMD` (default `mistral`)
- `LLM_ARGS_TEMPLATE` (default `chat --model {model} --stdin --output {format}`)
- `LLM_MODEL` (default `devstral`)
- `LLM_SUBMODEL` (default = `LLM_MODEL`)
- `LLM_OUTPUT` (`text` or `json`, default `text`)

## Env vars (budgets / safety)
- `MAX_STEPS` (default `30`)
- `MAX_RECURSION_DEPTH` (default `1`)
- `MAX_SUBCALL_CONCURRENCY` (default `6`)
- `CLI_TIMEOUT_MS` (default `180000`)
- `REPL_TIMEOUT_MS` (default `2000`)
- `REPL_OUTPUT_TRUNC_CHARS` (default `8000`)
- `COMPLETION_PHRASE` (default `RLM TASK COMPLETE`)

## Env vars (indexing)
- `INDEX_PATH` (default `./rlm_index.sqlite`)
- `LIBRARY_EXTS` (default `.txt,.md,.json,.yaml,.yml,.csv,.log`)
- `LIBRARY_MAX_FILES` (default `5000`)
- `LIBRARY_MAX_FILE_BYTES` (default `5000000`)
- `CHUNK_BYTES` (default `16384`)

## Hugging Face readiness
- Use any Hugging Face model/endpoint by wrapping it in a CLI that reads from stdin and prints to stdout,
  then set `LLM_CMD` + `LLM_ARGS_TEMPLATE` accordingly.
- UI can be added as a separate package (see next step).

## Security note
The REPL uses Node `vm`. It is not a hardened sandbox. Run with trusted models and inputs.


## UI (local web app)

A lightweight local web UI lives in `./ui`.

```bash
cd ui
bun install
bun run dev
```

The UI proxies `/v1/*` to `http://127.0.0.1:8787` (see `ui/vite.config.ts`).

> Note: The UI expects the daemon API to be running. If you haven’t implemented the daemon yet, the Login page will show a helpful message.


## UI Launcher (auto-start daemon)

The browser can’t spawn local processes, so the UI is served by a tiny local launcher that *can* start the daemon.

1) Build the UI

```bash
cd ui
bun install
bun run build
```

2) Start the launcher (serves UI + proxies `/v1/*` to the daemon)

```bash
cd ..
bun run ui:launch
```

Now open `http://127.0.0.1:5173`.

- Clicking **Enter the Engine** calls `POST /__launcher/daemon/start` which spawns `bun run quidoris-engine.ts daemon` if needed.
- The UI then logs in and routes to `/app`.
