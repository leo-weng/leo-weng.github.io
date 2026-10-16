# V2 systems list

Every category the game needs, combining v1 and the v2 talks. Drafted 2026-10-15 for Leo to react to.

Tags: **v1** = existed in v1, **new** = new for v2, **later** = not in the first playable.
Numbers are placeholders.

---

## 1. Winning a match
- **One win condition, two ways to score (new, Leo Oct 15):** first to 15 points.
- **Scoring:**
  - A kill that cracks a tile without breaking it: 0 points. It only does damage.
  - A kill that breaks a tile: 3 points.
  - A kill into a hole that's already broken: 1 point.
  - A tool off the block, an ace, or their error: 1 point. No tile damage.
- **The choice:** focus damage to break tiles for 3 at a time (5 breaks is 15), or take quick 1-point plays. Cracks spread across many tiles score nothing until they break.
- **Tile toughness (v1 Tiles):** each tile starts with 2 hits. Harder opponents get tougher tiles.
- **No special tile.** The Core idea is dropped. Which tiles they protect comes from the situation, like protecting their last good tiles or the ones you keep hitting.

## 2. Perspectives: you are whoever touches the ball
| Moment | Who you are | Your choice |
|---|---|---|
| Our serve | Server | Serve type (Safe, Float, Jump) and who to serve at **(v1)** |
| Their serve / their attack | Passer or digger | Mostly automatic. The grade shows with an animation **(v1 grades # + ! - / =)** |
| Set | Setter | Which hitter and which set **(v1 set calls)** |
| Attack | Hitter | Tile and shot **(v1 aim + shot types)** |
| Their attack | Puppet master | Block and defense adjustments **(new, see 5)** |

## 3. Sets (v1 set calls, slimmed)
- Each tempo is a trade **(v1)**:
  - **High:** biggest hitting range, but the block is formed and the defense is set.
  - **Medium / combo:** fools a late middle and splits the block. Needs a good pass.
  - **Fast:** beats the block, but you get a small range (fast to the outside means deep cross only).
- Each hitter starts with 2 calls. Combos (like a 32 with a 1) and extra calls unlock during the run.
- The pass decides which sets are open **(v1 stakes brainstorm)**. A bad pass means high balls only.

## 4. Shots (v1)
| Shot | Damage to a tile | Character |
|---|---|---|
| Hard | 2 | Breaks tiles. Blockable, and a digger standing on it can dig it |
| Tip | 1 | Goes short over the block. Easy to dig if someone is close |
| Roll | 1 | Goes to an open spot. Rarely errors |
| Tool | 0 | Aims off the block's hands for a sure-ish point, with no tile damage |

So breaking tiles wants Hard swings, while picking points can use soft shots and tools.

## 5. Defense: you're the puppet master (new)
- **Set it up before the game** with a preset, and "run default" is always fine:
  - **Block system (v1):** Bunch, Spread or Read.
  - **Formation (v1 defense board):** Perimeter, Rotational, or 6-up.
- **Adjust each ball** with one or two quick taps, after you see their set:
  - **Block:** commit on their middle, stack the line, or front their best hitter.
  - **Shift the floor:** move the libero, or pull a defender to cover a cracked tile.
- **Reading them:** each hitter has visible habits, like "OPP loves the line". The AI adapts too **(v1 keyed-in)**, so you keep adjusting.

## 6. Combos and chain (v1 Tiles, expanded)
- Every touch gets a grade. Good touches in a row build the chain:
  - A perfect pass and a perfect set make the hitter more accurate (+20%).
  - Pass, set and kill all perfect: ×2 tile damage.
  - A dig and a perfect transition set give a bonus to the counterattack.
- A sloppy touch breaks the chain. The chain meter sits by the score.

## 7. Team composition (v1 stats, archetypes, rotations)
- **Stats:**
  - Jump: hit over the block.
  - Power: break tiles, beat diggers.
  - Control: range and accuracy, so you can reach every tile.
  - Vision: see the block and the defense clearly.
  - Speed and Reaction: block and defense.
  - Stamina: hit more before fatigue.
- **Archetypes show the two win paths:**
  - A **Control hitter** reaches every tile accurately, which suits breaking all the tiles.
  - A **Power hitter** runs the fast offense, hits the seam and breaks the block, which suits racing to points.
- **Rotations (v1):** 5-1, with Leo's lineup and traits. Who's in the front row changes your options and theirs.

## 8. Momentum and fatigue (v1 stakes brainstorm; later)
- **Momentum:** earn it from risky kills and spreading the ball around, then spend it on a big swing, a read or saving a bad pass.
- **Fatigue:** your best hitter tires if you feed them every ball.
- Both are parked until a match feels good without them.

## 9. Opponents (v1 run loop)
- Each opponent has a personality, a block system and one signature twist, like The Wall or the Diggers.
- Their rotation changes who blocks and who digs where **(v1)**.
- They adapt to your habits **(v1 keyed-in)**.

## 10. The run (v1 run loop + Tiles upgrades)
- A ladder of about 5 matches, ending with a boss.
- After each point you pick 1 of 3 small upgrades **(v1 Tiles)**.
- After each match you get a bigger reward: a recruit, a set call, a shot, or a relic.
- **Relics** change the rules and combo with your build, like "Tips crack tiles" or "A perfect pass starts the chain at ×2".

## 11. What's on screen (new)
- A top-down court, players as circles, the ball's flight, and tiles cracking.
- Odds show as tile colors and short words, never percentages. The math lives in a hidden Lab screen.
- Vision blurs what you see of the block and defense **(v1)**.

---

## Open questions for Leo
1. Tile toughness: 2 hits per tile to start?
2. Is pass grade automatic (from stats), or should the passer get a choice?
3. Do the small upgrades come after every point, or only after points you win?

## Draft 2 (2026-10-16, from Leo's playtest)

Proposal page with drawings: https://claude.ai/artifact/5gNvfkzjyszkKUdLrWUxh2 (approved).

- **Hitting:** the ball always goes to the tile you tap. The only misses are net or out (about 4-10% a swing). Wild swings return only as a status effect later (like Confused).
- **Block shadow:** each blocker's hands throw a fan from the net, skinny to wide, angled away from the hitter. Touching hands merge. The core is solid (a hard swing can't be aimed there). The thin outer edge is weak: a ball there can be tooled (35%), stuffed (30%) or touched. A late blocker is weaker and only shadows the front half, so a gap shows as a lit seam.
- **Defense:** each tile is 2×2 squares. Spots come from your formation. Back row: libero left back, the back-row OH middle back, S or OPP right back. Front-row players who don't block drop off. You get one move per ball: one player, one square (blockers slide one square along the net), with no stacking. Their hitter aims at your starting setup, so a good read beats them.
- **Their attack is visible:** the net view shows their set arc and the hitter's approach (straight = line, wide = cross, slow = tip). The approach can fake: 15% Normal, 25% Hard, 35% Boss.
- **Chase:** their defense remembers where you hit (heat that cools each swing). Second time: a digger shades over. Third: two pile in and read it. Holes they've watched get plugged at half the dig. Their middle can bite on your quick, leaving your next outside set with a late middle. Easy and Normal are a "Chaser"; Hard and Boss are a "Reader" with a longer memory.
- **Serve:** five targets (three passers plus two seams), tinted by the chance of a bad pass. A front-row OH who passes is late to hit (one step worse set).
- **Upgrades:** one pick at a timeout when either team reaches 8. Picks: Second move, Long step, Big hands, Film study, Heavy hands, Spike training, Clean contact, Patch the floor.
- **Health check (200 matches per level):**
  - Smart bot win rate: Easy 93%, Normal 81%, Hard 36%, Boss 26%.
  - Random bot win rate: 42%, 16%, 1% and 0%.
  - Errors run 4-11%.

