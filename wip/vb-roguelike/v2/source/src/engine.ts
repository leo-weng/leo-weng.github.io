// Rules engine. Pure state + functions; no DOM. The UI and the bot sim both drive it step by step.
// Every swing goes through resolveSwing. At the base level a swing has no dice: the block, the defenders' circles and the
// square you pick decide it, and the court shows all of it before you swing (see tables.ts).
import {
  AI, BLOCK_HOME, BLOCK_TARGETS, CHASE, COMBO, COVER, CRACK_VALUE, DIALS, DIFFICULTY, FAN, FIRM, REACH_SIZE,
  JUMP_PER_POINT, KEYED_STREAK, DEFENSE_VARY, Board, BOARD_SHIFT, BoardRow, Monster, MONSTERS, LATE_SHARE, Level, PASS_CUTS, PASSER_SHIFT, POWER_PER_POINT, SCORING, SEAM, SERVE, SERVE_TYPES,
  SetQuality, SHOTS, ServeType, ShotKind, TIMEOUT_AT, TOOL, YOUR_TILE_HITS,
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
  /** How this team defends each of the other team's hitters, locked for the game. */
  board: Board;
  /** Hits left per square, index row*6+col. Row 0 is by the net. 0 = broken (a hole). The four squares of a big tile share their hits. */
  tiles: number[];
  maxHp: number;
  score: number;
}
export interface Mods {
  power: number; spike: number; dig: number;
  /** Defense moves per ball, and how many squares one move can go. */
  moves: number; step: number;
  /** Extra half-width on your blockers' hands (m). */
  hands: number;
  /** Extra damage on every kill. */
  dmg: number;
  /** Your defenders' circles (size). */
  reach: number;
  /** The Tool shot is unlocked. */
  tool: boolean;
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
  /** How much their defense is watching each square of their floor (your recent swings, cooling over time). */
  heat: number[];
  /** Your last set, so their middle can bite on a quick. */
  lastRole: Role | "";
  lastTempo: Tempo | "";
}
export interface Game {
  level: Level;
  monster: Monster;
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
  /** Rallies until your Tool shot is back. */
  toolCd: number;
  /** Lab notes for the last swings, newest last. */
  lab: string[];
}

// ---------- Teams ----------
const P = (id: string, role: Role, power: number, control: number, jump: number, passer: PasserSkill, trait: string): Player => ({ id, role, power, control, jump, passer, trait });
function makeTeam(side: Side, name: string, system: BlockSystem, formation: Formation, hp: number, board: Board): Team {
  // Leo's 5-1: S in 1, OH1 in 2, MB2 in 3, OPP in 4, OH2 in 5, MB1 in 6.
  const lineup = side === "us"
    ? [P("S", "S", 4, 7, 5, "average", "Setter"), P("OH1", "OH", 7, 6, 6, "average", "Big arm"), P("MB2", "MB", 5, 6, 6, "weak", "Quick off two feet"),
      P("OPP", "OPP", 8, 5, 7, "weak", "Power hitter"), P("OH2", "OH", 5, 7, 5, "strong", "Steady passer"), P("MB1", "MB", 6, 5, 7, "weak", "Best blocker")]
    : [P("S", "S", 4, 6, 5, "average", "Setter"), P("OH1", "OH", 6, 6, 6, "average", "Loves the cross"), P("MB2", "MB", 5, 5, 6, "weak", "Quick"),
      P("OPP", "OPP", 7, 5, 6, "weak", "Loves the line"), P("OH2", "OH", 5, 6, 5, "strong", "Steady passer"), P("MB1", "MB", 6, 5, 7, "weak", "Big blocker")];
  return { name, side, lineup, libero: P("L", "L", 3, 7, 3, "strong", "Libero"), system, formation, board, tiles: Array(N * N).fill(hp), maxHp: hp, score: 0 };
}

