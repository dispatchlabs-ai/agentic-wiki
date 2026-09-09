import { importTrace } from "../src/traces.mjs";
import test from "node:test";
import http from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { saveGitEdits } from "../src/editor.mjs";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createWiki } from "../src/server.mjs";
import { GitWiki, git } from "../src/git-wiki.mjs";
import { registerTools } from "../public/client.js";
import { fixture, update } from "./helpers.mjs";
async function server(t, options = {}) {
  const repo = options.repo || fixture(t),
    origin = "http://wiki.test";
  const app = createWiki({ repo, origin, write: true, ...options });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        app.close(resolve);
        app.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${app.address().port}`;
  const request = (route, options = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        base + route,
        {
          method: options.method || "GET",
          headers: { Host: "wiki.test", ...options.headers },
        },
        (res) => {
          const chunks = [];
          res.on("data", (b) => chunks.push(b));
          res.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode,
                headers: res.headers,
              }),
            ),
          );
        },
      );
      req.on("error", reject);
      req.end(options.body);
    });
  const save = (draft) =>
    request("/api/articles/edits", {
      method: "POST",
      headers: {
        Origin: origin,
        "X-Wiki-Write": "1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(draft),
    });
  return { repo, request, save };
}
test("HTTP reads, same-origin writes, idempotent retries and revision conflicts", async (t) => {
  const { request, save, repo } = await server(t);
  assert.equal((await request("/")).status, 200);
  assert.equal((await request("/.git/config")).status, 404);
  assert.equal(
    (await request("/api/articles/health.json", { headers: { Host: "wrong" } }))
      .status,
    403,
  );
  assert.equal(
    (await request("/api/articles/edits", { method: "POST", body: "{}" }))
      .status,
    403,
  );
  assert.equal((await request("/api/articles/search?limit=-1")).status, 400);
  const draft = {
    operation_id: "http-create",
    updates: [update("created", "See [[guide]].")],
  };
  const response = await save(draft);
  assert.equal(response.status, 200);
  const receipt = await response.json();
  assert.equal(receipt.remote, "not-requested");
  assert.equal(receipt.publication, "live");
  const retried = await (await save(draft)).json();
  assert.equal(retried.state, "already-saved");
  assert.equal(retried.commit, receipt.commit);
  assert.equal(
    retried.articles[0].revision_id,
    receipt.articles[0].revision_id,
  );
  const current = await (
    await request("/api/articles/created/current.json")
  ).json();
  assert.equal(current.revision_id, receipt.articles[0].revision_id);
  assert.equal((await save({ ...draft, operation_id: "stale" })).status, 409);
  assert.equal(
    (await request("/api/articles/created/history.json")).status,
    200,
  );
  assert.equal((await request("/api/articles/created/1.json")).status, 200);
  assert.match(
    await (await request("/wiki/created/")).text(),
    /href="\/wiki\/guide\/"/,
  );
  assert.match(
    await (await request("/wiki/guide/")).text(),
    /href="\/wiki\/created\/"/,
  );
  assert.equal(git(repo, ["status", "--porcelain"]), "");
});
test("simultaneous HTTP writers serialize and exactly one stale update succeeds", async (t) => {
  const { request, save, repo } = await server(t);
  const current = await (
    await request("/api/articles/guide/current.json")
  ).json();
  const drafts = ["a", "b"].map((id) => ({
    operation_id: `writer-${id}`,
    updates: [
      {
        ...update("guide", `Writer ${id}.`),
        expected_revision_id: current.revision_id,
      },
    ],
  }));
  const results = await Promise.all(drafts.map(save));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(new GitWiki(repo).history("guide").length, 2);
  assert.equal(git(repo, ["status", "--porcelain"]), "");
});
test("read-only mode and request limits are enforced", async (t) => {
  const { save } = await server(t, { write: false });
  assert.equal((await save({})).status, 403);
  const enabled = await server(t);
  const r = await enabled.request("/api/articles/edits", {
    method: "POST",
    headers: {
      Origin: "http://wiki.test",
      "X-Wiki-Write": "1",
      "Content-Type": "application/json",
    },
    body: "x".repeat(512001),
  });
  assert.equal(r.status, 413);
  const invalid = await enabled.request("/api/articles/edits", {
    method: "POST",
    headers: {
      Origin: "http://wiki.test",
      "X-Wiki-Write": "1",
      "Content-Type": "application/json",
    },
    body: "{",
  });
  assert.equal(invalid.status, 400);
});
test("failed remote push leaves one durable commit and retries push without another revision", async (t) => {
  const repo = fixture(t);
  git(repo, [
    "remote",
    "add",
    "origin",
    "/nonexistent-agentic-wiki-test-remote",
  ]);
  const draft = { operation_id: "retry-push", updates: [update("new")] };
  const run = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL("../src/editor.mjs", import.meta.url))],
        {
          env: {
            ...process.env,
            WIKI_REPO: repo,
            WIKI_PUSH: "1",
            WIKI_GIT_LOCKED: "0",
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let out = "",
        err = "";
      child.stdout.on("data", (b) => (out += b));
      child.stderr.on("data", (b) => (err += b));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(JSON.parse(out)) : reject(Error(err)),
      );
      child.stdin.end(JSON.stringify(draft));
    });
  const first = await run(),
    second = await run();
  assert.equal(first.remote, "push-failed");
  assert.equal(second.remote, "push-failed");
  assert.equal(second.state, "already-saved");
  assert.equal(first.commit, second.commit);
  assert.equal(new GitWiki(repo).history("new").length, 1);
});
test("WebMCP registers discoverable schemas and invokes the underlying HTTP API", async (t) => {
  const { request } = await server(t),
    original = globalThis.fetch;
  // Adapter contract test; native browser compatibility is verified separately.
  globalThis.fetch = request;
  t.after(() => {
    globalThis.fetch = original;
  });
  const registered = [];
  const controller = await registerTools(
    {
      registerTool: async (tool, options) => registered.push({ tool, options }),
    },
    true,
  );
  assert.deepEqual(
    registered.map((r) => r.tool.name),
    [
      "wiki.search",
      "wiki.read",
      "wiki.history",
      "wiki.traces",
      "wiki.trace",
      "wiki.save",
    ],
  );
  const read = registered.find((r) => r.tool.name === "wiki.read").tool;
  assert.equal((await read.execute({ id: "guide" })).title, "Guide");
  assert.equal(
    registered.find((r) => r.tool.name === "wiki.save").tool.annotations
      .readOnlyHint,
    false,
  );
  controller.abort();
  assert.ok(registered.every((r) => r.options.signal.aborted));
  const readonly = [];
  await registerTools({ registerTool: (t) => readonly.push(t) }, false);
  assert.equal(readonly.length, 5);
});

test("failed index transactions keep reader and search on one snapshot, then recover", async (t) => {
  const repo = fixture(t),
    database = path.join(repo, ".git", "index.sqlite3");
  const { request } = await server(t, { repo, database });
  const before = git(repo, ["rev-parse", "HEAD"]);
  const db = new DatabaseSync(database);
  t.after(() => db.close());
  db.exec(
    "CREATE TRIGGER fail_index BEFORE INSERT ON pages BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
  );
  saveGitEdits(repo, {
    operation_id: "index-failure",
    updates: [update("new", "Unique recovery phrase.")],
  });
  const health = await request("/api/articles/health.json");
  assert.equal(health.status, 503);
  assert.equal((await health.json()).commit, before);
  assert.equal((await request("/api/articles/new/current.json")).status, 404);
  assert.equal(
    (await (await request("/api/articles/search?q=recovery")).json()).articles
      .length,
    0,
  );
  db.exec("DROP TRIGGER fail_index");
  assert.equal((await request("/api/articles/health.json")).status, 200);
  assert.equal((await request("/api/articles/new/current.json")).status, 200);
  assert.equal(
    (await (await request("/api/articles/search?q=recovery")).json())
      .articles[0].id,
    "new",
  );
});

test("trace HTML and JSON routes share snapshots and validate page requests", async (t) => {
  const repo = fixture(t),
    traces = path.join(repo, ".git", "traces");
  const metadata = importTrace(
    traces,
    new URL("../examples/traces/pi.jsonl", import.meta.url),
    "Synthetic pi",
  );
  const { request } = await server(t, { repo, traces });
  assert.equal(
    (await (await request("/api/traces/catalog.json")).json())[0].id,
    metadata.id,
  );
  const html = await request(metadata.url || `/traces/${metadata.id}/`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Branch change/);
  const data = await (await request(`/api/traces/${metadata.id}.json`)).json();
  assert.equal(data.total_records, 8);
  assert.equal(data.html, undefined);
  assert.equal((await request(`/traces/${metadata.id}/?page=0`)).status, 400);
  assert.equal((await request(`/traces/${metadata.id}/?page=2`)).status, 404);
  assert.equal((await request(`/traces/${"0".repeat(64)}/`)).status, 404);
});
