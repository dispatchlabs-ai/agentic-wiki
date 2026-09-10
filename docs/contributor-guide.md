# Contributor map

The engine owns serving, indexing, and revision-checked editing. Content and trace
collection belong to the operator. Keep original Markdown/Git and JSONL recoverable;
never introduce a second authoritative conversation representation.

## Where to change behavior

- Git history and publication: `src/git-wiki.mjs`; write coordination:
  `src/editor.mjs`. No-op saves retain article revisions; receipts remain durable.
- Markdown syntax and anchors: `src/markdown-structure.mjs` and `src/wiki.mjs`.
  Rendering, link validation, and search must agree on supported syntax.
- Browser/HTTP edit shapes: `public/edit-contract.js`. The writer owns validation;
  `src/errors.mjs` defines failures that cross the subprocess boundary.
- Trace interpretation: pure `src/trace-format.mjs`; presentation:
  `src/trace-worker.mjs`; derived dialogue search: `src/trace-search.mjs`.

## Compatibility and fixtures

Linux and macOS are supported through the portable directory writer lock. Node
24.19.0 is the tested minimum for the built-in SQLite implementation. CI runs the
core suite on both platforms with 24.19.0 and 26.6.0; an engines lower bound is not proof that every
intervening or future runtime works. Chromium exercises the actual editor and
module loading. Native WebMCP remains a separate compatible-browser integration
check; mocked registration and a Chromium editor test do not establish that support.

`examples/traces/codex.jsonl` and `pi.jsonl` are synthetic baseline fixtures.
`tests/traces.test.mjs` adds typed/paginated Codex history, repeated representations,
pi branches/revisions, corruption and pagination. This is a tested shape inventory,
not a claim of support for every harness release. For a newly supported variant,
include a minimal synthetic record sequence, identify the harness version/shape in
the test, and assert original record values, dialogue classification and citation
lines. Never paste a real rollout into a fixture. Unknown records remain inspectable
context; change `TRACE_VERSION` when projection or index interpretation changes.

## Small contributions with clear completion criteria

1. **Reduce catalog scans.** Benchmark a rebuildable metadata index behind existing
   paginated snapshot/session APIs; preserve import ordering and snapshot URLs.
2. **Reduce cold range I/O.** Explore verified line-offset indexes for bounded source
   reads without weakening integrity checks or changing physical line citations.
3. **Reduce cold trace work.** Benchmark a rebuildable line-offset index against
   `npm run benchmark:serve`; preserve integrity checks and exact source anchors.
4. **Broaden format compatibility.** Add one documented synthetic format variant
   at a time using the fixture rules above.

Discuss interface changes before implementation. Keep a contribution focused on one
behavior, run `npm run check`, and include the specific regression or benchmark
result. Browser-facing changes additionally run `npm run test:browser`. Performance
claims must identify corpus sizes and include serving costs, not only SQLite timings.
