# Volleyball Roguelike: Game Spec

This is the single source of truth. Older drafts are in `archive/`.
Last updated: 2026-10-08 (round 4: match format; build starts at v0.1)

**Status tags**
- ✅ **Decided**: Leo agreed. Change only by updating the Decision Log (§16).
- 🟡 **Proposed**: Claude's default. Treat it as the plan unless Leo changes it.
- ❓ **Open**: needs Leo's call before the version that uses it.

All numbers are 🟡 starting values for tuning unless marked otherwise. ✅ Stats and values will be tuned as we go.

---

## 1. Pillars
- ✅ Slay the Spire-style roguelike: climb a ladder of opponents, earn upgrades, and a run ends when you lose.
- ✅ Turn-based on the ball. Every decision happens while the ball is in the air, and time is frozen while you decide.
- ✅ You are every player. Control jumps to whoever is about to touch the ball. On defense, the libero is the mastermind.
- ✅ Realistic but fun. Real volleyball concepts and trade-offs, but never a chore.
- ✅ Math-driven. Outcomes come from visible probabilities.
- ✅ Everything has error. Every shot, including the safe default, can miss long, wide or into the net.
- ✅ Every choice must be tangible. You can always see what a choice or upgrade changes (odds or information).
- ✅ Systems before visuals. Text-based in the browser first, graphics later.

## 2. Versions (build order)
Each version has one question it answers and a "done when" check. We don't start the next version until the current one passes.

**v0.1: Offense sandbox**
- Question: is "set, then hit" a fun pair of decisions?
- Includes:
  - Free ball in (§5.0).
  - Setter decision: set spot and tempo.
  - Computer block forms (§6.3).
  - Hitter decision: shot and aim cone.
  - Odds preview, one resolution, and a text log explaining why.
  - Endless rallies, no score.
- Includes also: the game plan auto-running on a perfect pass (§5.3), and text-mode reward moments (§15).
- Excludes: defense, fatigue, keyed-in, momentum, score, upgrades, serving, back-row attacks.
- Done when: Leo plays 20+ rallies and the right choice isn't always the same one.

**v0.2: One match**
- Adds: score (§10), the libero's defense call (§5.4), fatigue, keyed-in and momentum (§7), one opponent with a scouting report.
- Done when: a match to 11 takes about 10 minutes and spreading the ball around clearly matters.

**v0.3: The run**
- Adds: ladder (§11), rewards and upgrades (§12), 4 opponent types (§13).
- Done when: two different upgrade paths can both win a run.

**v0.4: Serve and receive**
- Adds: your serve, serve-receive decisions, rotations ❓.

**v0.5+: Presentation**
- Adds: court graphics, animation, sound, full reward feel (§15).

**Later (unscheduled)**
- Back-row attacks (Pipe, D), hitter collisions, serve receive.

## 3. Rally flow
0. Before the point: the setter picks a game plan (§5.3). Team systems are already set for this game (§5.5).
1. Ball arrives on your side: a free ball (v0.1–v0.3) or a dig in transition. The pass sets the pass rating and setter position.
2. **Setter decision** (§5.1): on a perfect pass the game plan runs (you may change one call). Otherwise you pick the set call.
3. Computer block forms, or fails to (§6.3).
4. **Hitter decision** (§5.2): shot + aim. A cone of error is applied.
5. Resolve the attack (§8): Kill, Blocked, Dug or Error.
6. If Dug: the opponent attacks. Control jumps to the **libero**, who picks their own position (§5.4, from v0.2). Teammates and blockers adjust automatically. If you dig it, the dig quality becomes the next pass rating, and you go back to step 2.

## 4. Team and stats

### 4.1 Lineup
- 🟡 Setter, Outside (OH), Middle (MB), Opposite (OPP), Libero (L).
- No rotations until v0.4 ❓.
- ✅ The libero is the defensive mastermind (§5.4). In v0.1 the libero only passes the free ball.

### 4.2 Stats (1–10, 5 = average)
✅ These are good for now and will be tuned as we go.

