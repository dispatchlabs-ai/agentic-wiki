import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { wikiLinks } from "./wiki.mjs";
import { headingIds } from "./markdown-structure.mjs";
export const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(headingIds)
  .use(wikiLinks)
  .use(remarkRehype)
  .use(rehypeSanitize, { ...defaultSchema, clobberPrefix: "" })
  .use(rehypeStringify);
export const renderMarkdown = async (body) =>
  String(await parser.process(body));
export const link = (url, title) =>
  `<a href="${escape(url)}">${escape(title)}</a>`;
export const shell = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)} · Wiki</title><link rel="stylesheet" href="/assets/style.css"><script type="module" src="/assets/client.js"></script></head><body><header><a href="/" class="brand">Wiki</a><nav aria-label="Main navigation"><a href="/">Home</a><a href="/wiki/">Articles</a><a href="/traces/">Traces</a></nav><form action="/search/" role="search"><label for="q">Find an article</label><input id="q" name="q" type="search"><button>Search</button></form></header><main>${body}</main><footer>Markdown in Git · <a href="/api/articles/authoring.json">Agent API & authoring</a></footer></body></html>`;
export async function article(wiki, index, id, revision) {
  const p = revision ? wiki.revision(id, revision) : wiki.current(id);
  if (!p) return null;
  return shell(
    p.title,
    `<p class="eyebrow">${escape(p.topic)}</p><h1>${escape(p.title)}</h1><p class="lede">${escape(p.description)}</p><nav>${link(`/wiki/${id}/`, "Current")} · ${link(`/wiki/${id}/history/`, "History")}${!revision ? ` · ${link(`/wiki/${id}/edit/`, "Edit")}` : ""}</nav><p class="meta">Revision ${p.number} · ${escape(p.created_at)} · ${escape(p.commit.slice(0, 12))}</p><article>${await renderMarkdown(p.body)}</article><aside><h2>Linked from</h2><ul>${index
      .backlinks(id)
      .map((p) => `<li>${link(`/wiki/${p.id}/`, p.title)}</li>`)
      .join("")}</ul></aside>`,
  );
}
