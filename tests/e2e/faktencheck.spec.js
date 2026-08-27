import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const dataOn = fs.readFileSync(path.join(fixturesDir, "data-fc-on.json"), "utf-8");
const dataOff = fs.readFileSync(path.join(fixturesDir, "data-fc-off.json"), "utf-8");

async function mockDataJson(page, body) {
  await page.route("**/data.json*", (route) =>
    route.fulfill({ contentType: "application/json", body })
  );
}

async function mockDawumUnreachable(page) {
  // Force the live-poll fetch to fail so the page falls back to data.json,
  // keeping these tests independent of dawum.de's availability.
  await page.route("**://api.dawum.de/**", (route) => route.abort("failed"));
}

test.describe("Faktencheck aktiv (faktencheck_aktiv: true)", () => {
  test.beforeEach(async ({ page }) => {
    await mockDataJson(page, dataOn);
    await mockDawumUnreachable(page);
    await page.goto("/index.html");
  });

  test("renders the post as a collapsed <details> card with a status badge", async ({ page }) => {
    const card = page.locator(".card").first();
    await expect(card).toHaveJSProperty("tagName", "DETAILS");
    await expect(card).not.toHaveAttribute("open", "");
    await expect(card.locator(".badge")).toHaveText("irreführend");
  });

  test("clicking the card reveals the faktencheck text and sources", async ({ page }) => {
    const card = page.locator(".card").first();
    await card.locator("summary").click();
    await expect(card).toHaveAttribute("open", "");
    await expect(card.locator(".fc p").first()).toContainText("Aussage: X. Befund: Y.");
    await expect(card.locator(".fc ul li a")).toHaveText("Destatis");
  });

  test("keeps the Hinweise section and its nav link", async ({ page }) => {
    await expect(page.locator("#hinweise")).toBeAttached();
    await expect(page.locator('nav.jump a[href="#hinweise"]')).toBeAttached();
  });
});

test.describe("Faktencheck inaktiv (faktencheck_aktiv: false)", () => {
  test.beforeEach(async ({ page }) => {
    await mockDataJson(page, dataOff);
    await mockDawumUnreachable(page);
    await page.goto("/index.html");
  });

  test("renders the post as a plain link card, not a <details>", async ({ page }) => {
    const card = page.locator(".card").first();
    await expect(card).toHaveJSProperty("tagName", "DIV");
    const link = card.locator("a.cardlink");
    await expect(link).toHaveAttribute("href", "https://www.instagram.com/p/ABC123/");
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("removes the Hinweise section and its nav link", async ({ page }) => {
    await expect(page.locator("#hinweise")).toHaveCount(0);
    await expect(page.locator('nav.jump a[href="#hinweise"]')).toHaveCount(0);
  });

  test("does not render a faktencheck status badge", async ({ page }) => {
    await expect(page.locator(".badge")).toHaveCount(0);
  });
});
