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
const TREND_STAND = { nrwVeraltet: tag(-47), bundFrisch: tag(-2) };

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
  e["bund"].wahltrend.stand = TREND_STAND.bundFrisch;         // frisch -> taugt als Leitzahl
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
/** Seite mit Fixture laden; dawum entweder live oder tot (Fallback auf data.json). */
async function seite(page, { live = false } = {}) {
  await mockDataJson(page);
  await page.route("**://api.dawum.de/**", (route) =>
    live ? route.fulfill({ contentType: "application/json", body: dawumLive }) : route.abort("failed")
  );
  await page.goto("/index.html");
  await page.waitForSelector("#bund-hero .leitzahl .num");
}

test.describe("Kopf und App-Icon", () => {
  test.beforeEach(({ page }) => seite(page));

  test("verweist auf alle Icon-Dateien und das Manifest", async ({ page }) => {
    // Ohne diese Zeilen zeigt "Zum Home-Bildschirm" kein eigenes Icon.
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "manifest.webmanifest");
    // sizes ist wichtig: ohne Angabe wählt iOS unter mehreren Kandidaten unzuverlässig.
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "icons/apple-touch-icon.png");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("sizes", "180x180");
    await expect(page.locator('link[rel="apple-touch-icon-precomposed"]')).toHaveCount(1);
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "icons/favicon.svg");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#171A21");
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "FDP-Monitor");
  });

  test("die verlinkten Icon-Dateien sind auch wirklich abrufbar", async ({ page, request }) => {
    for (const pfad of ["icons/favicon.ico", "icons/favicon.svg", "icons/icon.svg",
                        "icons/apple-touch-icon.png",
                        "icons/icon-192.png", "icons/icon-512.png", "manifest.webmanifest"]) {
      const res = await request.get("/" + pfad);
      expect(res.status(), pfad).toBe(200);
    }
  });


  test("zeigt das Stand-Datum aus data.json im Kopf", async ({ page }) => {
    await expect(page.locator("#stand")).toContainText("Stand");
    await expect(page.locator("header.top .marke img")).toHaveAttribute("src", "icons/icon.svg");
  });
});

test.describe("Bund-Hero", () => {
  test("nimmt den frischen Wahltrend als Leitzahl, mit Δ und Hürdenabstand", async ({ page }) => {
    await seite(page);
    await expect(page.locator("#bund-hero .leitzahl .num")).toContainText("4,4");
    await expect(page.locator("#bund-hero .delta .wert")).toContainText("▲ 0,2");
    // 4,4 % -> 0,6 Punkte unter 5 %; der Abstand wird gerechnet, nicht hinterlegt.
    await expect(page.locator("#bund-hero .chip")).toHaveText(/0,6 Punkte unter der 5-%-Hürde/);
    await expect(page.locator("#bund-hero .chip")).toHaveClass(/unter/);
  });

  test("zählt die Institute über der Hürde und den Ø", async ({ page }) => {
    await seite(page);
    const kz = page.locator("#bund-hero .kennzahlen dd");
    await expect(kz.first()).toHaveText("4,2 %");   // nur die frische Zeile zählt
    await expect(kz.last()).toHaveText("0 von 1");  // 4,2 % liegt unter 5 %
  });

  test("setzt die Hürdenlinie bei 62,5 % – das ist 5 % auf der Skala 0–8 %", async ({ page }) => {
    await seite(page);
    const feld = await page.locator("#bund-hero .skala .feld").boundingBox();
    const mark = await page.locator("#bund-hero .skala .bar .mark").boundingBox();
    expect((mark.x - feld.x) / feld.width).toBeCloseTo(0.625, 2);
  });

  test("zeichnet den Balken auf derselben Skala 0–8 %", async ({ page }) => {
    await seite(page);
    const bar = await page.locator("#bund-hero .skala .bar").boundingBox();
    const fill = await page.locator("#bund-hero .skala .bar .fill").boundingBox();
    expect(fill.width / bar.width).toBeCloseTo(4.4 / 8, 2);
  });

  test("setzt je einen Punkt pro Einzelumfrage", async ({ page }) => {
    await seite(page);
    await expect(page.locator("#bund-hero .skala .punkt")).toHaveCount(1);
  });

  test("nutzt live abgerufene Umfragen, wenn dawum erreichbar ist", async ({ page }) => {
    await seite(page, { live: true });
    await expect(page.locator("#bund-hero .inst-zeile .nam").first()).toHaveText("Forsa (live)");
    await expect(page.locator("#bund-hero .liste")).toContainText("Live von");
    // Der Wahltrend kommt weiterhin nur aus data.json.
    await expect(page.locator("#bund-hero .leitzahl .num")).toContainText("4,4");
  });

  test("fällt ohne dawum auf die gespeicherten Umfragen zurück", async ({ page }) => {
    await seite(page);
    await expect(page.locator("#bund-hero .inst-zeile .nam").first()).toHaveText("Forsa (gespeichert)");
    await expect(page.locator("#bund-hero .liste")).toContainText("letzten Aktualisierung");
  });

  test("blendet Umfragen ausserhalb des Altersfensters aus", async ({ page }) => {
    await seite(page);
    // Bund hat eine 250 Tage alte Zeile (>60 Tage) neben einer 17 Tage alten.
    await expect(page.locator("#bund-hero .inst-zeile")).toHaveCount(1);
  });
});

