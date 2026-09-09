import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import {
  digest,
  parseRecords,
  detectFormat,
  MAX_TRACE_BYTES,
  TRACE_PAGE_SIZE as PAGE_SIZE,
} from "./traces.mjs";
import { escape, link, renderMarkdown, shell } from "./render.mjs";
import { project } from "./trace-format.mjs";
export { project } from "./trace-format.mjs";
const json = (value) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);
async function renderEvent(event, id, positionByLine) {
  const { value: r, line, kind } = event;
  const anchor = (target) =>
    `/traces/${id}/?page=${Math.floor(positionByLine.get(target) / PAGE_SIZE) + 1}#line-${target}`;
  const notice = `${event.branch ? `<p class="trace-notice">Branch change · parent ${event.parentLine ? link(anchor(event.parentLine), `source line ${event.parentLine}`) : escape(r.parentId) + " (not in this snapshot)"}</p>` : ""}${event.superseded ? '<p class="trace-notice">Superseded entry revision; original retained.</p>' : ""}${event.mirrorOf ? `<p>Duplicate event representation of ${link(anchor(event.mirrorOf), `source line ${event.mirrorOf}`)}.</p>` : ""}`;
  let content = "";
  if (event.blocks?.length) {
    for (const block of event.blocks) {
      if (block.type === "text")
        content += await renderMarkdown(block.text || "");
      else if (block.type === "thinking")
        content += `<details><summary>Thinking</summary>${await renderMarkdown(block.thinking || block.text || "")}</details>`;
      else if (block.type === "toolCall")
        content += `<details><summary>Tool call · ${escape(block.name)}</summary><pre>${escape(json(block))}</pre></details>`;
      else
        content += `<p>Recorded ${escape(block.type || "content")} block — inspect the source record below.</p>`;
    }
  } else if (event.text)
    content =
      kind === "tool"
        ? `<pre>${escape(event.text)}</pre>`
        : await renderMarkdown(event.text);
  const body = `${content}<details><summary>Original source record</summary><pre>${escape(JSON.stringify(r, null, 2))}</pre></details>`;
  const heading = `${escape(["user", "assistant"].includes(kind) ? kind : event.label)} · ${link(anchor(line), `line ${line}`)}${event.timestamp != null ? ` · ${escape(event.timestamp)}` : ""}`;
  return `<section id="line-${line}" class="trace-event">${notice}${!["user", "assistant"].includes(kind) || event.mirrorOf || event.superseded ? `<details><summary>${heading}</summary>${body}</details>` : `<h2>${heading}</h2>${body}`}</section>`;
}
async function run({ root, metadata, page }) {
  const filename = path.join(root, metadata.id, "source.jsonl");
  if (fs.statSync(filename).size > MAX_TRACE_BYTES)
    throw new Error("Trace exceeds 128 MiB");
  const bytes = fs.readFileSync(filename);
  if (digest(bytes) !== metadata.id)
    throw new Error("Trace integrity check failed");
  const records = parseRecords(bytes);
  if (detectFormat(records) !== metadata.format)
    throw new Error("Trace format mismatch");
  const events = project(records, metadata.format),
    pages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  if (page > pages) return null;
  const selected = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    positions = new Map(events.map((event, index) => [event.line, index]));
  const pagination = `<nav>${page > 1 ? link(`?page=${page - 1}`, "Previous") + " · " : ""}Page ${page} of ${pages}${page < pages ? " · " + link(`?page=${page + 1}`, "Next") : ""}</nav>`;
  const header = records[0].value;
  const parent =
    header.parentSession ||
    header.lineage?.parentSessionId ||
    header.payload?.forked_from_id ||
    header.payload?.history_base;
  const html = shell(
    metadata.title,
    `<p class="eyebrow">${escape(metadata.format)} trace</p><h1>${escape(metadata.title)}</h1><p>${events.length} source records · ${link("/traces/", "All traces")}</p><p class="meta">Snapshot ${metadata.id}</p>${parent ? '<p class="trace-notice">This session references earlier history. This snapshot displays only records it contains; parent history is not automatically imported.</p>' : ""}<p>Dialogue is expanded. Tools, reasoning, context and duplicate event representations are available below. Original records preserve all recorded fields.</p>${pagination}${(await Promise.all(selected.map((event) => renderEvent(event, metadata.id, positions)))).join("")}${pagination}`,
  );
  return {
    id: metadata.id,
    format: metadata.format,
    page,
    pages,
    total_records: events.length,
    records: selected,
    html,
  };
}
if (parentPort)
  run(workerData).then(
    (result) => parentPort.postMessage({ result }),
    (error) => parentPort.postMessage({ error: error.message }),
  );
