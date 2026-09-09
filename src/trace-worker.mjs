import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import {
  digest,
  parseRecords,
  detectFormat,
  MAX_TRACE_BYTES,
} from "./traces.mjs";
import { escape, link, renderMarkdown, shell } from "./render.mjs";
const PAGE_SIZE = 100;
const textOf = (value) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map(textOf).filter(Boolean).join("\n\n");
  if (!value || typeof value !== "object") return "";
  return (
    value.text || value.thinking || value.input_text || value.output_text || ""
  );
};
const json = (value) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);
function describe(record, format) {
  const r = record.value,
    p = r.payload || {},
    item = p.item || {};
  const base = {
    ...record,
    timestamp: r.timestamp ?? r.message?.timestamp ?? null,
    kind: "context",
    text: "",
    label: r.type || "Unknown record",
    stream: r.type,
  };
  if (format === "pi") {
    if (r.type === "message") {
      const m = r.message || {};
      base.label = m.role || "Message";
      base.kind = ["user", "assistant"].includes(m.role) ? m.role : "tool";
      base.text = textOf(m.content) || m.output || "";
      base.blocks = Array.isArray(m.content) ? m.content : [];
    } else if (r.type === "compaction" || r.type === "branch_summary")
      base.text = r.summary || "";
    return base;
  }
  if (r.type === "response_item") {
    base.label = p.type;
    if (p.type === "message") {
      base.kind = p.channel === "analysis" ? "reasoning" : p.role;
      base.text = textOf(p.content);
    } else if (p.type === "reasoning") {
      base.kind = "reasoning";
      base.text = textOf(p.summary) + "\n\n" + textOf(p.content);
    } else if (/call|output|search|image_generation/.test(p.type || "")) {
      base.kind = "tool";
      base.text = json(p.output ?? p.arguments ?? p.input ?? p);
    }
  } else if (r.type === "event_msg") {
    base.label = p.type;
    if (p.type === "user_message" || p.type === "agent_message") {
      base.kind = p.type === "user_message" ? "user" : "assistant";
      base.text = p.message || "";
    } else if (/reasoning/.test(p.type || "")) {
      base.kind = "reasoning";
      base.text = p.text || p.message || "";
    } else if (p.type === "item_completed") {
      base.stream = "typed";
      base.label = item.type || "Completed item";
      if (["UserMessage", "AgentMessage"].includes(item.type)) {
        base.kind = item.type === "UserMessage" ? "user" : "assistant";
        base.text =
          textOf(item.content) || textOf(item.text) || textOf(item.message);
      } else if (item.type === "Reasoning") {
        base.kind = "reasoning";
        base.text =
          textOf(item.summary_text) + "\n\n" + textOf(item.raw_content);
      } else {
        base.kind = "tool";
        base.text = json(item);
      }
    }
  }
  return base;
}
export function project(records, format) {
  const events = records.map((record) => describe(record, format));
  if (format === "pi") {
    const latest = new Map();
    for (const event of events)
      if (event.value.id) latest.set(event.value.id, event);
    let previous = null;
    for (const event of events) {
      const r = event.value;
      event.superseded = r.id && latest.get(r.id) !== event;
      if (r.id && r.type !== "session" && !event.superseded) {
        event.parentLine = latest.get(r.parentId)?.line || null;
        event.branch = previous !== null && r.parentId !== previous;
        previous = r.id;
      }
    }
  } else {
    const paginated = records.some(
      ({ value }) =>
        value.payload?.history_mode === "paginated" ||
        (value.payload?.type === "item_completed" &&
          ["UserMessage", "AgentMessage", "Reasoning"].includes(
            value.payload?.item?.type,
          )),
    );
    for (const event of events) {
      if (
        paginated &&
        event.value.type === "response_item" &&
        event.kind === "user"
      ) {
        event.kind = "context";
        event.label = "Recorded model context (paginated history)";
      }
    }
    let turn = 0,
      seen = new Map();
    for (const event of events) {
      const p = event.value.payload || {};
      if (["task_started", "turn_started"].includes(p.type)) {
        turn++;
        seen = new Map();
      }
      event.turn = turn;
      if (["user", "assistant"].includes(event.kind) && event.text) {
        const key = `${event.kind}:${event.text}`;
        const group = seen.get(key) || [];
        const counterpart = group.find(
          (other) => !other.streams.has(event.stream),
        );
        if (counterpart) {
          event.mirrorOf = counterpart.line;
          counterpart.streams.add(event.stream);
        } else
          group.push({ line: event.line, streams: new Set([event.stream]) });
        seen.set(key, group);
      }
      if (p.type === "thread_rolled_back" || p.type === "thread_rollback") {
        event.label = "Rollback (earlier records retained)";
        event.text = `Recorded rollback: ${json(p)}`;
      }
    }
  }
  return events;
}
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
