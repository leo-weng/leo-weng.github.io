// Rules engine. Pure state + functions; no DOM. The UI and the bot sim both drive it step by step.
// Every swing goes through resolveSwing, which only reads the five dials (see tables.ts).
import {
  AI, CAP, COMBO, CONTROL_PER_POINT, COVER, DIALS, DIFFICULTY, DIG_CAP, DIG_GRADES, JUMP_PER_POINT, KEYED_STREAK, LATE_BLOCKER,
  Level, OUT_OF_RANGE, PASS_CUTS, PASSER_SHIFT, POWER_PER_POINT, SCORING, SERVE, SERVE_TYPES, SET_MULT, SetQuality, SHOTS, ServeType,
  ShotKind, STUFF_SHARE, TOOL, YOUR_TILE_HITS, CRACK_VALUE,
} from "./tables";

export type Side = "us" | "them";
export const other = (s: Side): Side => (s === "us" ? "them" : "us");
export type Grade = "#" | "+" | "!" | "-";
export type Role = "S" | "OH" | "MB" | "OPP" | "L";
export type PasserSkill = "strong" | "average" | "weak";
export type BlockSystem = "Bunch" | "Spread";
export type Formation = "Perimeter" | "Rotational" | "SixUp";
export type Tempo = "High" | "Combo" | "Fast";

export interface Player { id: string; role: Role; power: number; control: number; jump: number; passer: PasserSkill; trait: string }
export interface Team {
  name: string;
  side: Side;
  /** Index 0 is position 1 (the server). Positions 2-4 (indices 1-3) are the front row. */
  lineup: Player[];
  libero: Player;
  system: BlockSystem;
  formation: Formation;
  /** Hits left per tile, index row*3+col. Row 0 is by the net. 0 = broken. */
  tiles: number[];
  maxHp: number;
  score: number;
}
export interface Mods { acc: number; soft: number; power: number; spike: number; dig: number; block: number; pass: number }

export type Rng = () => number;
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Game {
  level: Level;
  us: Team;
  them: Team;
  serving: Side;
  mods: Mods;
  rng: Rng;
  rallies: number;
  winner?: Side;
  /** Our recent attacks, for their block and libero keying in. */
  track: { hitter: string; hitterStreak: number; col: number; colStreak: number };
  /** Lab notes for the last swings, newest last. */
  lab: string[];
}

// ---------- Teams ----------
const P = (id: string, role: Role, power: number, control: number, jump: number, passer: PasserSkill, trait: string): Player => ({ id, role, power, control, jump, passer, trait });
function makeTeam(side: Side, name: string, system: BlockSystem, formation: Formation, hp: number): Team {
  // Leo's 5-1: S in 1, OH1 in 2, MB2 in 3, OPP in 4, OH2 in 5, MB1 in 6.
  const lineup = side === "us"
    ? [P("S", "S", 4, 7, 5, "average", "Setter"), P("OH1", "OH", 7, 6, 6, "average", "Big arm"), P("MB2", "MB", 5, 6, 6, "weak", "Quick off two feet"),
      P("OPP", "OPP", 8, 5, 7, "weak", "Power hitter"), P("OH2", "OH", 5, 7, 5, "strong", "Steady passer"), P("MB1", "MB", 6, 5, 7, "weak", "Best blocker")]
    : [P("S", "S", 4, 6, 5, "average", "Setter"), P("OH1", "OH", 6, 6, 6, "average", "Loves the cross"), P("MB2", "MB", 5, 5, 6, "weak", "Quick"),
      P("OPP", "OPP", 7, 5, 6, "weak", "Loves the line"), P("OH2", "OH", 5, 6, 5, "strong", "Steady passer"), P("MB1", "MB", 6, 5, 7, "weak", "Big blocker")];
  return { name, side, lineup, libero: P("L", "L", 3, 7, 3, "strong", "Libero"), system, formation, tiles: Array(9).fill(hp), maxHp: hp, score: 0 };
}

