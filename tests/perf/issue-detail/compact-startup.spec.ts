import fs from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);
test.use({ video: "on", trace: "retain-on-failure", serviceWorkers: "block", viewport: { width: 1440, height: 900 } });

let fixture: { id: string; identifier: string; prefix: string; oldestCommentId: string };
const fixturePath = path.resolve("test-results/compact-startup-fixture.json");
test.beforeAll(async ({ request }) => {
  try {
    const saved = JSON.parse(await fs.readFile(fixturePath, "utf8"));
    if ((await request.get(`/api/issues/${saved.id}`)).ok()) {
      fixture = saved;
      const summary = await request.put(`/api/issues/${fixture.id}/documents/continuation-summary`, { data: { title: "Continuation summary", format: "markdown", body: "# Continuation summary\n\nSaved handoff evidence." } });
      expect(summary.ok()).toBeTruthy();
      return;
    }
  } catch { /* A fresh local instance needs its own synthetic task. */ }
  const company = await (await request.post("/api/companies", { data: { name: "Task loading reproduction" } })).json();
  const response = await request.post(`/api/companies/${company.id}/issues`, { data: {
    title: "Review the latest investigation", status: "backlog", description: "Investigate the latest reported pattern and keep the saved evidence together.",
  } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const issue = await response.json();
  let oldestCommentId = "";
  for (let index = 0; index < 24; index++) {
    const comment = await request.post(`/api/issues/${issue.id}/comments`, { data: { body: index === 23
      ? "The saved update is ready. [Read the investigation](#document-investigation). The recent reply must stay in the same place while cards load."
      : `Historical investigation message ${index}. ${"Saved findings and verification details. ".repeat(5)}` } });
    expect(comment.ok()).toBeTruthy();
    if (!index) oldestCommentId = (await comment.json()).id;
  }
  for (const [key, title] of [["plan", "Investigation and verification plan"], ["investigation", "Saved investigation"], ["verification", "Verification evidence"], ["handoff", "Engineering handoff"], ["continuation-summary", "Continuation summary"]]) {
    const document = await request.put(`/api/issues/${issue.id}/documents/${key}`, { data: {
      title, format: "markdown", body: `# ${title}\n\nInspect the original report.\n\nVerify the saved evidence.\n\nKeep the reader's position stable.`,
    } });
    expect(document.ok(), await document.text()).toBeTruthy();
  }
  for (let index = 0; index < 3; index++) {
    const product = await request.post(`/api/issues/${issue.id}/work-products`, { data: {
      type: "pull_request", provider: "github", title: `Investigation fix ${index + 1}`, status: "merged",
      url: `https://github.com/example/reproduction/pull/${index + 1}`, metadata: { repository: "example/reproduction", number: index + 1 },
    } });
    expect(product.ok(), await product.text()).toBeTruthy();
  }
  fixture = { id: issue.id, identifier: issue.identifier, prefix: company.issuePrefix, oldestCommentId };
  await fs.mkdir(path.dirname(fixturePath), { recursive: true });
  await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2));
});

async function ready(page: Page) {
  await expect(page.getByTestId("task-chat-thread").locator(':scope > [aria-busy="false"]')).toBeVisible({ timeout: 10_000 });
}

