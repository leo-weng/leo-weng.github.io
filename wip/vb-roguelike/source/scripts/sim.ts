// Balance sim: thousands of rallies per set call × shot, compared to spec §8/§14 targets.
// Usage: npx tsx scripts/sim.ts [Bunch|Spread] [Perfect|OK|Poor]
import { BlockSystem, OpponentLevel, setOpponentLevel, SET_CALLS, SHOTS, shotsFor, STARTING_PLAN, STARTING_TEAM } from "../src/data";
import { activeCalls, arrived, callSpot, defenseFor, emptyTendency, formBlock, makePass, makeRng, othersFor, Outcome, PassMode, resolveShot, setQuality } from "../src/engine";

const system = (process.argv[2] ?? "Bunch") as BlockSystem;
const passMode = (process.argv[3] ?? "Perfect") as PassMode;
const N = 4000;
const lvl = process.argv.find((a) => ["Rookie", "Club", "Elite"].includes(a)) as OpponentLevel | undefined;
if (lvl) setOpponentLevel(lvl);
const rng = makeRng(12345);
const team = STARTING_TEAM;
const shots = SHOTS.filter((s) => s.unlocked || process.argv.includes("--all"));

const pct = (x: number) => String(Math.round(x * 100)).padStart(3);
console.log(`System ${system}, pass ${passMode}, ${N} rallies per cell. Columns: Kill Blk Dug Err`);
console.log("call     blk  " + shots.map((s) => s.id.padEnd(14)).join(""));
const totals: Record<string, Record<Outcome, number>> = {};
for (const call of SET_CALLS) {
  const row: string[] = [];
  let blockers = 0;
  for (const shot of shots) {
    if (!shotsFor(call.hitter).includes(shot)) { row.push("  ·  ·  ·  ·  "); continue; }
    const c: Record<Outcome, number> = { Kill: 0, Blocked: 0, Dug: 0, Error: 0 };
    for (let i = 0; i < N; i++) {
      const pass = makePass(rng, passMode);
      if (call.tempo !== "High" && pass.rating < 2) continue;
      const calls = { ...activeCalls(STARTING_PLAN, pass), [call.hitter]: call };
      const spot = callSpot(call, pass.setterX);
      const block = formBlock(rng, call, spot, othersFor(call, calls, pass.setterX), system);
      blockers += arrived(block).length;
      const set = setQuality(team.S, call, pass);
      const defense = defenseFor(rng, emptyTendency(), spot, call.tempo).defenders;
      c[resolveShot(rng, shot.id, { hitter: team[call.hitter], hitterX: spot, set, block, defense, tempo: call.tempo }).outcome]++;
    }
    const n = c.Kill + c.Blocked + c.Dug + c.Error || 1;
    totals[shot.id] ??= { Kill: 0, Blocked: 0, Dug: 0, Error: 0 };
    const uses = SET_CALLS.filter((x) => shotsFor(x.hitter).includes(shot)).length;
    for (const k in c) totals[shot.id][k as Outcome] += c[k as Outcome] / n / uses;
    row.push(`${pct(c.Kill / n)}${pct(c.Blocked / n)}${pct(c.Dug / n)}${pct(c.Error / n)}  `);
  }
  console.log(`${call.id.padEnd(8)} ${(blockers / (N * shots.length)).toFixed(1)}  ${row.join("")}`);
}
console.log("\nAverage across calls:");
for (const s of shots) {
  const t = totals[s.id];
  if (!t) continue;
  console.log(`${s.id.padEnd(10)} Kill ${pct(t.Kill)}  Blocked ${pct(t.Blocked)}  Dug ${pct(t.Dug)}  Error ${pct(t.Error)}`);
}