export interface GameOpts { monster?: Monster; board?: Board; system: BlockSystem; formation: Formation; seed?: number; mods?: Mods; level?: Level }
export const freshMods = (): Mods => ({ power: 1, spike: 1, dig: 1, moves: 1, step: 1, hands: 0, dmg: 0, reach: 1, tool: false });
export function newGame(o: GameOpts): Game {
  const m = o.monster ?? MONSTERS[0];
  const rng = makeRng(o.seed ?? Math.floor(Math.random() * 2 ** 31));
  const them = makeTeam("them", m.name, m.system, "Perimeter", m.tileHits, { ...m.board });
  for (const p of [...them.lineup, them.libero]) {
    p.power += m.power[p.id] ?? 0;
    if (m.passers[p.id]) p.passer = m.passers[p.id];
  }
  return {
    level: m.chase === "none" ? "Normal" : m.chase,
    monster: m,
    us: makeTeam("us", "You", o.system, o.formation, YOUR_TILE_HITS, { ...(o.board ?? { OH: "bal", MB: "bal", OPP: "bal" }) }),
    them,
    serving: rng() < 0.5 ? "us" : "them",
    mods: o.mods ?? freshMods(),
    rng,
    rallies: 0,
    track: { hitter: "", hitterStreak: 0, heat: Array(N * N).fill(0), lastRole: "", lastTempo: "" },
    late: {},
    timeoutUsed: false,
    toolCd: 0,
    lab: [],
  };
}
export const team = (g: Game, s: Side) => (s === "us" ? g.us : g.them);

// ---------- Court geometry ----------
// Each floor is 6x6 squares of 1.5 m, in screen columns as seen from our side: col 0 is on our left, on both floors. Row 0 is by the net.
// Meters: x runs 0-9 along the net from the screen left; y is depth from the net, 0-9.
export const N = 6;
export const tileIdx = (r: number, c: number) => r * N + c;
export const rowOf = (i: number) => Math.floor(i / N);
export const colOf = (i: number) => i % N;
/** Which third of the court a square is in, side to side (0-2). Tells and the hitter's columns think in thirds. */
export const laneOf = (i: number) => Math.floor(colOf(i) / 2);
/** The 3x3 zone (2x2 squares) a square is in. Their chase watches zones. */
export const zoneOf = (i: number) => Math.floor(rowOf(i) / 2) * 3 + laneOf(i);
export const isBroken = (t: Team, i: number) => t.tiles[i] <= 0;
export const brokenCount = (t: Team) => t.tiles.filter((h) => h <= 0).length / 4;
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

// ---------- Squares ----------
export interface Sq { r: number; c: number }
export const sqIdx = (s: Sq) => tileIdx(s.r, s.c);
export const sqOf = (i: number): Sq => ({ r: rowOf(i), c: colOf(i) });
export const sqDist = (a: Sq, b: Sq) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
/** The four squares of a 3x3 zone. */
export function zoneSquares(z: number): Sq[] {
  const r = Math.floor(z / 3) * 2, c = (z % 3) * 2;
  return [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }];
}
export const distToZone = (s: Sq, z: number) => Math.min(...zoneSquares(z).map((q) => sqDist(s, q)));
const inCourt = (s: Sq) => s.r >= 0 && s.r < N && s.c >= 0 && s.c < N;
/** Where a square's center is, in meters: x along the net, y back from the net. */
export const sqXY = (s: Sq): [number, number] => [(s.c + 0.5) * 1.5, (s.r + 0.5) * 1.5];

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

