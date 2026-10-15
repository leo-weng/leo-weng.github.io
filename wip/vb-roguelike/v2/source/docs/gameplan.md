# V2 game plan: Floor Breaker

Drafted 2026-10-15. This is a plan to react to. Nothing is built yet.

## The one-line pitch

A volleyball roguelike where every rally is a quick read-and-react, every clean touch builds a combo, and every kill visibly smashes their floor. You climb a ladder of teams with personalities and build your squad as you go.

## What carries over from v1, and what changes

| Keep (it worked) | Change |
|---|---|
| Tiles: 3×3 floors that crack and break | Numbers hidden by default. Odds show as tile color and short words like "wide open" or "blocked" |
| Chain / combo that multiplies damage | The screen is a drawn court with players, the ball and the block moving, not a text panel |
| Pick 1 of 3 upgrades after points | 2 to 3 taps per rally, a few seconds each, no sidebar or sandbox |
| 5-1 rotations and player traits | Rotations show as who's in the front row, without the tables |
| Simple owned math (base × a few multipliers) | The math moves to a hidden Lab screen for you; players never need it |
| Serve and receive | Serve becomes one quick pick: who to serve at |

## The screen

Phone-first portrait, top-down court. Their floor is on top and yours on the bottom, with the net across the middle.
- **Tiles** are the court itself. A tile shows cracks as it takes damage, and a broken tile turns into a dark hole.
- **Players** are colored circles with a role letter (S, OH, MB, OPP, L). Their blockers and diggers slide into place before you choose, so you read the defense with your eyes.
- **The ball** flies in an arc with a shadow. Kills slam into a tile with a shake and a crack sound.
- **Chain meter** sits by the score as ×1, ×2, ×3 pips that light up with each clean touch.
- **Their intent** shows as a one-line banner, like "Their OPP loves the line" or "They're cheating toward your OH".

## Round 2 (Leo, Oct 15)

The Core idea is dropped. Win paths, scoring, puppet-master defense and the full list of systems now live in [systems.md](systems.md).

## One rally, start to finish

1. **Serve or receive.** On your serve, tap the passer to serve at (weak passers glow). On theirs, the pass happens automatically and shows its grade with an animation.
2. **Set (tap 1).** Your front-row hitters appear as 2 or 3 buttons on the court. Their middle blocker visibly leans toward one of them. A fast set beats the block but gives a smaller target.
3. **Attack (tap 2).** Tap a tile on their floor and pick Hard, Tip or Roll. Tiles tint green, yellow or red based on block shadow and diggers. Red tiles can still score and give a bigger chain bonus.
4. **Defense (tap 3, when they attack).** You see their hitter and their intent banner. Tap a tile on your floor to send your libero there. Guessing right protects the tile and starts your chain.
5. **Payoff.** A kill cracks the tile it lands in. A chain of 3 or more doubles the damage. Then the next serve starts.

## A match

- Win by breaking 5 of their 9 tiles, or by reaching 15 points.
- After each point you pick 1 of 3 upgrades: hit harder, dig better, a stronger chain, patch a tile, or a read on their next play.
- Each opponent has one signature twist that changes the puzzle. For example, The Wall has armored front tiles, the Diggers have tough back tiles, and the Speedsters attack faster so you get less time to read.

## A run

- A short map of 5 matches: 3 regular teams, 1 elite and a boss, with a branch choice after each win.
- Between matches you visit a shop or rest stop: buy a relic, recruit a player or repair your floor.
- **Relics** are run-long rules that combo, such as "A perfect pass starts the chain at ×2", "Tips crack tiles behind the block" or "Your OH's kills spread damage to the next tile."
- The run ends when you lose a match. Beating the boss wins the run.

## Build order

Each step ends with something you can play from a link.

| Step | What you get | Done when |
|---|---|---|
| 1. Court and one rally | The drawn court, players, ball flight, set and attack taps, tile cracks. Endless rallies against a simple AI | Watching and playing one rally feels good with no numbers on screen |
| 2. One match | Both floors, your defense tap, chain meter, serve, upgrades after points, a win/lose screen | A match takes about 5 minutes and you want to play again |
| 3. The run | Map, 4 or 5 opponents with signatures, a boss, relics and a shop | Two different builds can both win a run |
| 4. Feel and balance | Sound, screen shake, a 30-second tutorial, Lab screen for your numbers, bot sims to tune difficulty | A friend who doesn't play volleyball finishes a run without help |

## Tech and where it lives

- Same stack as v1: TypeScript built into one HTML file, drawn with SVG and simple animations. No game engine, so it stays light and runs on phones.
- v2 is a fresh codebase. It reuses v1's odds model (`src/model.ts`) and rotation data where they fit, and v1 stays frozen at version 25.
- Working copy: `/mnt/project-files/vb-roguelike/v2/`. Each playable build goes to a private link, as in v1.
- GitHub (Leo, Oct 15): same site repo. v1 moves to `wip/vb-roguelike/v1/`, v2 lives in `wip/vb-roguelike/v2/`, and `wip/vb-roguelike/` becomes a small page linking both so the old link still works.

## Defaults I picked (tell me to change any)

1. Top-down portrait court rather than a side view, because it shows the tiles and fits a phone.
2. Your libero placement is the one defense decision. The rest of your defense follows automatically.
3. No timing or execution meters. The skill is in the read, which matches what you said was fun.
4. Step 1 skips serve; it arrives in step 2.
