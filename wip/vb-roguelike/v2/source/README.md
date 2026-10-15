# Volleyball Roguelike v2: game code

Draft 1: one match on a drawn court. Plan: `../gameplan.md`, systems: `../systems.md`.
Numbers mirror the Google Sheet "VB Roguelike v2 Mechanics" (Dials, Scoring, Difficulty tabs).

- `src/tables.ts`: every number. Change it together with the sheet.
- `src/engine.ts`: rules (serve, pass, set calls, block, defense, swings, scoring, upgrades). No DOM.
- `src/match.ts` + `scripts/sim.ts`: bot matches for the health check. `npm run sim -- 300`.
- `src/views.ts`: SVG court and net view. `src/ui.ts` + `src/template.html`: the game screen.
- `scripts/playtest.cjs`: clicks through a full match in headless Chromium and saves screenshots.

Setup: `npm install`, then `npm run build` (writes `dist/index.html` and `dist/standalone.html`).
