import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

const TAG = 86_400_000;
const tag = (offset) => new Date(Date.now() + offset * TAG).toISOString().slice(0, 10);
const deutsch = (isoTag) => isoTag.split("-").reverse().join(".");

// Wahltermine und Umfrage-Daten werden relativ zu heute gesetzt. Fest eingetragene
// Daten würden sonst mit der Zeit ihre Bedeutung ändern: eine "anstehende" Wahl wird
// irgendwann zur gelaufenen, und eine "frische" Umfrage fällt aus dem Altersfenster.
const TERMIN = { sachsenAnhalt: tag(-1), berlin: tag(13), nrw: tag(230) };
// NRW steht im Fixture fuer den Echtfall: dawum weist keinen Wahltrend mehr aus,
// der gespeicherte Wert (6,2 %) ist eingefroren und darf nicht mehr Leitzahl sein.
const TREND_STAND = { nrwVeraltet: tag(-47) };

function buildDataFixture() {
  const d = JSON.parse(fs.readFileSync(path.join(fixturesDir, "data.json"), "utf-8"));
  const e = Object.fromEntries(d.ebenen.map((x) => [x.id, x]));

  e["sachsen-anhalt"].wahltermin = TERMIN.sachsenAnhalt;      // gestern -> gelaufen
  e["sachsen-anhalt"].wahlergebnis.datum = TERMIN.sachsenAnhalt;
  e["sachsen-anhalt"].umfragen.rows[0].datum = tag(-120);     // vor der Wahl, in den 180 Tagen
  e["sachsen-anhalt"].umfragen.rows[1].datum = tag(-600);     // ausserhalb der 180 Tage
  // Eine Umfrage nach dem Wahltag: nur sie darf in den Mittelwert eingehen (3,0 %),
  // die 4,0 % von vor der Wahl gehören zur entschiedenen Wahl.
  e["sachsen-anhalt"].umfragen.rows.push({ institut: "Nachwahl (gespeichert)", datum: tag(0), fdp: 3.0 });
  e["berlin"].wahltermin = TERMIN.berlin;                     // anstehend, bald
  e["nrw"].wahltermin = TERMIN.nrw;                           // anstehend, spaeter
  e["nrw"].umfragen.rows[0].datum = tag(-28);
  e["bund"].umfragen.rows[0].datum = tag(-17);                // innerhalb der 60 Tage
  e["bund"].umfragen.rows[1].datum = tag(-250);               // ausserhalb der 60 Tage
  e["bund"].wahltrend.stand = tag(-2);                        // frisch -> taugt als Leitzahl
  e["nrw"].wahltrend.stand = TREND_STAND.nrwVeraltet;         // zu alt -> Leitzahl faellt zurueck

  return JSON.stringify(d);
}
const dataFixture = buildDataFixture();

const DAWUM_STAND = tag(-1);

function buildDawumFixture() {
  const db = JSON.parse(fs.readFileSync(path.join(fixturesDir, "dawum-live.json"), "utf-8"));
  db.Database.Last_Update = DAWUM_STAND;
  db.Surveys["100"].Date = tag(-13);   // Bund, innerhalb der 60 Tage
  db.Surveys["101"].Date = tag(-250);  // Bund, ausserhalb der 60 Tage
  db.Surveys["200"].Date = tag(-13);   // NRW
  db.Surveys["300"].Date = tag(-13);   // Berlin
  return JSON.stringify(db);
}
const dawumLive = buildDawumFixture();

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

  test("Bund zuerst, dann anstehende Wahlen nach Termin, gelaufene ganz am Ende", async ({ page }) => {
    // Fixture-Reihenfolge ist nrw, bund, berlin, sachsen-anhalt (bewusst durcheinander).
    // Erwartet: bund, berlin (in 13 Tagen), nrw (in 230 Tagen), sachsen-anhalt (gestern gewählt).
    await expect(page.locator(".panel")).toHaveCount(4); // Panels rendern asynchron
    const ids = await page.locator(".panel").evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(["panel-bund", "panel-berlin", "panel-nrw", "panel-sachsen-anhalt"]);
  });

  test("shows the Wahltermin under each Land panel but not under Bund", async ({ page }) => {
    await expect(page.locator("#panel-bund .termin")).toHaveCount(0);
    await expect(page.locator("#panel-nrw .termin")).toContainText(deutsch(TERMIN.nrw));
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
    await expect(note).toContainText(deutsch(DAWUM_STAND));
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

test.describe("Altersfilter für Einzelumfragen", () => {
  test("fallback: a poll older than Bund's 60-day window is hidden, a Land's 180-day-old poll stays", async ({ page }) => {
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (route) => route.abort("failed"));
    await page.goto("/index.html");
    // bund hat eine 250 Tage alte Zeile (>60 Tage) neben einer 17 Tage alten —
    // nur die frische darf gerendert werden.
    await expect(page.locator("#panel-bund .row")).toHaveCount(1);
    await expect(page.locator("#panel-bund .row .inst")).toHaveText("Forsa (gespeichert)");
    // sachsen-anhalt fixture has an "Alt (gespeichert)" row from 2025-01-01 (>180 days old,
    // filtered) plus its Wahlergebnis bar (never filtered) and one fresh poll row.
    await expect(page.locator("#panel-sachsen-anhalt .row")).toHaveCount(3);
    await expect(page.locator("#panel-sachsen-anhalt .row .inst")).toHaveText(
      ["Amtliches Ergebnis", "Nachwahl (gespeichert)", "Forsa (gespeichert)"]);
  });

  test("live: a poll older than Bund's 60-day window is hidden even when dawum is reachable", async ({ page }) => {
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (route) =>
      route.fulfill({ contentType: "application/json", body: dawumLive })
    );
    await page.goto("/index.html");
    // dawum-live enthaelt eine zusaetzliche, 250 Tage alte "Alt (live)"-Bundesumfrage.
    await expect(page.locator("#panel-bund .row")).toHaveCount(1);
    await expect(page.locator("#panel-bund .row .inst")).toHaveText("Forsa (live)");
  });
});

