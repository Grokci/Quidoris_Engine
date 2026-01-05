import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseEnvInt } from "../util.js";
import { FtsIndex } from "./ftsIndex.js";

type DocCandidate = {
  id: string;
  filePath: string;
  ext: string;
  mtime: number;
  bytes: number;
};

function isUtf8ContinuationByte(b: number) {
  return (b & 0b1100_0000) === 0b1000_0000;
}

function chunkUtf8Bytes(bytes: Uint8Array, chunkBytes: number) {
  const spans: Array<{ start: number; end: number }> = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(bytes.length, start + chunkBytes);
    while (end > start && isUtf8ContinuationByte(bytes[end - 1])) end--;
    if (end <= start) end = Math.min(bytes.length, start + chunkBytes);
    spans.push({ start, end });
    start = end;
  }
  return spans;
}

function sha256Hex(bytes: Uint8Array): string {
  const h = new Bun.CryptoHasher("sha256");
  h.update(bytes);
  return h.digest("hex");
}

async function scanLibrary(dir: string): Promise<DocCandidate[]> {
  const maxFiles = parseEnvInt("LIBRARY_MAX_FILES", 5000);
  const maxBytes = parseEnvInt("LIBRARY_MAX_FILE_BYTES", 5_000_000);
  const exts = (process.env.LIBRARY_EXTS ?? ".txt,.md,.json,.yaml,.yml,.csv,.log")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

  const root = path.resolve(dir);
  const out: DocCandidate[] = [];

  const walk = async (p: string) => {
    if (out.length >= maxFiles) return;
    const entries = await fs.readdir(p, { withFileTypes: true });
    for (const ent of entries) {
      if (out.length >= maxFiles) break;
      const full = path.join(p, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        await walk(full);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!exts.includes(ext)) continue;
        const st = await fs.stat(full);
        if (st.size > maxBytes) continue;

        const rel = path.relative(root, full).replace(/\\/g, "/");
        out.push({
          id: rel,
          filePath: full,
          ext,
          mtime: Math.floor(st.mtimeMs),
          bytes: st.size,
        });
      }
    }
  };

  await walk(root);
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export async function indexLibrary(index: FtsIndex, libraryDir: string) {
  const chunkBytes = parseEnvInt("CHUNK_BYTES", 16_384);

  console.log(`[Index] Scanning: ${libraryDir}`);
  const candidates = await scanLibrary(libraryDir);
  console.log(`[Index] Found ${candidates.length} eligible files.`);

  let updated = 0;

  for (const c of candidates) {
    const existing = index.get_doc(c.id);

    // Fast skip if unchanged by mtime+bytes (commercial-grade default tradeoff).
    if (existing && Number(existing.mtime) === c.mtime && Number(existing.bytes) === c.bytes) {
      continue;
    }

    const fileBytes = new Uint8Array(await fs.readFile(c.filePath));
    const hash = sha256Hex(fileBytes);

    // If hash matches, we still reindex for simplicity (safe, consistent).
    // If you want an optimization later, add a metadata-only update path.
    const spans = chunkUtf8Bytes(fileBytes, chunkBytes);
    const decoder = new TextDecoder();

    const chunks = spans.map((sp, i) => ({
      chunk_id: i,
      start_byte: sp.start,
      end_byte: sp.end,
      content: decoder.decode(fileBytes.slice(sp.start, sp.end)),
    }));

    index.upsertDoc({
      id: c.id,
      filePath: c.filePath,
      mtime: c.mtime,
      bytes: c.bytes,
      hash,
      ext: c.ext,
      chunks,
    });

    updated++;
    if (updated % 50 === 0) console.log(`[Index] Updated ${updated} files...`);
  }

  console.log(`[Index] Done. Updated ${updated} files.`);
}