export interface Defender { id: string; zone: Zone; sq: Sq; /** This ball's roll on the size of their circle (around 1). */ reach?: number }
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
/** Everyone not blocking, in their starting spots for this hitter. Screen columns. Nobody stands in a hole: they take the nearest open square. */
export function defenseSetup(t: Team, h: number, block: BlockForm, pick: string = "bal", tempo: Tempo = "High", rng?: Rng): Defender[] {
  const hOwn = t.side === "us" ? h : 2 - h;
  const zp = zonePlayers(t);
  const toScreen = (s: Sq): Sq => (t.side === "us" ? s : { r: s.r, c: 5 - s.c });
  const out: Defender[] = [];
  const place = (id: string, zone: Zone, want: Sq) => {
    const reach = rng ? DEFENSE_VARY.reach.min + rng() * (DEFENSE_VARY.reach.max - DEFENSE_VARY.reach.min) : 1;
    let sq = want;
    if (!standable(t, out, sq)) {
      const all = Array.from({ length: N * N }, (_, i) => sqOf(i)).filter((q) => standable(t, out, q));
      all.sort((a, b) => Math.hypot(a.r - want.r, a.c - want.c) - Math.hypot(b.r - want.r, b.c - want.c));
      sq = all[0] ?? want;
    }
    out.push({ id, zone, sq, reach });
  };
  // The board: when the block takes the line, the diggers slide toward the cross, and the other way round. Screen columns.
  const lineDir = h === 0 ? -1 : h === 2 ? 1 : 0;
  const slide = pick === "line" ? -lineDir : pick === "cross" ? lineDir : 0;
  const clampC = (c: number) => Math.max(0, Math.min(N - 1, c));
  const clampR = (r: number) => Math.max(1, Math.min(N - 1, r));
  const shifted = (s0: Sq): Sq => {
    let s = { r: s0.r, c: clampC(s0.c + slide * BOARD_SHIFT.diggers) };
    // A fast set: the side diggers tuck in toward the middle.
    if (tempo === "Fast" && (s.c === 0 || s.c === N - 1)) s = { r: s.r, c: s.c === 0 ? DEFENSE_VARY.fastTuck : N - 1 - DEFENSE_VARY.fastTuck };
    // Nobody stands in exactly the same spot every ball.
    if (rng && rng() < DEFENSE_VARY.drift.col) s = { r: s.r, c: clampC(s.c + (rng() < 0.5 ? -1 : 1)) };
    if (rng && rng() < DEFENSE_VARY.drift.row) s = { r: clampR(s.r + (rng() < 0.5 ? -1 : 1)), c: s.c };
    return s;
  };
  for (const z of ["LB", "CB", "RB"] as Zone[]) place(zp[z].id, z, shifted(toScreen(ownSpot(BACK[t.formation], z, hOwn)!)));
  for (const f of block.front) if (f.state === "off") place(f.id, f.zone, toScreen(ownSpot(OFF, f.zone, hOwn)!));
  return out;
}
/** A defender can stand here: on the court, not in a hole, and nobody else is there. */
function standable(t: Team, defs: Defender[], s: Sq, except?: Defender): boolean {
  return inCourt(s) && !isBroken(t, sqIdx(s)) && !defs.some((d) => d !== except && d.sq.r === s.r && d.sq.c === s.c);
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
function blockCount(g: Game, system: BlockSystem, role: Role, tempo: Tempo, board?: Board): boolean[] {
  const r = g.rng;
  // The middle row of the board: commit puts two on the quick and leaves the pins a blocker short; release does the opposite.
  if (board?.MB === "commit") {
    if (role === "MB") return [true, r() < 0.5];
    if (tempo !== "Combo") return tempo === "Fast" ? [] : [true, false];
  }
  if (board?.MB === "release") {
    if (role === "MB") return [false];
    if (tempo !== "Combo") return tempo === "Fast" ? [false] : [true, true, r() < 0.4];
  }
  if (tempo === "Combo") return system === "Bunch" && r() < 0.5 ? [true, false] : [true];
  if (role === "MB") return system === "Bunch" ? (r() < 0.4 ? [true, false] : [true]) : [false];
  if (tempo === "Fast") return system === "Bunch" ? (r() < 0.7 ? [false] : []) : [true];
  return system === "Bunch" ? (r() < 0.6 ? [true, true, false] : [true, true]) : [true, true];
}
/** Board row for a hitter: the opposite hits from the right side, the setter's spot counts as the right side too. */
export const boardRow = (role: Role): BoardRow => (role === "MB" ? "MB" : role === "OH" ? "OH" : "OPP");
/** Where each blocker goes, in the order they arrive. Blockers close shoulder to shoulder: one pair of hands (2 x hand) apart. */
export function blockTargets(h: number, pick: string = "bal", hand: number = FAN.hand): number[] {
  const hx = HITTER_X[h], w = 2 * hand;
  if (h === 1) return [0, -w, w].map((d) => hx + BLOCK_TARGETS.middle + d);
  const toward = h === 0 ? 1 : -1;
  // Block line: the hands slide toward the sideline. Block cross: toward the middle.
  const shift = pick === "line" ? -BOARD_SHIFT.block : pick === "cross" ? BOARD_SHIFT.block : 0;
  return [0, w, 2 * w].map((d) => hx + toward * (BLOCK_TARGETS.outside + d + shift));
}
function formBlock(t: Team, flags: boolean[], h: number, hand: number, keyed: boolean, bait: boolean, pick: string = "bal"): BlockForm {
  const homes = BLOCK_HOME[t.system];
  const zp = zonePlayers(t);
  const front: FrontPlayer[] = screenFront(t.side).map((z, i) => ({ id: zp[z].id, zone: z, home: homes[i], x: homes[i], state: "off" as const }));
  const targets = blockTargets(h, pick, hand);
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
  return formBlock(g.them, blockCount(g, g.them.system, call.hitter.role, call.tempo, g.them.board), call.col, FAN.hand * g.monster.block, keyed, bait, g.them.board[boardRow(call.hitter.role)]);
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
/** How much of a square the block covers (0-1), sampled over the square. */
export function squareShadow(b: BlockForm, i: number): number {
  const r = rowOf(i), c = colOf(i);
  let sum = 0;
  for (let a = 0; a < 4; a++) for (let k = 0; k < 4; k++) sum += blockStrengthAt(b, c * 1.5 + (a + 0.5) * 0.375, r * 1.5 + (k + 0.5) * 0.375);
  return sum / 16;
}

// ---------- Defense: dig circles and the chase ----------
/** Squares a defender could move to with one move: on the court, not a hole, not taken. */
export function moveOptions(t: Team, defs: Defender[], d: Defender, step: number): Sq[] {
  const out: Sq[] = [];
  for (let dr = -step; dr <= step; dr++) for (let dc = -step; dc <= step; dc++) {
    const s = { r: d.sq.r + dr, c: d.sq.c + dc };
    if ((dr || dc) && standable(t, defs, s, d)) out.push(s);
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
function stepToward(t: Team, defs: Defender[], d: Defender, target: Sq) {
  const opts = moveOptions(t, defs, d, 1).filter((s) => sqDist(s, target) < sqDist(d.sq, target));
  if (!opts.length) return false;
  opts.sort((a, b) => Math.hypot(a.r - target.r, a.c - target.c) - Math.hypot(b.r - target.r, b.c - target.c));
  d.sq = opts[0];
  return true;
}
/** Their defense chases where you've been hitting: a digger shades next to that square, then two pile in. */
export function chase(g: Game, defs: Defender[]): { defs: Defender[]; hot: number; level: "none" | "shade" | "camp" } {
  const c = CHASE[g.level];
  const heat = g.track.heat;
  const hot = heat.reduce((best, h, i) => (h > heat[best] ? i : best), 0);
  const h = heat[hot], target = sqOf(hot);
  const out = defs.map((d) => ({ ...d, sq: { ...d.sq } }));
  if (h < c.shade) return { defs: out, hot, level: "none" };
  const camp = h >= c.camp;
  const order = [...out].sort((a, b) => sqDist(a.sq, target) - sqDist(b.sq, target));
  // Shade: the nearest digger comes up to two steps, until they're next to it. Camp: all the way onto it, and a helper comes two steps.
  const go = (d: Defender | undefined, steps: number, stopAt: number) => { for (let k = 0; d && k < steps && sqDist(d.sq, target) > stopAt && stepToward(g.them, out, d, target); k++); };
  go(order[0], camp ? 9 : 2, camp ? 0 : 1);
  if (camp) go(order[1], 2, 1);
  return { defs: out, hot, level: camp ? "camp" : "shade" };
}
/** The zone a hitter's approach points at, from where it's hit (h) and the tell. */
export function tellZone(h: number, tell: Tell): number { return tell === "tip" ? h : tell === "line" ? 6 + h : 6 + (2 - h); }
/** The obvious answer to a tell: the nearest defender steps toward the zone it points at. Their smart AI expects you to do this. */
export function readResponse(t: Team, defs: Defender[], h: number, tell: Tell, moves: number, step: number): Defender[] {
  const out = defs.map((d) => ({ ...d, sq: { ...d.sq } }));
  const z = tellZone(h, tell);
  for (let m = 0; m < moves; m++) {
    const d = [...out].sort((a, b) => distToZone(a.sq, z) - distToZone(b.sq, z)).find((x) => distToZone(x.sq, z) > 0);
    if (!d) break;
    const opts = moveOptions(t, out, d, step).sort((a, b) => distToZone(a, z) - distToZone(b, z));
    if (opts.length) d.sq = opts[0];
  }
  return out;
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
  powerMult: number;
  /** Shrinks their circles against your hard swings (upgrades). */
  spikeMult: number;
  /** How much of a square their shadow counts for (difficulty). */
  blockMult: number;
  /** Their dig circle size (difficulty and upgrades). */
  digMult: number;
  extraDmg: number;
}
/** The shot can reach this row at all (10-foot line for hard swings, short for tips). */
export const canAim = (tile: number, shot: ShotKind) => shot !== "Tool" && SHOTS[shot].rows.includes(rowOf(tile));
/**
 * Squares this set lets you reach. A poor set can't reach the deepest row. A middle's quick goes short.
 * A fast ball to the pin only goes to the middle third or cross.
 */
export function aimable(ctx: Pick<SwingCtx, "hitter" | "col" | "tempo" | "setQ">, tile: number, shot: ShotKind): boolean {
  if (!canAim(tile, shot)) return false;
  const r = rowOf(tile), lane = laneOf(tile);
  if (ctx.setQ === "Poor" && r === N - 1) return false;
  if (shot !== "Hard") return true;
  if (ctx.hitter.role === "MB") return r <= 3;
  if (ctx.tempo === "Fast") return lane === 1 || lane === 2 - ctx.col;
  return true;
}
/** How big one defender's dig circle is against this shot (meters). */
export function digRadius(ctx: Pick<SwingCtx, "hitter" | "spikeMult" | "digMult">, d: Defender, shot: ShotKind): number {
  const power = shot === "Hard" ? (1 - POWER_PER_POINT * (ctx.hitter.power - 5)) * ctx.spikeMult : 1;
  return DIALS.dig * REACH_SIZE[d.zone] * (d.reach ?? 1) * SHOTS[shot].reach * ctx.digMult * power;
}
/** How much of a square the block covers for this hitter: their block level, less your hitter's jump. */
export function blockShade(ctx: SwingCtx, tile: number): number {
  return Math.min(1, squareShadow(ctx.block, tile) * ctx.blockMult * (1 - JUMP_PER_POINT * (ctx.hitter.jump - 5)));
}
/** What happens to a ball hit to a square, decided before you swing. */
export type Verdict = "kill" | "hole" | "clean" | "scramble" | "stuff" | "touch" | "tool" | "closed";
export interface Read { kind: Verdict; by?: Defender; shade: number; hole: boolean; win: boolean; /** A touch that goes back to the hitter's side. */ back?: boolean }
export function readSquare(ctx: SwingCtx, tile: number, shot: ShotKind): Read {
  const hole = isBroken(ctx.defender, tile);
  if (!aimable(ctx, tile, shot)) return { kind: "closed", shade: 0, hole, win: false };
  // 1. The block, for hard swings: the solid middle stuffs it, a good part of the hands keeps it alive, a clip goes out off them.
  const shade = shot === "Hard" ? blockShade(ctx, tile) : 0;
  if (shade >= FIRM.stuff) return { kind: "stuff", shade, hole, win: false };
  if (shade >= FIRM.touch) return { kind: "touch", shade, hole, win: false, back: shade >= FIRM.back };
  if (shade >= FIRM.tool) return { kind: "tool", shade, hole, win: true };
  // 2. Inside a defender's circle it's dug: near them a clean dig, at the edge a scramble.
  // Nobody stands in a hole, so a ball into one is at best a diving scramble, and a point if no circle reaches it.
  const [x, y] = sqXY(sqOf(tile));
  let by: Defender | undefined, best = Infinity;
  for (const d of ctx.defs) {
    const [dx, dy] = sqXY(d.sq);
    const n = Math.hypot(x - dx, y - dy) / digRadius(ctx, d, shot);
    if (n <= 1 && n < best) { best = n; by = d; }
  }
  if (by) return { kind: best <= COVER.inner && !hole ? "clean" : "scramble", by, shade, hole, win: false };
  return { kind: hole ? "hole" : "kill", shade, hole, win: true };
}
/** How much a square is worth to whoever's choosing (bots and their AI). */
export function verdictValue(ctx: SwingCtx, tile: number, shot: ShotKind, v: Read = readSquare(ctx, tile, shot)): number {
  switch (v.kind) {
    case "kill": return killValue(ctx, tile, shot);
    case "hole": return SCORING.hole;
    case "tool": return SCORING.tool;
    case "scramble": return AI.scramble;
    case "touch": return v.back ? 0.1 : 0;
    case "clean": return 0;
    case "stuff": return -0.5;
    default: return -1;
  }
}

export type Outcome = "Kill" | "Tool" | "Stuff" | "Touch" | "Dug" | "Shank" | "Error";
export interface SwingResult {
  attackerSide: Side;
  outcome: Outcome;
  shot: ShotKind;
  aimed: number;
  landed: number | null;
  /** Where the ball came down (meters on the defending side), when it reached the floor or a digger. */
  landAt?: [number, number];
  /** Who dug it. */
  digBy?: Defender;
  damage: number;
  points: number;
  broke: boolean;
  hole: boolean;
  /** Winner of the rally, or null if it goes on. */
  winner: Side | null;
  /** The pass the next attacker gets if the rally continues. */
  nextGrade?: Grade;
  /** The same side attacks again (a block touch knocked it back to them). */
  again?: boolean;
  text: string;
}
/** One swing, start to finish. Nothing is rolled: it plays out exactly as the court showed. Applies damage and points. */
export function resolveSwing(g: Game, ctx: SwingCtx, aimed: number, shot: ShotKind): SwingResult {
  const aSide = ctx.attacker.side, dSide = ctx.defender.side;
  const base = { attackerSide: aSide, shot, aimed, landed: null as number | null, landAt: undefined as [number, number] | undefined, damage: 0, points: 0, broke: false, hole: false };
  const who = aSide === "us" ? `Your ${ctx.hitter.id}` : `Their ${ctx.hitter.id}`;
  const lab: string[] = [`${who}: ${ctx.tempo} set (${ctx.setQ})${ctx.combo ? ", combo" : ""}, ${shot}${shot === "Tool" ? "" : ` at row ${rowOf(aimed) + 1} col ${colOf(aimed) + 1}`}`];
  const done = (res: Omit<SwingResult, keyof typeof base> & Partial<typeof base>): SwingResult => { g.lab.push(...lab); g.lab = g.lab.slice(-40); return { ...base, ...res }; };

  if (shot === "Tool") {
    if (aSide === "us") g.toolCd = TOOL.cooldown;
    if (!blockersOf(ctx.block).length) { award(g, dSide, SCORING.error); lab.push("  no block to tool"); return done({ outcome: "Error", winner: dSide, text: "No hands to use. It sails out." }); }
    lab.push(`  tooled off ${blockersOf(ctx.block).length} blocker(s)`);
    award(g, aSide, SCORING.tool);
    return done({ outcome: "Tool", points: SCORING.tool, winner: aSide, text: "Tooled off the block!" });
  }
  const v = readSquare(ctx, aimed, shot);
  lab.push(`  block covers ${Math.round(v.shade * 100)}% of the square -> ${v.kind}${v.by ? ` (${v.by.id})` : ""}`);
  const at = sqXY(sqOf(aimed));
  switch (v.kind) {
    case "closed":
    case "stuff": award(g, dSide, SCORING.stuff); return done({ outcome: "Stuff", winner: dSide, text: "Stuffed by the block!" });
    case "touch": return v.back
      ? done({ outcome: "Touch", winner: null, nextGrade: "!", again: true, text: "Block touch. It comes back to the hitter's side." })
      : done({ outcome: "Touch", winner: null, nextGrade: "+", text: "Soft block touch. It pops into their court." });
    case "tool": award(g, aSide, SCORING.tool); return done({ outcome: "Tool", points: SCORING.tool, winner: aSide, text: "Off the edge of their hands and out!" });
    case "hole": award(g, aSide, SCORING.hole); return done({ outcome: "Kill", landed: aimed, landAt: at, hole: true, points: SCORING.hole, winner: aSide, text: "Right into the hole!" });
    case "clean": return done({ outcome: "Dug", landed: aimed, landAt: at, digBy: v.by, winner: null, nextGrade: "+", text: "Great dig!" });
    case "scramble": return done({ outcome: "Dug", landed: aimed, landAt: at, digBy: v.by, winner: null, nextGrade: "!", text: "Dug, barely." });
  }
  // A kill: damage the square; points only if it breaks.
  const dmg = killDamage(ctx, shot);
  // The hit lands on a big tile: all four of its squares share the damage.
  const t = ctx.defender.tiles;
  for (const q of zoneSquares(zoneOf(aimed))) t[sqIdx(q)] = Math.max(0, t[sqIdx(q)] - dmg);
  const broke = t[aimed] === 0;
  const pts = broke ? SCORING.break : SCORING.crack;
  award(g, aSide, pts);
  lab.push(`  kill: ${dmg} damage${ctx.combo ? " (combo x2)" : ""}, ${broke ? "tile broken" : "tile cracked"}`);
  return done({ outcome: "Kill", landed: aimed, landAt: at, damage: dmg, points: pts, broke, winner: aSide, text: broke ? "KILL! Tile broken!" : "Kill! Tile cracked." });
}
function killDamage(ctx: SwingCtx, shot: ShotKind) {
  return Math.max(1, Math.round(SHOTS[shot].damage * ctx.powerMult * (ctx.combo ? COMBO.damageMult : 1)) + ctx.extraDmg);
}
/** What a kill on this square is worth now: a break is 3, a hole 1, a crack counts a little as progress. */
export function killValue(ctx: SwingCtx, tile: number, shot: ShotKind): number {
  if (shot === "Tool") return SCORING.tool;
  if (isBroken(ctx.defender, tile)) return SCORING.hole;
  return ctx.defender.tiles[tile] - killDamage(ctx, shot) <= 0 ? SCORING.break : CRACK_VALUE;
}
export function award(g: Game, s: Side, pts: number) { team(g, s).score += pts; }

// ---------- Our attack ----------
export interface TheirDefense { defs: Defender[]; hot: number; level: "none" | "shade" | "camp"; /** Where they started, before leaning toward your last swings. */ from: Defender[] }
/** Their defense against our call: their spots for this hitter, shifted toward where we've been hitting. */
export function theirDefense(g: Game, call: Call, block: BlockForm): TheirDefense {
  const from = defenseSetup(g.them, call.col, block, g.them.board[boardRow(call.hitter.role)], call.tempo, g.rng);
  // A team that holds its board doesn't lean toward your swings.
  if (g.monster.chase === "none") return { defs: from.map((d) => ({ ...d, sq: { ...d.sq } })), hot: 0, level: "none", from };
  return { ...chase(g, from), from };
}
export function ourAttackCtx(g: Game, call: Call, block: BlockForm, def: TheirDefense, grade: Grade): SwingCtx {
  const m = g.monster;
  let setQ = setQuality(grade, call.tempo);
  if (g.late.us === call.hitter.id) setQ = DOWN[setQ];
  return {
    attacker: g.us, defender: g.them, hitter: call.hitter, col: call.col, tempo: call.tempo, setQ, combo: grade === "#" && setQ === "Perfect", block, defs: def.defs,
    powerMult: DIALS.power * g.mods.power, spikeMult: g.mods.spike, blockMult: m.block, digMult: m.dig, extraDmg: g.mods.dmg,
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
  /** What their approach shows you. At the base level it's always true. */
  tell: Tell;
  /** Your block and defense as they start, before your move. */
  block: BlockForm;
  defs: Defender[];
}
function tellFor(h: number, shot: ShotKind, target: number): Tell {
  if (shot === "Tip") return "tip";
  return laneOf(target) === h ? "line" : "cross";
}
export function planTheirAttack(g: Game, grade: Grade): TheirPlan {
  const r = g.rng;
  const calls = callsFor(g.them, grade).filter((c) => c.enabled && c.tempo !== "Combo");
  const fast = calls.filter((c) => c.tempo === "Fast");
  const high = calls.filter((c) => c.tempo === "High");
  const pool = fast.length && (grade === "#" || grade === "+") && r() < g.monster.fastChance ? fast : high.length ? high : calls;
  const call = pool[Math.floor(r() * pool.length)];
  const own = g.monster.habits ?? {};
  const habit = call.hitter.role === "OPP" ? own.OPP ?? "line" : call.hitter.role === "OH" ? own.OH ?? "cross" : own.MB ?? "middle";
  const habitCol = habit === "line" ? call.col : habit === "cross" ? 2 - call.col : 1;
  const block = formBlock(g.us, blockCount(g, g.us.system, call.hitter.role, call.tempo, g.us.board), call.col, FAN.hand + g.mods.hands, false, false, g.us.board[boardRow(call.hitter.role)]);
  const defs = defenseSetup(g.us, call.col, block, g.us.board[boardRow(call.hitter.role)], call.tempo, g.rng);
  // They read your defense as it starts (not your move) and pick a good spot, leaning on their habit.
  const ctx = theirAttackCtx(g, { call }, block, defs, grade);
  // A reader also checks the spot still works after your obvious answer to their approach.
  const reader = g.monster.chase !== "none" && CHASE[g.level].brain === "Reader";
  const opts: { tile: number; shot: ShotKind; w: number }[] = [];
  for (const shot of ["Hard", "Tip", "Roll"] as ShotKind[]) {
    for (let i = 0; i < N * N; i++) {
      let val = verdictValue(ctx, i, shot);
      if (val <= 0) continue;
      if (reader) {
        const after = readResponse(g.us, defs, call.col, tellFor(call.col, shot, i), g.mods.moves, g.mods.step);
        if (!readSquare({ ...ctx, defs: after }, i, shot).win) val *= 0.1;
      }
      const v = val * AI.shots[shot as "Hard"] * (laneOf(i) === habitCol ? g.monster.habitBoost : 1);
      opts.push({ tile: i, shot, w: v * v });
    }
  }
  let pick = r() * opts.reduce((a, o) => a + o.w, 0), choice = opts[0] ?? { tile: tileIdx(3, 2), shot: "Roll" as ShotKind, w: 0 };
  for (const o of opts) { pick -= o.w; if (pick <= 0) { choice = o; break; } }
  const shot = choice.shot, target = choice.tile;
  const tell = tellFor(call.col, shot, target);
  const tempoWord = call.tempo === "Fast" ? (call.hitter.role === "MB" ? "a quick" : "a fast ball") : "a high ball";
  const habitWord = habit === "line" ? "loves the line" : habit === "cross" ? "loves the cross" : "hits straight down";
  const late = g.late.them === call.hitter.id ? ` ${call.hitter.id} passed your serve, so they're late.` : "";
  return { call, shot, target, habit, tell, block, defs, intent: `Their ${call.hitter.id} gets ${tempoWord}. ${call.hitter.id} ${habitWord}.${late}` };
}
export function theirAttackCtx(g: Game, plan: Pick<TheirPlan, "call">, block: BlockForm, defs: Defender[], grade: Grade): SwingCtx {
  let setQ = setQuality(grade, plan.call.tempo);
  if (g.late.them === plan.call.hitter.id) setQ = DOWN[setQ];
  return {
    attacker: g.them, defender: g.us, hitter: plan.call.hitter, col: plan.call.col, tempo: plan.call.tempo, setQ, combo: false, block, defs,
    powerMult: DIALS.power, spikeMult: 1, blockMult: 1, digMult: g.mods.dig * g.mods.reach, extraDmg: 0,
  };
}

// ---------- End of rally ----------
/** Side out: the rally winner serves, rotating if they were receiving. */
export function endRally(g: Game, winner: Side) {
  g.rallies++;
  g.late = {};
  if (g.toolCd > 0) g.toolCd--;
  // Rotations are parked: every team keeps the same six in the same spots.
  if (winner !== g.serving) g.serving = winner;
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
  { id: "heavy", name: "Heavy hands", desc: "Every kill does one more hit of damage.", dial: "Power", apply: (g) => (g.mods.dmg += 1) },
  { id: "spike", name: "Spike training", desc: "Their dig circles shrink against your hard swings.", dial: "Power", apply: (g) => (g.mods.spike *= 0.85) },
  { id: "feet", name: "Quick feet", desc: "Your defenders cover more ground: every circle grows.", dial: "Dig", apply: (g) => (g.mods.reach *= 1.15) },
  { id: "tool", name: "Tool shot", desc: `Unlock the Tool shot: off their hands for a point, no damage. Then it needs ${TOOL.cooldown} rallies to come back.`, dial: "Options", apply: (g) => (g.mods.tool = true), ok: (g) => !g.mods.tool },
  {
    id: "patch", name: "Patch the floor", desc: "Fully fix your most cracked tile. Holes stay holes.", dial: "Tiles",
    ok: (g) => g.us.tiles.some((h) => h > 0 && h < g.us.maxHp),
    apply: (g) => {
      let best = -1;
      g.us.tiles.forEach((h, i) => { if (h > 0 && h < g.us.maxHp && (best < 0 || h < g.us.tiles[best])) best = i; });
      if (best >= 0) for (const q of zoneSquares(zoneOf(best))) g.us.tiles[sqIdx(q)] = g.us.maxHp;
    },
  },
];
export function upgradeChoices(g: Game, exclude: string[] = []): Upgrade[] {
  const pool = UPGRADES.filter((u) => !exclude.includes(u.id) && (!u.ok || u.ok(g)));
  const out: Upgrade[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(g.rng() * pool.length), 1)[0]);
  return out;
}
export { SERVE_TYPES };
