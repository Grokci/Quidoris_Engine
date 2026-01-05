# API Quickstart

This is a **local-first** HTTP API for the Quidoris Engine daemon.

- Base URL: `http://127.0.0.1:8787`
- API Spec: `openapi/openapi.yaml`
- Streaming: SSE (`/v1/runs/{run_id}/events`)

## 1) Health

```bash
curl -s http://127.0.0.1:8787/v1/health | jq
```

## 2) Register + login (local profiles)

Register:
```bash
curl -s -X POST http://127.0.0.1:8787/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ken@example.com","password":"password","display_name":"Ken"}' | jq
```

Login (stores cookie in `cookies.txt`):
```bash
curl -s -X POST http://127.0.0.1:8787/v1/auth/login \
  -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"ken@example.com","password":"password"}' | jq
```

Who am I:
```bash
curl -s http://127.0.0.1:8787/v1/auth/me \
  -b cookies.txt | jq
```

## 3) Upload documents

```bash
curl -s -X POST http://127.0.0.1:8787/v1/library/upload \
  -b cookies.txt \
  -F 'files=@./docs/retention-policy.md' \
  -F 'folder=uploads' \
  -F 'tags=["policy","billing"]' | jq
```

List docs:
```bash
curl -s 'http://127.0.0.1:8787/v1/library/documents?limit=20' \
  -b cookies.txt | jq
```

## 4) Index sync

Scan and enqueue indexing:
```bash
curl -s -X POST http://127.0.0.1:8787/v1/index/sync \
  -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"paths":["./library"],"reindex_all":false}' | jq
```

Check status:
```bash
curl -s http://127.0.0.1:8787/v1/index/status \
  -b cookies.txt | jq
```

## 5) Search & read

Search (FTS):
```bash
curl -s -X POST http://127.0.0.1:8787/v1/search \
  -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"query":"retention AND billing","limit":5}' | jq
```

Read a document slice:
```bash
curl -s -X POST http://127.0.0.1:8787/v1/read \
  -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"document_id":"doc_...","start_byte":0,"end_byte":2000}' | jq
```

## 6) Start a run + stream via SSE

Start run:
```bash
curl -s -X POST http://127.0.0.1:8787/v1/runs \
  -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{
    "task":"Summarize billing retention policy with citations.",
    "mode":"balanced",
    "strict":true,
    "citations":true,
    "stream":true,
    "provider":{
      "type":"local_cli",
      "model":"devstral",
      "endpoint":null,
      "preset_name":"Local CLI"
    }
  }' | jq
```

Stream events (note `-N` to disable buffering):
```bash
curl -N http://127.0.0.1:8787/v1/runs/RUN_ID/events \
  -b cookies.txt
```

Fetch final output:
```bash
curl -s http://127.0.0.1:8787/v1/runs/RUN_ID \
  -b cookies.txt | jq
```

Evidence + trace:
```bash
curl -s http://127.0.0.1:8787/v1/runs/RUN_ID/evidence -b cookies.txt | jq
curl -s http://127.0.0.1:8787/v1/runs/RUN_ID/steps -b cookies.txt | jq
```

## 7) Pagination

List endpoints return `next_cursor`.

See `docs/pagination.md` for details.
