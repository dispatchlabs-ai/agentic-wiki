# Changelog

## Unreleased

- Isolate draft previews in a bounded worker pool with queue-inclusive deadlines,
  worker heap/output limits, and cancellation on disconnect. Article serving stays
  responsive during expensive previews, including on read-only instances.
- Bound MCP loopback concurrency, response buffering and request duration. Large
  successful reads return a resource link to complete HTTP JSON; originals remain
  available without truncation. Errors and writes never become GET resource links.
- **Client migration:** MCP callers must handle resource-link results as well as
  inline JSON. The notice includes the complete-result URL; fetch it using the same
  access credentials or explicitly request a smaller range. See `docs/api.md`.

## 0.2.3 — 2026-09-11

- Fix oversized conversation headings and duplicate Codex attachment wrappers.
- Show matched attachments once, retaining original recorded text in expandable
  source details. Unknown wrappers and code examples remain literal.
- Preserve API text, source records, citations, and captured files; no migration.

## 0.2.2 — 2026-09-11

- Serve regular MCP over Streamable HTTP at `/mcp` in the existing wiki process.
- Share tool schemas and operations with WebMCP, including progressive trace
  disclosure, provider-specific discovery, structured errors and write safeguards.
- Validate Host, browser Origin and request size; preserve read-only defaults.
- Verify discovery, reads, previews, save retries, conflicts and external trace
  windows through an official MCP client against synthetic repositories.

## 0.2.1 — 2026-09-11

- Added optional `textOffset`/`textLimit` trace text windows. Full selected event
  text remains the default; no automatic cap or summarization is introduced.
- Window responses report total Unicode character length and continuation offsets.
  Zero-length requests inspect size; chunks preserve exact original text.
- Cited external event chunks exclude neighboring bodies. Imported messages expose
  stable per-record-part event ids for targeted reads, including mixed pi records.
- External providers must support the optional text-window parameters before
  clients use them. Existing requests and original source access remain unchanged.

## 0.2.0 — 2026-09-11

- Trace tools now disclose user prompts and assistant responses first. Tool calls,
  outputs, recorded reasoning and context require explicit follow-up requests.
- Added timezone-aware `after`/`before` ranges, applied before pagination, with
  inclusive/exclusive boundaries and undated-event counts. Source identities and
  original event text remain intact.
- External trace API attachments default to metadata; `wiki.file` and explicit
  `attachments=preview` requests expand content. Human previews remain embedded.
- **Migration:** imported `wiki.trace` now returns `messages` containing selected
  text and source links instead of raw `records`. Use `wiki.traceLines` to retrieve
  exact source records, or the existing source-page HTTP API without
  `view=conversation`. External providers must implement the updated range and
  attachment contract in `docs/external-evidence.md` before upgrading.

## 0.1.2 — 2026-09-11

Compatible WebMCP fixes and additions; no content migration or automatic writer activation.

- Translate external trace page numbers to offsets, validate pagination conflicts,
  and omit unsupported imported-session filters from external tool discovery.
- Preserve structured HTTP errors through native WebMCP, including writer errors
  accompanied by runtime warnings. Success receipts retain their existing shape.
- Add read-only Markdown preview and captured-file inspection tools, including
  preview status and original/download URLs.
- Accept verified structured quotations in article edits. Exact dialogue/tool
  quotes resolve original event aliases and retain provenance; omitted evidence
  is preserved and an empty array explicitly clears it. Receipt retries work even
  when the evidence service is unavailable.
- Exercise real Chromium WebMCP registration and execution in synthetic browser
  tests, including pagination, file ranges, atomic quote rejection and save retries.

## 0.1.1 — 2026-09-10

Compatible additions and fixes; existing imported archives continue to work.
External archive integration is opt-in and does not migrate original evidence.

- Add independent, concurrent article and trace search with scope and metadata filters.
- Add a read-only external evidence provider, native conversation pages, preserved
  event aliases and category navigation, captured images and file previews/downloads.
- Preserve structured evidence records and article source anchors; render raw HTML
  as literal text and avoid automatic external image requests.
- Add desktop/mobile coverage for delayed trace results, event navigation and files.

- Recover legacy recreation receipts from their recorded Git tree before numeric fallback.
- Enforce the existing archive size limit throughout verified range spooling.
- Bound inline search provenance and expose complete paginated citations in HTTP,
  WebMCP, and the browser. Search schema 3 requires an index rebuild.
- Reconcile metadata after overlapping imports instead of certifying partial updates.

### Fixed

- Restore the approved desktop proportions and editorial typography, tighten mobile
  spacing, separate Edit from reading tabs, and distinguish sidebar navigation groups.
- Enrich the synthetic articles with linked decisions, source citations, related
  articles and an open review question. Existing content is never silently reseeded.

- Recreated articles advance their complete revision lifecycle. New durable receipts
  persist blob IDs; retries preserve those IDs, with fallback for older receipts.
- Failed trace-search indexes no longer take down article-only search or catalog
  browsing. Combined HTML search degrades visibly and health reports components.
- Growing captures group by logical event in search, preserving distinct repeated
  dialogue and branches, with newest matching representatives and provenance.

### Changed

- Explicit range responses are verified and disk-spooled, streamed with backpressure,
  and excluded from the rendered cache. Workers calculate page-cache byte sizes.
- Catalog pages use an independently rebuildable metadata index.
- Source JavaScript/JSDoc boundary checking is part of `npm run check`.
- Serving benchmarks include large snapshot catalogs and OS peak RSS.

### Added

- Session grouping in the trace catalog, with paginated session/snapshot APIs and
  a `wiki.traceSessions` tool. Original snapshot URLs remain unchanged.
- Caller-selected original source-line reads through HTTP and `wiki.traceLines`, retaining
  blank lines and stable citations without rendering HTML. Cold reads stream the
  full source for integrity verification. Line ranges and complete records have no
  added line-count or response-byte cap; agent harnesses manage their own context.

## 0.1.0 — 2026-09-10

Completes the 0.1.0-alpha.1 preview. This is an initial-development source release.
No breaking changes or content migration are required from that preview.

### Added

- Linux and macOS support with portable writer locking.
- Rebuildable trace dialogue search with bounded results, source-line citations,
  and the `wiki.traceSearch` WebMCP tool.
- End-to-end serving benchmarks, contributor contracts and compatibility guidance.
- Linux/macOS runtime CI and a Chromium editor test.
- An explicit SemVer policy and versioned release checklist.

### Fixed

- Unchanged saves retain the actual article revision in durable retry receipts,
  including mixed batches and retries after subsequent edits.
- Reference-style Markdown links participate in validation and backlinks.
- Impossible trace pages are rejected before parsing the complete snapshot.

### Changed

- Shared edit contracts and structured writer errors; trace interpretation is
  separated from presentation without changing projected records.

### Known limitations

- Trace attachment playback and parent-session stitching remain unsupported.
- No built-in user authentication, ingestion pipeline, or multi-tenant permissions.
- Git and SQLite operations remain synchronous; benchmark results are workload-specific.

## 0.1.0-alpha.1 — 2026-09-09

Initial MIT-licensed public source alpha with synthetic examples: Git-backed
Markdown articles, incremental SQLite search and backlinks, revision-checked
editing and retry receipts, native WebMCP, and on-demand Codex/pi JSONL traces.
