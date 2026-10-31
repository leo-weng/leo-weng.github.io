// Rules engine for v0.1. Pure functions over data; no DOM. See spec.md §5–§8.
import { DefenseScenario, SCENARIOS } from "./defense";
import {
  BLOCK, BLOCK_START, BLOCK_STOP, BlockSystem, CONTROL_CONE_PER_POINT, COUNTER, GAME_CAP, GAME_TO, callById, Clarity, clarityFromScore,
  BLOCK_HANDS, BLOCK_TOUCH, CONTACT, HIT_WINDOW, SWING, DEFENSE_JITTER, INCOMING, Transition, TRANSITION_EFFECT, Defender, DIG, GamePlan, KEYED, OFF_BLOCKER_DEPTH, Hitter, JUMP_BLOCK_PER_POINT, OPPONENT, PASS_BONUS, PassRating, PERIMETER_DEFENSE, PIN_BLOCKER_RANGE,
  Player, Role, SET_CALLS, SET_QUALITY_EFFECT, SETTER_NEUTRAL_X, SetCall, SetQuality, Shot, ShotId, SHOTS,
  SPOT_DISTANCE_PER_PENALTY, Tempo, TEMPO_CLARITY, TEMPO_PENALTY, DIG_ODDS, DIGGER_SHIFT, Grade, GRADES, THEIR_ATTACK, THEM, OUT, ROSTER, Spot,
} from "./data";

