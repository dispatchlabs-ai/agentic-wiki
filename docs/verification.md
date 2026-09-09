# Verification

## Source alpha preparation — September 9, 2026

- Clean exported source: `npm ci --ignore-scripts` and `npm run check` passed
  all 22 tests on Linux x86-64 with Node 24.19.0.
- A clean-clone rehearsal also passed the complete check.
- The example started, returned articles and both synthetic trace types, saved an
  article, and did not push. Ambient content/trace/push settings did not redirect
  the example into the sentinel archive.
- After stopping the process, copied the full content Git repository and trace
  archive to new paths. The production entry point restored the saved edit and
  catalog and rebuilt the SQLite search index.
- Gitleaks 8.30.1 found no secrets in the reviewed history. A separate private-
  identifier scan and synthetic fixture inspection found no source-data exposure.
- Independent runtime security review found no concrete release blocker within
  the documented trusted-operator model. Independent source-release review
  accepted the alpha after example isolation and dependency-policy clarification.
- Dependency freshness and license inventory are recorded in [dependencies](dependencies.md).
  `npm audit` reported zero known vulnerabilities.

These are local source-alpha checks. Hosted GitHub CI, private vulnerability
reporting, branch/tag policies, signed releases, and public visibility have not
been configured or verified. No package or container release was prepared.

## Initial verification

September 9, 2026, on Linux x86-64 with Node v26.8.1.

- `npm run check`: formatting and 14 automated tests passed. Coverage includes
  coordinated edits, stable retry receipts, stale revision rejection, concurrent
  HTTP writers, failed remote pushes, metadata preservation, directory moves and
  first-parent merges, dirty-tree protection, compare-and-swap, malformed committed
  links, index transaction rollback/recovery, executable frontmatter rejection, HTML sanitization, heading/search anchor
  agreement, incremental indexing/deletion, HTTP access/size limits, and WebMCP
  registration/execution against the HTTP API.
- Native WebMCP in the Codex in-app browser: discovered all four tools; searched
  “soil”; read a fictional person and its backlinks/history; saved an edit; retried
  the same operation and received the same commit; rejected a stale revision.
- Browser editor: loaded current Markdown, saved a revision, reported local/remote/
  publication status, and showed revision 3 on the current article. Article layout
  was visually checked at desktop and a 390-pixel viewport override; no horizontal
  overflow was observed. No production content was involved.
- `npm run benchmark`: 10,000 synthetic articles / 50,000 initial sections, disk
  SQLite. Initial indexing 5,446 ms; one changed article 11.1 ms; 100 warm queries
  median 4.2 ms, p95 8.3 ms. These measurements exclude Git refresh, HTTP and rendering;
  they are not end-to-end latency or cross-machine guarantees.
- Workspace registration: workspace Git/LFS checks and all 17 Python tests passed.

The browser example used a separate ignored content repository; the committed
example corpus remains the original three synthetic articles. No persistent
service or network deployment was installed. Node 24 is the declared minimum;
the initial execution checks used Node 26, not a version matrix.
