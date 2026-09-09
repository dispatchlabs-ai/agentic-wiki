import { unified } from "unified";
import remarkParse from "remark-parse";
export function references(body) {
  const out = new Set();
  function walk(n) {
    if (n.type === "text")
      for (const m of n.value.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g))
        out.add(m[1]);
    if (n.type === "link") {
      const article = n.url.match(/^\/wiki\/([^/?#]+)(?:[/?#]|$)/);
      if (article) out.add(article[1]);
    }
    if (!["code", "inlineCode"].includes(n.type)) n.children?.forEach(walk);
  }
  walk(unified().use(remarkParse).parse(body));
  return [...out];
}
export function wikiLinks() {
  return (tree) => {
    function walk(n) {
      if (!n.children || ["link", "code", "inlineCode"].includes(n.type))
        return;
      n.children = n.children.flatMap((c) => {
        if (c.type !== "text") {
          walk(c);
          return [c];
        }
        const chunks = [];
        let end = 0;
        for (const m of c.value.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
          chunks.push(
            { type: "text", value: c.value.slice(end, m.index) },
            {
              type: "link",
              url: "/wiki/" + m[1] + "/",
              children: [
                { type: "text", value: m[2] || m[1].replaceAll("-", " ") },
              ],
            },
          );
          end = m.index + m[0].length;
        }
        chunks.push({ type: "text", value: c.value.slice(end) });
        return chunks;
      });
    }
    walk(tree);
  };
}
