// Every number the game uses. Mirrors the "VB Roguelike v2 Mechanics" Google Sheet; change both together.
// Rule: mechanics only ever turn one of the five dials. Nothing else decides a swing.

/** Dials tab: base values. */
export const DIALS = {
  /** Chance a swing is clean. The ball always goes where you aim; a miss is into the net or out. */
  accuracy: 0.96,
  /** Multiplier on shot damage, and on how hard a swing is to dig. */
  power: 1,
  /** How strong the thin edge of a block's shadow is (the core is solid). */
  block: 0.5,
  /** Chance a digger keeps alive a ball hit to their tile. */
  dig: 0.65,
  /** Choices on screen (sets and shots). Informational for now. */
  options: 3,
};

/** Probabilities never go above this. */
export const CAP = 0.95;
/** A clean-swing chance never goes above this, so there's always a small error risk. */
export const ACC_CAP = 0.97;

export type Level = "Easy" | "Normal" | "Hard" | "Boss";
export const LEVELS: Level[] = ["Easy", "Normal", "Hard", "Boss"];

/** Difficulty tab: multipliers on the dials, per level. */
export const DIFFICULTY: Record<Level, { yourAcc: number; yourPower: number; theirBlock: number; theirDig: number; theirAcc: number; tileHits: number }> = {
  Easy: { yourAcc: 1.04, yourPower: 1.2, theirBlock: 0.8, theirDig: 0.8, theirAcc: 0.95, tileHits: 1 },
  Normal: { yourAcc: 1, yourPower: 1, theirBlock: 1, theirDig: 1, theirAcc: 1, tileHits: 2 },
  Hard: { yourAcc: 0.98, yourPower: 1, theirBlock: 1.2, theirDig: 1.2, theirAcc: 1.02, tileHits: 3 },
  Boss: { yourAcc: 0.97, yourPower: 1, theirBlock: 1.3, theirDig: 1.3, theirAcc: 1.04, tileHits: 4 },
};
/** Your own tiles always take this many hits on every level. */
export const YOUR_TILE_HITS = 2;

/** Scoring tab. A crack scores nothing; points come when a tile breaks. */
export const SCORING = { crack: 0, break: 3, hole: 1, tool: 1, ace: 1, error: 1, stuff: 1, toWin: 15 };

export type ShotKind = "Hard" | "Tip" | "Roll" | "Tool";
export const SHOT_KINDS: ShotKind[] = ["Hard", "Tip", "Roll", "Tool"];
/** Shots. accBonus adds to accuracy; digMult scales the digger's chance; rows the shot can reach (0 = by the net). */
export const SHOTS: Record<ShotKind, { damage: number; accBonus: number; digMult: number; rows: number[]; overBlock: boolean; blurb: string }> = {
  Hard: { damage: 2, accBonus: 0, digMult: 0.8, rows: [0, 1, 2], overBlock: false, blurb: "Breaks tiles. Can't go through the block's shadow." },
  Tip: { damage: 1, accBonus: 0.04, digMult: 1.5, rows: [0, 1], overBlock: true, blurb: "Short, over the block. Easy to dig if someone's close." },
  Roll: { damage: 1, accBonus: 0.03, digMult: 1.3, rows: [1, 2], overBlock: true, blurb: "Over the block to an open spot." },
  Tool: { damage: 0, accBonus: 0, digMult: 0, rows: [], overBlock: false, blurb: "Off their hands for a point. No tile damage." },
};
/** Tool: chance to score off the block = base + per blocker; with no block it is a long shot. */
export const TOOL = { base: 0.45, perBlocker: 0.1, noBlock: 0.1, errorOnFail: 0.5 };

/** Set quality multiplies accuracy. */
export type SetQuality = "Perfect" | "Good" | "Poor";
export const SET_MULT: Record<SetQuality, number> = { Perfect: 1, Good: 0.98, Poor: 0.92 };

/** Combos (Mechanics tab): perfect pass + perfect set. */
export const COMBO = { accBonus: 0.05, damageMult: 2 };

