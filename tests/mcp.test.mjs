import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { importTrace } from "../src/traces.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createWiki } from "../src/server.mjs";
import { createWikiTools } from "../public/wiki-tools.js";
import { evidenceFixture, evidenceId } from "./evidence-fixture.mjs";
import { fixture, update } from "./helpers.mjs";

async function setup(t, write = false, options = {}, clientOptions = {}) {
  const origin = "http://wiki.test";
  const server = createWiki({ repo: fixture(t), origin, write, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const client = new Client(
    { name: "wiki-test", version: "1.0.0" },
    clientOptions,
  );
  const fetchWiki = async (input, options = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        String(input),
        {
          method: options.method || "GET",
          headers: {
            ...Object.fromEntries(new Headers(options.headers)),
            Host: "wiki.test",
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve(
              new Response(
                res.statusCode === 202 || res.statusCode === 204
                  ? null
                  : Buffer.concat(chunks),
                { status: res.statusCode, headers: res.headers },
              ),
            ),
          );
        },
      );
      req.on("error", reject);
      req.end(options.body);
    });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWiki }),
  );
  t.after(() => client.close());
  const call = async (name, args) => {
    const response = await client.callTool({ name, arguments: args });
    return { response, value: JSON.parse(response.content[0].text) };
  };
  return { client, call, url, origin, fetchWiki };
}

test("regular MCP shares WebMCP schemas, reads, preview and read-only discovery", async (t) => {
  const { client, call } = await setup(t);
  const { tools } = await client.listTools();
  const expected = createWikiTools(async () => {}, false);
  assert.deepEqual(
    tools.map((t) => t.name),
    expected.map((t) => t.name),
  );
  for (const tool of tools)
    assert.deepEqual(
      tool.inputSchema,
      expected.find((t) => t.name === tool.name).inputSchema,
    );
  const { value } = await call("wiki.read", { id: "guide" });
  assert.match(value.body, /Start here/);
  assert.equal(
    (await call("wiki.search", { q: "guide" })).value.articles.length,
    1,
  );
  assert.match(
    (await call("wiki.preview", { body: "**Safe** <script>bad()</script>" }))
      .value.html,
    /<strong>Safe<\/strong>/,
  );
  const missing = await call("wiki.read", { id: "missing" });
  assert.equal(missing.response.isError, true);
  assert.equal(missing.value.status, 404);
  await assert.rejects(
    client.callTool({ name: "wiki.save", arguments: {} }),
    /not found/,
  );
  assert.equal(
    (
      await client.callTool({
        name: "wiki.read",
        arguments: { id: "../secret" },
      })
    ).isError,
    true,
  );
});

test("MCP writes retain receipts, revisions and HTTP error codes", async (t) => {
  const { call } = await setup(t, true);
  const draft = {
    operation_id: "mcp-create",
    updates: [update("created", "See [[guide]].")],
  };
  const first = await call("wiki.save", draft);
  assert.equal(first.response.isError, undefined);
  assert.equal(first.value.publication, "live");
  const retry = await call("wiki.save", draft);
  assert.equal(retry.value.commit, first.value.commit);
  const conflict = await call("wiki.save", {
    ...draft,
    operation_id: "mcp-conflict",
  });
  assert.equal(conflict.response.isError, true);
  assert.equal(conflict.value.status, 409);
  assert.equal(conflict.value.code, "REVISION_CONFLICT");
});

test("MCP transport rejects foreign origins, malformed and oversized bodies", async (t) => {
  const { url, origin, fetchWiki } = await setup(t);
  const headers = {
    Host: "wiki.test",
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  for (const method of ["GET", "POST", "DELETE"]) {
    assert.equal(
      (
        await fetchWiki(url, {
          method,
          headers: { ...headers, Origin: "https://foreign.test" },
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (await fetch(url, { headers: { ...headers, Host: "foreign.test" } }))
      .status,
    403,
  );
  assert.equal(
    (await fetchWiki(url, { method: "POST", headers, body: "{" })).status,
    400,
  );
  assert.equal(
    (
      await fetchWiki(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ oversized: "x".repeat(512000) }),
      })
    ).status,
    413,
  );
  const response = await fetchWiki(url, {
    method: "POST",
    headers: { ...headers, Origin: origin },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("external MCP trace reads retain progressive disclosure", async (t) => {
  const evidence = await evidenceFixture();
  t.after(() => evidence.close());
  const { client, call } = await setup(t, false, { evidenceUrl: evidence.url });
  assert.deepEqual(
    (await client.listTools()).tools.map((t) => t.name),
    createWikiTools(async () => {}, false, { externalEvidence: true }).map(
      (t) => t.name,
    ),
  );
  const dialogue = (await call("wiki.trace", { id: evidenceId, limit: 1 }))
    .value;
  assert.equal(dialogue.kind, "dialogue");
  assert.equal(dialogue.messages.length, 1);
  const tool = (
    await call("wiki.trace", {
      id: evidenceId,
      kind: "tool",
      textOffset: 0,
      textLimit: 8,
      after: "2026-01-01T10:00:00Z",
      before: "2026-01-01T10:02:00Z",
    })
  ).value;
  assert.equal(tool.messages[0].text, "Recorded");
  assert.equal(tool.messages[0].textWindow.nextTextOffset, 8);
});

test("modern MCP discovery and calls work without persistent sessions", async (t) => {
  const { client, call } = await setup(
    t,
    false,
    {},
    { mode: { pin: "2026-07-28" } },
  );
  assert.ok(
    (await client.listTools()).tools.some((tool) => tool.name === "wiki.read"),
  );
  assert.match(
    (await call("wiki.read", { id: "guide" })).value.body,
    /Start here/,
  );
});

test("large MCP trace reads link to complete originals while explicit small ranges stay inline", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-mcp-large-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "input.jsonl");
  const header = { type: "session_meta", payload: { id: "synthetic-large" } };
  const event = {
    type: "response_item",
    payload: { text: "完整😀".repeat(150000) },
  };
  const raw = JSON.stringify(event);
  fs.writeFileSync(source, JSON.stringify(header) + "\n" + raw + "\n");
  const metadata = importTrace(root, source, "Synthetic large trace");
  const { client, call, url, fetchWiki } = await setup(t, false, {
    traces: root,
  });
  const result = await client.callTool({
    name: "wiki.traceLines",
    arguments: { id: metadata.id, start: 1, end: 2 },
  });
  assert.equal(result.isError, undefined);
  assert.ok(JSON.stringify(result).length < 3000);
  assert.equal(JSON.parse(result.content[0].text).state, "resource");
  const resource = result.content.find((item) => item.type === "resource_link");
  assert.equal(resource.mimeType, "application/json");
  assert.equal(
    resource.uri,
    `http://wiki.test/api/traces/${metadata.id}/lines.json?start=1&end=2`,
  );
  const target = new URL(resource.uri);
  const response = await fetchWiki(
    new URL(target.pathname + target.search, url),
  );
  assert.equal(response.status, 200);
  const full = await response.json();
  assert.equal(full.lines.length, 2);
  assert.equal(full.lines[1].raw, raw);
  assert.deepEqual(full.lines[1].value, event);
  assert.equal(full.nextStart, null);
  const small = await call("wiki.traceLines", {
    id: metadata.id,
    start: 1,
    end: 1,
  });
  assert.equal(small.response.content.length, 1);
  assert.deepEqual(small.value.lines[0].value, header);
  const missing = await call("wiki.traceLines", {
    id: metadata.id,
    start: 10,
    end: 11,
  });
  assert.equal(missing.response.isError, true);
  assert.equal(missing.value.status, 404);
});
