// Data tables for v0.1 (offense sandbox). Every number here is a tuning value — see spec.md.
// Court frame: x = meters along the net from the left antenna (0–9), y = depth into the
// opponent's court from the net (0–9). Both teams use the same x so set spots and blockers line up.

export type Role = "S" | "OH" | "MB" | "OPP" | "L";
export type Tempo = "High" | "Medium" | "Fast";
export type SetType = "Spot" | "Distance";
export type Hitter = "OH" | "MB" | "OPP";

export interface Stats {
  jump: number;
  power: number;
  control: number;
  stamina: number;
  vision: number;
  composure: number;
  speed: number;
  reaction: number;
}

export interface Player {
  role: Role;
  name: string;
  stats: Stats;
}

const base = (o: Partial<Stats>): Stats => ({
  jump: 5, power: 5, control: 5, stamina: 5, vision: 5, composure: 5, speed: 5, reaction: 5, ...o,
});

export const STARTING_TEAM: Record<Role, Player> = {
  S: { role: "S", name: "Setter", stats: base({ control: 6, vision: 5 }) },
  OH: { role: "OH", name: "Outside", stats: base({ jump: 6, power: 6 }) },
  MB: { role: "MB", name: "Middle", stats: base({ jump: 6, vision: 4 }) },
  OPP: { role: "OPP", name: "Opposite", stats: base({ jump: 6, power: 6 }) },
  L: { role: "L", name: "Libero", stats: base({ control: 6, reaction: 6 }) },
};

// Opponent strength. Harder teams block higher, move faster and stay disciplined (fewer blockers out of position).
export type OpponentLevel = "Rookie" | "Club" | "Elite";
export interface Opponent {
  name: string;
  blockJump: number;
  blockerSpeed: number;
  blockerReaction: number;
  defenderSpeed: number;
  defenderReaction: number;
  /** Chance a blocker who gets there is in the right spot (else they count as late). The middle is steadier. */
  discipline: number;
  /** Team personality (runs): how far their back row cheats toward cross court (m), and how badly look-alike calls fool them (×). */
  crossLean?: number;
  fooled?: number;
  /** Back-row shape: "Perimeter" keeps zone 6 deep; "SixUp" brings zone 6 up behind the block (spread-block teams). */
  defense?: DefenseStyle;
}
export type DefenseStyle = "Perimeter" | "SixUp";
export const OPPONENT_LEVELS: Record<OpponentLevel, Opponent> = {
  Rookie: { name: "Rookies", blockJump: 4, blockerSpeed: 4, blockerReaction: 4, defenderSpeed: 4, defenderReaction: 4, discipline: 0.6 },
  Club: { name: "Club team", blockJump: 5, blockerSpeed: 5, blockerReaction: 5, defenderSpeed: 5, defenderReaction: 5, discipline: 0.82 },
  Elite: { name: "Elite", blockJump: 7, blockerSpeed: 7, blockerReaction: 7, defenderSpeed: 8, defenderReaction: 8, discipline: 0.95 },
};
/** The current opponent. Mutated in place by setOpponentLevel so every module sees the same team. */
export const OPPONENT: Opponent = { ...OPPONENT_LEVELS.Club };
export const setOpponentLevel = (level: OpponentLevel, mods: Partial<Opponent> = {}) =>
  Object.assign(OPPONENT, { crossLean: 0, fooled: 1, defense: undefined }, OPPONENT_LEVELS[level], mods);

// ---- Set calls (spec §5.1) ----
export interface SetCall {
  id: string;
  hitter: Hitter;
  type: SetType;
  /** Spot sets: x on the net. Distance sets: offset from the setter's x (negative = in front, toward x=0). */
  x: number;
  tempo: Tempo;
  /** Seconds from set release to contact; this is what blockers race against. */
  time: number;
  isDefault?: boolean;
  isQuick?: boolean;
}

