// Plays whole games and prints averages per policy.
// Usage: npx tsx scripts/match-sim.ts [games=200] [Bunch|Spread] [Rookie|Club|Elite] [--all]
import { BlockSystem, OpponentLevel, setOpponentLevel, STARTING_TEAM } from "../src/data";
import { POLICIES, simulateGames, summarize } from "../src/sim";

const games = Number(process.argv[2] ?? 200);
const system = (process.argv[3] ?? "Bunch") as BlockSystem;
const lvl = (process.argv.find((a) => ["Rookie", "Club", "Elite"].includes(a)) ?? "Club") as OpponentLevel;
setOpponentLevel(lvl);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(4);
console.log(`${games} games to 11 vs a ${lvl} ${system} block, free ball every rally, placeholder counterattack.\n`);
for (const p of POLICIES) {
  const t0 = Date.now();
  const s = summarize(simulateGames(games, p.id, { team: STARTING_TEAM, system, passMode: "Free ball", unlockAll: process.argv.includes("--all"), seed: 2026 }));
  console.log(`${p.id.padEnd(10)} win ${pct(s.winRate)}  avg score ${s.avgFor.toFixed(1)}–${s.avgAgainst.toFixed(1)}  points won ${pct(s.pointWinRate)}  attacks/rally ${s.attacksPerRally.toFixed(2)}  kill ${pct(s.kill)} blk ${pct(s.blocked)} dug ${pct(s.dug)} err ${pct(s.error)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`           sets OH ${pct(s.hitterShare.OH)} MB ${pct(s.hitterShare.MB)} OPP ${pct(s.hitterShare.OPP)} · top: ${s.topCombos.slice(0, 3).map((c) => `${c.combo} ${pct(c.share)} (kill ${pct(c.kill)})`).join(", ")}`);
}