test.describe("Anstehende Wahlen", () => {
  test.beforeEach(({ page }) => seite(page));

  test("stehen als Kacheln nach Termin sortiert, Bund gehört nicht dazu", async ({ page }) => {
    const ids = await page.locator(".kachel").evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(["kachel-berlin", "kachel-nrw"]);
  });

  test("nennen Land, Wahltyp mit Datum und die Tage bis zur Wahl", async ({ page }) => {
    const nrw = page.locator("#kachel-nrw");
    await expect(nrw.locator("h3")).toHaveText("Nordrhein-Westfalen");
    await expect(nrw.locator(".wann")).toContainText("Landtagswahl");
    await expect(nrw.locator(".wann")).toContainText(deutsch(TERMIN.nrw));
    await expect(nrw.locator(".tage")).toHaveText("in 230 T.");
  });

  test("ein veralteter Wahltrend wird nicht zur Leitzahl", async ({ page }) => {
    // NRW: gespeicherter Trend 6,2 % (47 Tage alt), Einzelumfrage 5,3 %.
    const num = page.locator("#kachel-nrw .wert .num");
    await expect(num).toHaveText("5,3 %");
    await expect(num).not.toContainText("6,2");
    await expect(page.locator("#kachel-nrw .hinweis"))
      .toHaveText(`Wahltrend vom ${deutsch(TREND_STAND.nrwVeraltet)} – Aktualisierung prüfen`);
  });

  test("ohne Umfragen und ohne Trend bleibt eine kompakte Kachel", async ({ page }) => {
    const be = page.locator("#kachel-berlin");
    await expect(be).toHaveClass(/leer/);
    await expect(be.locator(".wert .num")).toHaveText("–");
    await expect(be.locator(".pill")).toHaveText("keine Daten");
    await expect(be.locator(".bar")).toHaveCount(0);
    await expect(be.locator(".hinweis")).toHaveText("Kein Wahltrend hinterlegt");
  });

  test("der Status-Chip benennt die Lage zur Hürde", async ({ page }) => {
    await expect(page.locator("#kachel-nrw .pill")).toHaveText("über der Hürde");
    await expect(page.locator("#kachel-nrw .pill")).toHaveClass(/ueber/);
  });

  test("Balken über der Hürde sind blau, darunter dunkel", async ({ page }) => {
    const fill = page.locator("#kachel-nrw .bar .fill");
    await expect(fill).toHaveCSS("background-color", "rgb(30, 79, 216)");  // 5,3 % >= 5 %
  });
});

