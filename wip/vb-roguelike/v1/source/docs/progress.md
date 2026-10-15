# Volleyball Roguelike: Progress

Where we are, what's done, and what's next. The design details live in [spec.md](spec.md). This file only tracks progress.
Last updated: 2026-10-08

## Right now
- **Phase:** v0.1 (offense sandbox) is built and playable: https://claude.ai/artifact/FEHYAV3QkBSs7woFh7CCHP
- **Code:** `vb-roguelike/game/` (rules engine, balance sim, text UI). See its README.
- **Waiting on Leo:** play 20+ rallies and say what feels off. That's the v0.1 "done when" check.
- **Public WIP link (no sign-in):** https://www.leo-weng.com/wip/vb-roguelike/ (latest: site PR #3 merged 2026-10-08, v0.1.3).
- **Playtest link:** the link above is Leo's own (private to his claude.ai account; works on phone and desktop when signed in). Every update lands on the same link.
- **Simulator findings (200 games, free ball every rally, flat counterattack):**
  - Always-default play (outside + seam) wins 76% of games, about 10.6–7.7.
  - "Best odds" play wins 87% vs bunch by spamming Shoot + seam (about 80% of sets).
  - Random play wins about 18%.
  - The seam is the best shot almost every time.
  - Without fatigue and keyed-in, nothing stops spamming one hitter. That's the v0.2 priority, along with giving line and cross a situational edge.
- **v0.1.4 sim (200 games, bunch, free ball every rally):** spamming outside + seam now wins 15% vs Rookie, 12% vs Club and 2% vs Elite. Best-odds play, which spreads hitters, wins 74%, 62% and 21%. Random play wins 25%, 8% and 5%.
- **Presentation direction (Leo, 2026-10-08):** casual players found the numbers stale. The setter gets a net view, and hitters get the net view plus a court view. Vision plays out as a slow-motion set. Later this could become pseudo-real-time, where you have to choose quickly.
- **Next after playtest (v0.2):** alternate free balls between teams and play defense (libero call) instead of the flat counterattack.

## Roadmap

| Version | What it adds | Status |
|---|---|---|
| Design | Spec, decisions, versions | ✅ Done enough to build (refined as we play) |
| **v0.1 Offense sandbox** | Free ball, set call, block forms, shot with aim cone, odds preview, text log, reward callouts. Endless rallies, no score | 🎮 Playable; waiting on Leo's playtest |
| v0.2 One match | Game to 11, libero defense call, team systems, fatigue, keyed-in, momentum (both sides), one opponent | ⏳ |
| v0.3 The run | 8-match ladder (boss game to 21), rewards and upgrades, 4 opponent types | ⏳ |
| v0.4 Serve and receive | Serving, serve receive, rotations | ⏳ |
| v0.5+ Presentation | Court graphics, animation, sound, full reward feel | ⏳ |
| Later | Back-row attacks, hitter collisions | ⏳ |

## v0.1 build (done 2026-10-08)
- **Tech:** TypeScript, runs in the browser as plain text and buttons. The rules engine is a separate module with no UI, so it can be tested and balance-simulated on its own.
- **Where it lives:** code goes in `vb-roguelike/game/` in this project. Each playable build is published as a private link Leo can open on any device. It moves to a GitHub repo whenever Leo wants (Claude Code works from there).
- **Steps:**
  1. Data tables: players, set calls (12), shots (5 + unlocks off), cones, block timings.
  2. Engine: pass → setter position → set quality → block formation → cone resolution → dig.
  3. Balance sim: thousands of rallies per call/shot, compared to the tuning targets (spec §14).
  4. Text UI: setter screen, hitter screen with odds, result log, reward callouts.
  5. Publish the playable link; Leo plays 20+ rallies.
- **All five steps done.** Balance sim results with a perfect pass vs a bunch block, averaged over all 12 calls:
  - Seam: 36% kill, 9% error.
  - Line: 26% kill, 22% error.
  - Cross: 28% kill, 20% error.
  - Tip: 4% kill.
  - Roll: 2% kill.
  - Hard line / hard cross (unlocks): about 43–45% kill.
- **Trade-offs the sim shows:**
  - Fast pin sets (Shoot, Flat) beat a bunch block, with about 0.3 blockers and about 50% kill on the seam. Their worse set quality brings more errors.
  - High sets face about 2 blockers.
- **Sandbox extras:**
  - Pass mode and their block system (bunch or spread) can be switched.
  - Player stats can be raised or lowered to see how upgrades move the odds.
  - A testing switch unlocks the locked shots.
