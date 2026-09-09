// Disposable dialogue index. Original JSONL remains the only trace authority.
import { WikiError } from "./errors.mjs";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  TraceStore,
  parseRecords,
  digest,
  MAX_TRACE_BYTES,
  TRACE_VERSION,
  TRACE_PAGE_SIZE,
} from "./traces.mjs";
import { project } from "./trace-format.mjs";
const filename = (root) => path.join(root, "search.sqlite3");
export function indexTraces(root) {
  fs.mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(filename(root));
  const store = new TraceStore(root);
  try {
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, title TEXT, format TEXT, session_id TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS dialogue USING fts5(snapshot UNINDEXED, line UNINDEXED, page UNINDEXED, role UNINDEXED, text);
      CREATE TABLE IF NOT EXISTS version(value INTEGER);`);
    db.exec("BEGIN IMMEDIATE");
    if (
      db.prepare("SELECT value FROM version").get()?.value !== TRACE_VERSION
    ) {
      db.exec(
        "DELETE FROM snapshots; DELETE FROM dialogue; DELETE FROM version;",
      );
      db.prepare("INSERT INTO version VALUES(?)").run(TRACE_VERSION);
    }
    const catalog = store.catalog();
    const ids = new Set(catalog.map((m) => m.id));
    for (const { id } of db.prepare("SELECT id FROM snapshots").all()) {
      if (ids.has(id)) continue;
      db.prepare("DELETE FROM dialogue WHERE snapshot=?").run(id);
      db.prepare("DELETE FROM snapshots WHERE id=?").run(id);
    }
    let added = 0;
    for (const m of catalog) {
      if (db.prepare("SELECT 1 FROM snapshots WHERE id=?").get(m.id)) continue;
      const source = path.join(root, m.id, "source.jsonl");
      if (fs.statSync(source).size > MAX_TRACE_BYTES)
        throw Error("Trace exceeds 128 MiB");
      const bytes = fs.readFileSync(source);
      if (digest(bytes) !== m.id) throw Error("Trace integrity check failed");
      const events = project(parseRecords(bytes), m.format);
      db.prepare("INSERT INTO snapshots VALUES(?,?,?,?)").run(
        m.id,
        m.title,
        m.format,
        m.session_id,
      );
      const insert = db.prepare("INSERT INTO dialogue VALUES(?,?,?,?,?)");
      events.forEach((event, i) => {
        if (
          !["user", "assistant"].includes(event.kind) ||
          event.mirrorOf ||
          event.superseded
        )
          return;
        const text = event.blocks?.length
          ? event.blocks
              .filter((b) => b.type === "text")
              .map((b) => b.text || "")
              .join("\n")
          : event.text;
        if (text)
          insert.run(
            m.id,
            event.line,
            Math.floor(i / TRACE_PAGE_SIZE) + 1,
            event.kind,
            text,
          );
      });
      added++;
    }
    db.exec("COMMIT");
    return { snapshots: catalog.length, added };
  } finally {
    store.close();
    db.close();
  }
}
export function searchTraces(root, query, { limit = 20, offset = 0 } = {}) {
  if (
    typeof query !== "string" ||
    query.length > 300 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 40 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10000
  )
    throw new WikiError("INVALID_SEARCH", "Invalid trace search");
  const terms = query.match(/[\p{L}\p{N}_-]+/gu) || [];
  if (terms.length > 30)
    throw new WikiError("INVALID_SEARCH", "Too many trace search terms");
  if (!root || !fs.existsSync(filename(root)))
    return { indexed: false, results: [], nextOffset: null };
  const db = new DatabaseSync(filename(root), { readOnly: true });
  try {
    if (db.prepare("SELECT value FROM version").get()?.value !== TRACE_VERSION)
      return { indexed: false, results: [], nextOffset: null };
    if (!terms.length) return { indexed: true, results: [], nextOffset: null };
    const rows = db
      .prepare(
        `SELECT snapshot AS id, line, page, role, s.title, s.format, s.session_id,
      snippet(dialogue,4,'','',' … ',30) AS snippet FROM dialogue JOIN snapshots s ON s.id=snapshot
      WHERE dialogue MATCH ? ORDER BY rank, snapshot, line LIMIT ? OFFSET ?`,
      )
      .all(terms.map((t) => `"${t}"*`).join(" AND "), limit + 1, offset);
    return {
      indexed: true,
      results: rows.slice(0, limit).map((r) => ({
        ...r,
        url: `/traces/${r.id}/?page=${r.page}#line-${r.line}`,
      })),
      nextOffset: rows.length > limit ? offset + limit : null,
    };
  } finally {
    db.close();
  }
}
