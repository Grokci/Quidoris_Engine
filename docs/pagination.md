# Pagination (Cursor)

List endpoints return `next_cursor`. If `next_cursor` is `null`, there are no more pages.

## Contract

```json
{
  "items": [ ... ],
  "next_cursor": "eyJ2IjoxLCJrIjp7ImNyZWF0ZWRfYXRfbXMiOjE3MzYwNDAwMDAwMDAsImlkIjoicnVuXzAxSFguLi4ifX0"
}
```

## Cursor format

The cursor is **base64url(JSON)** with this payload:

```json
{
  "v": 1,
  "k": {
    "created_at_ms": 1736040000000,
    "id": "run_01HX..."
  }
}
```

- `v`: cursor version
- `k`: keyset marker (the last item in the previous page)

## Ordering rules

Each endpoint has a fixed ordering. The cursor corresponds to that ordering.

### `/v1/runs`
Order: `created_at_ms DESC, id DESC`

### `/v1/library/documents`
Order: `path ASC, id ASC`

## Keyset paging behavior

Clients treat cursors as opaque.

Servers implement keyset paging:
- Runs: return rows where `(created_at_ms, id) < (cursor.created_at_ms, cursor.id)` in the same ordering.
- Documents: return rows where `(path, id) > (cursor.path, cursor.id)` if using ascending ordering.

## Parameters

- `limit` (default: 50)
- `cursor` (optional)

Servers may cap `limit` (e.g., max 200).
