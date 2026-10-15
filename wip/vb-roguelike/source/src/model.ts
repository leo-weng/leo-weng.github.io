// The odds model: every swing is base rate × a few multipliers, each read from a small table Leo owns.
// A tile gets tags (reach, block, defense, digger, set, matchup); each tag is one row in a table.
import { Defender, Grade, SetQuality, THEM } from "./data";
import { AttackContext, blockHands, effectiveJump, outsideWindow, Rng } from "./engine";

export type Kind = "Hard" | "Tip" | "Roll" | "Tool";
export const KIND_LIST: Kind[] = ["Hard", "Tip", "Roll", "Tool"];
export type Reach = "in" | "edge" | "out";
export type BlockTag = "clear" | "seam" | "shadow";
export type DefTag = "open" | "close" | "there";
export type DiggerTag = "strong" | "average" | "weak";
export type MatchTag = "you win" | "even" | "they win";
export type ServeType = "Safe" | "Float" | "Jump";
export const SERVE_TYPES: ServeType[] = ["Safe", "Float", "Jump"];

/** All the numbers. Edited in the game's Numbers panel; nothing else decides the odds of a swing. */
export interface Tables {
  base: Record<Kind, number>;
  reach: Record<Reach, number>;
  reachError: Record<Reach, number>;
  block: Record<Kind, Record<BlockTag, number>>;
  blocked: Record<Kind, Record<BlockTag, number>>;
  defense: Record<Kind, Record<DefTag, number>>;
  digger: Record<DiggerTag, number>;
  set: Record<SetQuality, number>;
  setError: Record<SetQuality, number>;
  matchup: Record<MatchTag, number>;
  serve: Record<ServeType, { ace: number; error: number }>;
  servePass: Record<ServeType, Record<Grade, number>>;
  passer: Record<DiggerTag, number>;
  theirOffense: Record<"#" | "+" | "!", number>;
}
export const DEFAULT_TABLES: Tables = {
  base: { Hard: 0.6, Tip: 0.5, Roll: 0.5, Tool: 0.4 },
  reach: { in: 1, edge: 0.75, out: 0.35 },
  reachError: { in: 0.03, edge: 0.1, out: 0.3 },
  block: {
    Hard: { clear: 1, seam: 0.7, shadow: 0.25 },
    Tip: { clear: 1, seam: 0.9, shadow: 0.6 },
    Roll: { clear: 1, seam: 0.9, shadow: 0.7 },
    Tool: { clear: 0.3, seam: 1.2, shadow: 1 },
  },
  blocked: {
    Hard: { clear: 0, seam: 0.15, shadow: 0.45 },
    Tip: { clear: 0, seam: 0.05, shadow: 0.15 },
    Roll: { clear: 0, seam: 0.03, shadow: 0.1 },
    Tool: { clear: 0, seam: 0.05, shadow: 0.1 },
  },
  defense: {
    Hard: { open: 1, close: 0.8, there: 0.45 },
    Tip: { open: 1, close: 0.45, there: 0.1 },
    Roll: { open: 1, close: 0.55, there: 0.2 },
    Tool: { open: 1, close: 0.9, there: 0.7 },
  },
  digger: { strong: 0.85, average: 1, weak: 1.15 },
  set: { Perfect: 1, Good: 0.9, Off: 0.7 },
  setError: { Perfect: 0, Good: 0.02, Off: 0.06 },
  matchup: { "you win": 1.15, even: 1, "they win": 0.85 },
  serve: { Safe: { ace: 0.02, error: 0.03 }, Float: { ace: 0.06, error: 0.08 }, Jump: { ace: 0.12, error: 0.18 } },
  servePass: {
    Safe: { "#": 0.45, "+": 0.3, "!": 0.17, "-": 0.06, "/": 0.02, "=": 0 },
    Float: { "#": 0.3, "+": 0.3, "!": 0.22, "-": 0.13, "/": 0.05, "=": 0 },
    Jump: { "#": 0.2, "+": 0.25, "!": 0.25, "-": 0.2, "/": 0.1, "=": 0 },
  },
  passer: { strong: 0.2, average: 0, weak: -0.2 },
  theirOffense: { "#": -0.1, "+": 0, "!": 0.1 },
};
export const TABLE_NOTES: Record<keyof Tables, string> = {
  base: "Kill rate for a clean ball: in reach, no block, open court, perfect set, even matchup.",
  reach: "Can this attack get there? In the hitting window, at its edge, or outside it. Tips can't go deep; hard swings can't go short.",
  reachError: "Chance the swing goes out or into the net, added by reach.",
  block: "Kill multiplier by where the tile sits behind their block: clear of it, at the seam or a late hand, or in its shadow.",
  blocked: "Chance of getting stuffed, by attack and block tag.",
  defense: "Kill multiplier by the nearest digger: open (over 3 m away), close (1.6 to 3 m), or there.",
  digger: "That digger's quality (from their rotation): strong, average or weak. Only counts if they're close or there.",
  set: "Kill multiplier by set quality.",
  setError: "Extra error chance from the set.",
  matchup: "Your hitter's jump and power against the blockers in the way.",
  serve: "Ace and error chance by serve type. Same for both teams.",
  servePass: "Pass grade odds when the serve is in play (before the passer). = is left at 0: aces are counted above.",
  passer: "Passer quality moves that share of each grade one step better (+) or worse (−). A front-row outside passes one step worse.",
  theirOffense: "Their pass grade changes your dig: share moved one grade better (+) or worse (−). On a − pass they free-ball you; on an overpass you get it.",
};

