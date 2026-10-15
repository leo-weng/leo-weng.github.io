// A run (spec §12): three matches and a boss. Win a match, pick one of three rewards; lose one and the run ends.
// Pure data and functions; ui.ts owns the state.
import { BlockSystem, Opponent, OpponentLevel, Player, Role, ShotId, Stats } from "./data";
import { Rng } from "./engine";

/** A team you meet on a run: a level plus a personality you can learn to beat. */
export interface Foe {
  id: string;
  name: string;
  level: OpponentLevel;
  system: BlockSystem;
  mods: Partial<Opponent>;
  /** One line telling you their habit, so beating it is a plan and not luck. */
  scout: string;
  boss?: boolean;
}

export const FOES: Foe[] = [
  { id: "rockets", name: "Rookie Rockets", level: "Rookie", system: "Spread", mods: { defense: "SixUp" },
    scout: "Spread block, slow to close, and zone 6 plays up for tips. Fast sets to the pins beat the block; deep corners beat the defense." },
  { id: "patrol", name: "Cross Patrol", level: "Club", system: "Bunch", mods: { crossLean: 1.1, defense: "Perimeter" },
    scout: "Their defense lives cross court. Line and seam are open if you can get past the block." },
  { id: "hunters", name: "Middle Hunters", level: "Club", system: "Bunch", mods: { blockerReaction: 7, fooled: 1.8 },
    scout: "Their middle jumps on every quick. Run a decoy and they bite: look-alike calls fool them badly." },
  { id: "wall", name: "The Wall", level: "Club", system: "Bunch", mods: { blockJump: 7, blockerSpeed: 4 },
    scout: "Tall and slow. High balls run into a big block. Go fast, or swing deep over the top." },
  { id: "fortress", name: "The Fortress", level: "Elite", system: "Bunch", mods: { crossLean: 0.4 }, boss: true,
    scout: "Boss. Fast, disciplined and tall, and they key in on habits quickly. Game to 21." },
];

/** The run's route: an opener, one of two middle teams, the wall, then the boss. */
export function planRoute(rng: Rng): Foe[] {
  const by = (id: string) => FOES.find((f) => f.id === id)!;
  return [by("rockets"), rng() < 0.5 ? by("patrol") : by("hunters"), by("wall"), by("fortress")];
}
export const gameTo = (f: Foe) => (f.boss ? 21 : 11);

// ---- Rewards ----
export interface RunState {
  team: Record<Role, Player>;
  calls: Set<string>;
  shots: Set<ShotId>;
  perks: Set<string>;
}
export interface Reward {
  id: string;
  kind: "Call" | "Shot" | "Stat" | "Perk";
  title: string;
  text: string;
  apply: (r: RunState) => void;
}

/** Calls you start a run with; the rest are rewards. */
export const START_CALLS = ["4", "Go", "1", "3", "5", "Pull"];
const CALL_REWARDS: { id: string; text: string }[] = [
  { id: "Shoot", text: "A fast set to the outside. Beats the block, but you only get deep cross." },
  { id: "32", text: "Outside comes inside to hit between their blockers." },
  { id: "Gap", text: "Middle quick out toward the outside: drags their middle away." },
  { id: "Back 1", text: "Middle quick behind the setter, where their block can't follow." },
  { id: "Flat", text: "A fast set to the right side. Small window, small block." },
  { id: "Back 2", text: "Right side comes in behind the setter at medium speed." },
];
const SHOT_REWARDS: { id: ShotId; title: string; text: string }[] = [
  { id: "HardLine", title: "Hard line", text: "A faster line shot. Harder to dig, a bit wilder." },
  { id: "HardCross", title: "Hard cross", text: "A faster cross shot. Harder to dig, a bit wilder." },
  { id: "Tool", title: "Tool the block", text: "Swing off their hands and out of bounds." },
];
const STAT_REWARDS: { role: Role; stat: keyof Stats; text: string }[] = [
  { role: "OH", stat: "jump", text: "Hit over more of the block, and a wider window." },
  { role: "OH", stat: "power", text: "Harder swings: smaller dig reach, wider window." },
  { role: "OPP", stat: "jump", text: "Hit over more of the block, and a wider window." },
  { role: "OPP", stat: "power", text: "Harder swings: smaller dig reach, wider window." },
  { role: "MB", stat: "jump", text: "Quicks over the top, and a wider window." },
  { role: "MB", stat: "vision", text: "See their block more clearly on quicks." },
  { role: "S", stat: "control", text: "Better sets, even off a bad pass." },
  { role: "OH", stat: "control", text: "A tighter cone." },
];
const ROLE_NAME: Record<Role, string> = { S: "Setter", OH: "Outside", MB: "Middle", OPP: "Opposite", L: "Libero" };
export const PERKS: { id: string; title: string; text: string }[] = [
  { id: "big", title: "Clutch", text: "One more Big swing every game." },
  { id: "legs", title: "Fresh legs", text: "Rushed transitions become clean." },
  { id: "memory", title: "Short memory", text: "They forget your habits twice as fast." },
];

/** Three different rewards you don't have yet. */
export function offerRewards(rng: Rng, r: RunState): Reward[] {
  const pool: Reward[] = [];
  for (const c of CALL_REWARDS) if (!r.calls.has(c.id)) pool.push({ id: `call:${c.id}`, kind: "Call", title: `New call: ${c.id}`, text: c.text, apply: (s) => { s.calls.add(c.id); } });
  for (const c of SHOT_REWARDS) if (!r.shots.has(c.id)) pool.push({ id: `shot:${c.id}`, kind: "Shot", title: c.title, text: c.text, apply: (s) => { s.shots.add(c.id); } });
  for (const c of STAT_REWARDS) {
    const v = r.team[c.role].stats[c.stat];
    if (v < 9) pool.push({ id: `stat:${c.role}:${c.stat}`, kind: "Stat", title: `${ROLE_NAME[c.role]} ${c.stat} +1`, text: `${v} → ${v + 1}. ${c.text}`, apply: (s) => { s.team[c.role].stats[c.stat]++; } });
  }
  for (const p of PERKS) if (!r.perks.has(p.id)) pool.push({ id: `perk:${p.id}`, kind: "Perk", title: p.title, text: p.text, apply: (s) => { s.perks.add(p.id); } });
  // One of each kind where possible, so every pick is a real choice.
  const out: Reward[] = [];
  const kinds = ["Call", "Stat", "Shot", "Perk"].sort(() => rng() - 0.5);
  for (const k of kinds) {
    const of = pool.filter((p) => p.kind === k && !out.includes(p));
    if (of.length && out.length < 3) out.push(of[Math.floor(rng() * of.length)]);
  }
  while (out.length < 3 && out.length < pool.length) {
    const p = pool[Math.floor(rng() * pool.length)];
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