// ---------- RNG ----------
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
export function gauss(rng: Rng): number {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- Pass (§5.0) ----------
export type PassMode = "Free ball" | "Random" | "Perfect" | "OK" | "Poor";
export interface Pass {
  rating: PassRating;
  setterX: number;
  /** How well your hitters got back into their approach (free balls are always clean). */
  transition?: Transition;
  /** Which of your hitters dug the ball they attacked: that hitter is late to get out and can only take a high ball. */
  dugBy?: Hitter;
  /** The DataVolley grade of the pass or dig, with the odds it was rolled from. */
  grade?: Grade;
  gradeOdds?: Record<Grade, number>;
  /** What came over and who dug it, for the math panel. */
  incoming?: string;
  digger?: string;
}

/** Move share of each grade one step better (shift > 0) or worse (shift < 0). Error and overpass count as the bottom. */
export function shiftGrades(o: Record<Grade, number>, shift: number): Record<Grade, number> {
  const order: Grade[] = ["=", "/", "-", "!", "+", "#"];
  const v = order.map((g) => o[g]);
  const out = [...v];
  if (shift > 0) for (let i = 0; i < 5; i++) { const m = v[i] * shift; out[i] -= m; out[i + 1] += m; }
  else if (shift < 0) for (let i = 5; i > 0; i--) { const m = v[i] * -shift; out[i] -= m; out[i - 1] += m; }
  const r = {} as Record<Grade, number>;
  order.forEach((g, i) => (r[g] = out[i]));
  return r;
}
export function rollGrade(rng: Rng, o: Record<Grade, number>): Grade {
  let r = rng();
  for (const g of GRADES) { if (r < o[g]) return g; r -= o[g]; }
  return "-";
}
/** A grade becomes a pass: how good it is and how far the setter is pulled. Overpass and error never get here. */
export function passFromGrade(rng: Rng, grade: Grade): Pass {
  const rating: PassRating = grade === "#" || grade === "+" ? 3 : grade === "!" ? 2 : 1;
  const spread = { "#": 0.25, "+": 0.6, "!": 1.0, "-": 1.8, "/": 1.8, "=": 1.8 }[grade];
  return { rating, grade, setterX: clamp(SETTER_NEUTRAL_X + gauss(rng) * spread, 2.0, 8.5) };
}

export function makePass(rng: Rng, mode: PassMode): Pass {
  if (mode === "Perfect" || mode === "OK" || mode === "Poor") return { ...passFromGrade(rng, mode === "Perfect" ? "#" : mode === "OK" ? "!" : "-"), incoming: "a fixed pass (sandbox)" };
  // Free ball: graded with the free-ball odds. Random: any kind of ball, any digger.
  const incoming = mode === "Free ball" ? "a free ball" : pickIncoming(rng);
  let odds = DIG_ODDS[incoming];
  const ok = { ...odds, "/": 0, "=": 0 };
  const tot = GRADES.reduce((a, g) => a + ok[g], 0);
  for (const g of GRADES) ok[g] /= tot;
  odds = ok;
  const grade = rollGrade(rng, odds);
  return { ...passFromGrade(rng, grade), gradeOdds: odds, incoming };
}

// ---------- Set calls (§5.1) ----------
export const callSpot = (call: SetCall, setterX: number): number =>
  clamp(call.type === "Spot" ? call.x : setterX + call.x, 0.3, 8.7);

/** Why a set can't be run off this pass, or null if it can. */
export function lockReason(call: SetCall, pass: Pass): string | null {
  if (OUT.hitters.includes(call.hitter)) return "back row this rotation";
  if (call.tempo === "High") return null;
  if (pass.dugBy === call.hitter) return "just dug it: high ball only";
  if (pass.rating < 2) return "needs a better pass";
  if (call.tempo === "Fast" && pass.transition === "Scrambled") return "scrambling: no quicks";
  // A setter pulled way off target can't push a fast ball all the way across.
  if (call.tempo === "Fast" && Math.abs(callSpotFor(call, pass.setterX) - pass.setterX) > 5.5) return "setter too far away";
  return null;
}
const callSpotFor = (call: SetCall, setterX: number) => (call.type === "Distance" ? setterX + call.x : call.x);
export const callAvailable = (call: SetCall, pass: Pass): boolean => lockReason(call, pass) === null;

export const availableCalls = (pass: Pass): SetCall[] => SET_CALLS.filter((c) => callAvailable(c, pass));

/** The calls every hitter is running this ball: the plan, with any unavailable call swapped for that hitter's default. */
export function activeCalls(plan: GamePlan, pass: Pass): Record<Hitter, SetCall> {
  const out = {} as Record<Hitter, SetCall>;
  for (const h of ["OH", "MB", "OPP"] as Hitter[]) {
    const c = callById(plan[h]);
    out[h] = callAvailable(c, pass) ? c : SET_CALLS.find((s) => s.hitter === h && s.tempo === "High") ?? c;
  }
  return out;
}

// ---------- Set quality (§6.2) ----------
export interface SetResult {
  quality: SetQuality;
  score: number;
  parts: string[];
}
export function setQuality(setter: Player, call: SetCall, pass: Pass): SetResult {
  const parts: string[] = [];
  let score = setter.stats.control;
  parts.push(`setter Control ${setter.stats.control}`);
  const pb = PASS_BONUS[pass.rating];
  score += pb;
  if (pb) parts.push(`pass ${pass.rating} ${pb > 0 ? "+" : ""}${pb}`);
  const tp = TEMPO_PENALTY[call.tempo];
  score -= tp;
  if (tp) parts.push(`${call.tempo} tempo −${tp}`);
  if (call.type === "Spot") {
    const dp = Math.floor(Math.abs(pass.setterX - SETTER_NEUTRAL_X) / SPOT_DISTANCE_PER_PENALTY);
    score -= dp;
    if (dp) parts.push(`setter pulled ${Math.abs(pass.setterX - SETTER_NEUTRAL_X).toFixed(1)} m on a spot set −${dp}`);
  }
  const quality: SetQuality = score >= 7 ? "Perfect" : score >= 4 ? "Good" : "Off";
  return { quality, score, parts };
}

// ---------- Block formation (§6.3) ----------
export type BlockerState = "Formed" | "Late" | "Missing" | "Home";
export interface Blocker {
  slot: 0 | 1 | 2; // 0 left, 1 middle, 2 right (our frame)
  startX: number;
  state: BlockerState;
  margin: number;
  delays: string[];
  /** How far off the ideal spot this blocker lines up, in meters (blocks drift ball to ball). */
  shade?: number;
}
export interface BlockResult {
  blockers: Blocker[];
  /** Where their scenario wants the blockers' hands (x at the net); the block sets up there when it gets there. */
  targets?: number[];
  /** Bunch or spread: decides whether the end blocker takes line. */
  system?: BlockSystem;
  deceived: boolean;
  frozen: boolean;
}

export function deceptionFor(call: SetCall, spot: number, others: { call: SetCall; spot: number }[]) {
  const deceived = others.some(
    (o) => Math.abs(o.spot - spot) <= BLOCK.deceptionRadius && Math.abs(o.call.time - call.time) <= BLOCK.deceptionTempoWindow,
  );
  const frozen = !call.isQuick && others.some((o) => o.call.isQuick);
  return { deceived, frozen };
}

/**
 * How their block forms against this set. `keyed` (0–1) is how keyed in they are on this hitter:
 * a hitter who gets every set is read faster.
 */
export function formBlock(
  rng: Rng, call: SetCall, spot: number, others: { call: SetCall; spot: number }[], system: BlockSystem, keyed = 0,
): BlockResult {
  const { deceived, frozen } = deceptionFor(call, spot, others);
  const fooled = BLOCK.deceptionDelay * (1.6 - OPPONENT.discipline) * (OPPONENT.fooled ?? 1);
  const speed = BLOCK.speedBase + BLOCK.speedPerPoint * (OPPONENT.blockerSpeed - 5);
  const blockers = BLOCK_START[system].map((startX, i): Blocker => {
    const slot = i as 0 | 1 | 2;
    const dist = Math.abs(spot - startX);
    if (slot !== 1 && dist > PIN_BLOCKER_RANGE) return { slot, startX, state: "Home", margin: -9, delays: [] };
    const delays: string[] = [];
    let reaction = BLOCK.readReactionBase - BLOCK.reactionPerPoint * (OPPONENT.blockerReaction - 5) + gauss(rng) * BLOCK.reactionJitter;
    if (deceived) { reaction += fooled; delays.push("fooled by a look-alike call"); }
    if (frozen && slot === 1) { reaction += BLOCK.quickFreezeDelay; delays.push("held by the quick hitter"); }
    if (keyed > 0) reaction -= KEYED.reaction * keyed;
    const mSpeed = speed + BLOCK.speedPerPoint * THEM.middleSpeed;
    const margin = call.time - (Math.max(0.05, reaction) + dist / (slot === 1 ? mSpeed * BLOCK.middleSpeed : speed));
    let state: BlockerState = margin >= BLOCK.formedMargin ? "Formed" : margin >= 0 ? "Late" : "Missing";
    // Less disciplined blocks get there but reach in the wrong spot. Closing is the middle's whole job, so they rarely do.
    const sloppy = (1 - OPPONENT.discipline) * (slot === 1 ? BLOCK.middleDiscipline : 1);
    if (state === "Formed" && rng() < sloppy) { state = "Late"; delays.push("out of position"); }
    const shade = state === "Formed" || state === "Late" ? gauss(rng) * BLOCK_HANDS.jitter[state === "Formed" ? "formed" : "late"] : 0;
    return { slot, startX, state, margin, delays, shade };
  });
  return { blockers, deceived, frozen, system };
}

export const arrived = (b: BlockResult) => b.blockers.filter((x) => x.state === "Formed" || x.state === "Late");

const isPin = (hitterX: number) => hitterX < 2.0 || hitterX > 7.0;

/**
 * Where each blocker who got there stands at contact. On a pin set the block builds from the antenna in:
 * the outside blocker takes line and the rest close inside. Otherwise it centers on the hitter.
 */
export function blockLineup(block: BlockResult, hitterX: number): Map<0 | 1 | 2, number> {
  const there = arrived(block).sort((a, b) => a.startX - b.startX);
  if (!there.length) return new Map();
  const half = (b: Blocker) => (b.state === "Formed" ? BLOCK_HANDS.formed.half : BLOCK_HANDS.late.half);
  // Disciplined blockers stand hand to hand: no gap they mean to leave, and never on top of each other.
  const gap = (a: Blocker, b: Blocker) => half(a) + half(b);
  let order: Blocker[], xs: number[];
  if (block.targets?.length) {
    // Take the scenario's spots closest to the hitter, one per blocker who got there.
    const spots = [...block.targets].sort((a, b) => Math.abs(a - hitterX) - Math.abs(b - hitterX)).slice(0, there.length).sort((a, b) => a - b);
    order = there;
    xs = order.map((_, i) => spots[Math.min(i, spots.length - 1)]);
    // Fewer spots than blockers: line the extras up beside the last one.
    for (let i = spots.length; i < order.length; i++) xs[i] = xs[i - 1] + gap(order[i - 1], order[i]);
    // Hands touch: close any gap between neighbors toward their middle.
    for (let i = 1; i < xs.length; i++) {
      const g = gap(order[i - 1], order[i]);
      if (xs[i] - xs[i - 1] > g && xs[i] - xs[i - 1] < g + 0.6) { const m = (xs[i] + xs[i - 1]) / 2; xs[i - 1] = m - g / 2; xs[i] = m + g / 2; }
    }
  } else if (isPin(hitterX)) {
    const dir = hitterX < 4.5 ? 1 : -1;
    order = [...there].sort((a, b) => dir * (a.startX - b.startX));
    const outer = clamp(hitterX + dir * (block.system === "Bunch" ? BLOCK.bunchInside : -0.1), half(order[0]), 9 - half(order[0]));
    xs = [outer];
    for (let i = 1; i < order.length; i++) xs.push(xs[i - 1] + dir * gap(order[i - 1], order[i]));
  } else {
    order = there;
    xs = [0];
    for (let i = 1; i < order.length; i++) xs.push(xs[i - 1] + gap(order[i - 1], order[i]));
    const mid = (xs[0] + xs[xs.length - 1]) / 2;
    xs = xs.map((x) => x - mid + hitterX);
  }
  // The block shades as one unit (a formed blocker's own drift is small; a late one lags on its own).
  const unit = order.filter((b) => b.state === "Formed").reduce((a, b) => a + (b.shade ?? 0), 0) / Math.max(1, order.filter((b) => b.state === "Formed").length);
  xs = xs.map((x, i) => x + unit + (order[i].state === "Late" ? (order[i].shade ?? 0) : 0));
  // On a pin set the end blocker's outside hand sits a ball to a ball and a half off the sideline (line mostly
  // closed), and everyone else closes in beside them, so the block takes away the deep cross behind it.
  if (isPin(hitterX)) {
    const dir = hitterX < 4.5 ? 1 : -1;
    const side = dir > 0 ? 0 : 9;
    const end = order.reduce((a, b, i) => (dir * xs[i] < dir * xs[order.indexOf(a)] ? b : a), order[0]);
    const ei = order.indexOf(end);
    const want = side + dir * (BLOCK.pinLineGap + half(end));
    // A late end blocker doesn't get all the way out.
    const lag = end.state === "Late" ? dir * Math.abs(end.shade ?? 0) : 0;
    const move = want + lag - xs[ei];
    xs = xs.map((x) => x + move);
    const byDist = order.map((b, i) => ({ b, i })).sort((p, q) => dir * (xs[p.i] - xs[q.i]));
    for (let k = 1; k < byDist.length; k++) xs[byDist[k].i] = xs[byDist[k - 1].i] + dir * gap(byDist[k - 1].b, byDist[k].b);
  }
  // Keep it on the court, then push apart anyone who drifted into a teammate.
  const lo = Math.min(...xs.map((x, i) => x - half(order[i]))), hi = Math.max(...xs.map((x, i) => x + half(order[i])));
  const shift = lo < 0 ? -lo : hi > 9 ? 9 - hi : 0;
  xs = xs.map((x) => x + shift);
  const byX = order.map((b, i) => ({ b, x: xs[i] })).sort((p, q) => p.x - q.x);
  for (let i = 1; i < byX.length; i++) byX[i].x = Math.max(byX[i].x, byX[i - 1].x + gap(byX[i - 1].b, byX[i].b));
  return new Map(byX.map(({ b, x }) => [b.slot, x]));
}
/** A blocker's hands at the net: what x they cover and how high they reach. */
export interface Hands { slot: 0 | 1 | 2; state: "Formed" | "Late"; x: number; half: number; top: number; stop: number }
export function blockHands(block: BlockResult, hitterX: number): Hands[] {
  const at = blockLineup(block, hitterX);
  return arrived(block).map((b) => {
    const h = b.state === "Formed" ? BLOCK_HANDS.formed : BLOCK_HANDS.late;
    return { slot: b.slot, state: b.state as "Formed" | "Late", x: at.get(b.slot)!, half: h.half, top: h.top + BLOCK_HANDS.topPerJump * (OPPONENT.blockJump + THEM.block[b.slot] - 5), stop: h.stop };
  });
}

/** How high the hitter meets the ball: Jump, set quality and transition all count. */
export const contactHeight = (ctx: Pick<AttackContext, "hitter" | "set" | "transition">) =>
  SWING.contactHeight + SWING.heightPerJump * (effectiveJump(ctx) - 5);
export const effectiveJump = (ctx: Pick<AttackContext, "hitter" | "set" | "transition">) =>
  ctx.hitter.stats.jump + SET_QUALITY_EFFECT[ctx.set.quality].jump + TRANSITION_EFFECT[ctx.transition ?? "Clean"].jump;

/** Swing angle from straight ahead (radians, + = to your right) from contact to a point on their court. */
export const swingAngle = (hitterX: number, p: { x: number; y: number }) => Math.atan2(p.x - hitterX, p.y - SWING.contactY);

/** The part of the court this set lets you swing at, as a range of angles. */
export function hitWindow(hitter: Player, hitterX: number, tempo: Tempo): { min: number; max: number; full: { min: number; max: number } } {
  const a = (x: number, y: number) => swingAngle(hitterX, { x, y });
  const full = { min: Math.min(a(0, 2.5), a(0, 9)), max: Math.max(a(9, 2.5), a(9, 9)) };
  const span = full.max - full.min;
  const middle = hitter.role === "MB";
  const stat = ((hitter.stats.jump + hitter.stats.power) / 2 - 5) * HIT_WINDOW.perStat;
  const share = clamp((middle ? HIT_WINDOW.middleShare : HIT_WINDOW.share[tempo]) + stat, 0.15, 1);
  const w = span * share;
  // Pins lean toward cross on faster sets; middles stay centered.
  const crossSide = hitterX < 4.5 ? 1 : -1;
  const lean = middle ? 0 : HIT_WINDOW.toCross[tempo];
  const center = (full.min + full.max) / 2 + crossSide * lean * (span - w) / 2;
  return { min: center - w / 2, max: center + w / 2, full };
}

/** Keep an aim inside the window: an aim past an edge swings to that edge at the same distance. */
export function clampAim(hitterX: number, p: { x: number; y: number }, win: { min: number; max: number }) {
  const ang = swingAngle(hitterX, p);
  if (ang >= win.min && ang <= win.max) return p;
  const t = ang < win.min ? win.min : win.max;
  const r = Math.hypot(p.x - hitterX, p.y - SWING.contactY);
  return { x: hitterX + Math.sin(t) * r, y: SWING.contactY + Math.cos(t) * r };
}

/** Where and how high a straight swing from contact to `land` crosses the net. */
export function netCrossing(hitterX: number, land: { x: number; y: number }, height: number) {
  const s = -SWING.contactY / Math.max(0.05, land.y - SWING.contactY);
  return { x: hitterX + (land.x - hitterX) * s, h: height * (1 - s) };
}
/** The shortest landing depth a hard swing can reach without catching the net. */
export const shortestSwing = (height: number) => {
  const need = SWING.netClear - SWING.topspin;
  return height <= need ? 9 : (-SWING.contactY * need) / (height - need);
};
/** The deepest landing a swing into this blocker's hands is still blocked (past it, the ball goes over). */
export const overDepth = (height: number, top: number) => (height <= top ? Infinity : (-SWING.contactY * top) / (height - top));

// ---------- Shot targets ----------
export function shotTarget(shot: ShotId, hitterX: number): { x: number; y: number } {
  const leftSide = hitterX < 4.5;
  const pin = hitterX < 2.0 || hitterX > 7.0;
  const toMiddle = leftSide ? 1 : -1;
  switch (shot) {
    case "Seam": return { x: pin ? (leftSide ? 4.9 : 4.1) : leftSide ? 5.2 : 3.8, y: 6.9 };
    case "Line": case "HardLine":
      return pin ? { x: leftSide ? 1.0 : 8.0, y: 7.5 } : { x: clamp(hitterX, 1.5, 7.5), y: 7.0 };
    case "Cross": case "HardCross":
      return pin ? { x: leftSide ? 7.6 : 1.4, y: 4.8 } : { x: leftSide ? 7.5 : 1.5, y: 5.5 };
    case "QLeft": return { x: 1.6, y: 3.7 };
    case "QRight": return { x: 7.4, y: 3.7 };
    case "QStraight": return { x: clamp(hitterX, 2.0, 7.0), y: 4.6 };
    case "Tip": return { x: clamp(hitterX + toMiddle * 1.0, 0.8, 8.2), y: 1.6 };
    case "Roll": return { x: clamp(hitterX + toMiddle * 2.5, 1.0, 8.0), y: 3.8 };
    case "Tool": return { x: leftSide ? -0.6 : 9.6, y: 5.0 };
  }
}

// ---------- Resolution (§8) ----------
export type Outcome = "Kill" | "Blocked" | "Dug" | "Error";
export interface AttackContext {
  hitter: Player;
  hitterX: number;
  set: SetResult;
  block: BlockResult;
  /** Where their back-court defense stands this ball (defaults to the base perimeter). */
  defense?: Defender[];
  /** What they remember about you; a shot you keep hitting gets blocked and dug more. */
  tendency?: Tendency;
  /** A rushed or scrambled hitter jumps lower and swings wilder. */
  transition?: Transition;
  /** The set's tempo: decides the hitting window (no window when left out). */
  tempo?: Tempo;
  /** How well you timed contact: 0 perfect, 1 badly early or late (defaults to a typical swing). */
  contact?: number;
  /** Easy mode: every cone is multiplied by this (under 1 = friendlier). */
  assist?: number;
  /** Where the hitter aims a hard swing (defaults to the shot's usual target). */
  aim?: { x: number; y: number };
}
export interface Resolution {
  outcome: Outcome;
  why: string[];
  land?: { x: number; y: number };
  tool?: boolean;
  /** The ball got past the block but grazed a hand on the way. */
  touch?: boolean;
}

function blockStopChance(shot: Shot, ctx: AttackContext): { p: number; note: string } {
  // On a pin set the block lines up from the antenna in: the outside blocker takes line, the next closes the seam.
  const pin = ctx.hitterX < 2.0 || ctx.hitterX > 7.0;
  const left = ctx.hitterX < 4.5;
  const there = arrived(ctx.block).sort((a, b) => pin
    ? (left ? a.startX - b.startX : b.startX - a.startX)
    : Math.abs(a.startX - ctx.hitterX) - Math.abs(b.startX - ctx.hitterX));
  if (!there.length) return { p: 0, note: "no block" };
  const row = BLOCK_STOP[shot.blockLane];
  const val = (b: Blocker) => (b.state === "Formed" ? row.formed : row.late);
  let p: number;
  if (shot.blockLane === "edge") p = val(there[0]);
  else if (shot.blockLane === "inside") p = there[1] ? val(there[1]) : val(there[0]) * 0.5;
  else if (shot.blockLane === "straight") p = val(there[0]);
  else if (shot.blockLane === "seam") {
    if (there.length >= 2) {
      const weaker = there[0].state === "Late" || there[1].state === "Late" ? row.late : row.formed;
      p = weaker;
    } else p = val(there[0]) * 0.6;
  } else p = Math.max(...there.map(val));
  if (there.length === 3 && there[2].state === "Formed") p += 0.06;
  const effJump = effectiveJump(ctx);
  const theirJump = OPPONENT.blockJump + there.reduce((a, b) => a + THEM.block[b.slot], 0) / there.length;
  const heightMul = Math.max(0.2, 1 + JUMP_BLOCK_PER_POINT * (theirJump - effJump));
  p *= heightMul;
  const formed = there.filter((b) => b.state === "Formed").length;
  const late = there.length - formed;
  return { p, note: `${there.length} blocker${there.length > 1 ? "s" : ""} (${formed} formed, ${late} late), your Jump ${effJump} vs block ${theirJump.toFixed(1)}` };
}

/** Hard swings: the ball goes where you aim, give or take your cone, and the block is wherever the hands are. */
const GEOMETRIC = new Set<Shot["blockLane"]>(["edge", "inside", "seam", "straight"]);
export const isGeometric = (shot: Shot) => GEOMETRIC.has(shot.blockLane);

/** The cone for a swing at this target: one σ along and across the swing, and the swing's direction. */
export function swingCone(shot: Shot, ctx: AttackContext, target: { x: number; y: number }) {
  const dx = target.x - ctx.hitterX, dy = target.y - SWING.contactY;
  const len = Math.hypot(dx, dy) || 1;
  const turn = Math.abs(dx) / len; // 0 straight ahead, toward 1 for a sharp angle
  const cm = coneMultiplier(ctx) * (isGeometric(shot) ? 1 + SWING.angleCone * turn : 1);
  return { along: shot.depthSpread * SWING.sigma * cm, across: shot.widthSpread * SWING.sigma * cm, ux: dx / len, uy: dy / len, cm };
}

/** Cone multiplier from contact timing: tight on a perfect contact, wide when early or late. */
export const contactCone = (miss: number) => (miss <= CONTACT.perfect ? CONTACT.perfectCone : 1 + CONTACT.coneSlope * (miss - CONTACT.perfect));

export function coneMultiplier(ctx: AttackContext): number {
  return (ctx.assist ?? 1) * contactCone(ctx.contact ?? CONTACT.average) / contactCone(CONTACT.average) * SET_QUALITY_EFFECT[ctx.set.quality].cone * TRANSITION_EFFECT[ctx.transition ?? "Clean"].cone * Math.max(0.3, 1 - CONTROL_CONE_PER_POINT * (ctx.hitter.stats.control - 5));
}

/** How far a defender reaches sideways for this ball. Forward they reach farther, backward less (see reachOval). */
export function digReach(ballSpeed: number, blockers: number): number {
  // Defenders read off their block: a formed block takes away angles, no block leaves them guessing.
  const blockHelp = DIG.noBlockReach + DIG.reachPerBlocker * blockers;
  const reachMul = (1 + DIG.defenderSpeedPerPoint * (OPPONENT.defenderSpeed - 5)) * blockHelp;
  // Slow balls give defenders time: reach grows sharply as speed drops.
  return (DIG.baseRadius * reachMul) / Math.pow(ballSpeed, ballSpeed < 1 ? DIG.offSpeedExponent : 1);
}
/** A defender's reach as an oval leaning toward the net: center, half-width and half-depth in meters. */
export function reachOval(d: { x: number; y: number }, radius: number) {
  return { x: d.x, y: d.y - radius * (DIG.forward - DIG.back) / 2, rx: radius, ry: radius * (DIG.forward + DIG.back) / 2 };
}

function digChance(land: { x: number; y: number }, ballSpeed: number, block: BlockResult, defense: Defender[], perMeter = DIG.offSpeedPerMeter): { p: number; who: string } {
  // A soft ball hangs longer the farther it goes, so a deep tip gives everyone time to get there.
  const radius = digReach(ballSpeed, arrived(block).length) * (ballSpeed < 0.5 ? 1 + perMeter * Math.max(0, land.y - 2) : 1);
  // Off-speed balls hang in the air, so a defender who gets there almost never shanks it.
  const close = ballSpeed < 0.5 ? DIG.offSpeedCloseChance : DIG.closeChance;
  const scenario = defense.some((d) => d.name.startsWith("z"));
  const offBlockers = block.blockers
    .filter((b) => b.state === "Home" && !scenario)
    .map((b) => ({ name: "off-blocker", x: b.startX < 4.5 ? 1.5 : 7.5, y: OFF_BLOCKER_DEPTH }));
  // One defender plays the ball; a second nearby one only adds a little (they can't both take it).
  const ps: { p: number; who: string }[] = [];
  for (const d of [...defense, ...offBlockers]) {
    // How far out in their oval the ball is, in sideways-meters (radius = the edge of their reach).
    // Their back row: a strong digger reaches farther, a weak one less (rotation decides who stands where).
    const r = d.y >= 4.5 ? radius * THEM.dig[d.x < 3 ? 0 : d.x > 6 ? 2 : 1] : radius;
    const o = reachOval(d, r);
    const reachDist = r * Math.hypot((land.x - o.x) / o.rx, (land.y - o.y) / o.ry);
    let p = 0;
    if (Math.hypot(d.x - land.x, d.y - land.y) <= DIG.closeRange) p = close;
    else if (reachDist < r) p = close * (1 - Math.pow(Math.max(0, reachDist - DIG.closeRange) / (r - DIG.closeRange), 2));
    p *= 1 - DIG.hardBallPenalty * Math.max(0, ballSpeed - 1);
    ps.push({ p: clamp(p, 0, 0.97), who: d.name });
  }
  ps.sort((a, b) => b.p - a.p);
  const p = ps[0].p + DIG.secondDefenderShare * ps[1].p * (1 - ps[0].p);
  return { p, who: ps[0].p > 0 ? ps[0].who : "nobody" };
}

export function resolveShot(rng: Rng, shotId: ShotId, ctx: AttackContext): Resolution {
  const shot = SHOTS.find((s) => s.id === shotId)!;
  const why: string[] = [];
  const sq = SET_QUALITY_EFFECT[ctx.set.quality];
  const st = ctx.hitter.stats;
  if (isGeometric(shot)) return resolveSwing(rng, shot, ctx, habitFor(ctx.tendency, shotId));

  // 1. Net (a mishit; hard swings can also catch the net by aiming too short, below)
  const net = Math.max(0.005, shot.netChance + sq.net - 0.01 * (st.jump + TRANSITION_EFFECT[ctx.transition ?? "Clean"].jump - 5));
  if (rng() < net) return { outcome: "Error", why: [`Into the net (${pct(net)} net chance on a ${ctx.set.quality.toLowerCase()} set).`] };

  // Tool: needs hands to use.
  if (shotId === "Tool") {
    const there = arrived(ctx.block);
    if (!there.length) {
      return { outcome: "Error", why: ["No block to tool — the ball sails wide."], tool: true };
    }
    const bs = blockStopChance(shot, ctx);
    if (rng() < bs.p) return { outcome: "Blocked", why: [`Tried to tool, but the hands stayed strong: ${bs.note}.`], tool: true };
    const miss = 0.28 * coneMultiplier(ctx);
    if (rng() < miss) return { outcome: "Error", why: ["Missed the hands — ball goes wide."], tool: true };
    return { outcome: "Kill", why: ["Off the blocker's hands and out of play."], tool: true };
  }

  // 2. Block (they sit on a shot you keep going to)
  const habit = habitFor(ctx.tendency, shotId);
  const bs = blockStopChance(shot, ctx);
  if (habit > 0 && bs.p > 0) { bs.p += KEYED.habitBlock * habit; bs.note += ", and they were sitting on it"; }
  if (rng() < bs.p) return { outcome: "Blocked", why: [`Stuffed: ${bs.note}.`] };
  if (bs.p > 0) why.push(`Beat the block: ${bs.note}.`);
  // A ball that gets by can still graze a hand: it slows down, so it's easier to dig.
  const touch = bs.p > 0 && shot.blockLane !== "over" && rng() < Math.min(BLOCK_TOUCH.max, bs.p * BLOCK_TOUCH.perStop);
  if (touch) why.push("Got a touch off the block, which slowed it down.");

  // 3. Landing point from the cone
  const t = ctx.aim ?? shotTarget(shotId, ctx.hitterX);
  const cm = coneMultiplier(ctx);
  const land = {
    x: t.x + gauss(rng) * shot.widthSpread * 0.75 * cm,
    y: t.y + gauss(rng) * shot.depthSpread * 0.75 * cm,
  };
  if (land.y > 9) return { touch, outcome: "Error", why: [...why, `Long by ${(land.y - 9).toFixed(1)} m (cone ×${cm.toFixed(2)}).`], land };
  if (land.x < 0 || land.x > 9) {
    const by = land.x < 0 ? -land.x : land.x - 9;
    return { touch, outcome: "Error", why: [...why, `Wide by ${by.toFixed(1)} m (cone ×${cm.toFixed(2)}).`], land };
  }
  land.y = Math.max(0.3, land.y);
  // A roll needs room to come down: forcing one inside the 3 m line often sails it or drops it in the net.
  if (shotId === "Roll" && land.y < 3) {
    const p = DIG.rollShortError * (3 - land.y) / 3;
    if (rng() < p) return { touch, outcome: "Error", why: [...why, `Tried to roll it in short and lost it (${pct(p)} that close to the net).`], land };
  }

  // 4. Dig
  const ballSpeed = shot.speed * (1 + DIG.powerPerPoint * (st.power - 5)) * (touch ? BLOCK_TOUCH.slow : 1);
  const dig = digChance(land, ballSpeed / (1 + KEYED.habitDig * habit), ctx.block, ctx.defense ?? PERIMETER_DEFENSE, shotId === "Tip" ? DIG.tipPerMeter : DIG.offSpeedPerMeter);
  if (rng() < dig.p) return { touch, outcome: "Dug", why: [...why, `Landed ${fmtSpot(land)}; their ${dig.who} got to it (${pct(dig.p)} dig chance).`], land };
  return { touch, outcome: "Kill", why: [...why, `Landed ${fmtSpot(land)}; ${dig.p < 0.05 ? "nobody near it" : `their ${dig.who} couldn't hold it`}.`], land };
}

/**
 * A hard swing, resolved from geometry: pick where it lands from the cone, follow the straight line from
 * contact to there, and see whether it clears the net, meets a blocker's hands or goes over them.
 */
function resolveSwing(rng: Rng, shot: Shot, ctx: AttackContext, habit: number): Resolution {
  const why: string[] = [];
  const st = ctx.hitter.stats;
  const target = ctx.aim ?? shotTarget(shot.id, ctx.hitterX);
  // Past the set's window you can still swing there, but you're reaching: wilder, softer, and more often off.
  const reach = ctx.tempo ? outsideWindow(ctx.hitter, ctx.hitterX, ctx.tempo, target) : 0;
  const c = swingCone(shot, ctx, target);
  const spray = 1 + HIT_WINDOW.outsideCone * reach;
  const a = gauss(rng) * c.along * spray, b = gauss(rng) * c.across * spray;
  const land = { x: target.x + c.ux * a - c.uy * b, y: target.y + c.uy * a + c.ux * b };
  const height = contactHeight(ctx);
  const cross = netCrossing(ctx.hitterX, land, height);

  // 1. Net: a mishit, or a swing aimed too short to get over the tape.
  const mishit = Math.max(0.005, shot.netChance + SET_QUALITY_EFFECT[ctx.set.quality].net - 0.01 * (effectiveJump(ctx) - 5));
  if (rng() < mishit) return { outcome: "Error", why: [`Into the net: a mishit (${pct(mishit)} on a ${ctx.set.quality.toLowerCase()} set).`] };
  const miss = ctx.contact ?? CONTACT.average;
  if (miss > CONTACT.shank && rng() < CONTACT.shankChance) return { outcome: "Error", why: ["Mistimed: you caught it off the wrist and shanked it."], land: { x: land.x + (land.x < ctx.hitterX ? -3 : 3), y: land.y + 2.5 } };
  if (reach > 0 && rng() < HIT_WINDOW.outsideError * reach) return { outcome: "Error", why: ["You reached for an angle this set doesn't give you and lost control of it."], land: { x: land.x + (land.x < ctx.hitterX ? -1.5 : 1.5), y: land.y + 1.5 } };
  if (land.y < 0.2 || cross.h + SWING.topspin < SWING.netClear) {
    return { outcome: "Error", why: [`Into the net: too steep. From ${height.toFixed(2)} m you can't get it down that short.`] };
  }

  // 2. Block: whose hands are where the ball crosses?
  const hands = blockHands(ctx.block, ctx.hitterX);
  let touch = false;
  const inHands = hands.filter((h) => Math.abs(cross.x - h.x) <= h.half).sort((p, q) => q.top - p.top)[0];
  if (inHands) {
    const who = inHands.state === "Formed" ? "a set blocker" : "a late blocker";
    if (cross.h > inHands.top + BLOCK_HANDS.fingertips) why.push(`Over the top of ${who}'s hands.`);
    else if (cross.h > inHands.top) { touch = true; why.push(`Off the fingertips of ${who}.`); }
    else {
      // The lower it crosses, the more hand it meets.
      const deep = clamp((inHands.top - cross.h) / 0.35, 0.35, 1);
      const p = Math.min(0.9, inHands.stop * deep + KEYED.habitBlock * habit);
      if (rng() < p) return { outcome: "Blocked", why: [`Into ${who}'s hands: they stop that ${pct(p)} of the time${habit > 0 ? ", and they were sitting on it" : ""}.`] };
      touch = rng() < 0.5;
      why.push(touch ? `Through ${who}'s hands with a touch.` : `Squeezed past ${who}'s hands.`);
    }
  } else {
    const near = hands.find((h) => Math.abs(cross.x - h.x) <= h.half + BLOCK_HANDS.edge && cross.h <= h.top + BLOCK_HANDS.fingertips);
    if (near && rng() < 0.3) { touch = true; why.push("Clipped the edge of the block."); }
    else if (hands.length) why.push("Around the block.");
  }

  // 3. In or out
  if (land.y > 9) return { touch, outcome: "Error", why: [...why, `Long by ${(land.y - 9).toFixed(1)} m.`], land };
  if (land.x < 0 || land.x > 9) return { touch, outcome: "Error", why: [...why, `Wide by ${(land.x < 0 ? -land.x : land.x - 9).toFixed(1)} m.`], land };

  // 4. Dig
  const ballSpeed = shot.speed * (1 + DIG.powerPerPoint * (st.power - 5)) * (touch ? BLOCK_TOUCH.slow : 1) * (1 - HIT_WINDOW.outsideSlow * Math.min(1, reach));
  const dig = digChance(land, ballSpeed / (1 + KEYED.habitDig * habit), ctx.block, ctx.defense ?? PERIMETER_DEFENSE);
  if (rng() < dig.p) return { touch, outcome: "Dug", why: [...why, `Landed ${fmtSpot(land)}; their ${dig.who} got to it (${pct(dig.p)} dig chance).`], land };
  return { touch, outcome: "Kill", why: [...why, `Landed ${fmtSpot(land)}; ${dig.p < 0.05 ? "nobody near it" : `their ${dig.who} couldn't hold it`}.`], land };
}

/** How far past the set's window a spot is: 0 inside, 1 about 20 degrees past an edge. */
export function outsideWindow(hitter: Player, hitterX: number, tempo: Tempo, p: { x: number; y: number }) {
  const w = hitWindow(hitter, hitterX, tempo), a = swingAngle(hitterX, p);
  return Math.max(0, w.min - a, a - w.max) / 0.35;
}

/**
 * Names a free aim so every swing has a plain name: pins swing line, seam or cross by how far across the
 * court it goes; middles hit left, straight or right. The name also picks the swing's cone.
 */
export function nearestShot(hitter: Hitter, hitterX: number, aim: { x: number; y: number }): ShotId {
  const across = aim.x - hitterX;
  if (hitter === "MB") return across < -1.6 ? "QLeft" : across > 1.6 ? "QRight" : "QStraight";
  const f = Math.abs(across);
  return f < 1.8 ? "Line" : f > 5.2 ? "Cross" : "Seam";
}
/** "Deep" or "short" when a swing goes well past or well short of mid-court. */
export const depthWord = (y: number) => (y > 7.4 ? "Deep " : y < 3.3 ? "Short " : "");

const pct = (p: number) => `${Math.round(p * 100)}%`;
const fmtSpot = (l: { x: number; y: number }) => `${l.y < 3 ? "short" : l.y > 6.5 ? "deep" : "mid-court"}, ${l.x < 3 ? "left" : l.x > 6 ? "right" : "middle"}`;

// ---------- Odds preview (§8, §9) ----------
export type Odds = Record<Outcome, number>;
export interface OddsRange {
  lo: Odds;
  hi: Odds;
  mid: Odds;
}

export function simulateOdds(shotId: ShotId, ctx: AttackContext, n = 1500, seed = 7): Odds {
  const rng = makeRng(seed);
  const c: Odds = { Kill: 0, Blocked: 0, Dug: 0, Error: 0 };
  for (let i = 0; i < n; i++) c[resolveShot(rng, shotId, ctx).outcome]++;
  for (const k in c) c[k as Outcome] /= n;
  return c;
}

const shift = (b: BlockResult, dir: 1 | -1): BlockResult => ({
  ...b,
  blockers: b.blockers.map((x) => {
    if (x.state === "Home") return x;
    const order: BlockerState[] = ["Missing", "Late", "Formed"];
    const i = clamp(order.indexOf(x.state) + dir, 0, 2);
    return { ...x, state: order[i] };
  }),
});

/** What the hitter believes the odds are, given their clarity. Clear = exact; Fuzzy = range over a block one step better/worse; Blind = averaged over how the block usually forms. */
export function previewOdds(shotId: ShotId, ctx: AttackContext, clarity: Clarity, priorBlocks: BlockResult[]): OddsRange {
  if (clarity === "Clear") {
    const o = simulateOdds(shotId, ctx);
    return { lo: o, hi: o, mid: o };
  }
  if (clarity === "Fuzzy") {
    const variants = [ctx.block, shift(ctx.block, 1), shift(ctx.block, -1)].map((block) => simulateOdds(shotId, { ...ctx, block }, 800));
    const lo = {} as Odds, hi = {} as Odds;
    for (const k of ["Kill", "Blocked", "Dug", "Error"] as Outcome[]) {
      lo[k] = Math.min(...variants.map((v) => v[k]));
      hi[k] = Math.max(...variants.map((v) => v[k]));
    }
    return { lo, hi, mid: variants[0] };
  }
  const acc: Odds = { Kill: 0, Blocked: 0, Dug: 0, Error: 0 };
  for (const block of priorBlocks) {
    const o = simulateOdds(shotId, { ...ctx, block }, 300);
    for (const k in acc) acc[k as Outcome] += o[k as Outcome] / priorBlocks.length;
  }
  return { lo: acc, hi: acc, mid: acc };
}

// ---------- Heat map (v0.3) ----------
export interface HeatCell { x: number; y: number; odds: Odds }
export const HEAT_STEP = 0.5;
/**
 * Odds of a hard swing aimed at each spot of their court, from the same rules that decide the point.
 * Spots outside the set's window are left out. `blocks` averages over several possible blocks (a blind read).
 */
export function heatMap(ctx: AttackContext, kind: ShotId | "Hard", blocks: BlockResult[] = [ctx.block], n = 36): HeatCell[] {
  const out: HeatCell[] = [];
  const role = ctx.hitter.role === "MB" ? "MB" : ctx.hitterX < 4.5 ? "OH" : "OPP";
  const per = Math.max(8, Math.round(n / blocks.length));
  for (let y = HEAT_STEP / 2; y < 9; y += HEAT_STEP) for (let x = HEAT_STEP / 2; x < 9; x += HEAT_STEP) {
    const aim = { x, y };
    const shot = kind === "Hard" ? nearestShot(role as Hitter, ctx.hitterX, aim) : kind;
    const odds: Odds = { Kill: 0, Blocked: 0, Dug: 0, Error: 0 };
    const rng = makeRng(11 + Math.round(x * 7 + y * 131));
    for (const block of blocks) for (let i = 0; i < per; i++) odds[resolveShot(rng, shot, { ...ctx, block, aim }).outcome]++;
    const tot = per * blocks.length;
    for (const k in odds) odds[k as Outcome] /= tot;
    out.push({ x, y, odds });
  }
  return out;
}
/** The heat cell under a spot, if it is inside the window. */
export const heatAt = (cells: HeatCell[], p: { x: number; y: number }) =>
  cells.find((c) => Math.abs(c.x - p.x) <= HEAT_STEP / 2 && Math.abs(c.y - p.y) <= HEAT_STEP / 2);

// ---------- Keyed in + defense variance (§7) ----------
/** What their team remembers about you: recent hitters set and recent shot targets. */
export interface Tendency {
  sets: Hitter[];
  shots: { x: number; y: number }[];
  shotIds: ShotId[];
}
export const emptyTendency = (): Tendency => ({ sets: [], shots: [], shotIds: [] });

export function remember(t: Tendency, hitter: Hitter, shot: ShotId, target: { x: number; y: number }) {
  t.sets.push(hitter);
  t.shots.push(target);
  t.shotIds.push(shot);
  for (const a of [t.sets, t.shots, t.shotIds]) if (a.length > KEYED.window) a.shift();
}

/** 0–1: how much they're sitting on this exact shot (its share of your recent swings past a fair mix). */
/** Recency-weighted share of `xs` matching, plus a bump for an unbroken streak at the end. */
function weightedHabit<T>(xs: T[], hit: (x: T) => boolean): number {
  if (xs.length < 2) return 0;
  let w = 0, m = 0;
  xs.forEach((x, i) => { const k = i + 1; w += k; if (hit(x)) m += k; });
  let streak = 0;
  for (let i = xs.length - 1; i >= 0 && hit(xs[i]); i--) streak++;
  return clamp(m / w + KEYED.streak * Math.max(0, streak - 1), 0, 2);
}
export function habitFor(t: Tendency | undefined, shot: ShotId): number {
  if (!t) return 0;
  return clamp((weightedHabit(t.shotIds, (s) => s === shot) - 0.3) / 0.6, 0, 1);
}
export function keyedOn(t: Tendency, hitter: Hitter): number {
  return clamp((weightedHabit(t.sets, (h) => h === hitter) - 0.4) / 0.5, 0, 1);
}

export interface DefenseRead {
  defenders: Defender[];
  /** Where they'd stand before reading you, for this set tempo. */
  base: Defender[];
  /** 0–1: how hard they're cheating toward where you've been hitting. */
  keyed: number;
  /** Where your recent shots cluster, if they've noticed. */
  focus?: { x: number; y: number };
  /** Which of Leo's scenarios they're in. */
  note?: string;
  /** Where that scenario's blockers stand at the net. */
  blockAt?: number[];
}

/** Pick the scenario from Leo's board closest to this ball: hitter spot, tempo, their block. Mirrors left/right. */
export function pickScenario(rng: Rng, hitterX: number, tempo: Tempo, system?: BlockSystem, blockers?: number): { s: DefenseScenario; mirror: boolean } {
  const all = SCENARIOS.flatMap((s) => [{ s, mirror: false }, { s, mirror: true }]);
  const score = ({ s, mirror }: { s: DefenseScenario; mirror: boolean }) => {
    const hx = mirror ? 9 - s.hitterX : s.hitterX;
    let v = Math.abs(hitterX - hx) / 1.5 + (s.tempos.includes(tempo) ? 0 : 2) + (mirror ? 0.3 : 0);
    if (s.tag === "triple") v += blockers === 3 ? -0.5 : 2;
    else if (s.tag && system && s.tag !== system) v += 1.5;
    return v;
  };
  const scored = all.map((c) => ({ c, v: score(c) })).sort((a, b) => a.v - b.v);
  const near = scored.filter((x) => x.v <= scored[0].v + 0.5);
  return near[Math.floor(rng() * near.length)].c;
}

/** Their defense for this ball: one of Leo's scenarios, nudged at random, then slid toward your habits. */
export function defenseFor(rng: Rng, t: Tendency, hitterX: number, tempo: Tempo = "Medium", opts: { system?: BlockSystem; blockers?: number } = {}): DefenseRead {
  const pick = pickScenario(rng, hitterX, tempo, opts.system, opts.blockers);
  const mx = (x: number) => (pick.mirror ? 9 - x : x);
  const names = ["z1", "z6", "z5"], fnames = ["z2", "z3", "z4"];
  // Back row always digs; a front-row player off the net (peeled) digs too, the rest are blocking.
  const base: Defender[] = [
    ...pick.s.back.map(([x, y], i) => ({ name: names[i], x: mx(x), y })),
    ...pick.s.front.flatMap(([x, y], i) => (y >= 1.2 ? [{ name: fnames[i], x: mx(x), y }] : [])),
  ];
  let keyed = 0;
  let focus: { x: number; y: number } | undefined;
  if (t.shots.length >= 2) {
    // Newer shots count more. Scattered shots are hard to key on.
    let wx = 0, wy = 0, w = 0;
    t.shots.forEach((p, i) => { const k = i + 1; wx += p.x * k; wy += p.y * k; w += k; });
    focus = { x: wx / w, y: wy / w };
    const spread = Math.sqrt(t.shots.reduce((a, p) => a + (p.x - focus!.x) ** 2 + (p.y - focus!.y) ** 2, 0) / t.shots.length);
    keyed = clamp(1 - spread / 3.5, 0, 1) * Math.min(1, t.shots.length / 3);
  }
  const nearest = focus ? base.reduce((a, d) => (Math.hypot(d.x - focus!.x, d.y - focus!.y) < Math.hypot(a.x - focus!.x, a.y - focus!.y) ? d : a)) : null;
  const defenders = base.map((d) => {
    let x = d.x + gauss(rng) * DEFENSE_JITTER, y = d.y + gauss(rng) * DEFENSE_JITTER;
    // Some teams just live cross court.
    if (OPPONENT.crossLean && d.y > 3) x += (hitterX < 4.5 ? 1 : -1) * OPPONENT.crossLean * 0.6;
    if (focus && keyed > 0) {
      const dx = focus.x - 4.5, dy = focus.y - 6;
      const len = Math.hypot(dx, dy) || 1;
      const slide = Math.min(len, KEYED.shift) * keyed;
      x += (dx / len) * slide;
      y += (dy / len) * slide;
      if (d === nearest) {
        const ex = focus.x - x, ey = focus.y - y, el = Math.hypot(ex, ey) || 1;
        const step = Math.min(el, KEYED.extraStep * keyed);
        x += (ex / el) * step;
        y += (ey / el) * step;
      }
    }
    return { name: d.name, x: clamp(x, 0.2, 8.8), y: clamp(y, 1.0, 8.9) };
  });
  const blockAt = pick.s.front.filter(([, y]) => y < 1.2).map(([x]) => mx(x));
  return { defenders, base, keyed, focus, note: pick.s.note, blockAt };
}

// ---------- Clarity (§6.1) ----------
export const setterClarity = (setter: Player, pass: Pass): Clarity => clarityFromScore(setter.stats.vision + PASS_BONUS[pass.rating]);
export const hitterClarity = (hitter: Player, call: SetCall, transition: Transition = "Clean"): Clarity =>
  clarityFromScore(hitter.stats.vision + TEMPO_CLARITY[call.tempo] + TRANSITION_EFFECT[transition].vision);

// ---------- Setter preview ----------
export interface CallPreview {
  call: SetCall;
  spot: number;
  set: SetResult;
  /** Average number of blockers that get there, from many simulated block formations. */
  avgBlockers: number;
  /** Rough kill chance of the default shot, averaged over block formations. */
  roughKill: number;
  deceived: boolean;
  frozen: boolean;
}

export function previewCall(
  team: Record<Role, Player>, call: SetCall, pass: Pass, others: { call: SetCall; spot: number }[], system: BlockSystem, samples = 24, perSample = 120, keyed = 0,
): CallPreview {
  const spot = callSpot(call, pass.setterX);
  const set = setQuality(team.S, call, pass);
  const rng = makeRng(99);
  let blockers = 0, kill = 0;
  const hitter = withCall(team[call.hitter], call);
  for (let i = 0; i < samples; i++) {
    const block = formBlock(rng, call, spot, others, system, keyed);
    blockers += arrived(block).length;
    kill += simulateOdds(call.hitter === "MB" ? "QStraight" : "Seam", { hitter, hitterX: spot, set, block, transition: pass.transition }, perSample, i + 1).Kill;
  }
  const { deceived, frozen } = deceptionFor(call, spot, others);
  return { call, spot, set, avgBlockers: blockers / samples, roughKill: kill / samples, deceived, frozen };
}

/** A player's stats on this call: some players are better or worse on certain sets (a quick middle on a slide). */
export function withCall(p: Player, call: SetCall): Player {
  const spot = (p as Player & { spot?: Spot }).spot;
  const mods = spot ? ROSTER[spot].callMods?.[call.id] : undefined;
  return mods ? { ...p, stats: { ...p.stats, ...mods } } : p;
}

export function othersFor(call: SetCall, calls: Record<Hitter, SetCall>, setterX: number) {
  return (Object.keys(calls) as Hitter[])
    .filter((h) => h !== call.hitter && !OUT.hitters.includes(h))
    .map((h) => ({ call: calls[h], spot: callSpot(calls[h], setterX) }));
}

// ---------- Reward moments (§15) ----------
export interface Callout {
  text: string;
  tone: "big" | "good" | "bad" | "neutral";
}
export function calloutFor(res: Resolution, block: BlockResult): Callout {
  const there = arrived(block);
  const formed = there.filter((b) => b.state === "Formed").length;
  if (res.outcome === "Kill") {
    if (res.tool) return { text: "Off the hands!", tone: "big" };
    if (formed >= 2) return { text: "Off the floor. Through a formed block.", tone: "big" };
    if ((block.deceived || block.frozen) && there.length <= 1) return { text: "Fooled them. Clean look.", tone: "big" };
    if (!there.length) return { text: "Nobody there. Put away.", tone: "good" };
    return { text: "Kill.", tone: "good" };
  }
  if (res.outcome === "Blocked") return { text: formed >= 2 ? "STUFFED." : "Blocked.", tone: "bad" };
  if (res.outcome === "Error") return { text: "Error.", tone: "bad" };
  return { text: "Dug. Rally on.", tone: "neutral" };
}

// ---------- Placeholder counterattack + scoring ----------
export type CounterResult = { outcome: "TheirKill" | "TheirError" | "YouDig"; pass?: Pass; incoming?: string; grade?: Grade; odds?: Record<Grade, number>; digger?: string };
function pickIncoming(rng: Rng): string {
  let r = rng();
  for (const a of THEIR_ATTACK) { if (r < a.share) return a.kind; r -= a.share; }
  return THEIR_ATTACK[0].kind;
}
/** Their counterattack: they may hit it out; otherwise you dig it and the dig is graded from what came over and who dug it. */
export function counterattack(rng: Rng, digShift = 0, backRow?: Spot[], force?: string): CounterResult {
  // A free ball can't be hit out.
  if (force !== "a free ball" && rng() < COUNTER.error) return { outcome: "TheirError" };
  const incoming = force ?? pickIncoming(rng);
  // Half the time your libero or a back-row player digs it; otherwise one of your hitters did.
  const d = rng();
  const dugBy: Hitter | undefined = d < 0.5 ? undefined : d < 0.7 ? "OH" : d < 0.85 && !OUT.hitters.includes("OPP") ? "OPP" : "MB";
  // Back row: the libero takes the middle's spot, so the others are the setter, an outside or the opposite.
  const backers = (backRow ?? []).filter((p) => !p.startsWith("MB"));
  const backer = backers.length ? backers[Math.floor(rng() * backers.length)] : undefined;
  const digger = dugBy ? HITTER_NAME_E[dugBy] : d < 0.3 ? "libero" : backer ? `back-row ${backer}` : "back row";
  const shift = (dugBy ? DIGGER_SHIFT.hitter : d < 0.3 ? DIGGER_SHIFT.libero : DIGGER_SHIFT.backRow + (backer ? ROSTER[backer].dig : 0)) + digShift;
  const odds = shiftGrades(DIG_ODDS[incoming], shift);
  const grade = rollGrade(rng, odds);
  // Error: they put it away. Overpass: they swing at it on the net, half the time for a point.
  if (grade === "=" || (grade === "/" && rng() < 0.5)) return { outcome: "TheirKill", incoming, grade, odds, digger };
  const pass = passFromGrade(rng, grade === "/" ? "-" : grade);
  // How fast it came at you decides how much time your hitters get to transition.
  const inc = INCOMING.find((i) => incoming.includes(i.kind.replace("a ", ""))) ?? (incoming.startsWith("a hard") ? INCOMING[0] : INCOMING[1]);
  let r3 = rng(), transition: Transition = "Clean";
  for (const t of ["Clean", "Rushed", "Scrambled"] as Transition[]) { if (r3 < inc.odds[t]) { transition = t; break; } r3 -= inc.odds[t]; }
  return { outcome: "YouDig", incoming, grade, odds, digger, pass: { ...pass, transition, dugBy, gradeOdds: odds, incoming, digger } };
}
const HITTER_NAME_E: Record<Hitter, string> = { OH: "outside", OPP: "opposite", MB: "middle" };
/** Game to 11, win by 2, capped at 15 (spec §10). Returns the winner or null. */
export function gameWinner(us: number, them: number, to = GAME_TO): "us" | "them" | null {
  const top = Math.max(us, them);
  if (top >= to + (GAME_CAP - GAME_TO) || (top >= to && Math.abs(us - them) >= 2)) return us > them ? "us" : "them";
  return null;
}
