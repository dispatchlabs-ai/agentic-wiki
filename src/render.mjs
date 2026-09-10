import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { wikiLinks } from "./wiki.mjs";
import {
  headingIds,
  markdownParser,
  nodeText,
  sections,
} from "./markdown-structure.mjs";
export const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function tableRegions() {
  return (tree) => {
    const visit = (node) => {
      node.children?.forEach((child, i) => {
        if (child.tagName === "table") {
          const elements = (n) =>
            (n?.children || []).filter((c) => c.type === "element");
          const head = elements(child).find((c) => c.tagName === "thead"),
            body = elements(child).find((c) => c.tagName === "tbody");
          const headers = elements(elements(head)[0]);
          const rows = elements(body);
          if (
            body &&
            headers.length > 0 &&
            headers.length <= 4 &&
            rows.every((row) => elements(row).length === headers.length)
          ) {
            child.properties = {
              ...child.properties,
              className: ["record-table"],
              role: "table",
            };
            head.properties = { ...head.properties, role: "rowgroup" };
            body.properties = { ...body.properties, role: "rowgroup" };
            elements(head)[0].properties = { role: "row" };
            headers.forEach((h) => {
              h.properties = {
                ...h.properties,
                scope: "col",
                role: "columnheader",
              };
            });
            rows.forEach((row) => {
              row.properties = { role: "row" };
              elements(row).forEach((cell, i) => {
                cell.properties = {
                  ...cell.properties,
                  dataLabel: nodeText(headers[i]),
                  role: "cell",
                };
                cell.children = [
                  {
                    type: "element",
                    tagName: "div",
                    properties: { className: ["cell-value"] },
                    children: cell.children,
                  },
                ];
              });
            });
          }
          node.children[i] = {
            type: "element",
            tagName: "div",
            properties: {
              className: ["table-scroll"],
              tabIndex: 0,
              role: "region",
              ariaLabel: "Article table",
            },
            children: [child],
          };
        } else visit(child);
      });
    };
    visit(tree);
  };
}
const parser = markdownParser()
  .use(headingIds)
  .use(wikiLinks)
  .use(remarkRehype)
  .use(rehypeSanitize, { ...defaultSchema, clobberPrefix: "" })
  .use(tableRegions)
  .use(rehypeStringify);
export const renderMarkdown = async (body) =>
  String(await parser.process(body));
export const safeUrl = (url) => {
  if (typeof url !== "string" || /[\u0000-\u0020\\]/.test(url)) return null;
  if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) || /^[?#]/.test(url))
    return url;
  return null;
};
export const link = (url, title) =>
  `<a href="${escape(safeUrl(url) || "#")}">${escape(title)}</a>`;