/** Out-of-range tiles are still hittable, at this accuracy multiplier. */
export const OUT_OF_RANGE = 0.9;

/** Dig coverage by how many squares (1.5 m each) a digger stands from the tile. A second digger adds a share of theirs. */
export const COVER = { on: 1, near: 0.55, far: 0.2, second: 0.35 };
export const DIG_CAP = 0.92;

/**
 * The block's shadow. It starts at the blockers' hands at the net and fans out, angled away from the hitter.
 * depth: how far behind the net the hitter's "eye" sits (smaller = wider fan). hand: half the width of one blocker's hands (m).
 * edge: width of the weak edge on the outside of the hands (m). A late blocker is weaker and only shadows the front half.
 * shadowCut: a tile this covered can't be hit hard. toolShare / stuffShare: what happens when the hands catch a ball.
 */
export const FAN = { depth: 7, hand: 0.8, edge: 0.35, lateCore: 0.6, lateEdge: 0.3, lateDepth: 4.5, shadowCut: 0.75, toolShare: 0.35, stuffShare: 0.3 };
/** Where blockers stand, in meters from the left antenna (screen left). Bunch starts tight in the middle. */
export const BLOCK_HOME = { Bunch: [3.4, 4.5, 5.6], Spread: [1.4, 4.5, 7.6] };
/** Where a block forms against an outside hitter: steps from the hitter toward the middle. A middle hitter: straight, then each side. */
export const BLOCK_TARGETS = { outside: [0.2, 1.9, 3.5], middle: [0, -1.6, 1.6] };
/** A late blocker gets this share of the way to their spot. */
export const LATE_SHARE = 0.6;

/** Their defense chasing your swings. Heat on a tile cools by decay each swing; at shade a digger steps over, at camp they pile in and read it. */
export const CHASE: Record<string, { brain: string; decay: number; shade: number; camp: number; read: number; bait: number }> = {
  Easy: { brain: "Chaser", decay: 0.5, shade: 0.9, camp: 1.4, read: 1.3, bait: 1 },
  Normal: { brain: "Chaser", decay: 0.5, shade: 0.9, camp: 1.4, read: 1.4, bait: 1 },
  Hard: { brain: "Reader", decay: 0.65, shade: 0.9, camp: 1.5, read: 1.45, bait: 0.6 },
  Boss: { brain: "Reader", decay: 0.7, shade: 0.9, camp: 1.6, read: 1.5, bait: 0.35 },
};
/** Chance their hitter's approach fakes you out, per level. */
export const TELL_FAKE: Record<string, number> = { Easy: 0, Normal: 0.15, Hard: 0.25, Boss: 0.35 };
/** Serving the seam between two passers: extra pressure and a few more aces. */
export const SEAM = { pressure: 0.15, ace: 0.03 };
/** A hole they've watched you hit can be plugged with bodies: dug at this share of the usual chance. */
export const HOLE_PLUG = 0.5;
/** Upgrade pick at this score (a timeout), once per match. */
export const TIMEOUT_AT = 8;
/** Each point of hitter Power over 5 makes a hard swing this much harder to dig. */
export const POWER_PER_POINT = 0.05;
/** Each point of hitter Control over 5 adds this much accuracy. */
export const CONTROL_PER_POINT = 0.04;
/** Each point of hitter Jump over 5 weakens the block's edges by this much. */
export const JUMP_PER_POINT = 0.06;

/** Digs: grades of a ball that's kept alive. A shank cracks the tile for 1 and gives the other side a free ball. */
export const DIG_GRADES = { perfect: 0.3, ok: 0.45, shank: 0.25 };

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

/** Their AI: weighs every spot by its value, boosts their habit column, and shades away from tips and rolls. */
export const AI = { habitBoost: 2, fastChance: 0.4, shots: { Hard: 1, Tip: 0.6, Roll: 0.5 } };
/** How much a crack (no points yet) is worth when the bots weigh their options. */
export const CRACK_VALUE = 0.8;
/** Keyed-in: after you set the same hitter this many times in a row, an extra blocker waits for them. */
export const KEYED_STREAK = 2;
