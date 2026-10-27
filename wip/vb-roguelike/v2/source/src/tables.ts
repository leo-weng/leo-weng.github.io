// Every number the game uses. Mirrors the "VB Roguelike v2 Mechanics" Google Sheet; change both together.
// Rule: mechanics only ever turn one of the five dials. Nothing else decides a swing.

/** Dials tab: base values. */
export const DIALS = {
  /** Chance a swing is clean. At the base level every swing is clean: the ball lands exactly where you aim. Misses come back only through statuses. */
  accuracy: 1,
  /** Multiplier on shot damage, and on how hard a swing is to dig. */
  power: 1,
  /** How strong the thin edge of a block's shadow is (the core is solid). */
  block: 0.5,
  /** Size of a defender's dig circle against a hard swing (m). Inside it the ball is always dug. */
  dig: 2.2,
  /** Choices on screen (sets and shots). Informational for now. */
  options: 3,
};


export type Level = "Easy" | "Normal" | "Hard" | "Boss";
export const LEVELS: Level[] = ["Easy", "Normal", "Hard", "Boss"];

/** Difficulty tab: multipliers on the dials, per level. theirDig scales their dig circles; theirBlock how deep their shadow counts. */
export const DIFFICULTY: Record<Level, { yourPower: number; theirBlock: number; theirDig: number; tileHits: number }> = {
  Easy: { yourPower: 1, theirBlock: 0.85, theirDig: 0.85, tileHits: 2 },
  Normal: { yourPower: 1, theirBlock: 1, theirDig: 1, tileHits: 3 },
  Hard: { yourPower: 1, theirBlock: 1.1, theirDig: 1.15, tileHits: 4 },
  Boss: { yourPower: 1, theirBlock: 1.2, theirDig: 1.25, tileHits: 4 },
};
/** Your own squares always take this many hits on every level. */
export const YOUR_TILE_HITS = 3;

/** Scoring tab. A crack scores nothing; points come when a square breaks. */
export const SCORING = { crack: 0, break: 3, hole: 1, tool: 1, ace: 1, error: 1, stuff: 1, toWin: 15 };

export type ShotKind = "Hard" | "Tip" | "Roll" | "Tool";
export const SHOT_KINDS: ShotKind[] = ["Hard", "Tip", "Roll", "Tool"];
/**
 * Shots. reach grows every defender's dig circle (a slow ball gives them time to get there).
 * rows: the rows of small squares the shot can reach (6 rows of 1.5 m; 0-1 are inside the 10-foot line).
 */
export const SHOTS: Record<ShotKind, { damage: number; reach: number; rows: number[]; overBlock: boolean; blurb: string }> = {
  Hard: { damage: 2, reach: 1, rows: [2, 3, 4, 5], overBlock: false, blurb: "Cracks tiles. Deep only. Into the block's shadow it gets stuffed." },
  Tip: { damage: 1, reach: 1.8, rows: [0, 1, 2, 3], overBlock: true, blurb: "Short, over the block. Slow, so their circles get big." },
  Roll: { damage: 1, reach: 1.3, rows: [2, 3, 4, 5], overBlock: true, blurb: "Over the block. Off-speed, so their circles grow a bit." },
  Tool: { damage: 0, reach: 1, rows: [], overBlock: false, blurb: "Off their hands for a point. No damage." },
};
/** The Tool shot is an upgrade. Once used, it's gone for this many rallies. */
export const TOOL = { cooldown: 3 };

export type SetQuality = "Perfect" | "Good" | "Poor";

/** Combos (Mechanics tab): perfect pass + perfect set. */
export const COMBO = { damageMult: 2 };

/**
 * Dig circles. Inside a defender's circle the ball is always dug: inside the inner share it's a clean dig, the rest a scramble.
 * The base size is DIALS.dig; size scales it per spot (the libero covers most).
 */
export const COVER = { inner: 0.5 };
export const REACH_SIZE: Record<"LB" | "CB" | "RB" | "LF" | "CF" | "RF", number> = { LB: 1.2, CB: 1.05, RB: 1, LF: 0.85, CF: 0.8, RF: 0.85 };
/**
 * The block on a square, by how much of the square its shadow covers (0-1, after their block level and your hitter's jump):
 * at or over stuff it's stuffed, over touch it's a touch, over tool it clips the hands and goes out (your point).
 * A touch at or over back is a firm one that knocks the ball back to the hitter's side; a lighter touch pops into the blockers' court.
 */