const KEY = "vb-tables-v1";
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
function load(): Tables {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(clone(DEFAULT_TABLES), JSON.parse(raw));
  } catch { /* storage blocked */ }
  return clone(DEFAULT_TABLES);
}
/** Copy known numbers from `src` onto `dst`, ignoring anything unknown or not a number. */
function merge<T>(dst: T, src: unknown): T {
  if (!src || typeof src !== "object") return dst;
  for (const k of Object.keys(dst as object)) {
    const d = (dst as Record<string, unknown>)[k], s = (src as Record<string, unknown>)[k];
    if (typeof d === "number" && typeof s === "number" && isFinite(s)) (dst as Record<string, unknown>)[k] = s;
    else if (d && typeof d === "object") merge(d, s);
  }
  return dst;
}
export const T: Tables = load();
export function saveTables() { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch { /* storage blocked */ } }
export function resetTables() { Object.assign(T, clone(DEFAULT_TABLES)); saveTables(); }
export function importTables(json: string): boolean {
  try { const fresh = merge(clone(DEFAULT_TABLES), JSON.parse(json)); Object.assign(T, fresh); saveTables(); return true; } catch { return false; }
}
export function setTableValue(path: string, v: number) {
  const parts = path.split(".");
  let o = T as unknown as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) o = o[p] as Record<string, unknown>;
  if (typeof o[parts[parts.length - 1]] === "number" && isFinite(v)) { o[parts[parts.length - 1]] = v; saveTables(); }
}

// ---------- Tiles mode: holes and buffs ----------
/** Their broken tiles (index r*3+c): nobody can defend a hole. */
export const HOLES = new Set<number>();
/** Upgrades picked during a Tiles game, added on top of the tables (never written into them). */
export const BOOST = { base: { Hard: 0, Tip: 0, Roll: 0, Tool: 0 } as Record<Kind, number>, block: 0 };

// ---------- Tagging a tile ----------
export interface Tile { c: number; r: number }
export const tileCenter = (t: Tile) => ({ x: t.c * 3 + 1.5, y: t.r * 3 + 1.5 });
export const TILE_NAME = [["short left", "short middle", "short right"], ["mid left", "middle", "mid right"], ["deep left", "deep middle", "deep right"]];
export interface Tags { reach: Reach; block: BlockTag; defense: DefTag; digger: DiggerTag; set: SetQuality; matchup: MatchTag; nearest?: string }
export interface TileOdds { kill: number; blocked: number; error: number; dug: number; tags: Tags; chain: string }

/** Where the ball crosses the net on its way to p, from contact about a meter off the net. */
const netX = (hitterX: number, p: { x: number; y: number }) => hitterX + (p.x - hitterX) / (p.y + 1);

