# SSE (Server-Sent Events)

Quidoris Engine streams run progress over SSE (no websockets).

## Endpoint

- `GET /v1/runs/{run_id}/events`
- Response: `Content-Type: text/event-stream`

## Event types

### `step`
A trace step that also persists to `run_steps`.

Payload:
```json
{
  "seq": 3,
  "stage": "Read",
  "detail": "Read 3 excerpts (total 4.8KB)",
  "at_ms": 1736040000300
}
```

### `evidence`
Evidence discovered or pinned. Persists to `run_evidence`.

Payload:
```json
{
  "chunk_id": "chk_01HX...",
  "rank": 0.55,
  "snippet": "…",
  "pinned": false,
  "excluded": false
}
```

### `output_delta`
Streaming partial answer (append-only UI behavior).

Payload:
```json
{
  "format": "markdown",
  "delta": "**Retention:** Keep billing records for **7 years** …"
}
```

### `output_final`
Final answer. Persists to `run_outputs`.

Payload:
```json
{
  "format": "markdown",
  "content": "…final answer with citations…"
}
```

### `done`
Run completed.

Payload:
```json
{ "status": "succeeded", "at_ms": 1736040002500 }
```

### `error`
Run failed.

Payload:
```json
{ "message": "Provider call failed", "at_ms": 1736040001200 }
```

## Reconnect behavior

Browsers auto-reconnect SSE. If supported, clients may send `Last-Event-ID` to resume.