export const SET_CALLS: SetCall[] = [
  { id: "4", hitter: "OH", type: "Spot", x: 0.5, tempo: "High", time: 1.8, isDefault: true },
  { id: "Go", hitter: "OH", type: "Spot", x: 0.5, tempo: "Medium", time: 1.3 },
  { id: "Shoot", hitter: "OH", type: "Spot", x: 0.5, tempo: "Fast", time: 0.95 },
  { id: "32", hitter: "OH", type: "Spot", x: 3.0, tempo: "Medium", time: 1.1 },
  { id: "1", hitter: "MB", type: "Distance", x: -1.0, tempo: "Fast", time: 0.55, isDefault: true, isQuick: true },
  { id: "3", hitter: "MB", type: "Spot", x: 3.5, tempo: "Fast", time: 0.65, isQuick: true },
  { id: "Gap", hitter: "MB", type: "Distance", x: -2.0, tempo: "Fast", time: 0.6, isQuick: true },
  { id: "Back 1", hitter: "MB", type: "Distance", x: 1.0, tempo: "Fast", time: 0.6, isQuick: true },
  { id: "5", hitter: "OPP", type: "Spot", x: 8.5, tempo: "High", time: 1.8, isDefault: true },
  { id: "Flat", hitter: "OPP", type: "Spot", x: 8.5, tempo: "Fast", time: 0.95 },
  { id: "Pull", hitter: "OPP", type: "Spot", x: 7.0, tempo: "Medium", time: 1.1 },
  { id: "Back 2", hitter: "OPP", type: "Distance", x: 1.0, tempo: "Medium", time: 1.05 },
];

export const callById = (id: string): SetCall => {
  const c = SET_CALLS.find((s) => s.id === id);
  if (!c) throw new Error(`Unknown set call ${id}`);
  return c;
};

/** Game plan = one call per hitter (spec §5.3). */
export type GamePlan = Record<Hitter, string>;
export const STARTING_PLAN: GamePlan = { OH: "Go", MB: "1", OPP: "5" };

export const SETTER_NEUTRAL_X = 6.0;

// ---- Shots (spec §5.2, §8) ----
export type ShotId = "Seam" | "Line" | "Cross" | "QLeft" | "QStraight" | "QRight" | "Tip" | "Roll" | "HardLine" | "HardCross" | "Tool";

export interface Shot {
  id: ShotId;
  label: string;
  unlocked: boolean;
  /** Cone size in meters at Control 5 with a Good set (one σ = this × 0.75 × cone multiplier):
   *  depth runs along the swing (long or short misses), width across it (wide misses). */
  depthSpread: number;
  widthSpread: number;
  netChance: number;
  /** Ball speed factor; 1 = a normal swing. Faster balls shrink the defenders' reach. */
  speed: number;
  /** Which part of the block this shot has to beat. */
  blockLane: "edge" | "inside" | "seam" | "straight" | "over" | "hands";
  /** Pin hitters (outside, opposite) swing line, seam and cross; middles hit quick angles instead. */
  who: "pin" | "middle" | "any";
  isDefault?: boolean;
}

export const SHOTS: Shot[] = [
  { id: "Seam", label: "Seam to 6", who: "pin", unlocked: true, depthSpread: 1.9, widthSpread: 1.6, netChance: 0.012, speed: 0.95, blockLane: "seam", isDefault: true },
  { id: "Line", label: "Line", who: "pin", unlocked: true, depthSpread: 1.7, widthSpread: 1.1, netChance: 0.012, speed: 1.0, blockLane: "edge" },
  { id: "Cross", label: "Cross", who: "pin", unlocked: true, depthSpread: 1.6, widthSpread: 1.6, netChance: 0.012, speed: 1.0, blockLane: "inside" },
  // Middle quicks: sharp angles to either side of the 3 m line, or straight down. The cone runs along the
  // swing, so misses go long or into the net more than sideways.
  { id: "QLeft", label: "Hit left", who: "middle", unlocked: true, depthSpread: 1.5, widthSpread: 1.1, netChance: 0.02, speed: 1.0, blockLane: "edge" },
  { id: "QStraight", label: "Straight down", who: "middle", unlocked: true, depthSpread: 2.1, widthSpread: 0.9, netChance: 0.02, speed: 1.2, blockLane: "straight", isDefault: true },
  { id: "QRight", label: "Hit right", who: "middle", unlocked: true, depthSpread: 1.5, widthSpread: 1.1, netChance: 0.02, speed: 1.0, blockLane: "edge" },
  { id: "Tip", label: "Tip", who: "any", unlocked: true, depthSpread: 1.0, widthSpread: 1.0, netChance: 0.008, speed: 0.3, blockLane: "over" },
  { id: "Roll", label: "Roll shot", who: "any", unlocked: true, depthSpread: 0.8, widthSpread: 0.8, netChance: 0.004, speed: 0.25, blockLane: "over" },
  { id: "HardLine", label: "Hard line", who: "pin", unlocked: false, depthSpread: 1.9, widthSpread: 1.15, netChance: 0.032, speed: 1.35, blockLane: "edge" },
  { id: "HardCross", label: "Hard cross", who: "pin", unlocked: false, depthSpread: 1.7, widthSpread: 1.6, netChance: 0.032, speed: 1.35, blockLane: "inside" },
  { id: "Tool", label: "Tool off the block", who: "any", unlocked: false, depthSpread: 1.0, widthSpread: 1.0, netChance: 0.02, speed: 1.1, blockLane: "hands" },
];

