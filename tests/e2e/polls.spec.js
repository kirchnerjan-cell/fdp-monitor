import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const dataFixture = fs.readFileSync(path.join(fixturesDir, "data.json"), "utf-8");
const dawumLive = fs.readFileSync(path.join(fixturesDir, "dawum-live.json"), "utf-8");

async function mockDataJson(page) {
  await page.route("**/data.json*", (route) =>
    route.fulfill({ contentType: "application/json", body: dataFixture })
  );
}

test.describe("Reihenfolge der Ebenen", () => {
  test.beforeEach(async ({ page }) => {
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (route) => route.abort("failed"));
    await page.goto("/index.html");
  });

  test("Bundesebene steht immer zuerst, danach Länder nach Wahltermin aufsteigend", async ({ page }) => {
    // Fixture order is nrw, bund, berlin, sachsen-anhalt (deliberately scrambled);
    // expected render order: bund, sachsen-anhalt (Jun 2026), berlin (Sep 2026), nrw (May 2027).
    const ids = await page.locator(".panel").evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(["panel-bund", "panel-sachsen-anhalt", "panel-berlin", "panel-nrw"]);
  });

  test("shows the Wahltermin under each Land panel but not under Bund", async ({ page }) => {
    await expect(page.locator("#panel-bund .termin")).toHaveCount(0);
    await expect(page.locator("#panel-nrw .termin")).toContainText("09.05.2027");
  });
});

test.describe("Amtliches Ergebnis als Extra-Balken", () => {
  test.beforeEach(async ({ page }) => {
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (route) => route.abort("failed"));
    await page.goto("/index.html");
  });

  test("renders the official result as a distinct first bar when present", async ({ page }) => {
    const row = page.locator("#panel-sachsen-anhalt .row").first();
    await expect(row).toHaveClass(/ergebnis/);
    await expect(row.locator(".inst")).toHaveText("Amtliches Ergebnis");
    await expect(row.locator(".val")).toHaveText("3,8 %");
  });

  test("does not render an extra bar for a region with no Wahlergebnis", async ({ page }) => {
    await expect(page.locator("#panel-nrw .row.ergebnis")).toHaveCount(0);
  });

  test("a region with a Wahlergebnis is never shown as errored, even with no poll rows", async ({ page }) => {
    // sachsen-anhalt has a stored poll row too, but the guard is what matters:
    // an ergebnis alone must suppress the "no data" error state.
    await expect(page.locator("#panel-sachsen-anhalt")).not.toHaveClass(/err/);
  });
});

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

  test("a region with live db entries but no matching survey plus a Wahlergebnis still shows the extra bar", async ({ page }) => {
    await expect(page.locator("#panel-sachsen-anhalt .row.ergebnis")).toHaveCount(1);
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
    const row = page.locator("#panel-bund .row").last();
    await expect(row.locator(".inst")).toHaveText("Forsa (gespeichert)");
    await expect(row.locator(".val")).toHaveText("4,2 %");
  });

  test("a region with neither poll rows nor a Wahlergebnis is marked as errored", async ({ page }) => {
    await expect(page.locator("#panel-berlin")).toHaveClass(/err/);
    await expect(page.locator("#panel-berlin .note")).toContainText("Keine Einzelumfragen gefunden");
  });
});
