// V3 step 1 model: one swing = tap one of 6 zones. Shared by the page and the tuning script.
const LANE_X = [1.5, 4.5, 7.5];
const TARGET_D = { short: 1.6, deep: 6.8 };          // distance from the net (m) of each zone's target
const R = { back: 1.9, off: 1.7 };                  // dig circle radius (m)
function rnd(rng, a, b) { return a + rng() * (b - a); }
function setup(rng) {
  const h = Math.floor(rng() * 3);                   // hitter's lane
  let lanes = [h];
  if (rng() < 0.6) lanes.push(h === 1 ? (rng() < 0.5 ? 0 : 2) : 1);
  const defs = [];
  for (let l = 0; l < 3; l++) if (!lanes.includes(l)) defs.push({ kind: "off", x: LANE_X[l] + rnd(rng, -0.9, 0.9), d: rnd(rng, 2.2, 3.6), r: R.off });
  const backX = [1.3, 4.5, 7.7];
  // Half the time their middle back plays up behind the block to pick up tips.
  const up = rng() < 0.5;
  backX.forEach((bx, i) => {
    if (up && i === 1) defs.push({ kind: "back", x: LANE_X[lanes[0]] + rnd(rng, -0.8, 0.8), d: rnd(rng, 2.6, 3.8), r: R.back });
    else defs.push({ kind: "back", x: Math.min(8.6, Math.max(0.4, bx + rnd(rng, -1.3, 1.3))), d: rnd(rng, 6.0, 8.2), r: R.back });
  });
  return { h, block: lanes, defs };
}
function zones() { const z = []; for (const depth of ["deep", "short"]) for (let l = 0; l < 3; l++) z.push({ id: `${depth}-${l}`, depth, lane: l, x: LANE_X[l], d: TARGET_D[depth] }); return z; }
function verdict(s, z) {
  if (z.depth === "deep" && s.block.includes(z.lane)) return "blocked";
  for (const p of s.defs) if (Math.hypot(p.x - z.x, p.d - z.d) <= p.r) return "dug";
  return "kill";
}
if (typeof module !== "undefined") module.exports = { setup, zones, verdict, LANE_X, TARGET_D };
