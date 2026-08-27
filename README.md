# fdp-monitor
Overview of FDP polling results (Bundestag + Landtagswahlen), sorted by election date.

## Tests

```
pip install -r requirements-dev.txt && pytest              # update.py
npm install && npm test                                    # monitor-utils.js (Vitest)
npm install && npx playwright install chromium && npm run test:e2e   # index.html (Playwright)
```