export interface GameOpts { level: Level; system: BlockSystem; formation: Formation; seed?: number }
export function newGame(o: GameOpts): Game {
  const d = DIFFICULTY[o.level];
  const rng = makeRng(o.seed ?? Math.floor(Math.random() * 2 ** 31));
  return {
    level: o.level,
    us: makeTeam("us", "You", o.system, o.formation, YOUR_TILE_HITS),
    them: makeTeam("them", "Riverside", "Bunch", "Perimeter", d.tileHits),
    serving: rng() < 0.5 ? "us" : "them",
    mods: { acc: 1, soft: 1, power: 1, spike: 1, dig: 1, block: 1, pass: 0 },
    rng,
    rallies: 0,
    track: { hitter: "", hitterStreak: 0, col: -1, colStreak: 0 },
    lab: [],
  };
}
export const team = (g: Game, s: Side) => (s === "us" ? g.us : g.them);

// ---------- Court geometry ----------
// Tiles are in screen columns as seen from our side: col 0 is on our left, on both floors.
export const tileIdx = (r: number, c: number) => r * 3 + c;
export const rowOf = (i: number) => Math.floor(i / 3);
export const colOf = (i: number) => i % 3;
export const isBroken = (t: Team, i: number) => t.tiles[i] <= 0;
export const brokenCount = (t: Team) => t.tiles.filter((h) => h <= 0).length;

/** Front-row hitters: role -> screen column. Ours: OH left, MB middle, OPP right. Theirs face us, so mirrored. */
export function frontRow(t: Team): Player[] { return t.lineup.slice(1, 4); }
export function hitterCol(side: Side, role: Role): number {
  const ours: Record<string, number> = { OH: 0, MB: 1, OPP: 2 };
  const c = ours[role] ?? 1;
  return side === "us" ? c : 2 - c;
}
/** Passers on serve receive: the front-row OH (passes a step worse), the back-row OH and the libero. */
export function passers(t: Team): { p: Player; col: number; front: boolean }[] {
  const front = frontRow(t).find((p) => p.role === "OH")!;
  const back = t.lineup.find((p, i) => p.role === "OH" && (i === 0 || i > 3))!;
  const cols = t.side === "them" ? [2, 1, 0] : [0, 1, 2];
  return [{ p: front, col: cols[0], front: true }, { p: t.libero, col: cols[1], front: false }, { p: back, col: cols[2], front: false }];
}
export function rotate(t: Team) { t.lineup.push(t.lineup.shift()!); }
export function rotationNumber(t: Team): number {
  const sIdx = t.lineup.findIndex((p) => p.role === "S");
  return sIdx + 1;
}

// ---------- Passing ----------
function gradeFrom(score: number): Grade {
  return score >= PASS_CUTS["#"] ? "#" : score >= PASS_CUTS["+"] ? "+" : score >= PASS_CUTS["!"] ? "!" : "-";
}
function passGrade(g: Game, passer: { p: Player; front: boolean }, type: ServeType, bonus: number): Grade {
  const shift = PASSER_SHIFT[passer.p.passer] - (passer.front ? 0.15 : 0) - SERVE[type].pressure + bonus;
  return gradeFrom(g.rng() + shift);
}

export interface ServeResult { side: Side; type: ServeType; passerIdx: number; outcome: "ace" | "error" | "pass"; grade?: Grade; text: string }
/** Our serve: type and which of their three passers we aim at. */
export function ourServe(g: Game, type: ServeType, passerIdx: number): ServeResult {
  return serve(g, "us", type, passerIdx);
}
/** Their serve: a random type at a random passer of ours. */
export function theirServe(g: Game): ServeResult {
  const r = g.rng();
  const type: ServeType = r < 0.3 ? "Safe" : r < 0.8 ? "Float" : "Jump";
  return serve(g, "them", type, Math.floor(g.rng() * 3));
}
function serve(g: Game, side: Side, type: ServeType, passerIdx: number): ServeResult {
  const recv = team(g, other(side));
  const ps = passers(recv)[passerIdx];
  const r = g.rng();
  const s = SERVE[type];
  const who = side === "us" ? "You" : "They";
  if (r < s.ace) { award(g, side, SCORING.ace); return { side, type, passerIdx, outcome: "ace", text: `${who} ace it at ${label(ps.p, recv.side)}!` }; }
  if (r < s.ace + s.error) { award(g, other(side), SCORING.error); return { side, type, passerIdx, outcome: "error", text: `${type} serve into the net.` }; }
  const grade = passGrade(g, ps, type, recv.side === "us" ? g.mods.pass : 0);
  return { side, type, passerIdx, outcome: "pass", grade, text: `${label(ps.p, recv.side)} passes ${grade}` };
}
export const label = (p: Player, side: Side) => (side === "us" ? `your ${p.id}` : `their ${p.id}`);

