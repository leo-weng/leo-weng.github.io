# VB Roguelike v1 handoff (2026-10-15)

v1 is frozen at artifact version 25 (built file: ../../index.html). Build: `npm install && node scripts/build.mjs` (dist/index.html, dist/standalone.html). Smoke test: `PW=$(npm root -g)/playwright node scripts/smoke.cjs`.

- src/model.ts: the odds model. Kill = base × reach × block × defense × digger × set × matchup, all from small editable tables (in-game Numbers panel).
- src/ui.ts: screens, serve/receive, rotations, Tiles mode (crack their 3×3 floor, chain, per-point upgrades).
- src/engine.ts / data.ts: blocks, defense scenarios, dig grades (# + ! - / =), 5-1 rotations and player traits.

Carry into v2: Tiles mode, owned simple math, rotations, serve/receive. Leo's concern: v1 feels like a coach's spreadsheet; v2 must be fun without dumbing it down.