export const FIRM = { stuff: 0.65, touch: 0.15, tool: 0.04, back: 0.4 };

/**
 * The block's shadow. It starts at the blockers' hands at the net and fans out, angled away from the hitter.
 * depth: how far behind the net the hitter's "eye" sits (smaller = wider fan). hand: half the width of one blocker's hands (m).
 * edge: width of the weak edge on the outside of the hands (m). A late blocker is weaker and only shadows the front half.
 */
export const FAN = { depth: 7, hand: 0.8, edge: 0.35, lateCore: 0.6, lateEdge: 0.3, lateDepth: 4.5 };
/** Where blockers stand, in meters from the left antenna (screen left). Bunch starts tight in the middle. */
export const BLOCK_HOME = { Bunch: [3.4, 4.5, 5.6], Spread: [1.4, 4.5, 7.6] };
/** Where a block forms against an outside hitter: steps from the hitter toward the middle. A middle hitter: straight, then each side. */
export const BLOCK_TARGETS = { outside: [0.2, 1.9, 3.5], middle: [0, -1.6, 1.6] };
/** A late blocker gets this share of the way to their spot. */
export const LATE_SHARE = 0.6;

/** Their defense chasing your swings. Heat on a zone (3x3) cools by decay each swing; at shade a digger steps over, at camp they pile in. */
export const CHASE: Record<string, { brain: string; decay: number; shade: number; camp: number; bait: number }> = {
  Easy: { brain: "Chaser", decay: 0.5, shade: 0.9, camp: 1.4, bait: 1 },
  Normal: { brain: "Reader", decay: 0.5, shade: 0.9, camp: 1.4, bait: 1 },
  Hard: { brain: "Reader", decay: 0.65, shade: 0.9, camp: 1.5, bait: 0.6 },
  Boss: { brain: "Reader", decay: 0.7, shade: 0.9, camp: 1.6, bait: 0.35 },
};
/** Serving the seam between two passers: extra pressure and a few more aces. */
export const SEAM = { pressure: 0.15, ace: 0.03 };
/** Upgrade pick at this score (a timeout), once per match. */
export const TIMEOUT_AT = 8;
/** Each point of hitter Power over 5 shrinks their dig circles against a hard swing by this share. */
export const POWER_PER_POINT = 0.03;
/** Each point of hitter Jump over 5 shrinks how much of a square the block covers by this share. */
export const JUMP_PER_POINT = 0.06;

export type ServeType = "Safe" | "Float" | "Jump";
export const SERVE_TYPES: ServeType[] = ["Safe", "Float", "Jump"];
/** Serve: ace and error chances, and how much it pushes the pass down (0 to 1). */
export const SERVE: Record<ServeType, { ace: number; error: number; pressure: number }> = {
  Safe: { ace: 0.02, error: 0.03, pressure: 0 },
  Float: { ace: 0.06, error: 0.08, pressure: 0.15 },
  Jump: { ace: 0.12, error: 0.18, pressure: 0.3 },
};
/** Passer skill shifts the pass: strong passers up, weak down. A front-row outside passes one step worse. */
export const PASSER_SHIFT = { strong: 0.15, average: 0, weak: -0.15 };
/** Pass grade cut-offs on a 0-1 roll (after shifts): above # is perfect, above + good, above ! ok, else poor. */
export const PASS_CUTS = { "#": 0.6, "+": 0.32, "!": 0.12 };

/** Their AI: weighs every open spot by its value, boosts their habit side, and shades away from tips and rolls. */
export const AI = { habitBoost: 2, fastChance: 0.4, shots: { Hard: 1, Tip: 0.6, Roll: 0.5 }, scramble: 0.15 };
/** How much a crack (no points yet) is worth when the bots weigh their options. */
export const CRACK_VALUE = 0.8;
/** Keyed-in: after you set the same hitter this many times in a row, an extra blocker waits for them. */
export const KEYED_STREAK = 2;