/** The shots this hitter can swing: middles get quick angles, pins get line/seam/cross. */
export const shotsFor = (hitter: Hitter): Shot[] =>
  SHOTS.filter((s) => s.who === "any" || s.who === (hitter === "MB" ? "middle" : "pin"));
export const defaultShot = (hitter: Hitter): ShotId => (hitter === "MB" ? "QStraight" : "Seam");

export const shotById = (id: ShotId): Shot => SHOTS.find((s) => s.id === id)!;

// ---- Block (spec §5.5, §6.3) ----
export type BlockSystem = "Bunch" | "Spread";
/** Starting x of their three blockers, ordered left-to-right in our frame. */
export const BLOCK_START: Record<BlockSystem, [number, number, number]> = {
  Bunch: [2.9, 4.5, 6.1],
  Spread: [1.2, 4.5, 7.8],
};
/** Pin blockers only go after sets within this lateral distance; the middle goes anywhere. */
export const PIN_BLOCKER_RANGE = 4.0;

export const BLOCK = {
  pinLineGap: 0.27, // meters from the sideline to the end blocker's outside hand on a pin set: about 1¼ balls
  readReactionBase: 0.3, // seconds before a read blocker moves
  reactionPerPoint: 0.03,
  speedBase: 4.0, // m/s at Speed 5
  speedPerPoint: 0.25,
  reactionJitter: 0.08, // seconds, one σ — makes formation probabilistic
  formedMargin: 0.15,
  deceptionDelay: 0.19, // two of our calls look alike; scaled down by discipline
  quickFreezeDelay: 0.1, // a quick hitter in the plan pins their middle
  deceptionRadius: 1.5,
  deceptionTempoWindow: 0.3,
  middleSpeed: 1.35, // the middle blocker moves this much faster than the pins: closing is their job
  middleDiscipline: 0.35, // the middle's chance to be out of position = (1 − discipline) × this
  /** Against a bunch block the end blocker sets inside the hitter, leaving line; a spread block takes line. */
  bunchInside: 0.6,
};

// ---- Defense (v0.1 is the opponent's default perimeter) ----
export interface Defender {
  name: string;
  x: number;
  y: number;
}
export const PERIMETER_DEFENSE: Defender[] = [
  { name: "left back", x: 1.8, y: 6.5 },
  { name: "middle back", x: 4.5, y: 7.4 },
  { name: "right back", x: 7.2, y: 6.5 },
  { name: "tip cover", x: 4.5, y: 3.5 },
];
/**
 * Where the back row starts by set tempo. Fast sets: the wings crash in to cut angles.
 * High sets: they play wide, close to both sidelines and the end line. Medium is the base perimeter.
 */