export const date = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.valueOf())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(d);
};
export const list = (items) =>
  `<ul class="link-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
export const queryLink = (pathname, params) =>
  pathname +
  "?" +
  new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== "" && v !== null && v !== undefined,
    ),
  ).toString();
export function shell(title, body, { active = "", className = "" } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)} · Agentic Wiki</title><script src="/assets/theme.js"></script><link rel="stylesheet" href="/assets/theme.css"><link rel="stylesheet" href="/assets/style.css"><script type="module" src="/assets/client.js"></script></head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a href="/" class="brand">Agentic Wiki</a><nav class="site-nav" aria-label="Main navigation">${[
    ["/", "Home"],
    ["/wiki/", "Topics"],
    ["/traces/", "Traces"],
  ]
    .map(
      ([url, name]) =>
        `<a href="${url}"${active === name ? ' aria-current="page"' : ""}>${name}</a>`,
    )
    .join(
      "",
    )}</nav><form class="header-search" action="/search/" role="search"><label class="sr-only" for="header-query">Search the wiki</label><input id="header-query" name="q" type="search" placeholder="Search the wiki" maxlength="300"><button>Search</button></form><a class="mobile-search" href="/search/">Search</a></header><main id="main" class="${escape(className)}">${body}</main><footer><span>Agentic Wiki · ${link("/api/articles/authoring.json", "Agent API")}</span><label>Appearance<select id="appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></footer></body></html>`;
}
export function sources(page) {
  const found = new Map();
  const add = (url, title, quote) => {
    if (!safeUrl(url) || url.startsWith("#") || url.startsWith("/wiki/"))
      return;
    if (!found.has(url))
      found.set(url, {
        url,
        title: title || url,
        quote: typeof quote === "string" ? quote : "",
      });
  };
  for (const s of page.sources || [])
    add(s.url, typeof s.title === "string" ? s.title : s.url, s.quote);
  const tree = markdownParser.parse(page.body),
    definitions = new Map();
  const collect = (n) => {
    if (n.type === "definition") definitions.set(n.identifier, n.url);
    n.children?.forEach(collect);
  };
  collect(tree);
  const visit = (n) => {
    if (n.type === "link") add(n.url, nodeText(n));
    if (n.type === "linkReference")
      add(definitions.get(n.identifier), nodeText(n));
    n.children?.forEach(visit);
  };
  visit(tree);
  return [...found.values()];
}
export function articleHeader(
  p,
  active = "Article",
  { write = false, historical = false } = {},
) {
  return `<p class="breadcrumb">${link("/wiki/", "Topics")} / ${link(queryLink("/wiki/", { topic: p.topic }), p.topic)}</p>${historical ? `<div class="notice warning">Earlier revision · Revision ${p.number} · ${link(`/wiki/${p.id}/`, "View current article")}</div>` : ""}<h1>${escape(p.title)}</h1><p class="lede">${escape(p.description)}</p><nav class="tabs" aria-label="Article views">${[
    [`/wiki/${p.id}/`, "Article"],
    [`/wiki/${p.id}/history/`, "History"],
    [
      `/wiki/${p.id}/sources/${historical ? `?revision=${p.number}` : ""}`,
      "Sources",
    ],
  ]
    .map(
      ([url, label]) =>
        `<a href="${url}"${active === label ? ' aria-current="page"' : ""}>${label}${label === "History" ? ` · ${p.revisionCount}` : label === "Sources" ? ` · ${sources(p).length}` : ""}</a>`,
    )
    .join(
      "",
    )}${write && !historical ? `<a href="/wiki/${p.id}/edit/">Edit article</a>` : ""}</nav>`;
}
export async function article(
  wiki,
  index,
  id,
  revision,
  { write = false } = {},
) {
  const p = revision ? wiki.revision(id, revision) : wiki.current(id);
  if (!p) return null;
  const toc = sections(p.body).filter((s) => s.anchor);
  const tocLinks = list(toc.map((s) => link("#" + s.anchor, s.heading)));
  const related = (p.related || [])
    .map((id) => wiki.current(id))
    .filter(Boolean);
  return shell(
    p.title,
    `<div class="layout article-layout"><div>${articleHeader(p, "Article", { write, historical: !!revision })}<p class="meta">Revision ${p.number} · Updated ${date(p.created_at)}</p>${revision ? `<nav class="actions" aria-label="Revision navigation">${p.number > 1 ? link(`/wiki/${id}/revision/${p.number - 1}/`, "Previous revision") : ""}${p.number < p.revisionCount ? link(`/wiki/${id}/revision/${p.number + 1}/`, "Next revision") : ""}${link(queryLink(`/wiki/${id}/compare/`, { from: p.number, to: p.revisionCount }), "Compare with current")}</nav>` : `<div class="notice">Latest change: ${escape(p.summary)}${p.number > 1 ? ` · ${link(queryLink(`/wiki/${id}/compare/`, { from: p.number - 1, to: p.number }), "View changes")}` : ""}</div>`}${toc.length ? `<details class="mobile-toc"><summary>On this page</summary>${tocLinks}</details>` : ""}<article>${await renderMarkdown(p.body)}</article></div><aside class="sidebar">${toc.length ? `<section class="desktop-toc"><h2>On this page</h2>${tocLinks}</section>` : ""}<div class="article-side-links">${related.length ? `<section><h2>Related articles</h2>${list(related.map((p) => link(p.url, p.title)))}</section>` : ""}<section><h2>Linked from</h2>${index.backlinks(id).length ? list(index.backlinks(id).map((p) => link(`/wiki/${p.id}/`, p.title))) : '<p class="muted">No incoming article links yet.</p>'}</section></div></aside></div>`,
    { active: "Topics" },
  );
}
