# Volleyball Roguelike: design restart (v0)

Sources: Leo's pitch in the project thread (2026-10-08) and the old Google Sheet "Volleyball Roguelike" (last edited 2025-11-14; tabs: Decision Making, Player Stats, Court Grid).

## 1. The core loop, as I understand it

A run is a ladder of opponents (Slay the Spire map). Each match is played rally by rally, and **every decision happens while the ball is in the air**. Time is frozen, you see the odds, you choose, the ball resolves, and the next contact becomes the next decision.

| Ball in the air after... | You decide | What it feeds |
|---|---|---|
| Their serve | Read the serve, who takes it, where to pass | Pass quality (a 0–3 pass rating is the natural unit) |
| Your pass | Setter: can they reach it? Who to set, what tempo (High / Medium / Fast) | Hitter options available, how much time the block gets |
| Your set | Hitter: shot (Go, 4, Rip, Shoot, Slide...), type (Hard / Roll / Tip), aim | Kill / dug / blocked / error |
| Their dig / their set | Your block scheme (Centered, Follow, Shade, Bunch; Read vs Commit) and back-row defense | Their attack odds, your transition chance |

Persistent pressure across a match: **fatigue** and **scouting**. Setting the same hitter repeatedly lowers their accuracy and lets the opponent "key in" (their block shades toward that hitter). This is the game's best idea: it's a resource you manage across a whole set, like Slay the Spire's HP and debuffs, and it stops "always set the best hitter" from being the solved strategy.

Progression: you get better (new shots, tighter accuracy cones), unlock players, and unlock combo plays (e.g. a slide + back-row pipe that pulls the middle blocker).

## 2. How it lines up with the old notes

**Already in the sheet**
- Attack phase options per position with a **default for every choice** (OH: Go, Hard Swing, to zone 5; OP: 5 ball, to 1; MB: 1 ball; Setter: Go, Medium tempo; Libero covers middle of court).
- Attack **type** is a "multiple choice, no error" decision while **angle** is a "cone of attack" with accuracy/error. That split is good and should stay: the choice is clean, the execution is where variance lives.
- Defend phase: Z1/Z5 (Rotation vs Perimeter), Z6 (Line seam / Cross seam / Deep hands), Middle blocker (Centered / Follow / Shade OH / Shade RS; Read / Dive / Straight over), Left blocker (Bunch / Base; Line / Cross / show-line-dive-cross...).
- Attack-result factors: Attack (setter synergy, accuracy, error, random, power) vs Block (positioning, speed, distance to close, strength) vs Defend (positioning, speed, reaction, ground cover).
- Player Stats: six base attributes (Speed, Strength, Height, Ball Control, Reaction, Intelligence) with weightings per archetype (Power vs Shotty hitter, Commit vs Read blocker, React vs Predict defender), and a note about FIFA's six headline stats.
- Court Grid: 90 × 45 cells, i.e. the full 18 m × 9 m court at 20 cm per cell.

**New in the pitch**
- Serve receive as a real decision (the sheet has Serve Receive and Setting stat rows, still empty).
- Setter reachability depending on pass quality.
- Fatigue + opponent keying in.
- Combo plays as an unlock.
- "You" getting better as the progression axis.

**Gaps in both**: serving (yours, and how theirs is generated), the Intelligence column (nothing uses it yet; it could drive how much of the opponent's intent you get to see), match length, and what an upgrade actually is in reward terms.

## 3. Realism vs fun: where it pulls apart

1. **Decision count.** The sheet has roughly 20 choices per rally across 9 roles. Even at four contacts per rally that's far too many clicks per point. *Fix:* everything has a default (the sheet already does this), and each contact surfaces **one headline decision** with "advanced" options behind it. Upgrades and unlocks can give you control over more of them, so complexity grows with the run instead of on turn one.
2. **Hidden math vs visible math.** Realism wants opaque randomness; Slay the Spire is fun because enemy intent and your numbers are visible. *Fix:* always show the odds for the choice in front of you ("Rip to 1: 54% kill, 12% error, 20% blocked"), and show the opponent's tendency as a scouting report, like StS intent icons. Intelligence/scouting upgrades can sharpen what you see.
3. **The 20 cm grid.** Good for the simulation under the hood, bad as an input. Players should aim at zones or drag a cone, not pick cells.
4. **Match length.** A real set is 25 points; at three or four decisions per rally that's 100+ decisions per set. Normal fights probably want sets to ~11 (or one short set) with bosses going longer.
5. **Who are "you"?** The pitch says *you* become a better player, but you also make decisions for the whole team and unlock teammates. Those are two different games: you as one player (teammates follow your calls), or you as a coach/captain building a roster. Picking one decides what upgrades look like.
6. **Variance that feels fair.** Volleyball has a lot of luck. Roguelikes stay fun when bad luck is explainable. Showing *why* a point was lost ("blocker closed in time: speed 7 vs set tempo Fast") makes the math feel like skill.

## 4. A possible "deck" framing (worth considering, not required)

The playbook could be the deck: plays, shots and block schemes are cards you draft after matches. Fatigue becomes "exhaust," keying-in becomes a stacking debuff on a hitter, and upgrading a card is "Rip 2.0, tighter cone." This gives a familiar StS reward loop without changing the ball-in-the-air turn structure. The alternative is pure stat/perk progression (closer to a sports-management sim).

## 5. Engine recommendation

The game is a turn-based probability simulation with a mostly 2D court view. That makes the engine choice less about rendering and more about how fast the rules can be built, tested and tuned.

- **Build the rules engine as a standalone, UI-free module first.** Rally resolution, stats, fatigue, scouting, all as pure functions over data. This is the part that needs thousands of simulated rallies to balance, and it's the part Claude can build and test most reliably.
- **Recommended front end: TypeScript in the browser** (simple canvas or a light framework). Reasons: Claude can build, run and play-test it end to end in the cloud (headless tests plus a real browser), every build is a link you can open on any device, and the same engine runs balance simulations from the command line.
- **Godot is still a fine choice** if a desktop/Steam release and working in the editor yourself matter more. The cost: scene files are awkward for Claude to edit by hand and harder to verify without the editor, so more of the visual work would land on you.

Either way, the data (players, shots, schemes, opponents) should live in JSON/CSV tables, which also means the existing spreadsheet can become the balance source of truth.

## 6. Decisions (2026-10-08)
- **Perspective: you are every player.** Control jumps to whoever is about to touch the ball, and you decide as that player.
- **Start simple: set, then hit.** Serve receive, blocking and defense can come later.
- **Upgrades are per-player growth**: strength, jump, new shots, bigger or tighter cone, accuracy, stamina, and **vision** (for example, a setter sees the block better).
- **Information depends on the moment.** At each decision you only see what that player could realistically see right then. Vision and timing decide how clear the block is: exact, a fuzzy zone, or unknown. Fast tempo gives the block less time to set up but gives the hitter less time to read it.

## 7. Open questions for Leo
- Browser first, or Godot/desktop first?