// ---------- Scouting: boards and monsters (draft 4) ----------
/** One row of a board: how a team defends one of the other team's hitters. Pins: block the line, balanced, or block the cross. Middle: commit, balanced, release. */
export type BoardPick = "line" | "bal" | "cross" | "commit" | "release";
export type BoardRow = "OH" | "MB" | "OPP";
export type Board = Record<BoardRow, BoardPick>;
export const BOARD_ROWS: BoardRow[] = ["OH", "MB", "OPP"];
export const BOARD_OPTIONS: Record<BoardRow, { v: BoardPick; label: string; sub: string }[]> = {
  OH: [{ v: "line", label: "Block line", sub: "Diggers cover cross" }, { v: "bal", label: "Balanced", sub: "A bit of both" }, { v: "cross", label: "Block cross", sub: "Diggers cover line" }],
  MB: [{ v: "commit", label: "Commit", sub: "Two on the quick, pins thinner" }, { v: "bal", label: "Balanced", sub: "Read and go" }, { v: "release", label: "Release", sub: "Help the pins, quick is open" }],
  OPP: [{ v: "line", label: "Block line", sub: "Diggers cover cross" }, { v: "bal", label: "Balanced", sub: "A bit of both" }, { v: "cross", label: "Block cross", sub: "Diggers cover line" }],
};
export const BOARD_WORD: Record<BoardPick, string> = { line: "block line", cross: "block cross", bal: "play balanced", commit: "commit on the quick", release: "release the middle" };
/** How far a board moves the block along the net toward the side it takes (m), and how many squares the diggers shift the other way. */
export const BOARD_SHIFT = { block: 0.8, diggers: 1 };

export interface Monster {
  id: string;
  name: string;
  tag: string;
  trait: string;
  traitText: string;
  weak: string;
  /** Multipliers on their block shadow and dig circles (1 = normal). */
  block: number;
  dig: number;
  /** Hits a big tile of theirs takes before it breaks. */
  tileHits: number;
  /** Their defense leans toward your recent swings (a chase brain from CHASE), or holds its board ("none"). */
  chase: "none" | Level;
  system: "Bunch" | "Spread";
  board: Board;
  /** How much they favor each hitter's habit side, and how often they run fast sets off a good pass. */
  habitBoost: number;
  fastChance: number;
  /** Power changes per player id, and passer skill changes. */
  power: Record<string, number>;
  passers: Record<string, "strong" | "average" | "weak">;
  /** Scouting lines per hitter. */
  scout: Record<"OH1" | "MB2" | "OPP", string>;
}
export const MONSTERS: Monster[] = [
  {
    id: "rec", name: "Rec League Regulars", tag: "Game 1", trait: "One Trick", traitText: "Their OH gets the ball and swings cross. Every time.",
    weak: "A soft block and a slow defense. Shut down the OH.",
    block: 0.8, dig: 0.85, tileHits: 2, chase: "none", system: "Bunch", board: { OH: "cross", MB: "bal", OPP: "bal" },
    habitBoost: 5, fastChance: 0.15, power: { OH1: 0, MB2: -1, OPP: -2 }, passers: {},
    scout: { OH1: "Hits cross, hard", MB2: "Quick only off a good pass", OPP: "Rarely set. Likes line" },
  },
  {
    id: "wall", name: "The Wall", tag: "Game 2", trait: "Triple Up", traitText: "A huge block: their shadow covers more of the floor than anyone's.",
    weak: "Shaky passers, and slow to cover short. Serve them and tip.",
    block: 1.35, dig: 0.8, tileHits: 3, chase: "none", system: "Bunch", board: { OH: "cross", MB: "commit", OPP: "line" },
    habitBoost: 2, fastChance: 0.3, power: { OH1: 0, MB2: 1, OPP: 0 }, passers: { OH2: "weak", OH1: "weak", L: "average" },
    scout: { OH1: "Cross or line, even split", MB2: "Big quick off a good pass", OPP: "Line hitter" },
  },
  {
    id: "rats", name: "Dig Rats", tag: "Game 3", trait: "Never Dies", traitText: "Huge dig range, and they lean toward wherever you've been hitting.",
    weak: "A tiny block and soft hitters. Spread your swings around.",
    block: 0.7, dig: 1.35, tileHits: 3, chase: "Normal", system: "Spread", board: { OH: "line", MB: "release", OPP: "cross" },
    habitBoost: 1.5, fastChance: 0.3, power: { OH1: -1, MB2: -1, OPP: -1 }, passers: { OH1: "strong", OH2: "strong" },
    scout: { OH1: "Mixes line and cross", MB2: "Slow quick", OPP: "Line or cross" },
  },
];