// ---------- Set calls ----------
export interface Call { id: string; hitter: Player; col: number; tempo: Tempo; name: string; desc: string; enabled: boolean; why?: string }
export function setQuality(grade: Grade, tempo: Tempo): SetQuality {
  if (grade === "#") return "Perfect";
  if (grade === "+") return tempo === "High" ? "Perfect" : "Good";
  return grade === "!" ? "Good" : "Poor";
}
/** Who can be set and how, given the pass. # opens everything, + no combo, ! and - high balls only. */
export function callsFor(t: Team, grade: Grade): Call[] {
  const out: Call[] = [];
  const front = frontRow(t);
  const mbUp = front.some((p) => p.role === "MB");
  for (const h of front) {
    if (h.role === "S") continue;
    const col = hitterCol(t.side, h.role);
    const add = (tempo: Tempo, name: string, desc: string) => {
      let why: string | undefined;
      if (tempo === "Combo" && grade !== "#") why = "Needs a perfect pass";
      else if (tempo === "Combo" && !mbUp) why = "No middle to fake";
      else if (tempo !== "High" && (grade === "!" || grade === "-")) why = "Pass too far off the net";
      out.push({ id: `${h.id}-${tempo}`, hitter: h, col, tempo, name, desc, enabled: !why, why });
    };
    if (h.role === "OH") {
      add("High", `${h.id} high`, "Big swing, but they get a full block");
      add("Fast", `${h.id} fast`, "Beats the block, cross court only");
      add("Combo", `${h.id} combo`, "Middle fakes a quick, their block splits");
    } else if (h.role === "MB") {
      add("Fast", `${h.id} quick`, "Too fast to block well, short court only");
    } else {
      add("High", `${h.id} high`, "Big swing, but they get a full block");
      add("Fast", `${h.id} fast`, "Beats the block, cross court only");
    }
  }
  return out;
}

// ---------- Block ----------
export interface Blocker { lane: number; formed: boolean }
export interface BlockForm { blockers: Blocker[]; keyed: boolean }
/** Lanes a block fills, in order: the seam first, then line, then cross. A middle hitter: straight, then each side. */
function laneOrder(col: number): number[] { return col === 1 ? [1, 0, 2] : [1, col, 2 - col]; }
function blockCount(g: Game, system: BlockSystem, role: Role, tempo: Tempo): Blocker[] {
  const r = g.rng;
  const b = (formed: boolean) => ({ lane: -1, formed });
  if (tempo === "Combo") return system === "Bunch" && r() < 0.5 ? [b(true), b(false)] : [b(true)];
  if (role === "MB") return system === "Bunch" ? (r() < 0.4 ? [b(true), b(false)] : [b(true)]) : [b(false)];
  if (tempo === "Fast") return system === "Bunch" ? (r() < 0.7 ? [b(false)] : []) : [b(true)];
  return system === "Bunch" ? (r() < 0.6 ? [b(true), b(true), b(false)] : [b(true), b(true)]) : [b(true), b(true)];
}
/** Their block against our call. If you keep setting the same hitter, a blocker keys on them. */
export function formTheirBlock(g: Game, call: Call): BlockForm {
  const list = blockCount(g, g.them.system, call.hitter.role, call.tempo);
  const keyed = g.track.hitter === call.hitter.id && g.track.hitterStreak >= 2;
  if (keyed && list.length < 3) list.push({ lane: -1, formed: true });
  const lanes = laneOrder(call.col);
  list.sort((a, b) => Number(b.formed) - Number(a.formed)).forEach((bk, i) => (bk.lane = lanes[i]));
  return { blockers: list, keyed };
}

