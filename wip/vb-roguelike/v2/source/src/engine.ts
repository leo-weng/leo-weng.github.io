// Rules engine. Pure state + functions; no DOM. The UI and the bot sim both drive it step by step.
// Every swing goes through resolveSwing, which only reads the five dials (see tables.ts).
import {
  ACC_CAP, AI, BLOCK_HOME, BLOCK_TARGETS, CAP, CHASE, COMBO, HOLE_PLUG, CONTROL_PER_POINT, COVER, CRACK_VALUE, DIALS, DIFFICULTY, DIG_CAP, DIG_GRADES, FAN,
  JUMP_PER_POINT, KEYED_STREAK, LATE_SHARE, Level, OUT_OF_RANGE, PASS_CUTS, PASSER_SHIFT, POWER_PER_POINT, SCORING, SEAM, SERVE, SERVE_TYPES, SET_MULT,
  SetQuality, SHOTS, ServeType, ShotKind, TELL_FAKE, TIMEOUT_AT, TOOL, YOUR_TILE_HITS,
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
export interface Mods {
  acc: number; power: number; spike: number; dig: number;
  /** Defense moves per ball, and how many squares one move can go. */
  moves: number; step: number;
  /** Extra half-width on your blockers' hands (m). */
  hands: number;
  /** Extra damage on every kill. */
  dmg: number;
  /** Their approach never fakes you out. */
  tells: boolean;
}

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

export interface Track {
  hitter: string;
  hitterStreak: number;
  /** How much their defense is watching each of their tiles (your recent swings, cooling over time). */
  heat: number[];
  /** Your last set, so their middle can bite on a quick. */
  lastRole: Role | "";
  lastTempo: Tempo | "";
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
  track: Track;
  /** A hitter who just passed a serve is late on their approach (worse set). Cleared when the rally ends. */
  late: { us?: string; them?: string };
  timeoutUsed: boolean;
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
    mods: { acc: 1, power: 1, spike: 1, dig: 1, moves: 1, step: 1, hands: 0, dmg: 0, tells: false },
    rng,
    rallies: 0,
    track: { hitter: "", hitterStreak: 0, heat: Array(9).fill(0), lastRole: "", lastTempo: "" },
    late: {},
    timeoutUsed: false,
    lab: [],
  };
}
export const team = (g: Game, s: Side) => (s === "us" ? g.us : g.them);

// ---------- Court geometry ----------
// Tiles are in screen columns as seen from our side: col 0 is on our left, on both floors. Row 0 is by the net.
// Meters: x runs 0-9 along the net from the screen left; y is depth from the net, 0-9.
export const tileIdx = (r: number, c: number) => r * 3 + c;
export const rowOf = (i: number) => Math.floor(i / 3);
export const colOf = (i: number) => i % 3;
export const isBroken = (t: Team, i: number) => t.tiles[i] <= 0;
export const brokenCount = (t: Team) => t.tiles.filter((h) => h <= 0).length;
/** Where a hitter in each screen column attacks along the net (meters from the screen-left antenna). */
export const HITTER_X = [1.2, 4.5, 7.8];

/** Front-row hitters: role -> screen column. Ours: OH left, MB middle, OPP right. Theirs face us, so mirrored. */
export function frontRow(t: Team): Player[] { return t.lineup.slice(1, 4); }
export function hitterCol(side: Side, role: Role): number {
  const ours: Record<string, number> = { OH: 0, MB: 1, OPP: 2, S: 2 };
  const c = ours[role] ?? 1;
  return side === "us" ? c : 2 - c;
}
/** Passers on serve receive: the front-row OH (passes a step worse), the libero and the back-row OH. */
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

// ---------- Squares: each tile is 2x2 squares of 1.5 m ----------
export interface Sq { r: number; c: number }
export const sqTile = (s: Sq) => tileIdx(Math.floor(s.r / 2), Math.floor(s.c / 2));
export const sqDist = (a: Sq, b: Sq) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
export function tileSquares(t: number): Sq[] {
  const r = rowOf(t) * 2, c = colOf(t) * 2;
  return [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }];
}
export const distToTile = (s: Sq, t: number) => Math.min(...tileSquares(t).map((q) => sqDist(s, q)));
const inCourt = (s: Sq) => s.r >= 0 && s.r < 6 && s.c >= 0 && s.c < 6;

// ---------- Who plays where ----------
/** Zones from the team's own view: back row left/center/right, front row left/center/right. */
export type Zone = "LB" | "CB" | "RB" | "LF" | "CF" | "RF";
/** Back row: libero (in for the middle) left back, the back-row OH middle back, the setter or opposite right back. Front: OH left, MB middle, S or OPP right. */
export function zonePlayers(t: Team): Record<Zone, Player> {
  const front = frontRow(t);
  const back = [t.lineup[0], t.lineup[4], t.lineup[5]];
  return {
    LF: front.find((p) => p.role === "OH")!, CF: front.find((p) => p.role === "MB")!, RF: front.find((p) => p.role === "S" || p.role === "OPP")!,
    LB: t.libero, CB: back.find((p) => p.role === "OH")!, RB: back.find((p) => p.role === "S" || p.role === "OPP")!,
  };
}
/** A zone's column on screen goes left to right for us; they face us, so theirs is mirrored. */
const FRONT_ORDER: Zone[] = ["LF", "CF", "RF"];
function screenFront(side: Side): Zone[] { return side === "us" ? FRONT_ORDER : [...FRONT_ORDER].reverse(); }

