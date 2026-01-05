export type LlmRequest = { snippet: string; question: string };

export type SearchHit = {
  id: string;       // doc_id
  path: string;     // absolute path
  chunk_id: number;
  start_byte: number;
  end_byte: number;
  rank: number;
  snippet: string;
};

export type FinalResult =
  | { kind: "text"; value: string }
  | { kind: "var"; name: string };

export type ReplRunResult = { ok: boolean; printed: string; error?: string };