| Stat | Kind | Effect |
|---|---|---|
| Jump | Physical | Hit over the block: lowers Blocked % |
| Power | Physical | Ball speed: harder to dig, lowers Dug % |
| Control | Skill | Narrower aim cone: lowers Error %. For the setter, better set quality |
| Stamina | Physical | Sets in a row before fatigue starts |
| Vision | Mental | How clearly you see the block or their set (§6.1) |
| Composure | Mental | Less error late in close sets |
| Speed | Physical | Blockers close faster; defenders cover more ground |
| Reaction | Mental | Read blockers start moving sooner; defenders react to harder balls |

### 4.3 Archetypes
✅ Archetypes are starting templates: a player's starting stat spread plus one signature trait. They are not separate systems.
- 🟡 Templates:

| Archetype | Starting stat spread | Signature trait |
|---|---|---|
| Power Hitter | High Jump and Power | Hard shots +speed |
| Shotty Hitter | High Control and Vision | Wider shot menu early |
| Commit Blocker | High Jump | Commit start is +10% to arrive |
| Read Blocker | High Speed and Reaction | — |
| React Defender | High Reaction | — |
| Predict Defender | High Vision | Sees the hitter's intended zone more often |
| Tempo Setter | High Control | Medium and Fast sets get a quality bonus |
| Deceptive Setter | High Vision | Read blockers react later |

## 5. Decision points

### 5.0 Free ball in (v0.1–v0.3)
- ✅ Serve receive comes later. For now, every rally starts with a free ball to your side.
- 🟡 A free ball is passed perfectly about 98% of the time.
- 🟡 Each pass has two parts:
  - **Pass rating:** 3 (perfect), 2 (ok) or 1 (poor).
  - **Setter position:** where the setter ends up along the net. Neutral is around 6 m from the left antenna. A pass off the net pushes the setter forward or pulls them off the net.
- Setter position matters because of spot vs distance sets (§5.1).

### 5.1 Setter decision
- **You see:** pass rating, setter position, the opponent block's starting positions (clarity per §6.1), and in v0.2 each hitter's fatigue and keyed-in level.
- **You choose:** a **set call**. Each call has a spot along the net and a tempo.
- ✅ Tempo rules:
  - High: always available.
  - Medium: needs a pass of 2+.
  - Fast: needs a pass of 2+.

✅ **Spot sets vs distance sets**
- **Spot set:** always goes to the same place on the net, wherever the setter is. If the setter is pulled away, the set gets longer and harder: lower set quality.
- **Distance set:** goes to a fixed distance from the setter, so it moves with the setter. It stays easy to set, but its spot shifts.
- **Deception:** when the setter is neutral, a distance set and a spot set can land in nearly the same place, for example Back 2 and Pull. That makes them hard for blockers to read apart. When the setter is pushed, they separate.

✅ **Set calls: 4 per hitter. Front row only; no back-row attacks yet.**

