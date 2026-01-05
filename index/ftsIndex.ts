import { Database } from "bun:sqlite";
import type { SearchHit } from "../types.js";

export class FtsIndex {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  close() { this.db.close(); }

  // Exposed only for maintenance tasks (e.g. wipe); keep private-ish.
  _raw() { return this.db; }

  private init() {
    this.db.exec(`PRAGMA journal_mode=WAL;`);
    this.db.exec(`PRAGMA synchronous=NORMAL;`);
    this.db.exec(`PRAGMA temp_store=MEMORY;`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS docs (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        bytes INTEGER NOT NULL,
        hash TEXT NOT NULL,
        ext TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_chunks (
        doc_id TEXT NOT NULL,
        chunk_id INTEGER NOT NULL,
        start_byte INTEGER NOT NULL,
        end_byte INTEGER NOT NULL,
        PRIMARY KEY (doc_id, chunk_id)
      );
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts
      USING fts5(
        content,
        doc_id UNINDEXED,
        chunk_id UNINDEXED,
        path UNINDEXED,
        tokenize = 'porter'
      );
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_docs_path ON docs(path);`);
  }

  stats() {
    const row = this.db.query(`SELECT COUNT(*) AS n FROM docs`).get() as any;
    return { num_docs: Number(row?.n ?? 0) };
  }

  list_docs(limit = 50, offset = 0) {
    return this.db
      .query(`SELECT id, path, mtime, bytes, ext FROM docs ORDER BY id LIMIT ? OFFSET ?`)
      .all(limit, offset) as Array<{ id: string; path: string; mtime: number; bytes: number; ext: string }>;
  }

  get_doc(id: string) {
    return this.db
      .query(`SELECT id, path, mtime, bytes, hash, ext FROM docs WHERE id = ?`)
      .get(id) as any | null;
  }

  search_docs(query: string, limit = 10): SearchHit[] {
    const rows = this.db.query(`
      SELECT
        f.doc_id AS id,
        f.path AS path,
        f.chunk_id AS chunk_id,
        bm25(docs_fts) AS rank,
        snippet(docs_fts, 0, '<<', '>>', '…', 16) AS snippet,
        c.start_byte AS start_byte,
        c.end_byte AS end_byte
      FROM docs_fts f
      JOIN doc_chunks c
        ON c.doc_id = f.doc_id AND c.chunk_id = f.chunk_id
      WHERE docs_fts MATCH ?
      ORDER BY rank
      LIMIT ?;
    `).all(query, limit) as any[];

    return rows.map((r) => ({
      id: String(r.id),
      path: String(r.path),
      chunk_id: Number(r.chunk_id),
      start_byte: Number(r.start_byte),
      end_byte: Number(r.end_byte),
      rank: Number(r.rank),
      snippet: String(r.snippet ?? ""),
    }));
  }

  upsertDoc(params: {
    id: string;
    filePath: string;
    mtime: number;
    bytes: number;
    hash: string;
    ext: string;
    chunks: Array<{ chunk_id: number; start_byte: number; end_byte: number; content: string }>;
  }) {
    const { id, filePath, mtime, bytes, hash, ext, chunks } = params;

    const tx = this.db.transaction(() => {
      this.db.query(`
        INSERT INTO docs(id, path, mtime, bytes, hash, ext)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          path=excluded.path,
          mtime=excluded.mtime,
          bytes=excluded.bytes,
          hash=excluded.hash,
          ext=excluded.ext
      `).run(id, filePath, mtime, bytes, hash, ext);

      this.db.query(`DELETE FROM doc_chunks WHERE doc_id = ?`).run(id);
      this.db.query(`DELETE FROM docs_fts WHERE doc_id = ?`).run(id);

      const insertChunk = this.db.query(
        `INSERT INTO doc_chunks(doc_id, chunk_id, start_byte, end_byte) VALUES(?, ?, ?, ?)`
      );
      const insertFts = this.db.query(
        `INSERT INTO docs_fts(content, doc_id, chunk_id, path) VALUES(?, ?, ?, ?)`
      );

      for (const c of chunks) {
        insertChunk.run(id, c.chunk_id, c.start_byte, c.end_byte);
        insertFts.run(c.content, id, c.chunk_id, filePath);
      }
    });

    tx();
  }

  deleteDoc(id: string) {
    const tx = this.db.transaction(() => {
      this.db.query(`DELETE FROM doc_chunks WHERE doc_id = ?`).run(id);
      this.db.query(`DELETE FROM docs_fts WHERE doc_id = ?`).run(id);
      this.db.query(`DELETE FROM docs WHERE id = ?`).run(id);
    });
    tx();
  }
}
