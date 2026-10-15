// Free-aim check: the best and worst spots to swing at for one call, over a grid of aims.
// Usage: npx tsx scripts/aim-grid.ts <call> [Rookie|Club|Elite]
import { callById, OpponentLevel, setOpponentLevel, STARTING_PLAN, STARTING_TEAM } from "../src/data";
import { activeCalls, callSpot, defenseFor, emptyTendency, formBlock, makePass, makeRng, othersFor, resolveShot, setQuality } from "../src/engine";

const call = callById(process.argv[2] ?? "4");
setOpponentLevel((process.argv[3] ?? "Club") as OpponentLevel);
const shot = call.hitter === "MB" ? "QStraight" : "Seam";
const rows: { x: number; y: number; k: number; v: number }[] = [];
for (let y = 1.5; y <= 8.6; y += 0.7) for (let x = 0.3; x <= 8.8; x += 0.85) {
  const rng = makeRng(42);
  let kill = 0, lost = 0;
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const pass = makePass(rng, "Perfect");
    const calls = { ...activeCalls(STARTING_PLAN, pass), [call.hitter]: call };
    const spot = callSpot(call, pass.setterX);
    const block = formBlock(rng, call, spot, othersFor(call, calls, pass.setterX), "Bunch");
    const set = setQuality(STARTING_TEAM.S, call, pass);
    const defense = defenseFor(rng, emptyTendency(), spot, call.tempo).defenders;
    const o = resolveShot(rng, shot, { hitter: STARTING_TEAM[call.hitter], hitterX: spot, set, block, defense, aim: { x, y }, tempo: call.tempo }).outcome;
    if (o === "Kill") kill++; else if (o !== "Dug") lost++;
  }
  rows.push({ x, y, k: kill / N, v: (kill - lost) / N });
}
rows.sort((a, b) => b.v - a.v);
const p = (n: number) => Math.round(n * 100);
console.log(`${call.id}: best aims (kill%, kill-minus-lost)`);
for (const r of rows.slice(0, 6)) console.log(`  (${r.x.toFixed(1)}, ${r.y.toFixed(1)})  kill ${p(r.k)}  net ${p(r.v)}`);
console.log("grid of kill% (top = deep):");
for (let y = 8.6; y >= 1.5; y -= 0.7) console.log(rows.filter((r) => Math.abs(r.y - y) < 0.3).sort((a, b) => a.x - b.x).map((r) => String(p(r.k)).padStart(3)).join(""));
