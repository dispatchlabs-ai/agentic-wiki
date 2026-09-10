# Changelog

## Unreleased

### Fixed

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