test("saved rich cards are present at first reveal and never insert during slow enrichment", async ({ page }, info) => {
  await page.addInitScript(() => { window.__PAPERCLIP_ISSUE_DETAIL_PROFILE__ = true; });
  await page.addInitScript(() => {
    const frames: unknown[] = [];
    Object.assign(window, { compactStartupFrames: frames });
    const sample = () => {
      const thread = document.querySelector('[data-testid="task-chat-thread"] > [aria-busy="false"]');
      const scroller = thread?.querySelector('[data-testid="task-chat-scroller"]');
      if (scroller) {
        const cards = [...scroller.querySelectorAll('[data-testid="task-chat-resource-document"], [data-testid="task-chat-plan-preview"], [data-testid="task-chat-rich-work-product-pull_request"], [data-testid="task-chat-resource-deliverable"]')];
        frames.push({ time: performance.now(), height: scroller.scrollHeight, cards: cards.length, boxes: cards.map(card => {
          const box = card.getBoundingClientRect(); return { top: box.top, height: box.height };
        }) });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/api\/issues\/[^/?]+$/, async route => { await held; await route.continue(); });
  try {
    await page.goto(`/${fixture.prefix}/issues/${fixture.identifier}`);
    await ready(page);
    await page.waitForTimeout(250);
    release();
    await expect(page.getByTestId("task-chat-resource-document")).toHaveCount(3);
    await expect(page.getByTestId("task-chat-plan-preview")).toHaveCount(1);
    await page.waitForTimeout(500);
    const frames = await page.evaluate(() => (window as unknown as { compactStartupFrames: { height: number; cards: number; boxes: { top: number; height: number }[] }[] }).compactStartupFrames);
    await fs.writeFile(info.outputPath("layout.json"), JSON.stringify(frames, null, 2));
    await page.screenshot({ path: info.outputPath("settled.png") });
    expect(frames.length).toBeGreaterThan(5);
    expect(new Set(frames.map(frame => frame.cards)).size, "Cards must arrive before the conversation becomes readable").toBe(1);
    expect(Math.max(...frames.map(frame => frame.height)) - Math.min(...frames.map(frame => frame.height)), "Initial content must not grow after reveal").toBeLessThanOrEqual(2);
    for (let card = 0; card < frames[0].cards; card++) {
      for (const dimension of ["top", "height"] as const) {
        const values = frames.map(frame => frame.boxes[card][dimension]);
        expect(Math.max(...values) - Math.min(...values), `Card ${card} ${dimension} stays stable after reveal`).toBeLessThanOrEqual(2);
      }
    }
  } finally {
    await fs.writeFile(info.outputPath("readiness.json"), JSON.stringify(await page.evaluate(() => performance.getEntriesByType("mark").map(entry => ({ ...entry.toJSON(), detail: (entry as PerformanceMark).detail }))), null, 2));
    release();
  }
});

for (const anchor of ["document", "comment", "unknown", "continuation"]) {
  test(`${anchor} anchors keep compact loading and resolve their target`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", request => { if (request.url().includes("/api/issues/")) requests.push(request.url()); });
    const hash = anchor === "comment" ? `#comment-${fixture.oldestCommentId}` : anchor === "document" ? "#document-investigation" : anchor === "continuation" ? "#document-continuation-summary" : "#unknown";
    await page.goto(`/${fixture.prefix}/issues/${fixture.identifier}${hash}`);
    await ready(page);
    await expect(page.getByRole("button", { name: "More messages", exact: true })).toBeVisible();
    await expect(page.getByText("The saved update is ready.", { exact: false }).first()).toBeAttached();
    if (anchor === "comment") await expect(page.locator(`[id="comment-${fixture.oldestCommentId}"]`)).toBeVisible();
    if (anchor === "document") await expect(page.locator('[id="side-panel-content-document:investigation"]')).toBeVisible();
    if (anchor === "continuation") await expect(page.locator('[id="side-panel-content-document:continuation-summary"]')).toBeVisible();
    expect(requests.some(url => /\/comments\?/.test(url))).toBe(false);
    expect(requests.some(url => /\/(activity|runs)(?:\?|$)/.test(url) && !url.includes("view=recent") && !url.includes("comment-inputs"))).toBe(false);
  });
}

test("opening documents and older comments keeps the mounted composer and compact window", async ({ page }) => {
  await page.goto(`/${fixture.prefix}/issues/${fixture.identifier}`);
  await ready(page);
  const editor = page.getByTestId("task-chat-composer-stack").locator('[contenteditable="true"]');
  await editor.fill("A draft stays here while I inspect saved evidence.");
  await editor.evaluate(element => { element.setAttribute("data-mount-proof", "retained"); });
  await page.getByRole("link", { name: "Read the investigation", exact: true }).click();
  await expect(page.locator('[id="side-panel-content-document:investigation"]')).toBeVisible();
  await expect(editor).toHaveAttribute("data-mount-proof", "retained");
  await expect(editor).toHaveText("A draft stays here while I inspect saved evidence.");
  await page.getByRole("button", { name: "More messages", exact: true }).click();
  await expect(page.getByText("Historical investigation message 0.", { exact: false }).first()).toBeAttached();
  await expect(editor).toHaveAttribute("data-mount-proof", "retained");
});

test("a failed linked comment keeps recent messages readable and retries without expanding history", async ({ page }) => {
  const targetPath = `**/api/issues/${fixture.id}/comments/${fixture.oldestCommentId}`;
  await page.route(targetPath, route => route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"Comment not found"}' }));
  await page.goto(`/${fixture.prefix}/issues/${fixture.identifier}#comment-${fixture.oldestCommentId}`);
  await ready(page);
  await expect(page.getByText("The saved update is ready.", { exact: false }).first()).toBeAttached();
  await expect(page.getByRole("button", { name: "More messages", exact: true })).toBeVisible();
  await page.unroute(targetPath);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(`[id="comment-${fixture.oldestCommentId}"]`)).toBeVisible();
  await expect(page.getByRole("button", { name: "More messages", exact: true })).toBeVisible();
});

test("late provider metadata keeps saved PR card geometry stable", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/issues/*/work-products?refreshPullRequests=true", async route => {
    const response = await route.fetch();
    const products = await response.json();
    await held;
    await route.fulfill({ response, json: products.map((product: { metadata: object }) => ({ ...product, metadata: { ...product.metadata, additions: 78, deletions: 2, filesChanged: 5 } })) });
  });
  try {
    await page.goto(`/${fixture.prefix}/issues/${fixture.identifier}`);
    await ready(page);
    const cards = page.getByTestId("task-chat-rich-work-product-pull_request");
    await expect(cards).toHaveCount(3);
    const before = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    release();
    await expect(cards.first()).toContainText("+78");
    const after = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    expect(after).toEqual(before);
  } finally { release(); }
});