// ---------- Defense ----------
export interface Spot { tile: number; who: string }
/** Where defenders stand against a hitter in column h. Spot 1 is the libero's. */
export function defenseSpots(f: Formation, h: number, blockers: number): Spot[] {
  const line = h, cross = 2 - h;
  let spots: Spot[];
  if (h === 1) spots = f === "Perimeter" ? [{ tile: tileIdx(2, 0), who: "D" }, { tile: tileIdx(2, 1), who: "L" }, { tile: tileIdx(2, 2), who: "D" }]
    : [{ tile: tileIdx(2, 0), who: "D" }, { tile: tileIdx(1, 1), who: "L" }, { tile: tileIdx(2, 2), who: "D" }];
  else if (f === "Perimeter") spots = [{ tile: tileIdx(2, line), who: "D" }, { tile: tileIdx(2, 1), who: "L" }, { tile: tileIdx(2, cross), who: "D" }];
  else if (f === "Rotational") spots = [{ tile: tileIdx(1, line), who: "D" }, { tile: tileIdx(2, line), who: "L" }, { tile: tileIdx(2, cross), who: "D" }];
  else spots = [{ tile: tileIdx(1, 1), who: "D" }, { tile: tileIdx(2, line), who: "L" }, { tile: tileIdx(2, cross), who: "D" }];
  // Front-row players who don't block drop off the net to cover short.
  if (blockers < 3) spots.push({ tile: tileIdx(1, h === 1 ? 0 : cross), who: "B" });
  if (blockers < 2) spots.push({ tile: tileIdx(0, h === 1 ? 2 : line), who: "B" });
  return spots;
}
export function coverage(spots: Spot[], tile: number, readTile = -1): number {
  let best = 0;
  for (const s of spots) {
    const dr = Math.abs(rowOf(s.tile) - rowOf(tile)), dc = Math.abs(colOf(s.tile) - colOf(tile));
    const v = dr + dc === 0 ? COVER.on : dr + dc === 1 ? COVER.side : dr === 1 && dc === 1 ? COVER.diagonal : 0;
    best = Math.max(best, v);
  }
  return tile === readTile ? best * COVER.read : best;
}

// ---------- Swings ----------
export interface SwingCtx {
  attacker: Team;
  defender: Team;
  hitter: Player;
  col: number;
  tempo: Tempo;
  setQ: SetQuality;
  combo: boolean;
  block: BlockForm;
  spots: Spot[];
  /** Tile the defense read and protects (their keyed libero, or your puppet-master pick). */
  readTile: number;
  accMult: number;
  softMult: number;
  powerMult: number;
  spikeMult: number;
  blockMult: number;
  digMult: number;
}
/** Tiles a hard swing reaches comfortably. Out-of-range tiles are still hittable, at lower accuracy. */
export function inRange(ctx: Pick<SwingCtx, "hitter" | "col" | "tempo">, tile: number, shot: ShotKind): boolean {
  const r = rowOf(tile), c = colOf(tile);
  if (shot !== "Hard") return SHOTS[shot].rows.includes(r);
  if (ctx.hitter.role === "MB") return r <= 1;
  if (ctx.tempo === "Fast") return r >= 1 && (c === 1 || c === 2 - ctx.col);
  return r >= 1;
}
export const canAim = (tile: number, shot: ShotKind) => shot === "Hard" || SHOTS[shot].rows.includes(rowOf(tile));

