# Errors

All non-2xx responses return the same JSON shape.

## Shape

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "http_status": 400,
    "request_id": "req_01HX9J0K7F...",
    "retryable": false,
    "details": {
      "hint": "Fix the highlighted fields and try again."
    },
    "validation": [
      { "path": "email", "issue": "invalid_format" }
    ]
  }
}
```

### Fields

- `error.code` (string, required): Stable machine-readable code.
- `error.message` (string, required): Human-readable summary.
- `error.http_status` (number, required): Mirrors HTTP status.
- `error.request_id` (string, required): Correlates logs; also returned in `X-Request-Id` header.
- `error.retryable` (boolean, required): Whether retry is likely to succeed.
- `error.details` (object, optional): Safe structured context.
- `error.validation` (array, optional): Field-level errors for 400s.

### Validation item

- `path`: dot-path to field (`provider.model`, `pins.chunk_ids[0]`)
- `issue`: one of `required`, `invalid_format`, `too_short`, `too_long`, `out_of_range`, `not_supported`

## Common codes

### Auth
- `AUTH_REQUIRED` (401)
- `AUTH_INVALID_CREDENTIALS` (401)
- `AUTH_SESSION_EXPIRED` (401)
- `AUTH_FORBIDDEN` (403)

### Library
- `DOC_NOT_FOUND` (404)
- `TAG_NOT_FOUND` (404)
- `UPLOAD_FAILED` (400/500)
- `DOC_DELETE_FAILED` (500)

### Index
- `INDEX_BUSY` (409)
- `INDEX_FAILED` (500)
- `FTS_NOT_READY` (409)

### Search/Read
- `CHUNK_NOT_FOUND` (404)
- `READ_RANGE_INVALID` (400)
- `READ_FAILED` (500)

### Runs
- `RUN_NOT_FOUND` (404)
- `RUN_INVALID_STATE` (409)
- `PROVIDER_NOT_CONFIGURED` (400)
- `PROVIDER_CALL_FAILED` (502)

### Generic
- `VALIDATION_FAILED` (400)
- `RATE_LIMITED` (429)
- `INTERNAL_ERROR` (500)
