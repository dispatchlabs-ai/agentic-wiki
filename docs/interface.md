# Responsive interface

The same server-rendered pages serve desktop and mobile. The interface covers
home activity, topics, articles, history, comparisons, sources, editing, article
and trace search, the trace catalog, and trace reading.

## Layout and appearance

`public/theme.css` owns semantic color tokens. Light mode uses restrained blue
links (`#1a65a6`); dark mode uses `#8ab4f8`. `public/style.css` owns layout and
typography. The desktop shell is capped at 1536px, with a bounded reading column and sidebar.
Article and conversation prose use shadcn Typeset with system sans serif. Mobile uses compact
metadata spacing and a separate Edit link outside the reading tabs. At 760px and below, sidebars move into the reading flow, filters
collapse into disclosures, comparisons stack, and revision selectors fill their
rows. Simple Markdown tables with up to four columns become labeled records;
larger tables have a keyboard-focusable horizontal scrolling region.

The footer Appearance control offers System, Light, and Dark. System follows the
browser preference. Explicit preferences persist in local storage and are read
before paint by `public/theme.js`. With JavaScript disabled, system appearance
and ordinary article navigation still work.

## Reading and evidence

The home feed shows the twelve most recently updated current articles, optionally
filtered to today or this week. It is not a complete revision activity log. Topics
can be filtered and sorted; search groups article and trace matches. The trace
catalog groups snapshots by harness and session ID, with links to every capture.
It supports harness filtering and dialogue search when its index exists.

Article tabs expose Git history and sources from the selected revision. Sources
are deduplicated links from Markdown and source metadata; their presence does not
establish independent verification. Trace citations retain their page and record
anchors. The trace reader preserves every original record and supports Dialogue
and Source records display modes.

Comparisons align source lines using a bounded algorithm and show rendered
Markdown fragments, changed title/description/topic metadata, and recorded change
summaries. Splitting Markdown structures can change fragment presentation; exact
Markdown for each group remains available in a disclosure. Other custom
frontmatter is preserved in Git but is not included in this comparison view.

## Editing

The editor offers Write, Preview, and desktop Split modes. Preview uses the same
sanitized Markdown renderer as articles, without changing Git. Switching modes
preserves the draft, and the browser warns before leaving an unsaved edit. Drafts
are not persisted across closing or reloading. Saving retains existing revision
checks, atomic commits, and retry receipts. A stale revision requires reconciliation.

## Verification

Run `npm run check` and `npm run test:browser`. Browser fixtures use temporary
synthetic content and trace repositories. Coverage includes eleven routes at
320px, 390px, 768px, 1024px, 1440px, 1920px, and 2560px in both themes, document overflow, appearance persistence,
mobile filters, trace anchors, preview sanitization, draft retention, and saving.
Review screenshots are written under ignored `.runtime/responsive-review/`.

The synthetic example articles cite the bundled immutable traces at their original
answer lines. To refresh an existing demo, review and commit the example Markdown
into its content repository explicitly; startup never replaces existing articles
or rewrites their history. Maintenance commits remain visible in historical views.

See [existing archive integration](external-evidence.md) for the optional provider,
its API differences, native conversation URLs, files, and concurrent search.

The [Markdown profile](markdown-profile.md) documents rich blocks and browser
asset setup. Shadcn/Base UI supplies the search dialog and content tabs; ordinary
server-rendered navigation and forms retain native behavior. Search opens with
Ctrl/Command+K. Rich-feature tests cover keyboard focus, no-JavaScript reading,
isolated Mermaid rendering, preview parity and live content commits.