export interface Odds { acc: number; blockP: number; digP: number; kill: number; tool: number; inRange: boolean; laneBlockers: number; hole: boolean }
const cap = (v: number, c = CAP) => Math.max(0, Math.min(c, v));
function accuracy(ctx: SwingCtx, tile: number, shot: ShotKind): number {
  const soft = shot === "Tip" || shot === "Roll" ? ctx.softMult : 1;
  return cap(DIALS.accuracy * ctx.accMult * soft * (1 + CONTROL_PER_POINT * (ctx.hitter.control - 5)) * (inRange(ctx, tile, shot) ? 1 : OUT_OF_RANGE)
    * SET_MULT[ctx.setQ] * (1 + SHOTS[shot].accBonus) * (ctx.combo ? 1 + COMBO.accBonus : 1));
}
function laneBlockers(ctx: SwingCtx, tile: number, shot: ShotKind): Blocker[] {
  if (shot !== "Hard" || rowOf(tile) === 0) return [];
  return ctx.block.blockers.filter((b) => b.lane === colOf(tile));
}
function blockChance(ctx: SwingCtx, b: Blocker): number {
  return cap(DIALS.block * ctx.blockMult * (b.formed ? 1 : LATE_BLOCKER) * (1 - JUMP_PER_POINT * (ctx.hitter.jump - 5)));
}
function digChance(ctx: SwingCtx, tile: number, shot: ShotKind): number {
  if (isBroken(ctx.defender, tile)) return 0;
  const power = shot === "Hard" ? (1 - POWER_PER_POINT * (ctx.hitter.power - 5)) * ctx.spikeMult : 1;
  return cap(DIALS.dig * ctx.digMult * coverage(ctx.spots, tile, ctx.readTile) * SHOTS[shot].digMult * power, DIG_CAP);
}
function toolChance(ctx: SwingCtx): number {
  const formed = ctx.block.blockers.filter((b) => b.formed).length;
  return ctx.block.blockers.length ? cap(TOOL.base + TOOL.perBlocker * formed) : TOOL.noBlock;
}
/** The odds for one tile and shot: what the color on the court comes from. */
export function odds(ctx: SwingCtx, tile: number, shot: ShotKind): Odds {
  const hole = isBroken(ctx.defender, tile);
  if (shot === "Tool") { const t = toolChance(ctx); return { acc: 1, blockP: 0, digP: 0, kill: t, tool: t, inRange: true, laneBlockers: ctx.block.blockers.length, hole: false }; }
  const acc = accuracy(ctx, tile, shot);
  const lane = laneBlockers(ctx, tile, shot);
  const blockP = 1 - lane.reduce((m, b) => m * (1 - blockChance(ctx, b)), 1);
  const digP = digChance(ctx, tile, shot);
  return { acc, blockP, digP, kill: acc * (1 - blockP) * (1 - digP), tool: 0, inRange: inRange(ctx, tile, shot), laneBlockers: lane.length, hole };
}