test.describe("Hinweis zur Datenlage", () => {
  // Wird die FDP in einem Land nicht separat ausgewiesen (Saarland: sie läuft unter
  // „Sonstige"), soll die Kachel das sagen. "keine Daten" allein sähe nach einer Lücke
  // oder einem Fehler aus.
  const TEXT = "Die Institute weisen die FDP hier nicht separat aus.";
  async function mitHinweis(page, { breite } = {}) {
    const d = JSON.parse(dataFixture);
    d.ebenen.find((e) => e.id === "berlin").datenhinweis = TEXT;
    await page.route("**/data.json*", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(d) }));
    await page.route("**://api.dawum.de/**", (route) => route.abort("failed"));
    if (breite) await page.setViewportSize({ width: breite, height: 900 });
    await page.goto("/index.html");
    await page.waitForSelector("#kachel-berlin");
  }

  test("zeigt den Hinweis statt einer nichtssagenden Leermeldung", async ({ page }) => {
    await mitHinweis(page);
    const k = page.locator("#kachel-berlin");
    await expect(k.locator(".notiz")).toHaveText(TEXT);
    await expect(k.locator(".pill")).toHaveText("nicht ausgewiesen");
    await expect(k).not.toContainText("Noch keine Umfragen");
  });

  test("lässt den Wahltrend-Hinweis weg, der hier nur Rauschen wäre", async ({ page }) => {
    // Ohne ausgewiesene Werte kann dawum gar keinen Trend bilden – "Kein Wahltrend
    // hinterlegt" würde fälschlich nach einem Versäumnis klingen.
    await mitHinweis(page);
    await expect(page.locator("#kachel-berlin .hinweis")).toHaveCount(0);
  });

  test("bleibt auch am Handy sichtbar", async ({ page }) => {
    // Die Basis-Zeile wird mobil ausgeblendet; der Hinweis darf das nicht mitmachen.
    await mitHinweis(page, { breite: 390 });
    await expect(page.locator("#kachel-berlin .notiz")).toBeVisible();
  });

  test("eine Ebene mit Werten bekommt keinen Hinweis", async ({ page }) => {
    await mitHinweis(page);
    await expect(page.locator("#kachel-nrw .notiz")).toHaveCount(0);
    await expect(page.locator("#kachel-nrw .pill")).not.toHaveText("nicht ausgewiesen");
  });

  test("ohne hinterlegten Hinweis bleibt es bei der bisherigen Darstellung", async ({ page }) => {
    await seite(page);   // Fixture ohne datenhinweis
    await expect(page.locator("#kachel-berlin .notiz")).toHaveCount(0);
    await expect(page.locator("#kachel-berlin .pill")).toHaveText("keine Daten");
    await expect(page.locator("#kachel-berlin .hinweis")).toHaveText("Kein Wahltrend hinterlegt");
  });

  test("data.json erklärt das Saarland, wo die FDP unter „Sonstige\" läuft", async ({ request }) => {
    const d = await (await request.get("/data.json")).json();
    const sl = d.ebenen.find((e) => e.id === "saarland");
    expect(sl.datenhinweis).toContain("Sonstige");
  });
});

test.describe("Gelaufene Wahlen", () => {
  test.beforeEach(({ page }) => seite(page));

  test("stehen in der Tabelle, nicht bei den anstehenden", async ({ page }) => {
    await expect(page.locator("#kachel-sachsen-anhalt")).toHaveCount(0);
    await expect(page.locator("#zeile-sachsen-anhalt")).toHaveCount(1);
  });

  test("zeigen das amtliche Ergebnis, nicht einen Umfragemittelwert", async ({ page }) => {
    // Fixture: Ergebnis 3,8 %, Vorwahlumfrage 4,0 %, Nachwahlumfrage 3,0 %.
    const zellen = page.locator("#zeile-sachsen-anhalt td");
    await expect(zellen.nth(0)).toHaveText("Sachsen-Anhalt");
    await expect(zellen.nth(1)).toHaveText(deutsch(TERMIN.sachsenAnhalt));
    await expect(zellen.nth(2)).toHaveText("3,8 %");
  });

  test("der Balken folgt dem Ergebnis auf derselben Skala", async ({ page }) => {
    const bar = await page.locator("#zeile-sachsen-anhalt .bar").boundingBox();
    const fill = await page.locator("#zeile-sachsen-anhalt .bar .fill").boundingBox();
    expect(fill.width / bar.width).toBeCloseTo(3.8 / 8, 2);
  });

  test("eine abgeschlossene Wahl holt keine Umfragen mehr", async ({ page }) => {
    // Das amtliche Ergebnis ersetzt sie: weder die gespeicherten noch die Nachwahl-
    // umfrage aus dem Fixture dürfen noch ausgewertet werden.
    await expect(page.locator("#zeile-sachsen-anhalt td.abstand")).toHaveAttribute("title", "");
  });

  test("fragt dawum gar nicht erst ab, wenn jede Wahl gelaufen ist", async ({ page }) => {
    let abgefragt = false;
    const nurGelaufene = JSON.parse(dataFixture);
    nurGelaufene.ebenen = nurGelaufene.ebenen.filter((e) => e.id === "sachsen-anhalt");
    await page.route("**/data.json*", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(nurGelaufene) }));
    await page.route("**://api.dawum.de/**", (route) => { abgefragt = true; route.abort("failed"); });
    await page.goto("/index.html");
    await expect(page.locator("#zeile-sachsen-anhalt")).toHaveCount(1);
    expect(abgefragt).toBe(false);
  });

  test("ein vorläufiges Ergebnis wird mit Sternchen gekennzeichnet", async ({ page }) => {
    const vorlaeufig = JSON.parse(dataFixture);
    vorlaeufig.ebenen.find((e) => e.id === "sachsen-anhalt").wahlergebnis.vorlaeufig = true;
    await page.route("**/data.json*", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(vorlaeufig) })
    );
    await page.goto("/index.html");
    await expect(page.locator("#zeile-sachsen-anhalt td.erg")).toHaveText("3,8 % *");
    await expect(page.locator("#gelaufen-tabelle")).toContainText("vorläufiges amtliches Ergebnis");
    // Solange nur vorläufig, läuft die Abfrage weiter – und dann zählt für den Ø nur
    // die Umfrage nach dem Wahltag (3,0 %), nicht die 4,0 % von davor.
    await expect(page.locator("#zeile-sachsen-anhalt td.abstand"))
      .toHaveAttribute("title", "Ø der Umfragen nach der Wahl: 3,0 %");
  });
});

