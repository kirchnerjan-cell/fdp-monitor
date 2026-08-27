import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const dataFixture = fs.readFileSync(path.join(fixturesDir, "data-fc-off.json"), "utf-8");
const dawumLive = fs.readFileSync(path.join(fixturesDir, "dawum-live.json"), "utf-8");

async function mockDataJson(page) {
  await page.route("**/data.json*", (route) =>
    route.fulfill({ contentType: "application/json", body: dataFixture })
  );
}

test.describe("Umfragen: live dawum erreichbar", () => {
  test.beforeEach(async ({ page }) => {
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (route) =>
      route.fulfill({ contentType: "application/json", body: dawumLive })
    );
    await page.goto("/index.html");
  });

  test("shows the live source note with the live database date", async ({ page }) => {
    const note = page.locator("#panel-bund .note");
    await expect(note).toContainText("Live von");
    await expect(note).toContainText("26.08.2026");
  });

  test("renders a bar row using the live survey value, not the stored fallback", async ({ page }) => {
    const row = page.locator("#panel-bund .row").first();
    await expect(row.locator(".inst")).toHaveText("Forsa (live)");
    await expect(row.locator(".val")).toHaveText("4,9 %");
  });

  test("still shows the stored dawum-Wahltrend as the headline figure", async ({ page }) => {
    // wahltrend comes only from data.json, regardless of the live poll fetch
    await expect(page.locator("#panel-bund .avg .num")).toContainText("4,4 %");
  });
});

test.describe("Umfragen: live dawum nicht erreichbar (Fallback auf data.json)", () => {
  test.beforeEach(async ({ page }) => {
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (route) => route.abort("failed"));
    await page.goto("/index.html");
  });

  test("shows the fallback source note referencing the last stored update", async ({ page }) => {
    const note = page.locator("#panel-bund .note");
    await expect(note).toContainText("letzten Aktualisierung");
    await expect(note).toContainText("15.08.2026");
  });

  test("renders a bar row using the stored fallback survey value", async ({ page }) => {
    const row = page.locator("#panel-bund .row").first();
    await expect(row.locator(".inst")).toHaveText("Forsa (gespeichert)");
    await expect(row.locator(".val")).toHaveText("4,2 %");
  });

  test("does not mark the panel as erred, since fallback rows exist", async ({ page }) => {
    await expect(page.locator("#panel-bund")).not.toHaveClass(/err/);
  });
});