export interface Defender { id: string; zone: Zone; sq: Sq }
type Spots = Partial<Record<Zone, Sq>>;
/** Back-row spots by formation, from the defending team's own view, for a hitter on their right or in the middle. */
const BACK: Record<Formation, { right: Spots; middle: Spots }> = {
  Perimeter: { right: { RB: { r: 3, c: 5 }, CB: { r: 5, c: 3 }, LB: { r: 4, c: 0 } }, middle: { LB: { r: 4, c: 0 }, CB: { r: 5, c: 2 }, RB: { r: 4, c: 5 } } },
  Rotational: { right: { RB: { r: 2, c: 5 }, CB: { r: 5, c: 4 }, LB: { r: 4, c: 0 } }, middle: { LB: { r: 4, c: 0 }, CB: { r: 5, c: 2 }, RB: { r: 4, c: 5 } } },
  SixUp: { right: { RB: { r: 4, c: 5 }, CB: { r: 2, c: 3 }, LB: { r: 4, c: 0 } }, middle: { LB: { r: 4, c: 0 }, CB: { r: 2, c: 2 }, RB: { r: 4, c: 5 } } },
};
/** Where front-row players who don't block drop to. */
const OFF: { right: Spots; middle: Spots } = {
  right: { LF: { r: 2, c: 1 }, CF: { r: 1, c: 3 }, RF: { r: 1, c: 5 } },
  middle: { LF: { r: 2, c: 0 }, RF: { r: 2, c: 5 }, CF: { r: 1, c: 2 } },
};
const MIRROR_ZONE: Record<Zone, Zone> = { LB: "RB", RB: "LB", CB: "CB", LF: "RF", RF: "LF", CF: "CF" };
/** A spot for a zone given the hitter's column from the defenders' own view (0 = on their left, 2 = right). */
function ownSpot(table: { right: Spots; middle: Spots }, zone: Zone, hOwn: number): Sq | undefined {
  if (hOwn === 1) return table.middle[zone];
  if (hOwn === 2) return table.right[zone];
  const s = table.right[MIRROR_ZONE[zone]];
  return s && { r: s.r, c: 5 - s.c };
}
/** Everyone not blocking, in their starting spots for this hitter. Screen columns. */
export function defenseSetup(t: Team, h: number, block: BlockForm): Defender[] {
  const hOwn = t.side === "us" ? h : 2 - h;
  const zp = zonePlayers(t);
  const toScreen = (s: Sq): Sq => (t.side === "us" ? s : { r: s.r, c: 5 - s.c });
  const out: Defender[] = [];
  for (const z of ["LB", "CB", "RB"] as Zone[]) out.push({ id: zp[z].id, zone: z, sq: toScreen(ownSpot(BACK[t.formation], z, hOwn)!) });
  for (const f of block.front) if (f.state === "off") out.push({ id: f.id, zone: f.zone, sq: toScreen(ownSpot(OFF, f.zone, hOwn)!) });
  return out;
}

// ---------- Passing and serving ----------
function gradeFrom(score: number): Grade {
  return score >= PASS_CUTS["#"] ? "#" : score >= PASS_CUTS["+"] ? "+" : score >= PASS_CUTS["!"] ? "!" : "-";
}
/** Serve targets: 0, 2, 4 are the three passers; 1 and 3 are the seams between them. */
export const SERVE_TARGETS = 5;
function targetPassers(recv: Team, target: number) {
  const ps = passers(recv);
  if (target % 2 === 0) return { passer: ps[target / 2], idx: target / 2, seam: false };
  const a = ps[(target - 1) / 2], b = ps[(target + 1) / 2];
  const shift = (x: typeof a) => PASSER_SHIFT[x.p.passer] - (x.front ? 0.15 : 0);
  return shift(a) <= shift(b) ? { passer: a, idx: (target - 1) / 2, seam: true } : { passer: b, idx: (target + 1) / 2, seam: true };
}
function passShift(recv: Team, target: number, type: ServeType) {
  const t = targetPassers(recv, target);
  const shift = PASSER_SHIFT[t.passer.p.passer] - (t.passer.front ? 0.15 : 0) - SERVE[type].pressure - (t.seam ? SEAM.pressure : 0);
  return { ...t, shift };
}
/** The odds of a serve, for the tint on their passers: ace, error, and a bad pass (OK or poor, so no fast sets). */
export function serveOdds(g: Game, side: Side, type: ServeType, target: number) {
  const recv = team(g, other(side));
  const t = passShift(recv, target, type);
  const ace = SERVE[type].ace + (t.seam ? SEAM.ace : 0), error = SERVE[type].error;
  const bad = Math.max(0, Math.min(1, PASS_CUTS["+"] - t.shift)) * (1 - ace - error);
  return { ace, error, bad, good: ace + bad };
}