export type Outcome = "Kill" | "Tool" | "Stuff" | "Touch" | "Dug" | "Shank" | "Error";
export interface SwingResult {
  attackerSide: Side;
  outcome: Outcome;
  shot: ShotKind;
  aimed: number;
  landed: number | null;
  /** Lane of the blocker who touched it, if any. */
  blockedLane?: number;
  /** Who dug it, as a spot. */
  digSpot?: number;
  damage: number;
  points: number;
  broke: boolean;
  hole: boolean;
  /** Winner of the rally, or null if it goes on. */
  winner: Side | null;
  /** The pass the other side gets if the rally continues. */
  nextGrade?: Grade;
  text: string;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
function neighbors(i: number): number[] {
  const r = rowOf(i), c = colOf(i);
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < 3 && b >= 0 && b < 3).map(([a, b]) => tileIdx(a, b));
}
/** One swing, start to finish. Applies tile damage and points. */
export function resolveSwing(g: Game, ctx: SwingCtx, aimed: number, shot: ShotKind): SwingResult {
  const r = g.rng;
  const aSide = ctx.attacker.side, dSide = ctx.defender.side;
  const base = { attackerSide: aSide, shot, aimed, landed: null as number | null, damage: 0, points: 0, broke: false, hole: false };
  const who = aSide === "us" ? `Your ${ctx.hitter.id}` : `Their ${ctx.hitter.id}`;
  const lab: string[] = [`${who}: ${ctx.tempo} set (${ctx.setQ})${ctx.combo ? ", combo" : ""}, ${shot} at row ${rowOf(aimed) + 1} col ${colOf(aimed) + 1}`];
  const done = (res: Omit<SwingResult, keyof typeof base> & Partial<typeof base>): SwingResult => { g.lab.push(...lab); g.lab = g.lab.slice(-40); return { ...base, ...res }; };

  if (shot === "Tool") {
    const t = toolChance(ctx), roll = r();
    lab.push(`  tool chance ${pct(t)} with ${ctx.block.blockers.length} blocker(s), rolled ${pct(roll)}`);
    if (roll < t) { award(g, aSide, SCORING.tool); return done({ outcome: "Tool", points: SCORING.tool, winner: aSide, text: "Tooled off the block!" }); }
    if (r() < TOOL.errorOnFail || !ctx.block.blockers.length) { award(g, dSide, SCORING.error); return done({ outcome: "Error", winner: dSide, text: "Tool attempt sails out." }); }
    return done({ outcome: "Touch", winner: null, nextGrade: "+", blockedLane: ctx.block.blockers[0]?.lane, text: "Off the hands, but they keep it alive." });
  }

  // 1. Accuracy: does it go where you aimed?
  const acc = accuracy(ctx, aimed, shot), roll = r();
  lab.push(`  accuracy ${pct(acc)}${inRange(ctx, aimed, shot) ? "" : " (out of range)"}, rolled ${pct(roll)}`);
  let landed = aimed;
  if (roll >= acc) {
    if (r() < SHOTS[shot].errorOnMiss) {
      award(g, dSide, SCORING.error);
      return done({ outcome: "Error", winner: dSide, text: shot === "Hard" ? "Swung out!" : "Into the net." });
    }
    const n = neighbors(aimed);
    landed = n[Math.floor(r() * n.length)];
    lab.push(`  missed the spot, drifted to row ${rowOf(landed) + 1} col ${colOf(landed) + 1}`);
  }
  // 2. Block: hard swings into a lane with a blocker.
  for (const b of laneBlockers(ctx, landed, shot)) {
    const p = blockChance(ctx, b), br = r();
    lab.push(`  ${b.formed ? "formed" : "late"} blocker in that lane: ${pct(p)}, rolled ${pct(br)}`);
    if (br < p) {
      if (r() < STUFF_SHARE) { award(g, dSide, SCORING.stuff); return done({ outcome: "Stuff", landed: null, blockedLane: b.lane, winner: dSide, text: "Stuffed by the block!" }); }
      return done({ outcome: "Touch", landed: null, blockedLane: b.lane, winner: null, nextGrade: "+", text: "Block touch. They keep it alive." });
    }
  }
  // 3. Holes can't be defended.
  if (isBroken(ctx.defender, landed)) {
    award(g, aSide, SCORING.hole);
    lab.push(`  landed in a hole`);
    return done({ outcome: "Kill", landed, hole: true, points: SCORING.hole, winner: aSide, text: "Right into the hole!" });
  }
  // 4. Dig.
  const dp = digChance(ctx, landed, shot), dr = r();
  lab.push(`  dig chance ${pct(dp)}, rolled ${pct(dr)}`);
  if (dr < dp) {
    const spot = ctx.spots.reduce((best, s) => (Math.abs(rowOf(s.tile) - rowOf(landed)) + Math.abs(colOf(s.tile) - colOf(landed)) < Math.abs(rowOf(best) - rowOf(landed)) + Math.abs(colOf(best) - colOf(landed)) ? s.tile : best), ctx.spots[0].tile);
    const gr = r();
    if (gr < DIG_GRADES.shank) {
      // A shank cracks the tile (never breaks it) and the ball comes back free.
      const t = ctx.defender.tiles;
      const cracked = t[landed] > 1;
      if (cracked) t[landed] -= 1;
      return done({ outcome: "Shank", landed, digSpot: spot, damage: cracked ? 1 : 0, winner: null, nextGrade: "#", text: cracked ? "Shanked! The tile cracks and it's a free ball back." : "Shanked! Free ball back." });
    }
    return done({ outcome: "Dug", landed, digSpot: spot, winner: null, nextGrade: gr < DIG_GRADES.shank + DIG_GRADES.perfect ? "+" : "!", text: "Dug!" });
  }
  // 5. Kill: damage the tile; points only if it breaks.
  const dmg = Math.max(1, Math.round(SHOTS[shot].damage * ctx.powerMult * (ctx.combo ? COMBO.damageMult : 1)));
  const t = ctx.defender.tiles;
  t[landed] = Math.max(0, t[landed] - dmg);
  const broke = t[landed] === 0;
  const pts = broke ? SCORING.break : SCORING.crack;
  award(g, aSide, pts);
  lab.push(`  kill: ${dmg} damage${ctx.combo ? " (combo x2)" : ""}, ${broke ? "tile broken" : "tile cracked"}`);
  return done({ outcome: "Kill", landed, damage: dmg, points: pts, broke, winner: aSide, text: broke ? "KILL! Tile broken!" : "Kill! Tile cracked." });
}