test.describe("Veralteter Wahltrend taugt nicht als Leitzahl", () => {
  test.beforeEach(async ({ page }) => {
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (route) => route.abort("failed"));
    await page.goto("/index.html");
  });

  test("falls back to the poll average instead of showing the frozen trend", async ({ page }) => {
    // NRW: gespeicherter Trend 6,2 % (47 Tage alt), Einzelumfrage 5,3 %.
    // Die Leitzahl muss die Umfrage zeigen, nicht den eingefrorenen Trend.
    const num = page.locator("#panel-nrw .avg .num");
    await expect(num).toHaveText("5,3 %");
    await expect(num).not.toContainText("6,2");
  });

  test("names the stale trend in the label so the fallback is visible", async ({ page }) => {
    const lbl = page.locator("#panel-nrw .avg .lbl");
    await expect(lbl).toContainText("Ø der neuesten Umfragen je Institut");
    await expect(lbl).toContainText("dawum-Wahltrend veraltet");
    await expect(lbl).toContainText(deutsch(TREND_STAND.nrwVeraltet));
  });

  test("a fresh trend is still used as the headline figure", async ({ page }) => {
    await expect(page.locator("#panel-bund .avg .num")).toContainText("4,4 %");
    await expect(page.locator("#panel-bund .avg .lbl")).toContainText("dawum-Wahltrend");
    await expect(page.locator("#panel-bund .avg .lbl")).not.toContainText("veraltet");
  });

  test("an Ebene without any trend says so without claiming one went stale", async ({ page }) => {
    // "noch nicht hinterlegt" waere hier falsch: eine Ebene kann ihren Trend auch
    // verloren haben, weil update.py ihn als veraltet verworfen hat. Berlin hat im
    // Fixture weder Trend noch amtliches Ergebnis.
    const lbl = page.locator("#panel-berlin .avg .lbl");
    await expect(lbl).toContainText("kein aktueller dawum-Wahltrend");
    await expect(lbl).not.toContainText("veraltet");
  });
});

test.describe("Gelaufene Wahl: amtliches Ergebnis ist die Leitzahl", () => {
  test.beforeEach(async ({ page }) => {
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (route) => route.abort("failed"));
    await page.goto("/index.html");
  });

  test("shows the official result as the headline figure, not a poll average", async ({ page }) => {
    // Fixture: Ergebnis 3,8 %, Vorwahlumfrage 4,0 %, Nachwahlumfrage 3,0 %.
    // Der Mittelwert über alle wäre 3,5 % – die Leitzahl muss das Ergebnis sein.
    const num = page.locator("#panel-sachsen-anhalt .avg .num");
    await expect(num).toHaveText("3,8 %");
    await expect(page.locator("#panel-sachsen-anhalt .avg .lbl")).toContainText("Amtliches Wahlergebnis vom");
  });

  test("averages only the polls taken after the election day", async ({ page }) => {
    // 3,0 % ist die Nachwahlumfrage allein; 4,0 % (vor der Wahl) darf nicht eingehen.
    const simple = page.locator("#panel-sachsen-anhalt .simple");
    await expect(simple).toContainText("Ø der Umfragen nach der Wahl");
    await expect(simple).toContainText("3,0 %");
  });

  test("still lists the pre-election polls as bars", async ({ page }) => {
    // Aus dem Mittelwert heraus, aber als Verlauf weiter sichtbar.
    await expect(page.locator("#panel-sachsen-anhalt .row .inst")).toContainText(["Forsa (gespeichert)"]);
  });

  test("does not call a final result preliminary", async ({ page }) => {
    await expect(page.locator("#panel-sachsen-anhalt .avg .lbl")).not.toContainText("vorläufig");
  });

  test("an upcoming election is unaffected and still uses the trend", async ({ page }) => {
    await expect(page.locator("#panel-bund .avg .lbl")).toContainText("dawum-Wahltrend");
  });
});

test("a preliminary result is named as such in the headline label", async ({ page }) => {
  // Zwischen Wahltag und Feststellung durch den Landeswahlausschuss trägt das Ergebnis
  // "vorlaeufig": true – die Leitzahl darf das nicht verschweigen.
  const vorlaeufig = JSON.parse(dataFixture);
  const st = vorlaeufig.ebenen.find((e) => e.id === "sachsen-anhalt");
  st.wahlergebnis.vorlaeufig = true;
  await page.route("**/data.json*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(vorlaeufig) })
  );
  await page.route("**://api.dawum.de/**", (route) => route.abort("failed"));
  await page.goto("/index.html");
  await expect(page.locator("#panel-sachsen-anhalt .avg .lbl")).toContainText("(vorläufig)");
});