export interface ServeResult { side: Side; type: ServeType; target: number; passerIdx: number; seam: boolean; outcome: "ace" | "error" | "pass"; grade?: Grade; text: string }
export function ourServe(g: Game, type: ServeType, target: number): ServeResult { return serve(g, "us", type, target); }
/** Their serve: a random type at a random target on our side. */
export function theirServe(g: Game): ServeResult {
  const r = g.rng();
  const type: ServeType = r < 0.3 ? "Safe" : r < 0.8 ? "Float" : "Jump";
  return serve(g, "them", type, Math.floor(g.rng() * SERVE_TARGETS));
}
function serve(g: Game, side: Side, type: ServeType, target: number): ServeResult {
  const recv = team(g, other(side));
  const t = passShift(recv, target, type);
  const o = serveOdds(g, side, type, target);
  const r = g.rng();
  const who = side === "us" ? "You" : "They";
  const base = { side, type, target, passerIdx: t.idx, seam: t.seam };
  if (r < o.ace) { award(g, side, SCORING.ace); return { ...base, outcome: "ace", text: `${who} ace it${t.seam ? " down the seam" : ` at ${label(t.passer.p, recv.side)}`}!` }; }
  if (r < o.ace + o.error) { award(g, other(side), SCORING.error); return { ...base, outcome: "error", text: `${type} serve into the net.` }; }
  const grade = gradeFrom(g.rng() + t.shift);
  // A front-row hitter who passes is late getting to their approach.
  if (t.passer.front) g.late[recv.side] = t.passer.p.id;
  return { ...base, outcome: "pass", grade, text: `${label(t.passer.p, recv.side)} passes ${grade}` };
}
export const label = (p: Player, side: Side) => (side === "us" ? `your ${p.id}` : `their ${p.id}`);

// ---------- Set calls ----------
export interface Call { id: string; hitter: Player; col: number; tempo: Tempo; name: string; desc: string; enabled: boolean; why?: string }
const DOWN: Record<SetQuality, SetQuality> = { Perfect: "Good", Good: "Poor", Poor: "Poor" };
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
export interface FrontPlayer { id: string; zone: Zone; home: number; x: number; state: "formed" | "late" | "off" }
export interface BlockForm {
  /** All three front-row players: blockers have a spot at the net (x, meters), the rest are "off" and drop back to defend. */
  front: FrontPlayer[];
  /** Hitter's column and contact point along the net. */
  h: number;
  hx: number;
  /** Half the width of each blocker's hands (m). */
  hand: number;
  keyed: boolean;
  /** Their middle bit on your last quick and is late. */
  bait: boolean;
}
export const blockersOf = (b: BlockForm) => b.front.filter((f) => f.state !== "off");
/** How many block, and whether each gets there in time. */
function blockCount(g: Game, system: BlockSystem, role: Role, tempo: Tempo): boolean[] {
  const r = g.rng;
  if (tempo === "Combo") return system === "Bunch" && r() < 0.5 ? [true, false] : [true];
  if (role === "MB") return system === "Bunch" ? (r() < 0.4 ? [true, false] : [true]) : [false];
  if (tempo === "Fast") return system === "Bunch" ? (r() < 0.7 ? [false] : []) : [true];
  return system === "Bunch" ? (r() < 0.6 ? [true, true, false] : [true, true]) : [true, true];
}
export function blockTargets(h: number): number[] {
  const hx = HITTER_X[h];
  if (h === 1) return BLOCK_TARGETS.middle.map((d) => hx + d);
  const toward = h === 0 ? 1 : -1;
  return BLOCK_TARGETS.outside.map((d) => hx + toward * d);
}
function formBlock(t: Team, flags: boolean[], h: number, hand: number, keyed: boolean, bait: boolean): BlockForm {
  const homes = BLOCK_HOME[t.system];
  const zp = zonePlayers(t);
  const front: FrontPlayer[] = screenFront(t.side).map((z, i) => ({ id: zp[z].id, zone: z, home: homes[i], x: homes[i], state: "off" as const }));
  const targets = blockTargets(h);
  const list = [...flags].sort((a, b) => Number(b) - Number(a));
  if (keyed && list.length < 3) list.push(true);
  const free = [0, 1, 2];
  list.forEach((formed, i) => {
    const target = targets[i];
    const k = free.reduce((best, j) => (Math.abs(homes[j] - target) < Math.abs(homes[best] - target) ? j : best), free[0]);
    free.splice(free.indexOf(k), 1);
    front[k].state = formed ? "formed" : "late";
    front[k].x = formed ? target : homes[k] + (target - homes[k]) * LATE_SHARE;
  });
  // Their middle bit on your last quick: they're late to this one.
  if (bait) {
    const mid = front.find((f) => f.zone === "CF" && f.state === "formed");
    if (mid) { mid.state = "late"; mid.x = mid.home + (mid.x - mid.home) * LATE_SHARE; }
  }
  return { front, h, hx: HITTER_X[h], hand, keyed, bait };
}
/** Their block against our call. Same hitter again and again: an extra blocker keys on them. Right after a quick: their middle may bite. */
export function formTheirBlock(g: Game, call: Call): BlockForm {
  const keyed = g.track.hitter === call.hitter.id && g.track.hitterStreak >= KEYED_STREAK;
  const bait = g.track.lastRole === "MB" && g.track.lastTempo === "Fast" && call.hitter.role !== "MB" && g.rng() < CHASE[g.level].bait;
  return formBlock(g.them, blockCount(g, g.them.system, call.hitter.role, call.tempo), call.col, FAN.hand, keyed, bait);
}

