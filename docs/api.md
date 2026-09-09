# HTTP API and editing

All JSON routes return `Cache-Control: no-store` and `X-Wiki-Commit` for the current
reader snapshot. URLs are relative to the configured origin.

| Method and path                                     | Result                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/articles/authoring.json`                  | Workflow, access boundary, enabled tools                                                    |
| `GET /api/articles/health.json`                     | `state`, `commit`, article count, index stats, error, write flag; 503 when degraded         |
| `GET /api/articles/catalog.json`                    | Current article summaries and revision IDs                                                  |
| `GET /api/articles/search?q=soil&limit=20&offset=0` | Ranked `articles`, matched `anchor`/`heading`/`snippet`, `total`, `truncated`, `nextOffset` |
| `GET /api/articles/ID/current.json`                 | Markdown `body`, metadata, `revision_id`, commit, numbered revision, backlinks              |
| `GET /api/articles/ID/history.json`                 | First-parent revision list, oldest first                                                    |
| `GET /api/articles/ID/NUMBER.json`                  | Historical article                                                                          |
| `GET /api/articles/ID/COMMIT.json`                  | Historical article at an article-changing commit                                            |
| `POST /api/articles/edits`                          | Coordinated revision-checked commit receipt                                                 |

Search accepts literal terms (prefix matching), quoted phrases, an optional exact
`topic`, `limit` from 1–40, and `offset` from 0–10,000. Queries are at most 300
characters / 30 terms. Results group a bounded 400-section candidate set by article.
`total` counts those article groups; inspect `truncated` before treating it as an
exhaustive count. Empty queries list articles within the same bound. SQL/FTS operators
are not accepted as executable query syntax.

Human views are `/`, `/search/?q=...`, `/wiki/ID/`, `/wiki/ID/history/`,
`/wiki/ID/revision/NUMBER/` (or COMMIT), and `/wiki/ID/edit/`. The form edits an
existing page; create pages through the API, WebMCP, or ordinary Git commits.

## Save an article

Read the current article first, then supply its exact `revision_id`. For creation,
use `expected_revision_id: null`. One operation may update 1–10 pages atomically,
including mutually linked new pages. Supply all required strings on every update:

```json
{
  "operation_id": "unique-operation-id",
  "updates": [
    {
      "id": "new-page",
      "expected_revision_id": null,
      "title": "New page",
      "description": "A clear summary of this page.",
      "topic": "Examples",
      "body": "A sourced Markdown explanation.",
      "summary": "Create the example article"
    }
  ]
}
```

`operation_id` uses the same lowercase hyphenated syntax as article IDs; a UUID
works. Maximum string lengths: title 200, description 600, topic 100, body 100,000,
summary 1,000. Optional `related` and `questions` arrays replace those fields;
omission preserves them. Other existing frontmatter is preserved. New pages get
`kind: topic`; use file edits for arbitrary initial custom metadata. Unknown update
fields are not applied. The HTTP body is limited to 512,000 bytes.

Save the JSON in `draft.json` outside the content checkout, then:

```sh
curl --fail-with-body http://127.0.0.1:4317/api/articles/edits \
  -H 'Origin: http://127.0.0.1:4317' \
  -H 'Content-Type: application/json' \
  -H 'X-Wiki-Write: 1' \
  --data-binary @draft.json
```

HTTP writing must be enabled. Requests require the configured Origin, Host,
JSON content type, `X-Wiki-Write: 1`, and same-origin fetch metadata when present.
The browser sends these automatically. The standalone locked writer is also usable:

```sh
WIKI_REPO=/absolute/path/to/content node src/editor.mjs < draft.json
```

A receipt separates three outcomes:

```json
{
  "operation_id": "unique-operation-id",
  "state": "saved",
  "commit": "GIT_COMMIT",
  "articles": [
    {
      "id": "new-page",
      "number": 1,
      "url": "/wiki/new-page/",
      "revision_id": "BLOB_ID"
    }
  ],
  "remote": "not-requested",
  "publication": "live"
}
```

`state` is `saved` or `already-saved`. `remote` is `not-requested`, `pushed`, or
`push-failed`; a failed push does not undo the local commit. `publication` is `live`
or `refresh-failed` and is only returned by HTTP. A successful retry can return an
older receipt while the current article has moved on; read current again before
starting another edit. `revision_id` identifies the full Markdown blob, including
metadata, rather than a global repository commit. An update producing identical
Markdown bytes succeeds with the existing article revision. Its operation receipt
is still committed; mixed batches advance only articles whose bytes change.

Retry an ambiguous response with the **same operation ID and identical JSON**.
The committed `.wiki/operations/ID.json` fingerprint prevents duplicate edits and
rejects reuse for different input. Retry also retries a requested push. On a stale
revision, read current content, reconcile the draft and submit a new operation ID;
never substitute the fresh ID blindly. The browser retains drafts in the current
page after failures; it does not persist unsaved drafts across closing/reloading.

HTTP errors: 400 invalid JSON/edit/search, 403 access/origin rejection, 404 absent
article/revision/route, 409 revision/operation/dirty-checkout conflict, 413 oversized
request, 405 unsupported method, 500 unexpected server failure. `error` explains
the failure. Git/lock/environment failures from the writer currently return 400;
inspect the message rather than assuming every 400 means malformed Markdown.

## Git correctness and recovery

The writer requires clean `main`, holds `.git/wiki-write.lock` using `flock`, writes
through a private Git index, then compare-and-swaps `refs/heads/main`. The commit
contains every changed page and its operation receipt. Only those paths are then
restored to the real index and worktree. It does not commit unrelated files or
force-push. The internal `saveGitEdits` helper assumes its caller owns the lock;
use the CLI or HTTP interface for coordinated writes.

Do not race human or other uncoordinated Git edits against the service writer.
Compare-and-swap protects the branch ref, but cannot preserve a human edit to the
same path made between the clean check and worktree restoration. Pause service
writing for ordinary file edits. A crash after the ref update can leave a dirty
checkout while the complete commit and receipt are already durable. Inspect HEAD,
the receipt and worktree differences, preserve any human changes, and reconcile
the affected paths before further writing. An identical retry can retrieve the
receipt; it does not automatically discard or repair worktree changes.

History is first-parent, by stable basename. Directory moves preserve identity;
renaming a basename creates a new identity. Deletion is a Git operation, not an
editor endpoint; prior revisions remain readable, while current returns 404.
Avoid rewriting content history: revision numbers and receipts depend on it.
The writer does not run Git commit hooks or sign commits (`commit-tree` is used);
repositories requiring those policies need a deliberate integration.