test.describe("Mobil", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("klappt die Institutsliste hinter einen Button", async ({ page }) => {
    await seite(page);
    const details = page.locator("#insts");
    await expect(details).toHaveJSProperty("open", false);
    await expect(details.locator("summary")).toBeVisible();
    await details.locator("summary").click();
    await expect(details).toHaveJSProperty("open", true);
  });

  test("die Seite scrollt nicht quer", async ({ page }) => {
    await seite(page);
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(ueberlauf).toBeLessThanOrEqual(1);
  });
});

test("auf dem Desktop ist die Institutsliste offen", async ({ page }) => {
  await seite(page);
  await expect(page.locator("#insts")).toHaveJSProperty("open", true);
});

test.describe("Leere Seite verhindern", () => {
  // index.html und monitor-utils.js gehören zusammen. Liefert ein Cache die alte
  // Skriptdatei zur neuen Seite, fehlen Funktionen – ohne Absicherung bliebe die
  // Seite vollständig leer, ohne jeden Hinweis.
  const veraltet = (quelltext) =>
    quelltext.replace(/, gruppiereEbenen, tageBis, huerdeText, wahlAbgeschlossen };/, " };");

  test("lädt eine veraltete Skriptdatei selbsttätig neu und rendert trotzdem", async ({ page }) => {
    const fehler = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (r) => r.abort("failed"));
    let ersterAbruf = true;
    await page.route("**/monitor-utils.js*", async (route) => {
      if (!ersterAbruf) return route.continue();   // der Nachlade-Versuch bekommt die echte Datei
      ersterAbruf = false;
      const res = await route.fetch();
      return route.fulfill({ contentType: "text/javascript", body: veraltet(await res.text()) });
    });
    await page.goto("/index.html");
    await expect(page.locator("#bund-hero .leitzahl .num")).toContainText("4,4");
    await expect(page.locator(".kachel")).toHaveCount(2);
    expect(fehler).toEqual([]);
  });

  test("zeigt eine Erklärung statt einer weissen Seite, wenn das Nachladen nicht hilft", async ({ page }) => {
    await mockDataJson(page);
    await page.route("**://api.dawum.de/**", (r) => r.abort("failed"));
    await page.route("**/monitor-utils.js*", (r) =>
      r.fulfill({ contentType: "text/javascript", body: "window.MonitorUtils={};" }));
    await page.goto("/index.html");
    await expect(page.locator("#bund-hero .fehler")).toContainText("konnte nicht geladen werden");
    await expect(page.locator("#bund-hero .fehler")).toContainText("neu laden");
  });

  test("die Skriptdatei wird versioniert geladen", async ({ page }) => {
    // Ohne ?v= kann eine neue Seite mit einer alten Skriptdatei gepaart werden.
    await seite(page);
    const src = await page.locator('script[src*="monitor-utils.js"]').first().getAttribute("src");
    expect(src).toMatch(/monitor-utils\.js\?v=\d+/);
  });
});
