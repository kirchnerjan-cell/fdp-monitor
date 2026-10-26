import { test, expect } from "@playwright/test";

// partei.json ist redaktionell gepflegt und ändert sich selten: die Seite wird mit der
// echten Datei getestet, nicht mit einem Fixture.
test.beforeEach(async ({ page }) => {
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
});

test("Parteiseite zeichnet Kennzahlen und alle Diagramme", async ({ page }) => {
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.goto("/partei.html");

  await expect(page.locator("#kennzahlen")).toContainText("14,6 %");
  await expect(page.locator("#kennzahlen")).toContainText("2 von 8");
  await expect(page.locator("#chart-wahlen rect")).toHaveCount(8);
  await expect(page.locator("#chart-themen rect")).toHaveCount(88);
  await expect(page.locator("#chart-shift rect")).toHaveCount(11);
  await expect(page.locator("#chart-zeit rect")).not.toHaveCount(0);
  expect(fehler).toEqual([]);
});

test("Tooltip der Themengewichtung zeigt die Position", async ({ page }) => {
  await page.goto("/partei.html");
  await page.locator("#chart-themen rect").first().hover();
  await expect(page.locator("#chart-themen .tip")).toContainText("Steuern & Entlastung · 1998");
});

test("Parteiseite passt auf Handybreite ohne seitliches Scrollen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/partei.html");
  await expect(page.locator("#chart-shift rect")).toHaveCount(11);
  const breite = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(breite).toBeLessThanOrEqual(390);
});

test("Navigation verbindet beide Seiten", async ({ page }) => {
  await page.route("**/api.dawum.de/**", (r) => r.abort());
  await page.goto("/index.html");
  await expect(page.locator('nav.seiten a[aria-current="page"]')).toHaveText("Umfragen");
  await page.locator("nav.seiten a", { hasText: "Partei" }).click();
  await expect(page).toHaveURL(/partei\.html$/);
  await expect(page.locator('nav.seiten a[aria-current="page"]')).toHaveText("Partei");
});