// ---------- The block's shadow ----------
interface Span { a: number; b: number; formed: boolean }
function spans(b: BlockForm): Span[] {
  return blockersOf(b).map((f) => ({ a: f.x - b.hand, b: f.x + b.hand, formed: f.state === "formed" })).sort((p, q) => p.a - q.a);
}
const touchesLeft = (sp: Span[], s: Span) => sp.some((o) => o !== s && o.a < s.a && o.b >= s.a - 0.15);
const touchesRight = (sp: Span[], s: Span) => sp.some((o) => o !== s && o.b > s.b && o.a <= s.b + 0.15);
/** Where a ball landing at (x, y) crossed the net, tracing back toward the hitter. */
export const toNet = (b: BlockForm, x: number, y: number) => b.hx + (x - b.hx) * FAN.depth / (y + FAN.depth);
/** And the other way: where a point on the net projects to at depth y. */
export const fromNet = (b: BlockForm, xn: number, y: number) => b.hx + (xn - b.hx) * (y + FAN.depth) / FAN.depth;
/** Shadow pieces for drawing: blockers whose hands touch merge into one fan; each fan has a weak edge and a solid core. */
export function shadowShapes(b: BlockForm): { a: number; b: number; depth: number; kind: "edge" | "core"; formed: boolean }[] {
  const groups: Span[] = [];
  for (const s of spans(b)) {
    const last = groups[groups.length - 1];
    if (last && last.formed === s.formed && s.a <= last.b + 0.15) last.b = Math.max(last.b, s.b);
    else groups.push({ ...s });
  }
  return groups.flatMap((s) => {
    const depth = s.formed ? 9 : FAN.lateDepth;
    return [{ a: s.a, b: s.b, depth, kind: "edge" as const, formed: s.formed }, { a: s.a + FAN.edge, b: s.b - FAN.edge, depth, kind: "core" as const, formed: s.formed }];
  });
}
/** How strongly the block covers a point on the floor: 1 in a formed core, weaker on the edges and for late blockers, 0 in the open. */
export function blockStrengthAt(b: BlockForm, x: number, y: number): number {
  const xn = toNet(b, x, y);
  const sp = spans(b);
  let best = 0;
  for (const s of sp) {
    if (!s.formed && y > FAN.lateDepth) continue;
    if (xn < s.a || xn > s.b) continue;
    const d = Math.min(touchesLeft(sp, s) ? Infinity : xn - s.a, touchesRight(sp, s) ? Infinity : s.b - xn);
    const core = d >= FAN.edge;
    best = Math.max(best, s.formed ? (core ? 1 : DIALS.block) : core ? FAN.lateCore : FAN.lateEdge);
  }
  return best;
}
/** How much of a tile the block covers (0-1), sampled over the tile. */
export function tileShadow(b: BlockForm, tile: number): number {
  const r = rowOf(tile), c = colOf(tile);
  let sum = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) sum += blockStrengthAt(b, c * 3 + (i + 0.5) * 0.75, r * 3 + (j + 0.5) * 0.75);
  return sum / 16;
}

