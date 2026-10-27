# fdp-monitor
Overview of FDP polling results (Bundestag + Landtagswahlen), sorted by election date (`index.html`),
plus a second page with statistics on the party at federal level since 1998 (`partei.html`, data in `partei.json`),
and a third page tracking Wolfgang Kubicki's Cicero columns and interview appearances
(`kubicki.html`, data in `kubicki-data.json`, see `ANLEITUNG-KUBICKI.md`).

## Tests

```
pip install -r requirements-dev.txt && pytest              # update.py, kubicki_stats.py
npm install && npm test                                    # monitor-utils.js, partei-utils.js, kubicki-utils.js (Vitest)
npm install && npx playwright install chromium && npm run test:e2e   # index.html, partei.html, kubicki.html (Playwright)
```