/** What a kill on this tile is worth now: a break is 3, a hole 1, a crack counts a little as progress. */
export function killValue(ctx: SwingCtx, tile: number, shot: ShotKind): number {
  if (shot === "Tool") return SCORING.tool;
  if (isBroken(ctx.defender, tile)) return SCORING.hole;
  const dmg = Math.max(1, Math.round(SHOTS[shot].damage * ctx.powerMult * (ctx.combo ? COMBO.damageMult : 1)));
  return ctx.defender.tiles[tile] - dmg <= 0 ? SCORING.break : CRACK_VALUE;
}

export function award(g: Game, s: Side, pts: number) {
  team(g, s).score += pts;
}

// ---------- Our attack ----------
export function ourAttackCtx(g: Game, call: Call, block: BlockForm, grade: Grade): SwingCtx {
  const d = DIFFICULTY[g.level];
  const setQ = setQuality(grade, call.tempo);
  let spots = defenseSpots(g.them.formation, call.col, block.blockers.length);
  // Their libero keys on the column you keep hitting.
  let readTile = -1;
  if (g.track.colStreak >= KEYED_STREAK) {
    readTile = tileIdx(2, g.track.col);
    spots = spots.map((s) => (s.who === "L" ? { ...s, tile: readTile } : s));
  }
  return {
    attacker: g.us, defender: g.them, hitter: call.hitter, col: call.col, tempo: call.tempo, setQ, combo: grade === "#" && setQ === "Perfect", block, spots, readTile,
    accMult: d.yourAcc * g.mods.acc, softMult: g.mods.soft, powerMult: DIALS.power * d.yourPower * g.mods.power, spikeMult: g.mods.spike,
    blockMult: d.theirBlock, digMult: d.theirDig,
  };
}
/** Note what we hit, so they can key in on it next time. */
export function trackAttack(g: Game, call: Call, aimed: number) {
  const t = g.track;
  t.hitterStreak = t.hitter === call.hitter.id ? t.hitterStreak + 1 : 1;
  t.hitter = call.hitter.id;
  const c = colOf(aimed);
  t.colStreak = t.col === c ? t.colStreak + 1 : 1;
  t.col = c;
}

// ---------- Their attack ----------
export interface TheirPlan { call: Call; shot: ShotKind; target: number; habit: "line" | "cross" | "middle"; intent: string }
export function planTheirAttack(g: Game, grade: Grade): TheirPlan {
  const r = g.rng;
  const calls = callsFor(g.them, grade).filter((c) => c.enabled && c.tempo !== "Combo");
  const fast = calls.filter((c) => c.tempo === "Fast");
  const high = calls.filter((c) => c.tempo === "High");
  const pool = fast.length && (grade === "#" || grade === "+") && r() < AI.fastChance ? fast : high.length ? high : calls;
  const call = pool[Math.floor(r() * pool.length)];
  const habit = call.hitter.role === "OPP" ? "line" : call.hitter.role === "OH" ? "cross" : "middle";
  const habitCol = habit === "line" ? call.col : habit === "cross" ? 2 - call.col : 1;
  // They read your defense as it starts (not your puppet-master move) and pick a good spot, leaning on their habit.
  const draft: TheirPlan = { call, shot: "Hard", target: 4, habit, intent: "" };
  const ctx = theirAttackCtx(g, draft, formOurBlock(g, draft, -1), grade, -1);
  const opts: { tile: number; shot: ShotKind; w: number }[] = [];
  for (const shot of ["Hard", "Tip", "Roll"] as ShotKind[]) {
    for (let i = 0; i < 9; i++) {
      if (!canAim(i, shot)) continue;
      const o = odds(ctx, i, shot);
      const v = o.kill * killValue(ctx, i, shot) * AI.shots[shot as "Hard"] * (colOf(i) === habitCol ? AI.habitBoost : 1);
      opts.push({ tile: i, shot, w: v * v });
    }
  }
  let pick = r() * opts.reduce((a, o) => a + o.w, 0), choice = opts[0];
  for (const o of opts) { pick -= o.w; if (pick <= 0) { choice = o; break; } }
  const shot = choice.shot, target = choice.tile;
  const tempoWord = call.tempo === "Fast" ? (call.hitter.role === "MB" ? "a quick" : "a fast ball") : "a high ball";
  const habitWord = habit === "line" ? "loves the line" : habit === "cross" ? "loves the cross" : "hits straight down";
  return { call, shot, target, habit, intent: `Their ${call.hitter.id} gets ${tempoWord}. ${call.hitter.id} ${habitWord}.` };
}
/** Our block against their call, shifted toward the tile you chose to protect. */
export function formOurBlock(g: Game, plan: TheirPlan, protect: number): BlockForm {
  const list = blockCount(g, g.us.system, plan.call.hitter.role, plan.call.tempo);
  const lanes = laneOrder(plan.call.col);
  list.sort((a, b) => Number(b.formed) - Number(a.formed)).forEach((bk, i) => (bk.lane = lanes[i]));
  // Puppet master: if the protected tile is deep in an unblocked lane, the last blocker slides over to take it.
  if (protect >= 0 && rowOf(protect) >= 1 && list.length && !list.some((b) => b.lane === colOf(protect))) list[list.length - 1].lane = colOf(protect);
  return { blockers: list, keyed: false };
}
export function theirAttackCtx(g: Game, plan: TheirPlan, block: BlockForm, grade: Grade, protect: number): SwingCtx {
  const d = DIFFICULTY[g.level];
  let spots = defenseSpots(g.us.formation, plan.call.col, block.blockers.length);
  // Puppet master: your libero goes to the tile you protect, and reads it.
  if (protect >= 0) spots = spots.map((s) => (s.who === "L" ? { ...s, tile: protect } : s));
  const setQ = setQuality(grade, plan.call.tempo);
  return {
    attacker: g.them, defender: g.us, hitter: plan.call.hitter, col: plan.call.col, tempo: plan.call.tempo, setQ, combo: false, block, spots, readTile: protect,
    accMult: d.theirAcc, softMult: 1, powerMult: DIALS.power, spikeMult: 1, blockMult: g.mods.block, digMult: g.mods.dig,
  };
}

