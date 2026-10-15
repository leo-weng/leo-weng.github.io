// Health check: plays N matches per level with the smart and random bots and prints the Health check stats.
// Usage: npm run sim -- 300
import { playMatch, SMART, RANDOM, MatchStats } from "../src/match";
import { LEVELS } from "../src/tables";

const n = Number(process.argv[2] ?? 300);
const pct = (v: number) => `${Math.round(v * 100)}%`;
function summary(list: MatchStats[]) {
  const sum = (f: (m: MatchStats) => number) => list.reduce((a, m) => a + f(m), 0);
  const wins = list.filter((m) => m.winner === "us");
  return {
    win: pct(wins.length / list.length),
    score: `${(sum((m) => m.us) / list.length).toFixed(1)}-${(sum((m) => m.them) / list.length).toFixed(1)}`,
    rallies: (sum((m) => m.rallies) / list.length).toFixed(1),
    killRate: pct(sum((m) => m.kills) / Math.max(1, sum((m) => m.swings))),
    tilesBroken: `${(sum((m) => m.theirBroken) / list.length).toFixed(1)} theirs / ${(sum((m) => m.ourBroken) / list.length).toFixed(1)} yours`,
    winsByBreaks: pct(wins.filter((m) => m.theirBroken >= 4).length / Math.max(1, wins.length)),
    greenestIsBest: pct(sum((m) => m.topPickBest) / Math.max(1, sum((m) => m.topPickTotal))),
  };
}
for (const level of LEVELS) {
  const smart = Array.from({ length: n }, (_, i) => playMatch(level, SMART, 1000 + i));
  const rand = Array.from({ length: n }, (_, i) => playMatch(level, RANDOM, 5000 + i));
  console.log(level.padEnd(7), "smart", JSON.stringify(summary(smart)));
  console.log("".padEnd(7), "random", JSON.stringify(summary(rand)));
}
