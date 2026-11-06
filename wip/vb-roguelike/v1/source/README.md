# Volleyball Roguelike: game code

v0.1 offense sandbox. Design lives in `../spec.md`; progress in `../progress.md`.

- `src/data.ts`: every tuning number (set calls, shots, cones, block timings, defense).
- `src/engine.ts`: rules engine (pass, set quality, block formation, aim cone, dig). Pure functions, no UI.
- `src/ui.ts` + `src/template.html`: text UI.
- `scripts/sim.ts`: balance sim. `npm run sim -- Bunch Perfect --all` prints Kill/Blocked/Dug/Error per call × shot.
- `scripts/build.mjs`: bundles everything into one page at `dist/index.html`.

Setup: `npm install`, then `npm run build`.
