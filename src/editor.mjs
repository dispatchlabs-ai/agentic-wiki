import fs from "node:fs";
import path from "node:path";
import { withWriterLock } from "./writer-lock.mjs";
import { fileURLToPath } from "node:url";
import {
  GitWiki,
  git,
  wikiRepo,
  sha,
  validId,
  markdown,
  commitFiles,
  parsePage,
} from "./git-wiki.mjs";
import { references } from "./wiki.mjs";

export function saveGitEdits(repo, draft) {
  if (
    !draft ||
    !validId(draft.operation_id) ||
    !Array.isArray(draft.updates) ||
    draft.updates.length < 1 ||
    draft.updates.length > 10
  )
    throw Error("Invalid edit operation");
  const wiki = new GitWiki(repo);
  const fingerprint = sha(JSON.stringify(draft));
  const prior = wiki.receipt(draft.operation_id);
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      throw Error("Operation identity already used for different content");
    return {
      ...prior.receipt,
      state: "already-saved",
      commit: git(repo, [
        "log",
        "-1",
        "--format=%H",
        wiki.head,
        "--",
        `.wiki/operations/${draft.operation_id}.json`,
      ]),
    };
  }
  const files = {},
    results = [],
    proposed = new Map(wiki.pages);
  const now = new Date().toISOString();
  const seen = new Set();
  for (const u of draft.updates) {
    if (!u || !validId(u.id) || seen.has(u.id))
      throw Error("Invalid or duplicate article identity");
    seen.add(u.id);
    const current = wiki.current(u.id);
    if (u.expected_revision_id !== (current?.revision_id || null))
      throw Error("Conflict: article changed; read it again before editing");
    for (const [field, max] of [
      ["title", 200],
      ["description", 600],
      ["topic", 100],
      ["body", 100000],
      ["summary", 1000],
    ]) {
      if (
        typeof u[field] !== "string" ||
        !u[field].trim() ||
        u[field].length > max
      )
        throw Error(`Invalid ${field}`);
    }
    for (const field of ["related", "questions"]) {
      if (
        u[field] !== undefined &&
        (!Array.isArray(u[field]) ||
          u[field].length > 100 ||
          u[field].some((s) => typeof s !== "string" || s.length > 2000))
      )
        throw Error(`Invalid ${field}`);
    }
    const metadata = current
      ? { ...wiki.pages.get(u.id) }
      : { kind: "topic", sources: [] };
    for (const key of [
      "id",
      "filename",
      "blob",
      "body",
      "number",
      "created_at",
      "change_type",
    ])
      delete metadata[key];
    Object.assign(metadata, {
      title: u.title,
      description: u.description,
      topic: u.topic,
      updated: now.slice(0, 10),
      summary: u.summary,
      related: u.related ?? current?.related ?? [],
      questions: u.questions ?? current?.questions ?? [],
    });
    const name = current?.filename || `wiki/${u.id}.md`;
    files[name] = markdown(metadata, u.body);
    proposed.set(u.id, parsePage(files[name], name, null));
    results.push({
      id: u.id,
      number:
        (current?.number || 0) +
        Number(
          git(repo, ["hash-object", "--stdin"], { input: files[name] }) !==
            current?.revision_id,
        ),
      url: `/wiki/${u.id}/`,
    });
  }
  for (const p of proposed.values())
    for (const target of [...references(p.body), ...p.related])
      if (!proposed.has(target))
        throw Error(`Broken article link: ${p.id} -> ${target}`);
  const receipt = {
    operation_id: draft.operation_id,
    state: "saved",
    articles: results,
  };
  files[`.wiki/operations/${draft.operation_id}.json`] =
    JSON.stringify({ fingerprint, recorded_at: now, receipt }, null, 2) + "\n";
  const commit = commitFiles(
    repo,
    wiki.head,
    files,
    draft.updates.map((u) => u.summary).join("; "),
  );
  wiki.refresh();
  return {
    ...receipt,
    commit,
    articles: results.map((a) => ({
      ...a,
      revision_id: wiki.current(a.id).revision_id,
    })),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const repo = wikiRepo();
  try {
    await withWriterLock(repo, async () => {
      const draft = JSON.parse(fs.readFileSync(0, "utf8"));
      const result = saveGitEdits(repo, draft);
      // Retry also retries a previously failed push. A failed remote never makes
      // the local durable commit disappear or creates a duplicate revision.
      const wiki = new GitWiki(repo);
      result.articles = result.articles.map((a) => ({
        ...a,
        revision_id: wiki.revision(a.id, a.number).revision_id,
      }));
      try {
        if (process.env.WIKI_PUSH === "1")
          git(repo, ["push", "origin", "main"], { timeout: 30000 });
        result.remote =
          process.env.WIKI_PUSH !== "1" ? "not-requested" : "pushed";
      } catch {
        result.remote = "push-failed";
      }
      console.log(JSON.stringify(result));
    });
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
