// Every number the game uses. Mirrors the "VB Roguelike v2 Mechanics" Google Sheet; change both together.
// Rule: mechanics only ever turn one of the five dials. Nothing else decides a swing.

/** Dials tab: base values. */
export const DIALS = {
  /** Chance the ball lands in the tile you aimed at. */
  accuracy: 0.7,
  /** Multiplier on shot damage, and on how hard a swing is to dig. */
  power: 1,
  /** Chance one blocker touches a hard swing hit into their lane. */
  block: 0.3,
  /** Chance a digger keeps alive a ball hit to their tile. */
  dig: 0.65,
  /** Choices on screen (sets and shots). Informational for now. */
  options: 3,
};

/** Probabilities never go above this. */
export const CAP = 0.95;

export type Level = "Easy" | "Normal" | "Hard" | "Boss";
export const LEVELS: Level[] = ["Easy", "Normal", "Hard", "Boss"];

/** Difficulty tab: multipliers on the dials, per level. */
export const DIFFICULTY: Record<Level, { yourAcc: number; yourPower: number; theirBlock: number; theirDig: number; theirAcc: number; tileHits: number }> = {
  Easy: { yourAcc: 1.3, yourPower: 1.2, theirBlock: 0.8, theirDig: 0.8, theirAcc: 0.85, tileHits: 1 },
  Normal: { yourAcc: 1, yourPower: 1, theirBlock: 1, theirDig: 1, theirAcc: 1, tileHits: 2 },
  Hard: { yourAcc: 0.9, yourPower: 1, theirBlock: 1.2, theirDig: 1.2, theirAcc: 1.05, tileHits: 3 },
  Boss: { yourAcc: 0.85, yourPower: 1, theirBlock: 1.3, theirDig: 1.3, theirAcc: 1.1, tileHits: 4 },
};
/** Your own tiles always take this many hits on every level. */
export const YOUR_TILE_HITS = 2;

/** Scoring tab. A crack scores nothing; points come when a tile breaks. */
export const SCORING = { crack: 0, break: 3, hole: 1, tool: 1, ace: 1, error: 1, stuff: 1, toWin: 15 };

export type ShotKind = "Hard" | "Tip" | "Roll" | "Tool";
export const SHOT_KINDS: ShotKind[] = ["Hard", "Tip", "Roll", "Tool"];
/** Shots. accBonus adds to accuracy; digMult scales the digger's chance; rows the shot can reach (0 = by the net). */
export const SHOTS: Record<ShotKind, { damage: number; accBonus: number; digMult: number; errorOnMiss: number; rows: number[]; overBlock: boolean; blurb: string }> = {
  Hard: { damage: 2, accBonus: 0, digMult: 0.8, errorOnMiss: 0.5, rows: [0, 1, 2], overBlock: false, blurb: "Breaks tiles. The block can stop it." },
  Tip: { damage: 1, accBonus: 0.15, digMult: 1.5, errorOnMiss: 0.1, rows: [0, 1], overBlock: true, blurb: "Short, over the block. Easy to dig if someone's close." },
  Roll: { damage: 1, accBonus: 0.1, digMult: 1.3, errorOnMiss: 0.1, rows: [1, 2], overBlock: true, blurb: "Over the block to an open spot. Rarely misses." },
  Tool: { damage: 0, accBonus: 0, digMult: 0, errorOnMiss: 0, rows: [], overBlock: false, blurb: "Off their hands for a point. No tile damage." },
};
/** Tool: chance to score off the block = base + per blocker; with no block it is a long shot. */
export const TOOL = { base: 0.45, perBlocker: 0.1, noBlock: 0.1, errorOnFail: 0.5 };

/** Set quality multiplies accuracy. */
export type SetQuality = "Perfect" | "Good" | "Poor";
export const SET_MULT: Record<SetQuality, number> = { Perfect: 1, Good: 0.9, Poor: 0.75 };

/** Combos (Mechanics tab): perfect pass + perfect set. */
export const COMBO = { accBonus: 0.2, damageMult: 2 };

/** Out-of-range tiles are still hittable, at this accuracy multiplier. */
export const OUT_OF_RANGE = 0.5;

/** Dig coverage: a digger on the tile, next to it, or diagonal. */
export const COVER = { on: 1, side: 0.6, diagonal: 0.3, read: 1.3 };
export const DIG_CAP = 0.9;
/** Each point of hitter Power over 5 makes a hard swing this much harder to dig. */
export const POWER_PER_POINT = 0.05;
/** Each point of hitter Control over 5 adds this much accuracy. */
export const CONTROL_PER_POINT = 0.04;
/** Each point of hitter Jump over 5 lowers the block's chance by this much. */
export const JUMP_PER_POINT = 0.06;
/** A late blocker touches the ball at this share of a formed blocker's chance. */
export const LATE_BLOCKER = 0.5;
/** Share of block touches that are stuff blocks (point for the blockers); the rest are soft touches they dig. */
export const STUFF_SHARE = 0.6;

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
/** Keyed-in: after you hit the same column this many times in a row, their libero moves there. */
export const KEYED_STREAK = 2;