| Hitter | Call | Type | Spot (m from left antenna, setter neutral at 6 m) | Tempo | Default? |
|---|---|---|---|---|---|
| OH | 4 | Spot | 0.5 | High | ✅ OH default |
| OH | Go | Spot | 0.5 | Medium | |
| OH | Shoot | Spot | 0.5 | Fast | |
| OH | 32 | Spot | 3.0 | Medium | |
| MB | 1 | Distance | 1 m in front of setter (≈5.0) | Fast | ✅ MB default |
| MB | 3 | Spot | 3.5 | Fast | |
| MB | Gap | Distance | 2 m in front of setter (≈4.0) | Fast | |
| MB | Back 1 (aka 6) | Distance | 1 m behind setter (≈7.0) | Fast | |
| OPP | 5 | Spot | 8.5 | High | ✅ OPP default |
| OPP | Flat | Spot | 8.5 | Fast | |
| OPP | Pull | Spot | 7.0 (inside spot set from the right side, the right side's 32) | Medium | |
| OPP | Back 2 | Distance | 1 m behind setter (≈7.0, same spot as Back 1) | Medium | |

- **Overall default:** 4 to the OH, the safe bailout set.
- 🟡 For v0.1 all 12 calls are available, so we can feel them out. ❓ Which ones become unlocks is decided in v0.3.
- Why the spot matters: the block's **distance to close** depends on where its blockers start and where the set goes (§6.3).
- ❓ Later: hitter collisions. Two hitters running into the same space (for example a Back 1 and a Back 2 together) run into each other.

### 5.2 Hitter decision
- **You see:** set quality, the block at contact (clarity per §6.1), odds for each shot.
- **You choose:** a shot. Each shot is a target on the court plus a swing type. The aim cone (§8) decides where it actually lands.
- ✅ Shot menu:

| Shot | Target | At start? | Character |
|---|---|---|---|
| Seam (default) | Zone 6, deep middle seam | ✅ | Most reliable; medium speed; still has error |
| Line | Down the line, deep | ✅ | Lower success early; narrow target |
| Cross | Sharp cross-court | ✅ | Lower success early; angle errors go wide |
| Tip | Short, behind the block | ✅ | Very low kill chance at start; low error |
| Roll Shot | Short corner, off-speed | ✅ | Basically a free ball (~95% they pass it perfectly); safe, almost no error. Ball-control players can make it more dangerous |
| Hard Line | Down the line, deep | Unlock | High speed; still narrow |
| Hard Cross | Sharp cross-court | Unlock | High speed |
| Tool | Off the block's outside hand | Unlock | Uses the block; high error |

- **Default:** Seam to zone 6.
- ✅ Roll Shot is the "get it over safely" option when the set is bad. The trade-off: it gives them a perfect pass.

### 5.3 Game plan and combo plays
✅ Before each point, the setter picks a **game plan**: a combo play (every hitter's call at once).
- **Perfect pass:** the game plan runs automatically. No setter decision needed unless you want to change it.
- **Imperfect pass:** the game plan is off, and you choose the set call yourself (§5.1).
- **Changing the plan on a perfect pass:** you can change one player's call. 🟡 Only one, so you can't create collisions (for example, a Slide and a Flat into the same space).
- 🟡 Example game plan, the v0.1 starting play: OH Go, MB 1, OPP 5.
- 🟡 Combo plays that create deception or overloads are unlocks (v0.3).
- ❓ How many plays a team carries, and exactly how the "change one call" rule works. Brainstorm later.

### 5.4 Libero defense call (v0.2)
✅ When the opponent attacks, control jumps to the libero. The libero controls **only their own position**, and the other defenders automatically adjust around them. Blockers are not the libero's call.
- **You see:** their set (clarity per §6.1), their scouting report, the hitter's Power, and their expected kill chance under your call.
- **You choose:**
  - Position: shade Left / Center / Right, and Up / Balanced / Deep.
  - Range: how much court the libero takes (Small / Normal / Big). Taking more court makes the libero's dig chance lower per ball, and teammates shift to cover the rest.
- 🟡 **Default:** Center, Balanced, Normal. One click accepts it.
- ✅ Dig chance falls as the attacking hitter's Power goes up. Libero stats push it back up.
- ✅ Libero upgrades:
  - **Range:** take more court without losing dig chance.
  - **Read:** see their set and hitter tendencies more clearly.
  - **Control:** digs become better passes, so the counterattack is stronger.
- ✅ Commit and Follow were removed from the libero's options. They're blocking concepts.

### 5.5 Team systems (set between games)
✅ Some choices are team systems. They're set before a game and can't be changed mid-game.
- **Block system:** Bunch / Spread (+ Read vs Commit tendencies, 🟡).
- 🟡 **Defensive system:** Rotation / Perimeter. This tells teammates how to adjust around the libero.
- 🟡 **Blockers act automatically** during play, following the block system plus keyed-in (§7.2).
- ✅ Each match is a single game (§10), so systems are set before each match and locked for the whole game. Timeouts can't change them.

## 6. Core systems

### 6.1 Vision and information
- 🟡 Three clarity tiers:
  - **Clear:** exact positions; odds shown as single numbers.
  - **Fuzzy:** zone only ("middle shading left?"); odds shown as ranges.
  - **Blind:** no info; odds assume the default.
- 🟡 Setter clarity score = Vision + pass bonus (3: +2, 2: 0, 1: −3).
- 🟡 Hitter clarity score = Vision + tempo bonus (High: +2, Medium: 0, Fast: −2).
- 🟡 Libero clarity score = Vision + Read upgrades.
- 🟡 Score 8+ is Clear, 5–7 is Fuzzy, 4 or below is Blind.
- 🟡 Opponent blockers have clarity too. When two of your calls look alike (a distance set and a spot set landing close together, §5.1), read blockers react later.

### 6.2 Set quality
- 🟡 Score = setter Control + pass bonus (3: +2, 2: 0, 1: −3) − tempo penalty (High: 0, Medium: 1, Fast: 3) − distance penalty.
- 🟡 Distance penalty: spot sets only. −1 per 1.5 m the setter is pulled from neutral (distance sets have none).
- 🟡 Perfect (7+): aim cone 20% narrower. Good (4–6): no change. Off (3 or below): cone 40% wider, more net errors, and the hitter's Jump counts as 2 lower.

### 6.3 Block formation (distance to close)
✅ Whether the block forms depends on distance to close, plus blocker reaction, speed, and how well the block is formed.
- 🟡 For each blocker who could reach the set spot:
  - Time available = tempo time (High 1.6 s, Medium 1.1 s, Fast 0.7 s) − reaction delay.
  - Reaction delay: Read blocker 0.45 s − 0.03 s per Reaction point above 5. Commit blocker: 0 s, but only if they guessed the spot.
  - Time needed = distance from start position to the spot ÷ blocker speed (Speed 5 ≈ 3 m/s, ±0.2 m/s per point).
  - Margin = time available − time needed.
- 🟡 Each blocker ends in one state:
  - **Formed** (margin ≥ 0.15 s): sealed, hands over the net.
  - **Late** (0 to 0.15 s): there, but leaves a seam or soft hands; Tool and seam shots get easier.
  - **Missing** (margin < 0): not there.
- 🟡 Block quality = number of Formed and Late blockers. This is what the hitter sees (subject to clarity).
- Where blockers start comes from the opponent's block system (§5.5) and keyed-in level (§7.2).
- ✅ Blockers act automatically during play. Nobody (libero included) gives them per-ball commands.

## 7. Pressure across a game (v0.2)

### 7.1 Fatigue
- 🟡 +1 fatigue each time a hitter attacks; −1 for each rally they don't attack.
- 🟡 Threshold = 2 + floor(Stamina / 3). Each point above the threshold: −1 Power and −1 Control.

### 7.2 Keyed-in
- 🟡 Level = (sets to that hitter in your last 4 sets) − 1, minimum 0.
- 🟡 Each level: their blockers start 0.5 m closer to that hitter, and read blockers react 0.05 s sooner on that hitter.
- 🟡 Shown on screen as a heat meter per hitter.

### 7.3 Momentum
✅ A team meter for each side: when a team is playing well, it gets a small boost.
- 🟡 The meter runs from −3 to +3 and starts at 0.
- 🟡 +1 for each point you win; +1 extra for a stuff block or a dig that leads to a kill.
- 🟡 −1 for each point you lose.
- 🟡 Effect: each positive level is +1% to Kill and Dig chances, so up to +3% at "On Fire". Each negative level is +1% Error.
- 🟡 Shown on screen as a meter, and the effect appears as its own line in the odds preview.
- ✅ Both teams have momentum. A run of their points boosts them.

## 8. Resolving an attack (aim cone)
✅ Every shot has an aim cone. The cone is the error: even the default Seam can miss long or go into the net. Line and Cross start with wider cones, so they succeed less often early on.

**How a shot resolves (🟡)**
1. **Net check:** chance to hit the net = base by shot + set-quality penalty − Jump bonus.
2. **Block check:** if the shot's path crosses a Formed blocker's hands, it's Blocked. Partial chances apply for Late blockers. Jump vs block height shifts this.
3. **Landing point:** target + random offset inside the cone (depth and width). Outside the court means Error (long or wide).
4. **Dig check:** a defender covering that landing point digs it with a chance based on their distance, ball speed (Power and swing type) vs defender Reaction and Speed, and the libero's position and range (§5.4). Otherwise it's a Kill.
5. **Dig quality:** a dug ball becomes their pass (rating + setter position). Off-speed shots (Tip, Roll) give them better passes.

**Cone sizes (🟡, in meters at Control 5 with a Good set)**

| Shot | Depth spread | Width spread | Base net chance |
|---|---|---|---|
| Seam | ±1.2 | ±1.0 | 5% |
| Line | ±1.2 | ±0.9 (sideline right there) | 7% |
| Cross | ±1.0 | ±1.2 (angle goes wide) | 7% |
| Tip | ±0.8 | ±0.8 | 3% |
| Roll Shot | ±0.6 | ±0.6 | 1% |
| Hard Line / Hard Cross | ±1.4 | as Line / Cross | 9% |

- 🟡 Control: each point above 5 makes the cone 8% narrower; each point below makes it 8% wider.
- 🟡 Fatigue and Off sets widen the cone (§6.2, §7.1).

**Odds preview**
- The game simulates the shot a few thousand times against what you can see, then shows **Kill / Blocked / Dug / Error** for each shot.
- When clarity is Fuzzy, it shows a range.
- 🟡 In text mode the cone is described in words ("Seam to 6: cone ±1.2 m deep, ~9% chance long").

**Log**
- After each roll the log explains the main factor, for example: "Cross went 0.6 m wide; Control 4 cone."

**Target feel (🟡, starting player, decent set vs a 2-blocker block)**

| Shot | Kill | Error |
|---|---|---|
| Seam | 35–40% | 10–12% |
| Line | 25–30% | 20–25% |
| Cross | 25–30% | 20–25% |
| Tip | ~5–8% | ~4% |
| Roll Shot | ~2–3% (they pass it ~95% perfect) | ~1–2% |
| Hard Line / Hard Cross (once unlocked) | ~40% | ~15% |

**Opponent attacks** use the same model from their side. Your block system (§5.5) places your blockers; your libero's position and range place your defenders.

## 9. Odds display rules
- 🟡 The preview always shows exactly what the resolution uses, given your clarity.
- 🟡 Each modifier (momentum, fatigue, keyed-in, set quality) appears as its own line, so upgrades and pressure are visible.

## 10. Match
- ✅ Each match is one game to 11. Boss matches are one game to 21 (not best of 3).
- 🟡 Win by 2, capped at 15 (boss: capped at 25).
- 🟡 v0.1–v0.3: every rally starts with a free ball to you. ❓ Serving order comes in v0.4.

## 11. Run structure (v0.3)
- 🟡 8 matches (each one game). Matches 3 and 6 are Elites; match 8 is the Boss (game to 21).
- 🟡 Lose a match and the run ends.
- 🟡 Between matches, pick 1 of 3 rewards. Elites give 2 picks.
- ❓ Map branching (shops, rest, events) or a straight ladder? Proposed: straight ladder first.
- ❓ Meta-progression between runs? Proposed: none until the core run is fun.

## 12. Upgrades (v0.3)
Rule: each upgrade must show a visible change in the preview or unlock a new option. Target size: 3–8 points of Kill % on the affected shots.
- **Physical:** +1 Jump, +1 Power, +1 Stamina, +1 Speed (for one player).
- **Skill:**
  - +1 Control (narrower cone).
  - New shots: Hard Line, Hard Cross, Tool.
  - Roll Shot / Tip upgrades for ball-control players (more dangerous off-speed).
  - Set calls: ❓ which of the 12 start locked.
  - Combo plays (game plans).
- **Mental:**
  - +1 Vision.
  - +1 Reaction.
  - +1 Composure.
  - Scout: see the opponent's tendencies before the match.
- **Libero:** Range, Read, Control (§5.4).
- **Team systems:** new block/defense systems to choose between games (§5.5).
- **Traits (team-wide, relic-like):**
  - Big Game: +10% Kill when down by 2+.
  - Net Cord: once per match, turn a Blocked into a scramble.
  - Hype Man: momentum gains +1 extra on kills.
- ❓ Are upgrades per player, team-wide, or both? Proposed: both; stats and shots per player, traits team-wide.

## 13. Opponents
- Each opponent has: player stats, a block system and a defense system (§5.5), an attack distribution (who they set) and archetype templates. The scouting report shows a selection of these.
- 🟡 Starter types:
  - **Tall Block:** high block height.
  - **Scrappy Defense:** strong defense and libero.
  - **Read Blockers:** key in faster, so predictable setting gets punished.
  - **Fast Closers:** high Speed, so High sets get punished.
- ❓ Boss designs.

## 14. Tuning targets
- 🟡 Average attack: 40–45% Kill, 10–15% Error, 8–12% Blocked, the rest Dug.
- 🟡 Normal match: about 10 minutes. Full run: about 60–90 minutes.
- 🟡 About 3 decisions per rally on average.

## 15. Reward feel ("juice")
✅ Big moments need a crisp, physical-feeling payoff, like a Valorant headshot "ding". Graphics, sound and screen shake come in v0.5+, but we should design the trigger moments now.
- 🟡 **Trigger moments (biggest first):**
  - Stuff block.
  - Kill off the floor through a formed block.
  - Kill on a set the block read wrong (deception paid off).
  - Tool off the block.
  - Momentum hitting max ("On Fire").
  - Big dig by the libero.
- 🟡 **Text-mode version (v0.1):** a short punchy callout ("STUFFED.", "Off the floor."), color flash, a brief pause before the result appears, and a one-line "why" so the payoff feels earned.
- 🟡 **Later (v0.5+):** screen shake, hit-stop (a freeze frame on contact), a crisp impact sound, ball-on-floor bounce.
- ❓ What a "crisp" moment should look and feel like in this game. To explore once there's a prototype.

## 16. Decision Log
| Date | Decision |
|---|---|
| 2026-10-08 | Slay the Spire-style ladder, decisions made while the ball is in the air |
| 2026-10-08 | You play as every player; control moves to whoever touches the ball |
| 2026-10-08 | Start with set and hit only |
| 2026-10-08 | Browser, text-based first; graphics later |
| 2026-10-08 | Upgrades include physical, skill unlocks and mental traits; all must be tangible |
| 2026-10-08 | Keep the old sheet's deliberate defense choices |
| 2026-10-08 | Spec first; no building until the versions and decisions are clear |
| 2026-10-08 | Libero is the defensive mastermind: shade, court coverage, line/cross, rotation/perimeter; libero skills cover more |
| 2026-10-08 | Stats OK for now; tune as we go |
| 2026-10-08 | Team momentum meter: playing well gives a small (~2%) boost |
| 2026-10-08 | Archetypes used as starting templates |
| 2026-10-08 | Serve receive later; start rallies with a free ball |
| 2026-10-08 | Tempo: High always; Medium needs a 2+ pass |
| 2026-10-08 | Setter also chooses the set spot along the net (Go, 32, Flat, Back 2...); block formation depends on distance to close, reaction, speed |
| 2026-10-08 | Default shot: seam to zone 6. Line/Cross early but weaker; Hard Line/Hard Cross unlock; Tip available but low kill |
| 2026-10-08 | Every shot has an aim cone of error (long, wide, net), including the default |
| 2026-10-08 | Both teams have momentum |
| 2026-10-08 | Bunch/Spread is a team system, set between games; not the libero's call. Timeouts may allow limited mid-game changes |
| 2026-10-08 | Libero controls only their own position and range; other defenders adjust around them; blockers act automatically. Libero has no Commit/Follow |
| 2026-10-08 | Dig chance drops as the attacker's Power rises |
| 2026-10-08 | No back-row attacks for now (Pipe, D removed) |
| 2026-10-08 | 4 set calls per hitter. OH: 4, Go, Shoot, 32. MB: 1, 3, Gap, Back 1. OPP: 5 (default), Flat, Pull, Back 2 |
| 2026-10-08 | Spot sets vs distance sets (spot: 4, Go, Shoot, 32, 3, 5, Flat, Pull; distance: 1, Gap, Back 1, Back 2) |
| 2026-10-08 | Roll Shot available from the start, basically a free ball; Tool is an unlock |
| 2026-10-08 | Game plan: setter picks a combo before the point; it runs on a perfect pass; imperfect pass means you choose |
| 2026-10-08 | Reward feel matters: crisp payoff on big moments (stuff, kill); visuals come later |
| 2026-10-08 | Setter screen shows all four calls per hitter (game plan marked) instead of a change-call dropdown. Bunch block a bit wider. Right side's inside spot set is called Pull |
| 2026-10-08 | Presentation: 2D net view for the setter; net + top-down court for the hitter. The set plays in slow motion (Fuzzy blurs the block, Blind fogs it). Aim by tapping the court. Odds shown as a colored word, numbers optional. Later: pseudo-real-time decisions |
| 2026-10-08 | From a friend's playtest: ratings show only in Easy mode. Keyed in is live: feeding one hitter speeds their block read (up to 0.16 s), a repeated shot gets +8% block and is easier to dig, and the defense slides toward your recent targets. The defense also jitters each ball, and against a pin the line digger moves onto the line and the middle back sits in the seam. Pin blocks build from the antenna in (line covered on high sets, stretched on fast sets). Opponent levels: Rookie, Club and Elite (speed, reaction, jump, discipline). Seam to 6 aims at zone 6 and is covered by default. Still to come: a real timing component |
| 2026-10-08 | Middles don't swing line/cross: they hit left (sharp angle to the 3 m line), straight down, or right, with cones that miss long, short or into the net. Defense start depends on set tempo: fast = wings crashed in to cut angles, high = wide near both sidelines and the end line. The setter screen is tap to pick, tap again or Set to confirm. Later: free-aim targets (silly targets almost always miss); fixed dots stay for testing |
| 2026-10-08 | Transition: after you dig their attack, hitters are Clean, Rushed or Scrambled depending on how hard it came (hard swing / roll shot / free ball). Rushed means -1 jump, a 1.15x cone and -1 vision. Scrambled means -2 jump, a 1.35x cone, -2 vision and no fast sets. Block touch: a ball that beats the block can graze a hand (up to 35%) and slow to 0.6x speed, so it's easier to dig. Result screen animates the ball's flight in straight lines. Later: hitter Speed stat reduces rushed transitions |
| 2026-10-09 | Leo: easy mode / first runs start with three calls (outside high, middle fast, right side high); later smaller formats (3v3/4v4, free balls only) unlock into 6-on-6, and volleyball players can skip to 6-on-6. Calls are renamable. "They're onto you" is shown. Aim is a drag with a cone; the block covers its cone; a higher jump hits over the block (first step toward 3D). Hard swings now resolve from geometry: contact 1.15 m off the net at 3.15 m + 0.07 per Jump, straight line to the landing spot; crossing below 2.55 − 0.45 topspin = net; formed hands cover ±0.45 m up to 3.0 m (stop 55%), late ±0.3 m up to 2.85 m (28%), +0.06 m per Block Jump; blockers shade ±0.15/0.3 m each ball. Next: memory read (see the block briefly, limited peeks), smaller formats, real timing. Later: four-blocker modes, true 3D |
| 2026-10-09 | Leo: dig reach should be smaller and lean forward (you can chase forward, not back), not a circle centered on the player. Aim has to be cleaner: fewer misses, especially early and in Easy; perfect vision should let you thread the hole. Middles close fast; bunch always leaves line, the middle almost always closes the seam, and only fast balls get one-on-one or one-and-a-half. Leo may draw corrected defender positions |
| 2026-10-09 | Leo: the set limits where you can hit. Fast/shoot = small window (deep cross); high ball = about 75% of the court for a mid-level hitter; Jump and Power widen it toward the whole court at max stats. Fast ball: small window but small block; high ball: big window but big block. Hitting should feel like execution, not "hit where they aren't": added a contact timing tap |
| 2026-10-08 | Matches are one game to 11; boss is one game to 21. Team setup (e.g. block scheme) can't change within a game |
| 2026-10-08 | Spec phase done enough; start building from v0.1 |

## 17. Open questions (summary)
1. Game plans: how many does a team carry, and how does "change one call" work exactly?
2. Hitter collisions when calls overlap (later).
3. Which of the 12 set calls start locked (v0.3)?
4. Rotations (v0.4)?
5. Straight ladder vs branching map for v0.3?
6. Meta-progression between runs?
7. Upgrades per player, team-wide, or both?
8. Boss designs.
9. What "crisp" feels like in this game (once there's a prototype).
