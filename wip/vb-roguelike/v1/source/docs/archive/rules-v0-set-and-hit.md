# Rules v0: set and hit (text prototype)

Scope: the first playable version. It's text-based in the browser and covers only your offense: setter decision, then hitter decision, against a computer-controlled block and defense. Serve receive, your blocking and graphics come later. All numbers are starting guesses meant for tuning.

**Design rule: every upgrade must change something you can see.** Either an odds number in the shot preview moves, or new information or options appear on screen. If an upgrade can't do either, it doesn't ship.

## Players and stats (1–10)

Your team for v0: Setter, Outside (OH), Middle (MB), Opposite (OPP).

| Stat | Kind | What you feel |
|---|---|---|
| Jump | Physical | Hit over more of the block (lowers Blocked %) |
| Power | Physical | Harder for the defense to dig (lowers Dug %) |
| Control | Skill | Tighter aiming cone (lowers Error %, unlocks precise targets) |
| Stamina | Physical | How many sets in a row before fatigue starts hurting |
| Vision | Mental | How clearly you see the block when you decide |
| Composure | Mental | Less error when the score is close late in a set |

## A rally, step by step

**0. Pass arrives.** v0 rolls a random pass rating of 3 (perfect), 2 (ok) or 1 (poor). Serve receive replaces this roll later.

**1. Setter decides** (control moves to the setter).
- Information: the opponent's 3 blockers. With high setter Vision and a good pass you see exactly where each blocker stands. With low Vision or a poor pass you see a rough zone ("middle shading left?") or nothing.
- Choices: which hitter, and the tempo: **High** (always available), **Medium**, **Fast** (only on a pass of 2 or 3, and only for hitters who have Fast unlocked).
- Set quality = setter Control + pass rating, minus a tempo penalty. A poor set raises the hitter's Error % and lowers their Jump advantage.

**2. Block reacts (computer-controlled).**
- How many blockers close (0–3) depends on blocker speed vs tempo, plus how "keyed in" they are on that hitter.
- Tempo trade-off: a Fast set gives the block less time (fewer blockers arrive). A High set gives your hitter more time to read but lets the full block form.

**3. Hitter decides** (control moves to the hitter).
- Information: the block at the moment of contact (how many blockers, whether they're taking line or cross). How clear that is depends on Vision, with less time to read on a Fast set.
- Shot choices: Hard Line, Hard Cross, Roll Shot, Tip. Unlockable: Tool off the block, Deep Corner, Back-row Pipe.
- Before committing you see each shot's odds: **Kill / Blocked / Dug / Error**. The odds reflect what *you can see*. When your read is fuzzy, the preview shows a range instead of one number.

**4. Resolve.** One roll against the true odds. The text log says why it happened ("two blockers closed in time; your Jump 6 vs their block 7").
- Kill: you score. Error or Blocked: they score.
- Dug: the opponent counterattacks, and you make the defense decision below. If you dig it, you get another attack, from a worse pass.

## Defense decision (from the old sheet's Defend phase)

When the opponent attacks, you choose a scheme instead of the game rolling a flat counterattack %. It's one decision while their set is in the air, with options from the old sheet:

| Choice | Strong against | Burned by |
|---|---|---|
| **Bunch block** (all 3 start in the middle) | Middle quicks; gets 2–3 blockers on high sets | Fast sets to the pins |
| **Spread block** (blockers start at the pins) | Fast outside / opposite sets | The middle quick |
| **Read** (wait to see the set) | Anything, just late | Fast tempo |
| **Commit** (jump with their middle) | Their quick attack, stuffed | Any set that goes outside |
| **Follow** (middle shadows one hitter) | Their best hitter | Everyone else |
| **Take line / take cross** | That lane | The other lane (your defense must cover it) |
| **Perimeter defense** (stay deep and react) | Hard swings | Tips and roll shots |
| **Rotation defense** (move up to cover the tip) | Tips and shots | Hard line, deep |

- Opponents have tendencies (the "scouting report"). Scout and Vision reveal more of them, the way Slay the Spire shows enemy intent.
- The same schemes are what the computer block runs against *your* offense. Learning them on defense teaches you how to beat them on offense.
- Defensive upgrades fit the same pool: blocker speed (close faster), reach, reaction (stay-and-react defense digs more), anticipation (move-early defense gets better), plus unlocks like a Swing block or a Dive commit.

## Pressure across a set
- **Fatigue:** each attack adds 1 fatigue to that hitter. Above their Stamina, Power and Control drop. Fatigue goes down while they aren't being set.
- **Keyed in:** the opponent tracks your recent set distribution. The more you lean on one hitter, the more likely extra blockers commit to them.
- These two together are why spreading the ball around matters, and the preview makes both visible.

## Match and run
- Rally scoring to 11 for normal fights, best-of-3 to 15 for bosses (tune later).
- The ladder is about 8 opponents with traits: Tall Block, Scrappy Defense, Read Blockers (punish predictable setting), Fast Closers (punish High sets).
- After each win, pick 1 of 3 rewards.

## Upgrade pool (examples)
- **Physical:** +Jump, +Power, +Stamina.
- **Skill unlocks:** Fast tempo for a hitter, Tool shot, Deep Corner, Back-row Pipe, combo plays (e.g. Slide + Pipe pulls the middle blocker, so one hitter is guaranteed to face no more than 1 blocker).
- **Mental:** +Vision (clearer block reads), +Composure (late-set error cut), Scout (see the opponent's tendencies before the match), Luck (one "net cord" save per match: turn one Blocked into a scramble).
- **Clutch traits (relic-like):** e.g. "Big Game: +10% Kill when down by 2+".

## Target feel (for tuning)
Average attack around 40–45% kill, 10–15% error, 8–12% blocked, rest dug. A good upgrade should move a shot's kill odds by roughly 3–8 points. Smaller than that and nobody notices. Bigger and the run gets solved.