/** Zone 6 up: the middle back plays just behind the block and covers tips, the wings sit deep on the lines. */
export const SIX_UP_BY_TEMPO: Record<Tempo, Defender[]> = {
  High: [
    { name: "left back", x: 0.9, y: 7.6 },
    { name: "6 up", x: 4.5, y: 4.2 },
    { name: "right back", x: 8.1, y: 7.6 },
  ],
  Medium: [
    { name: "left back", x: 1.0, y: 7.3 },
    { name: "6 up", x: 4.5, y: 4.0 },
    { name: "right back", x: 8.0, y: 7.3 },
  ],
  Fast: [
    { name: "left back", x: 1.6, y: 6.4 },
    { name: "6 up", x: 4.5, y: 3.8 },
    { name: "right back", x: 7.4, y: 6.4 },
  ],
};
export const DEFENSE_BY_TEMPO: Record<Tempo, Defender[]> = {
  High: [
    { name: "left back", x: 0.9, y: 7.2 },
    { name: "middle back", x: 4.5, y: 7.9 },
    { name: "right back", x: 8.1, y: 7.2 },
    { name: "tip cover", x: 4.5, y: 3.0 },
  ],
  Medium: PERIMETER_DEFENSE,
  Fast: [
    { name: "left back", x: 2.0, y: 5.2 },
    { name: "middle back", x: 4.5, y: 6.5 },
    { name: "right back", x: 7.0, y: 5.2 },
    { name: "tip cover", x: 4.5, y: 2.8 },
  ],
};

/** Their defenders don't stand in the same spots every ball (meters, one σ). */
export const DEFENSE_JITTER = 0.4;

/** Keyed in: the more you lean on one hitter or one target, the more they cheat toward it (spec §7). */
export const KEYED = {
  window: 6, // recent sets / shots they remember; newer ones count more, so a habit cools off as you mix it up
  reaction: 0.25, // seconds faster their block reads a hitter who gets every set
  shift: 2.2, // meters the defense slides toward your recent shots, at most
  extraStep: 1.6, // extra meters for the defender closest to where you keep hitting
  habitBlock: 0.2, // added block chance on a shot you keep hitting
  habitDig: 0.45, // a shot they expect plays this much slower for their diggers
  streak: 0.25, // each repeat in a row on top of the first makes them this much more sure
};

/**
 * Swing geometry (spec §8). The hitter contacts the ball `contactY` meters off the net (on our side) and the
 * ball travels in a straight line to where it lands, so short swings cross the net low and deep swings cross high.
 */
export const SWING = {
  contactY: -1.15,
  contactHeight: 3.15, // meters at Jump 5 on a good set
  heightPerJump: 0.07,
  topspin: 0.45, // a hard swing can arc over the tape and dive this much below the straight line
  netClear: 2.55, // the ball has to cross above the tape (2.43 m) plus its own radius
  angleCone: 0.15, // a swing turned far from straight ahead sprays this much more
  sigma: 0.38, // one σ of a hard swing's cone = spread × this × cone multiplier
  easyAssist: 0.8, // Easy mode tightens every cone this much
};
/**
 * Hitting window (spec §8): the set decides which part of the court you can swing at. A fast set to the
 * pin only gives you deep cross; a high ball gives you most of the court. Jump and Power widen it.
 * `share` is the fraction of the full angle (line to sharp cross) at Jump/Power 5; `toCross` slides
 * the window toward cross (0 = centered, 1 = against the cross edge).
 */
export const HIT_WINDOW = {
  share: { High: 0.75, Medium: 0.55, Fast: 0.35 } as Record<Tempo, number>,
  toCross: { High: 0.15, Medium: 0.45, Fast: 1 } as Record<Tempo, number>,
  middleShare: 0.6, // quick hitters can still turn it either way
  perStat: 0.035, // added share per point of (Jump + Power) / 2 over 5
  // Swinging past the window is allowed but costly, scaled by how far past (1 = about 20 degrees):
  outsideCone: 0.8, // cone × (1 + this)
  outsideError: 0.35, // chance to lose control of it
  outsideSlow: 0.3, // a reaching swing is this much softer
};

/**
 * Contact timing (spec §8, "execute"): you stop a sweeping marker at the ball. `miss` is 0 for a perfect
 * contact and 1 at the edge of the meter. Clean contact tightens the cone; a late or early swing sprays it.
 */