// ---------- End of rally ----------
/** Side out: the rally winner serves, rotating if they were receiving. */
export function endRally(g: Game, winner: Side) {
  g.rallies++;
  if (winner !== g.serving) { rotate(team(g, winner)); g.serving = winner; }
  if (g.us.score >= SCORING.toWin || g.them.score >= SCORING.toWin) g.winner = g.us.score >= g.them.score ? "us" : "them";
}

// ---------- Upgrades ----------
export interface Upgrade { id: string; name: string; desc: string; dial: string; apply: (g: Game) => void; ok?: (g: Game) => boolean }
export const UPGRADES: Upgrade[] = [
  { id: "aim", name: "Sharp eyes", desc: "Your hitters land it where they aim more often.", dial: "Accuracy", apply: (g) => (g.mods.acc *= 1.06) },
  { id: "soft", name: "Soft hands", desc: "Tips and rolls find their spot more often.", dial: "Accuracy", apply: (g) => (g.mods.soft *= 1.1) },
  { id: "spike", name: "Spike training", desc: "Your hard swings are harder to dig.", dial: "Power", apply: (g) => (g.mods.spike *= 0.9) },
  { id: "heavy", name: "Heavy hands", desc: "Every kill does more damage to their floor.", dial: "Power", apply: (g) => (g.mods.power *= 1.25) },
  { id: "dig", name: "Libero drills", desc: "Your defenders dig more balls.", dial: "Dig", apply: (g) => (g.mods.dig *= 1.12) },
  { id: "block", name: "Block drills", desc: "Your block gets more touches.", dial: "Block", apply: (g) => (g.mods.block *= 1.15) },
  { id: "pass", name: "Passing reps", desc: "More perfect passes, so more sets open up.", dial: "Options", apply: (g) => (g.mods.pass += 0.05) },
  {
    id: "patch", name: "Patch the floor", desc: "Fix one hit on your most cracked tile. Holes stay holes.", dial: "Tiles",
    ok: (g) => g.us.tiles.some((h) => h > 0 && h < g.us.maxHp),
    apply: (g) => {
      let best = -1;
      g.us.tiles.forEach((h, i) => { if (h > 0 && h < g.us.maxHp && (best < 0 || h < g.us.tiles[best])) best = i; });
      if (best >= 0) g.us.tiles[best] += 1;
    },
  },
];
export function upgradeChoices(g: Game): Upgrade[] {
  const pool = UPGRADES.filter((u) => !u.ok || u.ok(g));
  const out: Upgrade[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(g.rng() * pool.length), 1)[0]);
  return out;
}
export { SERVE_TYPES };