// ---------- Defense: coverage and the chase ----------
export function coverage(defs: Defender[], tile: number): number {
  const v = defs.map((d) => { const k = distToTile(d.sq, tile); return k === 0 ? COVER.on : k === 1 ? COVER.near : k === 2 ? COVER.far : 0; }).sort((a, b) => b - a);
  return (v[0] ?? 0) + COVER.second * (v[1] ?? 0);
}
/** The defender who'd get to a ball on this tile. */
export function digger(defs: Defender[], tile: number): Defender | undefined {
  return [...defs].sort((a, b) => distToTile(a.sq, tile) - distToTile(b.sq, tile))[0];
}
const occupied = (defs: Defender[], s: Sq, except?: Defender) => defs.some((d) => d !== except && d.sq.r === s.r && d.sq.c === s.c);
/** Squares a defender could move to with one move. */
export function moveOptions(defs: Defender[], d: Defender, step: number): Sq[] {
  const out: Sq[] = [];
  for (let dr = -step; dr <= step; dr++) for (let dc = -step; dc <= step; dc++) {
    const s = { r: d.sq.r + dr, c: d.sq.c + dc };
    if ((dr || dc) && inCourt(s) && !occupied(defs, s, d)) out.push(s);
  }
  return out;
}
/** Spots along the net a blocker could slide to: one square (1.5 m) each way, not into another blocker. */
export function blockMoveOptions(b: BlockForm, f: FrontPlayer, step: number): number[] {
  const out: number[] = [];
  for (let k = -step; k <= step; k++) {
    const x = f.x + k * 1.5;
    if (k === 0 || x < 0.4 || x > 8.6) continue;
    if (blockersOf(b).some((o) => o !== f && Math.abs(o.x - x) < 1.1)) continue;
    out.push(x);
  }
  return out;
}
function stepToward(defs: Defender[], d: Defender, tile: number) {
  const opts = moveOptions(defs, d, 1).filter((s) => distToTile(s, tile) < distToTile(d.sq, tile));
  if (!opts.length) return false;
  const [cr, cc] = [rowOf(tile) * 2 + 0.5, colOf(tile) * 2 + 0.5];
  opts.sort((a, b) => Math.hypot(a.r - cr, a.c - cc) - Math.hypot(b.r - cr, b.c - cc));
  d.sq = opts[0];
  return true;
}
/** Their defense chases where you've been hitting: a digger shades over, then two pile in. */
export function chase(g: Game, defs: Defender[]): { defs: Defender[]; hot: number; level: "none" | "shade" | "camp" } {
  const c = CHASE[g.level];
  const heat = g.track.heat;
  const hot = heat.reduce((best, h, i) => (h > heat[best] ? i : best), 0);
  const h = heat[hot];
  const out = defs.map((d) => ({ ...d, sq: { ...d.sq } }));
  if (h < c.shade) return { defs: out, hot, level: "none" };
  // Whoever isn't already standing on it comes over: one step to shade it, all the way in (plus a helper) to camp it.
  const order = [...out].sort((a, b) => distToTile(a.sq, hot) - distToTile(b.sq, hot)).filter((d) => distToTile(d.sq, hot) > 0);
  const camp = h >= c.camp;
  const go = (d: Defender | undefined, steps: number) => { for (let k = 0; d && k < steps && distToTile(d.sq, hot) > 0 && stepToward(out, d, hot); k++); };
  go(order[0], camp ? 9 : 2);
  if (camp) go(order[1], 2);
  return { defs: out, hot, level: camp ? "camp" : "shade" };
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
  defs: Defender[];
  /** Dig multiplier per tile from their read (the tile they've camped). */
  read: number[];
  accMult: number;
  powerMult: number;
  spikeMult: number;
  blockMult: number;
  digMult: number;
  extraDmg: number;
}
/** Tiles a hard swing reaches comfortably. Out-of-range tiles are still hittable, with a bigger error risk. */
export function inRange(ctx: Pick<SwingCtx, "hitter" | "col" | "tempo">, tile: number, shot: ShotKind): boolean {
  const r = rowOf(tile), c = colOf(tile);
  if (shot !== "Hard") return SHOTS[shot].rows.includes(r);
  if (ctx.hitter.role === "MB") return r <= 1;
  if (ctx.tempo === "Fast") return r >= 1 && (c === 1 || c === 2 - ctx.col);
  return r >= 1;
}
export const canAim = (tile: number, shot: ShotKind) => shot === "Hard" || SHOTS[shot].rows.includes(rowOf(tile));
/** Can this shot go to this tile right now? A hard swing can't go through the block's solid shadow. */
export function aimable(ctx: SwingCtx, tile: number, shot: ShotKind): boolean {
  if (!canAim(tile, shot)) return false;
  return shot !== "Hard" || tileShadow(ctx.block, tile) < FAN.shadowCut;
}

export interface Odds { acc: number; blockP: number; digP: number; kill: number; tool: number; win: number; inRange: boolean; shadow: number; inShadow: boolean; hole: boolean }
const cap = (v: number, c = CAP) => Math.max(0, Math.min(c, v));
function accuracy(ctx: SwingCtx, tile: number, shot: ShotKind): number {
  return cap(DIALS.accuracy * ctx.accMult * (1 + CONTROL_PER_POINT * (ctx.hitter.control - 5)) * (inRange(ctx, tile, shot) ? 1 : OUT_OF_RANGE)
    * SET_MULT[ctx.setQ] * (1 + SHOTS[shot].accBonus) * (ctx.combo ? 1 + COMBO.accBonus : 1), ACC_CAP);
}
function blockChance(ctx: SwingCtx, tile: number, shot: ShotKind): number {
  if (shot !== "Hard") return 0;
  return cap(tileShadow(ctx.block, tile) * ctx.blockMult * (1 - JUMP_PER_POINT * (ctx.hitter.jump - 5)));
}
function digChance(ctx: SwingCtx, tile: number, shot: ShotKind): number {
  // A hole can't be dug, unless they've seen you go there again and plugged it with bodies.
  const plug = isBroken(ctx.defender, tile) ? (ctx.read[tile] > 1 ? HOLE_PLUG : 0) : 1;
  if (!plug) return 0;
  const power = shot === "Hard" ? (1 - POWER_PER_POINT * (ctx.hitter.power - 5)) * ctx.spikeMult : 1;
  return cap(DIALS.dig * ctx.digMult * coverage(ctx.defs, tile) * SHOTS[shot].digMult * power * ctx.read[tile] * plug, DIG_CAP);
}
function toolChance(ctx: SwingCtx): number {
  const bl = blockersOf(ctx.block);
  const formed = bl.filter((b) => b.state === "formed").length;
  return bl.length ? cap(TOOL.base + TOOL.perBlocker * formed) : TOOL.noBlock;
}
/** The odds for one tile and shot: what the color on the court comes from. */
export function odds(ctx: SwingCtx, tile: number, shot: ShotKind): Odds {
  const hole = isBroken(ctx.defender, tile);
  if (shot === "Tool") { const t = toolChance(ctx); return { acc: 1, blockP: 0, digP: 0, kill: 0, tool: t, win: t, inRange: true, shadow: 0, inShadow: false, hole: false }; }
  const acc = accuracy(ctx, tile, shot);
  const shadow = shot === "Hard" ? tileShadow(ctx.block, tile) : 0;
  const inShadow = shadow >= FAN.shadowCut;
  const blockP = blockChance(ctx, tile, shot);
  const digP = digChance(ctx, tile, shot);
  const kill = inShadow ? 0 : acc * (1 - blockP) * (1 - digP);
  const tool = inShadow ? 0 : acc * blockP * FAN.toolShare;
  return { acc, blockP, digP, kill, tool, win: kill + tool, inRange: inRange(ctx, tile, shot), shadow, inShadow, hole };
}

