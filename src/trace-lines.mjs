import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { WikiError } from "./errors.mjs";
import { MAX_TRACE_BYTES, TRACE_PAGE_SIZE } from "./traces.mjs";
export const MAX_RANGE_BYTES = 256 * 1024;

// Scan/hash the immutable source, retaining only the requested physical lines.
// No projection or Markdown rendering, and no whole-file or unbounded-line buffer.
export async function readTraceLines(root, metadata, start, end) {
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const hash = createHash("sha256"),
    lines = [];
  let bytes = 0,
    selectedBytes = 0,
    line = 1,
    ordinal = 0,
    nonblank = false,
    parts = [],
    lineBytes = 0;
  const consume = (part) => {
    lineBytes += part.length;
    if (/\S/u.test(part)) nonblank = true;
    if (line >= start && line <= end) {
      selectedBytes += Buffer.byteLength(part);
      if (selectedBytes > MAX_RANGE_BYTES)
        throw new WikiError(
          "RANGE_TOO_LARGE",
          "Selected source lines exceed 256 KiB; request a smaller range",
          413,
        );
      parts.push(part);
    }
  };
  const finish = () => {
    if (line >= start && line <= end) {
      const raw = parts.join("");
      lines.push({
        line,
        raw,
        value: nonblank
          ? JSON.parse(line === 1 ? raw.replace(/^\uFEFF/, "") : raw)
          : null,
        url: nonblank
          ? `/traces/${metadata.id}/?page=${Math.floor(ordinal / TRACE_PAGE_SIZE) + 1}#line-${line}`
          : null,
      });
    }
    if (nonblank) ordinal++;
    line++;
    parts = [];
    lineBytes = 0;
    nonblank = false;
  };
  for await (const chunk of fs.createReadStream(
    path.join(root, metadata.id, "source.jsonl"),
  )) {
    bytes += chunk.length;
    if (bytes > MAX_TRACE_BYTES) throw new Error("Trace exceeds 128 MiB");
    hash.update(chunk);
    const text = decoder.decode(chunk, { stream: true });
    let at = 0;
    for (let i = 0; i < text.length; i++)
      if (text[i] === "\n") {
        consume(text.slice(at, i));
        finish();
        at = i + 1;
      }
    consume(text.slice(at));
  }
  consume(decoder.decode());
  if (lineBytes) finish();
  if (hash.digest("hex") !== metadata.id)
    throw new Error("Trace integrity check failed");
  const total_lines = line - 1;
  if (start > total_lines) return null;
  return {
    id: metadata.id,
    format: metadata.format,
    start,
    end: Math.min(end, total_lines),
    total_lines,
    nextStart: end < total_lines ? end + 1 : null,
    lines,
  };
}
