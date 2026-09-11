# Existing archive integration

Set `WIKI_EVIDENCE_URL` to an operator-controlled HTTP(S) service base ending in `/`.
It is mutually exclusive with `WIKI_TRACES`. The engine reads this service; it does
not import, rewrite, or index its original archive. Protect the service and engine
with the deployment's access controls. The service URL is configuration, never
selected by article content. Redirects and upstream cookie forwarding are disabled.

## Read-only provider contract

All routes below are relative to the configured base. Errors use HTTP 400, 404 or 503. JSON responses must be objects. A synthetic implementation is available in
`tests/evidence-fixture.mjs`.

- `health`: archive readiness metadata.
- `search?q=&limit=20&offset=0&harness=&machine=`: `{results, total, nextOffset}`.
  Results include `id`, `url`, `title`, `snippet`, `machine`, `harness`, and `start`.
  Conversation matches do not imply a precise event match. Keep original provenance
  when available. Query length is at most 300; limit is 1–100, offset 0–1000000.
- `catalog`: the same filters, returning `{items, total, nextOffset}`.
- `traces/:id?kind=dialogue&offset=0&limit=100&event=`: a conversation projection.
  IDs use `chat-` plus 24 hexadecimal digits. Include canonical `id`, title, harness,
  machine, start, kind, offset, limit, total, counts, previousOffset, nextOffset and
  messages. Each message has its original id, aliases, role, timestamp, text,
  snapshot, line, inherited/rolled_back flags and attachments where recorded.
  An event lookup selects its category and page and returns `eventFound`.
  Optional categories are tool, thinking, reasoning, context and analysis. Retain
  related histories, gaps, recovery notes and parent metadata without inventing events.
- `attachments/:asset`: `{attachment}` with name, url, kind, size, provenance,
  status (`available`, `not_captured`, `too_large` or unavailable), and optional
  captured_at, preview and preview_truncated fields.
- `assets/:asset`: original bytes; support Range, Content-Type, Content-Length,
  Content-Range and Accept-Ranges. Asset names are a SHA-256 plus a short extension.

The browser uses `/conversations/:id/`, `/files/:asset`, and `/media/:asset` on the
engine origin. Media is streamed; `?download=1` requests a download. Raster images
can display inline; PDFs open as files; text/Markdown previews remain inert and
explicitly report shortening or missing originals. Other formats download. HTML
and SVG are not executed. External images require an explicit open action.

## Search and citations

Search scopes are All, Articles and Traces. Article topic/state filters and trace
harness/machine filters remain independent. Initial HTML includes article results;
the browser requests trace results separately. Typing debounces for 180 ms and
cancels stale requests. Without JavaScript, submit with `sync=1` for both groups.
An unavailable trace service leaves articles usable and reports a visible error.
Scores from separate indexes are not merged into a single ranking. Attachment
text is not searched unless the operator's search service explicitly indexes it.

`wiki.traces`, `wiki.trace`, and `wiki.traceSearch` use the provider when configured.
`wiki.trace` supports `page` (one-based, default page size 100), `limit` (1–100),
`offset` (zero-based), `kind` and event lookup. If page and offset are both supplied,
they must identify the same starting point. An event lookup selects its own page.
The engine translates page numbers before calling the provider. External catalogs
use machine/harness filters and reject the imported-only `session_id` parameter.
`wiki.file` exposes safe file inspection and original/download URLs; `wiki.preview`
renders draft Markdown without writing. See [the API contract](api.md#webmcp-quotation-and-failure-contracts)
for verified quotations and structured WebMCP errors.
Provider mode omits imported-archive session, raw-line and logical-provenance tools.
Structured article evidence remains distinct, including multiple quotes from one
URL; source anchors and task state metadata are preserved. Existing conversation
fragments are resolved through event aliases, including events on later pages.
This adapter does not add ingestion, authentication, OCR or Office document rendering.
