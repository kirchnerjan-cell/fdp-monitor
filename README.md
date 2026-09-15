# fdp-monitor
Overview of FDP polling results (Bundestag + Landtagswahlen), sorted by election date
(`index.html`, see `ANLEITUNG.md`).

Also includes the Kubicki-Monitor: weekly count of Wolfgang Kubicki's Cicero columns
and interview appearances (`kubicki.html`, see `ANLEITUNG-KUBICKI.md`).

## Tests

```
pip install -r requirements-dev.txt && pytest              # update.py, kubicki_stats.py
npm install && npm test                                    # monitor-utils.js, kubicki-utils.js (Vitest)
npm install && npx playwright install chromium && npm run test:e2e   # index.html, kubicki.html (Playwright)
```
