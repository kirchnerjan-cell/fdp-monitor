import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

const TAG = 86_400_000;
const today = () => new Date(Date.now() + 0 * TAG).toISOString().slice(0, 10);

function buildFixture(overrides) {
  const d = JSON.parse(fs.readFileSync(path.join(fixturesDir, "kubicki-data.json"), "utf-8"));
  Object.assign(d, overrides);
  return JSON.stringify(d);
}

async function mockKubickiData(page, overrides) {
  const body = buildFixture(overrides);
  await page.route("**/kubicki-data.json*", (route) =>
    route.fulfill({ contentType: "application/json", body })
  );
}

test.describe("Cicero-Beiträge pro Woche", () => {
  test("shows the current week's Wochen-Zeile with its Beitrag counted", async ({ page }) => {
    await mockKubickiData(page, {
      beitraege: [{ titel: "Ein Kommentar", datum: today(), url: "https://www.cicero.de/x" }],
    });
    await page.goto("/kubicki.html");
    await expect(page.locator("#beitraege-weeks .wrow")).toHaveCount(12);
    const current = page.locator("#beitraege-weeks .wrow").last();
    await expect(current).not.toHaveClass(/empty/);
    await expect(current.locator(".brk")).toHaveText("1 Beitrag");
  });

  test("pluralizes the count for more than one Beitrag in the same week", async ({ page }) => {
    await mockKubickiData(page, {
      beitraege: [
        { titel: "a", datum: today() },
        { titel: "b", datum: today() },
      ],
    });
    await page.goto("/kubicki.html");
    await expect(page.locator("#beitraege-weeks .wrow").last().locator(".brk")).toHaveText("2 Beiträge");
  });

  test("a week with no Beitrag renders as empty with no .brk line", async ({ page }) => {
    await mockKubickiData(page, { beitraege: [] });
    await page.goto("/kubicki.html");
    const current = page.locator("#beitraege-weeks .wrow").last();
    await expect(current).toHaveClass(/empty/);
    await expect(current.locator(".brk")).toHaveCount(0);
    // regression: min-width on .seg must not render a visible sliver for a zero count
    await expect(current.locator(".seg")).toHaveCount(0);
  });
});

test.describe("Interviews pro Woche", () => {
  test("breaks the current week down by sender, confirmed interviews only", async ({ page }) => {
    await mockKubickiData(page, {
      interviews: [
        { sender: "WELT TV", titel: "Interview A", datum: today(), status: "bestaetigt" },
        { sender: "ZDF", titel: "Interview B", datum: today(), status: "bestaetigt" },
        { sender: "ARD", titel: "Nicht geprüft", datum: today(), status: "vorschlag" },
      ],
    });
    await page.goto("/kubicki.html");
    const current = page.locator("#interviews-weeks .wrow").last();
    await expect(current.locator(".brk")).toContainText("WELT TV: 1");
    await expect(current.locator(".brk")).toContainText("ZDF: 1");
    await expect(current.locator(".brk")).not.toContainText("ARD");
  });

  test("shows a legend entry for every configured sender", async ({ page }) => {
    await mockKubickiData(page, { interviews: [] });
    await page.goto("/kubicki.html");
    await expect(page.locator("#legend .item")).toHaveCount(5);
    await expect(page.locator("#legend")).toContainText("WELT TV");
    await expect(page.locator("#legend")).toContainText("Deutschlandfunk");
  });
});

test.describe("Unbestätigte Vorschläge", () => {
  test("lists a vorschlag interview with a link to its source", async ({ page }) => {
    await mockKubickiData(page, {
      interviews: [{ sender: "WELT TV", titel: "Fundstück", datum: today(), url: "https://welt.de/x", status: "vorschlag" }],
    });
    await page.goto("/kubicki.html");
    await expect(page.locator("#vorschlaege-liste li")).toHaveCount(1);
    await expect(page.locator("#vorschlaege-liste a")).toHaveAttribute("href", "https://welt.de/x");
    await expect(page.locator("#vorschlaege-leer")).toBeHidden();
  });

  test("shows the empty-state note when there are no open vorschlaege", async ({ page }) => {
    await mockKubickiData(page, { interviews: [] });
    await page.goto("/kubicki.html");
    await expect(page.locator("#vorschlaege-liste li")).toHaveCount(0);
    await expect(page.locator("#vorschlaege-leer")).toBeVisible();
  });
});
