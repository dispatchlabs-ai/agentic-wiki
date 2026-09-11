import { test, expect } from "@playwright/test";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { createWiki } from "../../src/server.mjs";
import { fixture, commit } from "../helpers.mjs";
import { markdown } from "../../src/git-wiki.mjs";
import { evidenceFixture, evidenceId, fileId } from "../evidence-fixture.mjs";
let server, backend, base, cleanup;
test.beforeAll(async () => {
  backend = await evidenceFixture();
  const repo = fixture({ after: (fn) => (cleanup = fn) });
  fs.writeFileSync(
    path.join(repo, "wiki/guide.md"),
    markdown(
      {
        title: "Prototype guide",
        description: "A synthetic article",
        topic: "Research",
        evidence: [
          {
            url: `/conversations/${evidenceId}/#old-tool`,
            quote: "Recorded source quote",
            attribution: "user",
          },
        ],
      },
      `## Prototype\n\nA searchable prototype.\n\n- [w] Review evidence\n\n[Captured notes](/media/${fileId})`,
    ),
  );
  commit(repo, "Synthetic evidence");
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  base = `http://127.0.0.1:${port}`;
  server = createWiki({ repo, origin: base, evidenceUrl: backend.url });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
});
test.afterAll(async () => {
  await new Promise((r) => server.close(r));
  await backend.close();
  cleanup();
});
test("articles appear before a delayed trace query; typing updates both groups and tabs", async ({
  page,
}) => {
  backend.state.delay = 1000;
  await page.goto(base + "/search/?q=prototype", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("#article-results")).toContainText(
    "Prototype guide",
  );
  await expect(page.locator("#trace-results")).toContainText(
    "Searching traces",
  );
  await expect(page.locator("#trace-results")).toContainText(
    "Prototype archive discussion",
  );
  backend.state.delay = 0;
  await page.locator("#search-query").fill("captured");
  await expect(page).toHaveURL(/q=captured/);
  await expect(
    page.locator('nav[aria-label="Search type"] a').last(),
  ).toHaveAttribute("href", /q=captured/);
  await expect(page.locator("#trace-results")).toContainText(
    "Prototype archive discussion",
  );
});
test("legacy citation opens its correct page and optional category", async ({
  page,
}) => {
  await page.goto(base + `/conversations/${evidenceId}/#old-event`);
  await expect(page).toHaveURL(/event=old-event/);
  await expect(page.locator("#event-101")).toContainText(
    "Recorded message 101",
  );
  await page.goto(base + `/conversations/${evidenceId}/#old-tool`);
  await expect(page.locator("#tool-event")).toContainText(
    "Recorded tool output",
  );
  await expect(
    page.locator('.trace-categories [aria-current="page"]'),
  ).toContainText("Tool calls");
});
for (const width of [390, 1440])
  test(`conversation attachments and sources work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + `/conversations/${evidenceId}/`);
    await expect(page.getByRole("heading", { name: "notes.md" })).toBeVisible();
    await page.getByText("Preview notes.md", { exact: true }).click();
    await expect(page.locator(".file-preview[open]")).toContainText(
      "<script>bad()</script>",
    );
    await expect(page.locator("script:not([src])")).toHaveCount(0);
    await expect(
      page.getByText("Not included in this capture", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `.runtime/responsive-review/evidence-${width}.png`,
      fullPage: false,
    });
    await page.goto(base + "/wiki/guide/");
    await expect(page.locator("#source-1")).toContainText(
      "Recorded source quote",
    );
    await expect(
      page.getByText("In progress:", { exact: false }),
    ).toBeVisible();
    await page.getByText("Preview and file details", { exact: true }).click();
    await expect(page).toHaveURL(/\/files\//);
    await expect(
      page.getByRole("heading", { name: "notes.md", exact: true }).first(),
    ).toBeVisible();
  });