export const CONTACT = {
  perfect: 0.12, // within this, a perfect contact
  perfectCone: 0.7,
  coneSlope: 1.0, // cone × (1 + this × miss) outside the perfect zone
  shank: 0.82, // past this, a real chance to shank it
  shankChance: 0.5,
  /** Seconds for one sweep across the meter by set tempo: fast sets give you less time. */
  sweep: { High: 1.15, Medium: 0.95, Fast: 0.75 } as Record<Tempo, number>,
  easySlow: 1.5, // Easy mode slows the meter down
  average: 0.35, // the simulator's stand-in for a typical swing
};

/** What a blocker's hands cover at the net: half-width in meters and the top of their reach. */
export const BLOCK_HANDS = {
  formed: { half: 0.5, top: 3.0, stop: 0.6 },
  late: { half: 0.35, top: 2.85, stop: 0.3 },
  topPerJump: 0.06, // per point of their Block Jump over 5
  fingertips: 0.18, // a ball this close over the hands still grazes them
  edge: 0.25, // a ball this close past the hands can still clip them
  /** Blockers don't stand on the exact same spot every ball (meters, one σ); late ones drift more. */
  jitter: { formed: 0.15, late: 0.3 },
};

/** A pin blocker who stays home drops off the net to cover tips and sharp cross at this depth. */
export const OFF_BLOCKER_DEPTH = 3.5;

export const DIG = {
  offSpeedExponent: 0.35,
  offSpeedPerMeter: 0.12,
  tipPerMeter: 0.5, // tips die fast: every meter deeper gives defenders much more time
  rollShortError: 0.6, // roll shot error chance right at the net, fading to 0 at the 3 m line
 // a soft ball's reach grows this much per meter it travels past 2 m // how much slow balls extend a defender's reach
  baseRadius: 2.0, // meters a defender can cover sideways against a normal swing
  /** Reach is an oval leaning toward the net: a defender can run forward much farther than they can back up. */
  forward: 1.25,
  back: 0.6,
  closeRange: 0.6,
  closeChance: 0.9,
  offSpeedCloseChance: 0.97,
  hardBallPenalty: 0.1,
  secondDefenderShare: 0.35,
  noBlockReach: 0.75,
  reachPerBlocker: 0.15, // dig chance lost per unit of ball speed over 1
  powerPerPoint: 0.06,
  defenderSpeedPerPoint: 0.05,
};

// ---- Pass & set quality (spec §5.0, §6.2) ----
export type PassRating = 1 | 2 | 3;
export const PASS_BONUS: Record<PassRating, number> = { 3: 2, 2: 0, 1: -3 };
export const TEMPO_PENALTY: Record<Tempo, number> = { High: 0, Medium: 1, Fast: 3 };
export const TEMPO_CLARITY: Record<Tempo, number> = { High: 2, Medium: 0, Fast: -2 };
export const SPOT_DISTANCE_PER_PENALTY = 1.5;

export type SetQuality = "Perfect" | "Good" | "Off";
export const SET_QUALITY_EFFECT: Record<SetQuality, { cone: number; net: number; jump: number }> = {
  Perfect: { cone: 0.8, net: -0.02, jump: 0 },
  Good: { cone: 1.0, net: 0, jump: 0 },
  Off: { cone: 1.4, net: 0.06, jump: -2 },
};

export const CONTROL_CONE_PER_POINT = 0.08;
export const JUMP_BLOCK_PER_POINT = 0.12;

/** Chance a blocker in the right lane blocks the ball, by blocker state. */
export const BLOCK_STOP: Record<Shot["blockLane"], { formed: number; late: number }> = {
  edge: { formed: 0.26, late: 0.08 },
  inside: { formed: 0.22, late: 0.07 },
  seam: { formed: 0.3, late: 0.08 },
  straight: { formed: 0.3, late: 0.1 },
  over: { formed: 0.03, late: 0.01 },
  hands: { formed: 0.08, late: 0.04 },
};

export type Clarity = "Clear" | "Fuzzy" | "Blind";
export const clarityFromScore = (score: number): Clarity => (score >= 8 ? "Clear" : score >= 5 ? "Fuzzy" : "Blind");

// ---- Transition (spec §6.4) ----
/**
 * After a dig your hitters have to get off the net and back into their approach. The faster their
 * attack came at you, the less time that takes: even a perfect dig can leave hitters rushed.
 */