export function tagTile(kind: Kind, t: Tile, cx: AttackContext): Tags {
  const p = tileCenter(t);
  // Reach: the hitting window, plus what each attack can physically do.
  const past = cx.tempo ? outsideWindow(cx.hitter, cx.hitterX, cx.tempo, p) : 0;
  let reach: Reach = past <= 0 ? "in" : past < 3 ? "edge" : "out";
  const worse = (a: Reach): Reach => (a === "in" ? "edge" : "out");
  if (kind === "Tip") reach = t.r === 2 ? "out" : t.r === 1 ? worse(reach) : reach;
  if (kind === "Roll" && t.r === 0) reach = worse(reach);
  if (kind === "Hard" && t.r === 0) reach = worse(reach);
  // Block: is the path through a hand, at the edge of one, or clear?
  const hands = blockHands(cx.block, cx.hitterX);
  const x = netX(cx.hitterX, p);
  let block: BlockTag = "clear";
  for (const h of hands) {
    const d = Math.abs(x - h.x);
    if (d <= h.half && h.state === "Formed") block = "shadow";
    else if (d <= h.half + 0.35 && block !== "shadow") block = "seam";
  }
  // Defense: the nearest back-row digger (front-row players up at the net don't dig hard balls deep).
  const defs: Defender[] = (cx.defense ?? []).filter((d) => d.y >= 1.2);
  let near: Defender | undefined, dist = 99;
  for (const d of defs) { const k = Math.hypot(d.x - p.x, d.y - p.y); if (k < dist) { dist = k; near = d; } }
  const defense: DefTag = HOLES.has(t.r * 3 + t.c) ? "open" : dist < 1.6 ? "there" : dist < 3 ? "close" : "open";
  const mul = near && near.y >= 4.5 ? THEM.dig[near.x < 3 ? 0 : near.x > 6 ? 2 : 1] : 1;
  const digger: DiggerTag = mul >= 1.1 ? "strong" : mul <= 0.9 ? "weak" : "average";
  // Matchup: your jump and power against the blockers in the way.
  const you = (effectiveJump(cx) + cx.hitter.stats.power) / 2;
  const theirs = hands.length ? 5 + hands.reduce((a, h) => a + THEM.block[h.slot], 0) / hands.length : 0;
  const matchup: MatchTag = !hands.length ? "you win" : you - theirs >= 1.5 ? "you win" : you - theirs <= -1.5 ? "they win" : "even";
  return { reach, block, defense, digger, set: cx.set.quality, matchup, nearest: near?.name };
}

export function tileOdds(kind: Kind, t: Tile, cx: AttackContext): TileOdds {
  const g = tagTile(kind, t, cx);
  const dig = g.defense === "open" ? 1 : T.digger[g.digger];
  const parts: [string, number][] = [
    [`${kind} base`, T.base[kind] + BOOST.base[kind]], [`${g.reach} reach`, T.reach[g.reach]], [`block ${g.block}`, T.block[kind][g.block]],
    [`defense ${g.defense}`, T.defense[kind][g.defense]], ...(g.defense === "open" ? [] : [[`${g.digger} digger`, dig] as [string, number]]),
    [`${g.set.toLowerCase()} set`, T.set[g.set]], [`matchup ${g.matchup}`, T.matchup[g.matchup]],
  ];
  let kill = parts.reduce((a, [, v]) => a * v, 1);
  const error = Math.min(0.9, T.reachError[g.reach] + T.setError[g.set]);
  const blocked = Math.min(0.9, Math.max(0, T.blocked[kind][g.block] - BOOST.block) * (g.matchup === "they win" ? 1.2 : g.matchup === "you win" ? 0.8 : 1));
  kill = Math.max(0, Math.min(kill, 0.95, 1 - error - blocked));
  const dug = Math.max(0, 1 - kill - error - blocked);
  const chain = parts.map(([n, v], i) => (i === 0 ? `${Math.round(v * 100)}% ${n}` : `× ${v} ${n}`)).join(" ") + ` = ${Math.round(kill * 100)}%`;
  return { kill, blocked, error, dug, tags: g, chain };
}

export function allTiles(kind: Kind, cx: AttackContext): (TileOdds & Tile)[] {
  const out: (TileOdds & Tile)[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push({ c, r, ...tileOdds(kind, { c, r }, cx) });
  return out;
}

export function rollTile(rng: Rng, o: TileOdds): "Kill" | "Blocked" | "Error" | "Dug" {
  const r = rng();
  if (r < o.error) return "Error";
  if (r < o.error + o.blocked) return "Blocked";
  if (r < o.error + o.blocked + o.kill) return "Kill";
  return "Dug";
}