export type Outcome = "Kill" | "Tool" | "Stuff" | "Touch" | "Dug" | "Shank" | "Error";
export interface SwingResult {
  attackerSide: Side;
  outcome: Outcome;
  shot: ShotKind;
  aimed: number;
  landed: number | null;
  /** Who dug it. */
  digBy?: Defender;
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
/** One swing, start to finish. The ball goes where it's aimed unless it's an error. Applies tile damage and points. */
export function resolveSwing(g: Game, ctx: SwingCtx, aimed: number, shot: ShotKind): SwingResult {
  const r = g.rng;
  const aSide = ctx.attacker.side, dSide = ctx.defender.side;
  const base = { attackerSide: aSide, shot, aimed, landed: null as number | null, damage: 0, points: 0, broke: false, hole: false };
  const who = aSide === "us" ? `Your ${ctx.hitter.id}` : `Their ${ctx.hitter.id}`;
  const lab: string[] = [`${who}: ${ctx.tempo} set (${ctx.setQ})${ctx.combo ? ", combo" : ""}, ${shot} at row ${rowOf(aimed) + 1} col ${colOf(aimed) + 1}`];
  const done = (res: Omit<SwingResult, keyof typeof base> & Partial<typeof base>): SwingResult => { g.lab.push(...lab); g.lab = g.lab.slice(-40); return { ...base, ...res }; };

  if (shot === "Tool") {
    const t = toolChance(ctx), roll = r();
    lab.push(`  tool chance ${pct(t)} with ${blockersOf(ctx.block).length} blocker(s), rolled ${pct(roll)}`);
    if (roll < t) { award(g, aSide, SCORING.tool); return done({ outcome: "Tool", points: SCORING.tool, winner: aSide, text: "Tooled off the block!" }); }
    if (r() < TOOL.errorOnFail || !blockersOf(ctx.block).length) { award(g, dSide, SCORING.error); return done({ outcome: "Error", winner: dSide, text: "Tool attempt sails out." }); }
    return done({ outcome: "Touch", winner: null, nextGrade: "+", text: "Off the hands, but they keep it alive." });
  }

  // 1. Clean swing? The ball goes where you aimed, or it's an error.
  const acc = accuracy(ctx, aimed, shot), roll = r();
  lab.push(`  clean ${pct(acc)}${inRange(ctx, aimed, shot) ? "" : " (a reach)"}, rolled ${pct(roll)}`);
  if (roll >= acc) {
    award(g, dSide, SCORING.error);
    return done({ outcome: "Error", winner: dSide, text: shot === "Hard" ? (r() < 0.5 ? "Swung out!" : "Into the net.") : "Into the net." });
  }
  // 2. The block catches it at the edge of its shadow: a tool, a stuff, or a soft touch.
  const bp = blockChance(ctx, aimed, shot);
  if (bp > 0) {
    const br = r();
    lab.push(`  block edge ${pct(bp)}, rolled ${pct(br)}`);
    if (br < bp) {
      const k = r();
      if (k < FAN.toolShare) { award(g, aSide, SCORING.tool); return done({ outcome: "Tool", points: SCORING.tool, winner: aSide, text: "Off the edge of their hands and out!" }); }
      if (k < FAN.toolShare + FAN.stuffShare) { award(g, dSide, SCORING.stuff); return done({ outcome: "Stuff", winner: dSide, text: "Stuffed by the block!" }); }
      return done({ outcome: "Touch", winner: null, nextGrade: "+", text: "Block touch. They keep it alive." });
    }
  }
  // 3. Dig. Holes usually can't be dug.
  const hole = isBroken(ctx.defender, aimed);
  const dp = digChance(ctx, aimed, shot), dr = r();
  lab.push(`  ${hole ? "hole, " : ""}dig ${pct(dp)}${ctx.read[aimed] > 1 ? " (they read it)" : ""}, rolled ${pct(dr)}`);
  if (hole && dr >= dp) {
    award(g, aSide, SCORING.hole);
    return done({ outcome: "Kill", landed: aimed, hole: true, points: SCORING.hole, winner: aSide, text: "Right into the hole!" });
  }
  if (dr < dp) {
    const by = digger(ctx.defs, aimed);
    const gr = r();
    if (gr < DIG_GRADES.shank && !hole) {
      // A shank cracks the tile (never breaks it) and the ball comes back free.
      const t = ctx.defender.tiles;
      const cracked = t[aimed] > 1;
      if (cracked) t[aimed] -= 1;
      return done({ outcome: "Shank", landed: aimed, digBy: by, damage: cracked ? 1 : 0, winner: null, nextGrade: "#", text: cracked ? "Shanked! The tile cracks and it's a free ball back." : "Shanked! Free ball back." });
    }
    return done({ outcome: "Dug", landed: aimed, digBy: by, winner: null, nextGrade: gr < DIG_GRADES.shank + DIG_GRADES.perfect ? "+" : "!", text: "Dug!" });
  }
  // 5. Kill: damage the tile; points only if it breaks.
  const dmg = killDamage(ctx, shot);
  const t = ctx.defender.tiles;
  t[aimed] = Math.max(0, t[aimed] - dmg);
  const broke = t[aimed] === 0;
  const pts = broke ? SCORING.break : SCORING.crack;
  award(g, aSide, pts);
  lab.push(`  kill: ${dmg} damage${ctx.combo ? " (combo x2)" : ""}, ${broke ? "tile broken" : "tile cracked"}`);
  return done({ outcome: "Kill", landed: aimed, damage: dmg, points: pts, broke, winner: aSide, text: broke ? "KILL! Tile broken!" : "Kill! Tile cracked." });
}
function killDamage(ctx: SwingCtx, shot: ShotKind) {
  return Math.max(1, Math.round(SHOTS[shot].damage * ctx.powerMult * (ctx.combo ? COMBO.damageMult : 1)) + ctx.extraDmg);
}
/** What a kill on this tile is worth now: a break is 3, a hole 1, a crack counts a little as progress. */
export function killValue(ctx: SwingCtx, tile: number, shot: ShotKind): number {
  if (shot === "Tool") return SCORING.tool;
  if (isBroken(ctx.defender, tile)) return SCORING.hole;
  return ctx.defender.tiles[tile] - killDamage(ctx, shot) <= 0 ? SCORING.break : CRACK_VALUE;
}
export function award(g: Game, s: Side, pts: number) { team(g, s).score += pts; }

// ---------- Our attack ----------
export interface TheirDefense { defs: Defender[]; hot: number; level: "none" | "shade" | "camp" }
/** Their defense against our call: their spots for this hitter, shifted toward where we've been hitting. */
export function theirDefense(g: Game, call: Call, block: BlockForm): TheirDefense {
  return chase(g, defenseSetup(g.them, call.col, block));
}
export function ourAttackCtx(g: Game, call: Call, block: BlockForm, def: TheirDefense, grade: Grade): SwingCtx {
  const d = DIFFICULTY[g.level];
  let setQ = setQuality(grade, call.tempo);
  if (g.late.us === call.hitter.id) setQ = DOWN[setQ];
  const read = Array(9).fill(1);
  if (def.level === "camp") read[def.hot] = CHASE[g.level].read;
  if (def.level === "shade") read[def.hot] = 1 + (CHASE[g.level].read - 1) / 2;
  return {
    attacker: g.us, defender: g.them, hitter: call.hitter, col: call.col, tempo: call.tempo, setQ, combo: grade === "#" && setQ === "Perfect", block, defs: def.defs, read,
    accMult: d.yourAcc * g.mods.acc, powerMult: DIALS.power * d.yourPower * g.mods.power, spikeMult: g.mods.spike, blockMult: d.theirBlock, digMult: d.theirDig, extraDmg: g.mods.dmg,
  };
}
/** Note what we hit, so they can chase it. */
export function trackAttack(g: Game, call: Call, aimed: number, shot: ShotKind) {
  const t = g.track;
  t.hitterStreak = t.hitter === call.hitter.id ? t.hitterStreak + 1 : 1;
  t.hitter = call.hitter.id;
  t.lastRole = call.hitter.role;
  t.lastTempo = call.tempo;
  const decay = CHASE[g.level].decay;
  t.heat = t.heat.map((h) => h * decay);
  if (shot !== "Tool") t.heat[aimed] += 1;
}

// ---------- Their attack ----------
export type Tell = "line" | "cross" | "tip";
export interface TheirPlan {
  call: Call; shot: ShotKind; target: number; habit: "line" | "cross" | "middle"; intent: string;
  /** What their approach shows you. It can be a fake. */
  tell: Tell;
  /** Your block and defense as they start, before your move. */
  block: BlockForm;
  defs: Defender[];
}
function tellFor(h: number, shot: ShotKind, target: number): Tell {
  if (shot === "Tip") return "tip";
  return colOf(target) === h ? "line" : "cross";
}
export function planTheirAttack(g: Game, grade: Grade): TheirPlan {
  const r = g.rng;
  const calls = callsFor(g.them, grade).filter((c) => c.enabled && c.tempo !== "Combo");
  const fast = calls.filter((c) => c.tempo === "Fast");
  const high = calls.filter((c) => c.tempo === "High");
  const pool = fast.length && (grade === "#" || grade === "+") && r() < AI.fastChance ? fast : high.length ? high : calls;
  const call = pool[Math.floor(r() * pool.length)];
  const habit = call.hitter.role === "OPP" ? "line" : call.hitter.role === "OH" ? "cross" : "middle";
  const habitCol = habit === "line" ? call.col : habit === "cross" ? 2 - call.col : 1;
  const block = formBlock(g.us, blockCount(g, g.us.system, call.hitter.role, call.tempo), call.col, FAN.hand + g.mods.hands, false, false);
  const defs = defenseSetup(g.us, call.col, block);
  // They read your defense as it starts (not your move) and pick a good spot, leaning on their habit.
  const ctx = theirAttackCtx(g, { call }, block, defs, grade);
  const opts: { tile: number; shot: ShotKind; w: number }[] = [];
  for (const shot of ["Hard", "Tip", "Roll"] as ShotKind[]) {
    for (let i = 0; i < 9; i++) {
      if (!aimable(ctx, i, shot)) continue;
      const o = odds(ctx, i, shot);
      const v = (o.kill * killValue(ctx, i, shot) + o.tool) * AI.shots[shot as "Hard"] * (colOf(i) === habitCol ? AI.habitBoost : 1);
      opts.push({ tile: i, shot, w: v * v });
    }
  }
  let pick = r() * opts.reduce((a, o) => a + o.w, 0), choice = opts[0] ?? { tile: tileIdx(2, 1), shot: "Roll" as ShotKind, w: 0 };
  for (const o of opts) { pick -= o.w; if (pick <= 0) { choice = o; break; } }
  const shot = choice.shot, target = choice.tile;
  let tell = tellFor(call.col, shot, target);
  if (!g.mods.tells && r() < TELL_FAKE[g.level]) { const fakes = (["line", "cross", "tip"] as Tell[]).filter((t) => t !== tell); tell = fakes[Math.floor(r() * fakes.length)]; }
  const tempoWord = call.tempo === "Fast" ? (call.hitter.role === "MB" ? "a quick" : "a fast ball") : "a high ball";
  const habitWord = habit === "line" ? "loves the line" : habit === "cross" ? "loves the cross" : "hits straight down";
  const late = g.late.them === call.hitter.id ? ` ${call.hitter.id} passed your serve, so they're late.` : "";
  return { call, shot, target, habit, tell, block, defs, intent: `Their ${call.hitter.id} gets ${tempoWord}. ${call.hitter.id} ${habitWord}.${late}` };
}
export function theirAttackCtx(g: Game, plan: Pick<TheirPlan, "call">, block: BlockForm, defs: Defender[], grade: Grade): SwingCtx {
  const d = DIFFICULTY[g.level];
  let setQ = setQuality(grade, plan.call.tempo);
  if (g.late.them === plan.call.hitter.id) setQ = DOWN[setQ];
  return {
    attacker: g.them, defender: g.us, hitter: plan.call.hitter, col: plan.call.col, tempo: plan.call.tempo, setQ, combo: false, block, defs, read: Array(9).fill(1),
    accMult: d.theirAcc, powerMult: DIALS.power, spikeMult: 1, blockMult: 1, digMult: g.mods.dig, extraDmg: 0,
  };
}

// ---------- End of rally ----------
/** Side out: the rally winner serves, rotating if they were receiving. */
export function endRally(g: Game, winner: Side) {
  g.rallies++;
  g.late = {};
  if (winner !== g.serving) { rotate(team(g, winner)); g.serving = winner; }
  if (g.us.score >= SCORING.toWin || g.them.score >= SCORING.toWin) g.winner = g.us.score >= g.them.score ? "us" : "them";
}
/** A timeout (with an upgrade pick) the first time either team reaches TIMEOUT_AT. */
export function takeTimeout(g: Game): boolean {
  if (g.winner || g.timeoutUsed || Math.max(g.us.score, g.them.score) < TIMEOUT_AT) return false;
  g.timeoutUsed = true;
  return true;
}

// ---------- Upgrades ----------
export interface Upgrade { id: string; name: string; desc: string; dial: string; apply: (g: Game) => void; ok?: (g: Game) => boolean }
export const UPGRADES: Upgrade[] = [
  { id: "moves", name: "Second move", desc: "Move two players on defense instead of one.", dial: "Dig", apply: (g) => (g.mods.moves += 1) },
  { id: "step", name: "Long step", desc: "A defense move can go two squares.", dial: "Dig", apply: (g) => (g.mods.step = 2), ok: (g) => g.mods.step < 2 },
  { id: "hands", name: "Big hands", desc: "Your blockers' shadows get wider.", dial: "Block", apply: (g) => (g.mods.hands += 0.3) },
  { id: "film", name: "Film study", desc: "Their hitters can't fake their approach anymore.", dial: "Dig", apply: (g) => (g.mods.tells = true), ok: (g) => !g.mods.tells },
  { id: "heavy", name: "Heavy hands", desc: "Every kill does one more hit of damage.", dial: "Power", apply: (g) => (g.mods.dmg += 1) },
  { id: "spike", name: "Spike training", desc: "Your hard swings are much harder to dig.", dial: "Power", apply: (g) => (g.mods.spike *= 0.8) },
  { id: "clean", name: "Clean contact", desc: "Your hitters almost never miss.", dial: "Accuracy", apply: (g) => (g.mods.acc *= 1.04) },
  {
    id: "patch", name: "Patch the floor", desc: "Fully fix your most cracked tile. Holes stay holes.", dial: "Tiles",
    ok: (g) => g.us.tiles.some((h) => h > 0 && h < g.us.maxHp),
    apply: (g) => {
      let best = -1;
      g.us.tiles.forEach((h, i) => { if (h > 0 && h < g.us.maxHp && (best < 0 || h < g.us.tiles[best])) best = i; });
      if (best >= 0) g.us.tiles[best] = g.us.maxHp;
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