export type Transition = "Clean" | "Rushed" | "Scrambled";
export const TRANSITION_EFFECT: Record<Transition, { cone: number; jump: number; vision: number }> = {
  Clean: { cone: 1.0, jump: 0, vision: 0 },
  Rushed: { cone: 1.15, jump: -1, vision: -1 },
  Scrambled: { cone: 1.35, jump: -2, vision: -2 }, // and no quick sets: nobody's ready to run one
};
/** How their counterattack came at you, and the odds of each transition after you dig it. */
export const INCOMING: { kind: string; share: number; odds: Record<Transition, number> }[] = [
  { kind: "a hard swing", share: 0.4, odds: { Clean: 0.1, Rushed: 0.4, Scrambled: 0.5 } },
  { kind: "a roll shot", share: 0.35, odds: { Clean: 0.45, Rushed: 0.45, Scrambled: 0.1 } },
  { kind: "a free ball", share: 0.25, odds: { Clean: 0.9, Rushed: 0.1, Scrambled: 0 } },
];

/** Chance a ball that gets past the block still grazes a hand, per unit of block stop chance (capped). */
export const BLOCK_TOUCH = { perStop: 1.1, max: 0.35, slow: 0.6 };

// ---- Placeholder counterattack (until the libero's defense call in v0.2) ----
/** When they dig your attack, their counterattack is rolled from these flat odds. */
export const COUNTER = {
  kill: 0.25, // lower so rallies run longer
  error: 0.12,
  /** If you dig it, your pass quality for the transition attack. */
  digPass: { 3: 0.25, 2: 0.45, 1: 0.3 } as Record<1 | 2 | 3, number>,
};

// ---- Scoring (spec §10) ----
export const GAME_TO = 11;
export const GAME_CAP = 15;

// ---- Dig grades (DataVolley style) ----
/** # perfect, + good, ! OK, - poor, / overpass, = error (their kill). */
export type Grade = "#" | "+" | "!" | "-" | "/" | "=";
export const GRADES: Grade[] = ["#", "+", "!", "-", "/", "="];
export const GRADE_NAME: Record<Grade, string> = { "#": "Perfect", "+": "Good", "!": "OK", "-": "Poor", "/": "Overpass", "=": "Error" };
/** Your dig grade odds by the ball that came over, before who dug it. Rough shapes, not tuned numbers. */
export const DIG_ODDS: Record<string, Record<Grade, number>> = {
  "a free ball": { "#": 0.9, "+": 0.07, "!": 0.03, "-": 0, "/": 0, "=": 0 },
  "a tip": { "#": 0.45, "+": 0.28, "!": 0.15, "-": 0.08, "/": 0.02, "=": 0.02 },
  "a roll shot": { "#": 0.3, "+": 0.28, "!": 0.2, "-": 0.14, "/": 0.03, "=": 0.05 },
  "a hard swing at a digger": { "#": 0.04, "+": 0.14, "!": 0.27, "-": 0.3, "/": 0.08, "=": 0.17 },
  "a hard swing into a gap": { "#": 0, "+": 0.03, "!": 0.1, "-": 0.2, "/": 0.05, "=": 0.62 },
};
/** How often their attack is each kind of ball. */
export const THEIR_ATTACK: { kind: string; share: number }[] = [
  { kind: "a hard swing at a digger", share: 0.25 },
  { kind: "a hard swing into a gap", share: 0.2 },
  { kind: "a roll shot", share: 0.2 },
  { kind: "a tip", share: 0.12 },
  { kind: "a free ball", share: 0.23 },
];
/** Who digs shifts the odds: share moved one grade better (libero) or worse (a hitter). */
export const DIGGER_SHIFT = { libero: 0.2, backRow: 0, hitter: -0.15 };