- **Done when:** Leo plays 20+ rallies and the right choice isn't always the same one.

## History
| Date | Milestone |
|---|---|
| 2025-08 to 2025-11 | Original notes in the "Volleyball Roguelike" Google Sheet (decision tree, stat weightings, court grid) |
| 2026-10-08 | Restarted. Pitch, old notes reviewed, engine chosen (browser, text-first) |
| 2026-10-08 | Spec v1: pillars, versions, decision points, odds math |
| 2026-10-08 | Round 2: libero, momentum, set spots, aim cones |
| 2026-10-08 | Round 3: 4 set calls per hitter, spot vs distance sets, team systems, game plan, reward feel |
| 2026-10-08 | Round 4: games to 11, boss game to 21, no setup changes mid-game. Build starts at v0.1 |
| 2026-10-08 | v0.1 offense sandbox playable |
| 2026-10-08 | Hosted on www.leo-weng.com/wip/vb-roguelike/ |
| 2026-10-08 | v0.1.1: scoreboard (game to 11), points only when a rally ends, dug balls continue the rally (placeholder counterattack), rally-by-rally log |
| 2026-10-08 | v0.1.2: all calls shown, wider bunch, Pull, game simulator (sidebar + `npm run match-sim`) |
| 2026-10-08 | v0.1.3: 2D net view (setter) and net + court views (hitter), slow-motion set with vision blur/fog, tap-to-aim on the court, odds as colored words (numbers toggle), ding/thud and shake |
| 2026-10-08 | v0.1.4 (friend playtest): keyed-in block and defense (spec §7 pulled forward), defense jitter + set read, pin blocks build from the line, seam to 6 covered, opponent levels Rookie/Club/Elite, odds only in Easy mode |
| 2026-10-08 | v0.1.5: setter screen is tap-to-pick then Set (mobile), middles get Hit left / Straight down / Hit right, defense start depends on set tempo (crashed on fast, wide on high) |
| 2026-10-08 | v0.1.6: ball flight animation after the swing (kill, stuff, touch, dig, net, out), block touches slow the ball, transition after digs (clean / rushed / scrambled). Accessibility brainstorm doc: https://claude.ai/code/artifact/f818afcf-1b28-42a2-b7b6-caa8305a39c2 |
| 2026-10-09 | v0.1.7: drag to aim anywhere (cone turns with the swing, swing named for you), hard swings resolved from geometry (hands at the net, over the top on a big jump, too steep = net), block shadows match the hands, easy mode has three plain calls, renamable calls, "They're onto you" banner, bigger blockers at higher levels. Sim (perfect info, Bunch): Rookie 88% / Club 78% / Elite 60% |
| 2026-10-09 | v0.1.8 (Leo feedback): hard-swing cones tightened (σ = spread × 0.5, ×0.8 in Easy), mishits halved, dig reach is a smaller oval leaning toward the net (forward 1.25R, back 0.6R, R base 2.0), middle blocker 1.35× faster and rarely out of position, bunch end blocker sets 0.6 m inside (line open) while spread takes line, line digger plays deeper. Elite: Block Jump 7, defender speed/reaction 8. Sim (perfect info, free ball every rally): best-odds 100/98/93% Rookie/Club/Elite, default seam spam 0%. |
| 2026-10-09 | v0.1.9 (Leo: "I want to execute"): hitting window per set (share of the line-to-sharp-cross angle: High 0.75, Medium 0.55, Fast 0.35 leaning cross, middles 0.6, +0.035 per (Jump+Power)/2 over 5); aim clamps to it and the rest is dimmed. Swing is a timing tap (meter sweep High 1.15 s / Medium 0.95 / Fast 0.75, ×1.5 in Easy): perfect contact cone ×0.7, miss widens it, way off can shank. Fast pin sets: cross digger drops deep. Site PR #5. |
| 2026-10-09 | v0.2 run loop (Leo agreed): run = Rookie Rockets → Cross Patrol or Middle Hunters → The Wall → The Fortress (boss, to 21). Teams have personalities (crossLean, fooled, stat mods) shown as a scouting line. Win → pick 1 of 3 rewards (call / stat / shot / perk: Clutch, Fresh legs, Short memory); lose → run over. Start calls 4, Go, 1, 3, 5, Pull. Timing only on a Big swing (+2 Power, 1 per game). Free play in the sidebar. Site PR #6. Source: src/run.ts |
