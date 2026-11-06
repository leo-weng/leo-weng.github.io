# Stakes: options, momentum and fatigue

Brainstorm, 2026-10-10. Leo liked ideas 1–3 (momentum, fatigue, setting them up). The card hand (idea 4) is parked.

## The one idea underneath

Every touch decides how many options the next touch gets. Good touches open the menu and bad ones shrink it. Momentum is what you earn by taking a risk, and you spend it to buy an option back when the ball goes wrong. Fatigue makes your best option cost something.

So each rally asks three things:
- What can I do with this ball?
- What does it cost me?
- What does it set up next?

## 1. The incoming ball sets the menu

| Ball coming over | Pass / setter | Sets open | Their defense |
|---|---|---|---|
| **Free ball** | Perfect, setter on target | Everything, including combos and quicks | Neutral: they don't know what's coming |
| **Down ball** (standing swing) | Good | All but the hardest combos | Slightly set |
| **Roll / tip dug** | Good to OK | Pins and middle; combos are a stretch | Reading you |
| **Hard swing dug (big dig)** | OK to bad, setter pulled | High balls to the pins; the hitter who dug is out | Fully ready |
| **Shank / scramble** | Bad, someone else sets | One high ball, and maybe a back-row set later | Fully ready, block formed |
| **Overpass** | (no set) | Joust or swing at the net: a free kill chance | Caught off guard |

The ball they sent decides your menu, so *how you defend* (dig quality) feeds straight into your offense.

## 2. Set choice is a trade, not just odds

| Set | You get | You give up |
|---|---|---|
| **High** | Biggest hitting window, all shots, harder swing (+Power) | Block formed, defense set and deep |
| **Medium / combo** | Fools a middle that reads late; split block | Needs a good pass; mistimed if the setter is pulled |
| **Fast** | Block late or 1-on-1, defense crashed in | Small window (deep cross only), little power, costs more fatigue on a bad pass |
| **Back row** (later) | Block mostly stays home | Weaker swing, needs a deep set |

A high ball isn't "safe". It's the ball where the *shot* matters most, because the defense is fully set.

## 3. Momentum: points for risk

A meter from 0 to 10, shown next to the score. Both teams have one.

**You earn it by:**
- A kill in a red tile (under 30%): **+2**
- A kill in a yellow tile: **+1**
- A kill with a hitter you haven't set in your last 3 sets: **+1** (distribution)
- A kill off a fast or combo set: **+1**
- **Set-up bonus:** a kill right after you pulled their defense the other way: **+2** (see 5)
- A dig on a hard swing that turns into a kill: **+1**

**You lose it (or they gain it) when:**
- You're blocked: −1 for you, +1 for them
- You hit an error: −1
- They go on a 3-point run: they get +2

**You spend it on tools, mid-rally:**

| Tool | Cost | What it does |
|---|---|---|
| **Big swing** | 2 | +2 Power, timed (already exists; now costs momentum) |
| **Read** | 2 | One step clearer vision this ball (see the block and defense exactly) |
| **Save the pass** | 3 | Turn a bad dig into an OK pass: opens the menu back up |
| **Fresh legs** | 2 | One hitter's fatigue resets |
| **Timeout** | 4, once per game | They forget your habits and their momentum drops to 0 |
| **Called play** | 3 | Run a combo off an OK pass |

Their momentum makes their block tighter and their defense quicker. A boss spends theirs on things like "Read your setter" or "Triple block".

## 4. Fatigue: your best hitter isn't free

- Each hitter has **3 energy pips**.
- A hard swing on a high ball costs 1. A tip or roll costs 0. A fast set costs 0 off a good pass but 1 off a bad one.
- A hitter gets 1 pip back each rally they aren't set.
- A hitter at 0 jumps 1 lower, has a smaller window, and their hard swing is softer.
- Middles recover fastest and outsides slowest, which also tells players who should get the most sets.

Feeding your best hitter every ball works for three rallies, then they're spent right when you need them.

## 5. Setting them up

Their defense already drifts toward where you hit. Make it visible and worth chasing:
- A **lean indicator** on their court ("leaning line", "leaning deep") that builds as you hit the same side.
- The next kill to the **opposite** side while they're leaning earns the +2 set-up bonus and plays faster, since the diggers have to recover.
- Tips work the same way: two deep swings pull them back, then a tip is wide open.

That gives you a reason to take the worse-odds shot now: you're buying a better shot next time.

## How a rally might read

1. **Free ball.** Everything's open. Your outside has 1 energy left, so you set the middle a 1. **Kill in a yellow tile: +1 momentum.**
2. **Next rally they swing hard and you dig it.** Your opposite dug it, so they're out. The pass is bad, so only high balls are open. You **spend 3 on Save the pass**, now run a combo and split their block. **Kill in a red tile: +2.**
3. **Two line kills later** they're leaning line. You go cross for **+2 set-up**. Momentum is 6, saved for a Timeout when they go on a run.

## Run-level hooks (rewards fit right in)

- **Perks change the economy:** "Showman: red-tile kills +3", "Iron lungs: middles never tire", "Play caller: Called play costs 2".
- **Foes have momentum personalities:** a "Hot streak" team gains double momentum, and "The Wall" gains momentum from blocks.
- **Stats feed the system:** Vision makes Read cheaper, and Stamina adds energy pips.

## Open questions for Leo

1. Should momentum carry between games in a match, or reset each game?
2. Is fatigue per game, or does it carry through a match (more roguelike)?
3. Should their momentum be visible, so you know when to call a Timeout?
4. Where do Hard mode and the tiles fit: does Read (spending momentum) temporarily show the heat map?

## Suggested first slice to build

1. The incoming-ball table (free ball / down ball / big dig / scramble), so each rally starts with a different menu.
2. The momentum meter: earn from red/yellow kills and distribution, spend on Big swing, Read and Save the pass.
3. Fatigue pips on the three hitters.

Set-up bonuses, Timeout and opponent momentum come next.