// ---- Rotations (5-1) ----
/** The six players in a 5-1. Starting zones: S 1, OH1 2, MB2 3, OPP 4, OH2 5, MB1 6. */
export type Spot = "S" | "OH1" | "MB2" | "OPP" | "OH2" | "MB1";
export const LINEUP: Spot[] = ["S", "OH1", "MB2", "OPP", "OH2", "MB1"];
export const SPOT_ABOUT: Record<Spot, string> = {
  S: "setter",
  OH1: "attacking outside: takes the big load",
  MB2: "quick middle: great on 1s, 3s and gaps, weaker on slides",
  OPP: "big power opposite: weak defending in the back row",
  OH2: "defensive outside: good passer and digger",
  MB1: "best middle: blocks and hits, plays the two hard block rotations",
};
/** Who stands in each zone (1–6) in rotation r (0–5). Rotating moves zone 2 to zone 1. */
export const zonePlayer = (rot: number, zone: number): Spot => LINEUP[(zone - 1 + rot) % 6];
export interface FrontRow { OH: Spot; MB: Spot; OPP: Spot | null; setterFront: boolean; back: Spot[] }
/** Who attacks from which spot this rotation. Players switch: outsides hit left, middles middle, opposite right. A front-row setter means only two hitters. */
export function frontRow(rot: number): FrontRow {
  const front = [2, 3, 4].map((z) => zonePlayer(rot, z));
  const back = [1, 6, 5].map((z) => zonePlayer(rot, z));
  return {
    OH: front.find((p) => p.startsWith("OH"))!,
    MB: front.find((p) => p.startsWith("MB"))!,
    OPP: front.includes("OPP") ? "OPP" : null,
    setterFront: front.includes("S"),
    back,
  };
}
/** Your players' stats. Each one is a different weapon. */
export const ROSTER: Record<Spot, { stats: Partial<Stats>; dig: number; callMods?: Record<string, Partial<Stats>> }> = {
  S: { stats: { control: 6, vision: 5 }, dig: 0 },
  OH1: { stats: { jump: 6, power: 7, control: 5 }, dig: 0 },
  OH2: { stats: { jump: 6, power: 5, control: 6 }, dig: 0.12 },
  MB1: { stats: { jump: 7, power: 6, control: 5 }, dig: 0 },
  MB2: { stats: { jump: 6, power: 5, control: 6 }, dig: 0, callMods: { "1": { control: 7, jump: 7 }, "3": { control: 7, jump: 7 }, Gap: { control: 7, jump: 7 }, "Back 1": { control: 3, jump: 5 } } },
  OPP: { stats: { jump: 7, power: 7, control: 5 }, dig: -0.15 },
};
/** Their players: block height change when front row, dig reach change when back row. */
export const THEIR_PLAYERS: Record<Spot, { block: number; dig: number }> = {
  S: { block: -2, dig: 0 },
  OH1: { block: 0, dig: 0 },
  OH2: { block: 0.5, dig: 0.15 },
  OPP: { block: 1.5, dig: -0.2 },
  MB1: { block: 1, dig: 0 },
  MB2: { block: 0, dig: 0 },
};
/** Their front and back this rotation, as the engine reads them. Mutated each ball. */
export const THEM = {
  /** Block height change per slot in your frame: 0 faces your outside, 1 their middle, 2 faces your opposite. */
  block: [0, 0, 0] as number[],
  /** Dig reach multiplier for their back row in your frame: left, middle (libero), right. */
  dig: [1, 1.15, 1] as number[],
  /** Middle blocker speed change in stat points. */
  middleSpeed: 0,
};
/** Your hitters who are back row this rotation (can't attack yet). */
export const OUT: { hitters: Hitter[] } = { hitters: [] };
export function setTheirRotation(rot: number) {
  const f = frontRow(rot);
  // Facing your outside is their right front: their setter when front row, else their opposite.
  const rightFront: Spot = f.setterFront ? "S" : "OPP";
  THEM.block = [THEIR_PLAYERS[rightFront].block, THEIR_PLAYERS[f.MB].block, THEIR_PLAYERS[f.OH].block];
  THEM.middleSpeed = f.MB === "MB1" ? 1 : 0;
  // Back row: right back (your left) is their setter or opposite; left back (your right) is the back-row outside; the libero plays middle back.
  const rightBack: Spot = f.setterFront ? "OPP" : "S";
  const backOH = (["OH1", "OH2"] as Spot[]).find((p) => p !== f.OH)!;
  THEM.dig = [1 + THEIR_PLAYERS[rightBack].dig, 1.15, 1 + THEIR_PLAYERS[backOH].dig];
}
