import fs from "node:fs";

// Two pages, with open A/W counters. Keep the center gap four units wide so
// the silhouette survives at favicon size. No fonts or raster tracing in mark.
const pages = `<path d="M6 5Q3 4 3 8V42Q3 45 6 46L16 50Q18 51 18 48V38Q18 36 16 35L12 33L18 20Q19 18 20 21L28 50Q30 54 30 49V20Q30 17 27 16Z"/><path d="M34 20Q34 17 37 16L42 14V34L48 29L53 32V10L58 5Q61 3 61 8V42Q61 45 58 46L37 53Q34 54 34 50Z"/>`;
const svg = (attrs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>\n`;
const out = new URL("../public/", import.meta.url);
fs.writeFileSync(
  new URL("brand-mark.svg", out),
  svg(
    'viewBox="0 0 64 56" fill="#256c9e"',
    `<title>Agentic Wiki</title>${pages}`,
  ),
);
for (const [name, ink, blue] of [
  ["light", "#192c35", "#256c9e"],
  ["dark", "#e4edf1", "#8ab4f8"],
  ["mono", "#192c35", "#192c35"],
]) {
  fs.writeFileSync(
    new URL(`brand-${name}.svg`, out),
    svg(
      'viewBox="0 0 272 48" role="img" aria-label="Agentic Wiki"',
      `<g fill="${blue}" transform="translate(0 7) scale(.6)">${pages}</g><text x="48" y="34" fill="${ink}" font-family="system-ui, sans-serif" font-size="30" font-weight="700" letter-spacing="-1">Agentic Wiki</text>`,
    ),
  );
}
// A pale tile keeps the same mark legible against light and dark browser chrome.
fs.writeFileSync(
  new URL("favicon.svg", out),
  svg(
    'viewBox="0 0 64 64"',
    `<rect width="64" height="64" rx="12" fill="#eef5ff"/><g fill="#256c9e" transform="translate(4 8) scale(.875)">${pages}</g>`,
  ),
);