## Dig reach ovals (2026-10-16)
- Each defender has an oval reach (2.1 m along the net, 1.6 m front to back, scaled by spot: libero 1.2, back-row OH 1.05, right back 0.9, front row 0.8-0.85).
- Confidence = exp(-0.69 n^2), n = distance in oval radii: 100% at their feet, 50% at the dashed ring, fading smoothly past it. Tile coverage is the average over 16 points in the tile; a second defender adds 35% of theirs.
- Dig quality follows the digger's confidence q: perfect = 50% x q, shank = 8% + 45% x (1 - q), rest ok.
- Drawn as a soft oval plus a dashed 50% ring under every defender on both floors.
- 2026-10-16 update: ovals are rounder (1.9 m x 1.75 m). No hard swings inside the 10-foot line (Hard reaches rows 2-3 only). Slow balls grow every oval: Roll x1.4 (dig x1.1), Tip x2.2 (dig x1.3), and the court draws the bigger ovals when you pick that shot. New upgrade "Quick feet": your defenders' ovals x1.2.
- 2026-10-16 landing spots: every ball lands at a random spot inside the aimed tile, and the dig roll uses coverage at that exact spot (the court draws it there). A defender standing on the spot now digs a hard swing most of the time (Dig dial 0.95, Hard dig x0.9). All six deep tiles take a hard swing; the block's solid middle just stuffs most of them (catch there: 8% tool, 60% stuff), while the soft edge still tools 35%.
