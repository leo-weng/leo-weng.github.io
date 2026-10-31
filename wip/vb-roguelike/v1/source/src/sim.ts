// Game simulator: plays whole games to 11 with a fixed decision policy and reports averages.
// Mirrors the UI's rally flow exactly (free ball → set → shot → dug balls continue via the placeholder counterattack).
import { BlockSystem, defaultShot, Hitter, Player, Role, SET_CALLS, SetCall, SHOTS, ShotId, shotsFor, STARTING_PLAN } from "./data";
import {
  activeCalls, availableCalls, callSpot, counterattack, defenseFor, emptyTendency, formBlock, keyedOn, remember, shotTarget, Tendency, gameWinner, makePass, makeRng, othersFor, Outcome, Pass,
  PassMode, previewCall, resolveShot, Rng, setQuality, simulateOdds,
  arrived } from "./engine";

export type Policy = "Default" | "Best odds" | "Random";
export const POLICIES: { id: Policy; about: string }[] = [
  { id: "Default", about: "Always the safe defaults: set the outside (plan call on a perfect pass, else a high 4) and swing Seam." },
  { id: "Best odds", about: "Picks the call with the best rough kill chance, then the shot with the best kill minus (blocked + error)." },
  { id: "Random", about: "Any available call, any open shot." },
];

export interface SimOptions {
  team: Record<Role, Player>;
  system: BlockSystem;
  passMode: PassMode;
  unlockAll: boolean;
  seed: number;
}

export interface SimStats {
  games: number;
  wins: number;
  pointsFor: number;
  pointsAgainst: number;
  rallies: number;
  attacks: number;
  outcomes: Record<Outcome, number>;
  byHitter: Record<Hitter, number>;
  combos: Record<string, { n: number; kills: number }>;
}

export const emptyStats = (): SimStats => ({
  games: 0, wins: 0, pointsFor: 0, pointsAgainst: 0, rallies: 0, attacks: 0,
  outcomes: { Kill: 0, Blocked: 0, Dug: 0, Error: 0 },
  byHitter: { OH: 0, MB: 0, OPP: 0 },
  combos: {},
});

function pickCall(rng: Rng, policy: Policy, pass: Pass, calls: Record<Hitter, SetCall>, o: SimOptions, t: Tendency): SetCall {
  const avail = availableCalls(pass);
  if (policy === "Random") return avail[Math.floor(rng() * avail.length)];
  if (policy === "Default") return pass.rating === 3 ? calls.OH : SET_CALLS.find((c) => c.id === "4")!;
  let best = avail[0], bestKill = -1;
  for (const c of avail) {
    const merged = { ...calls, [c.hitter]: c };
    const pv = previewCall(o.team, c, pass, othersFor(c, merged, pass.setterX), o.system, 6, 60, keyedOn(t, c.hitter));
    if (pv.roughKill > bestKill) { bestKill = pv.roughKill; best = c; }
  }
  return best;
}

function pickShot(rng: Rng, policy: Policy, open: ShotId[], ctx: Parameters<typeof resolveShot>[2], dflt: ShotId): ShotId {
  if (policy === "Random") return open[Math.floor(rng() * open.length)];
  if (policy === "Default") return dflt;
  let best: ShotId = dflt, bestEv = -9;
  for (const id of open) {
    const odds = simulateOdds(id, ctx, 300, 3);
    const ev = odds.Kill - odds.Blocked - odds.Error;
    if (ev > bestEv) { bestEv = ev; best = id; }
  }
  return best;
}

/** Plays one game and adds it to `st`. */
export function playGame(rng: Rng, policy: Policy, o: SimOptions, st: SimStats) {
  const openFor = (h: Hitter) => shotsFor(h).filter((s) => s.unlocked || o.unlockAll).map((s) => s.id);
  let us = 0, them = 0;
  const t = emptyTendency();
  while (!gameWinner(us, them)) {
    st.rallies++;
    let pass = makePass(rng, o.passMode);
    let winner: "us" | "them" | null = null;
    for (let attack = 0; attack < 50 && !winner; attack++) {
      const calls = activeCalls(STARTING_PLAN, pass);
      const call = pickCall(rng, policy, pass, calls, o, t);
      const spot = callSpot(call, pass.setterX);
      const block = formBlock(rng, call, spot, othersFor(call, { ...calls, [call.hitter]: call }, pass.setterX), o.system, keyedOn(t, call.hitter));
      const read = defenseFor(rng, t, spot, call.tempo, { system: o.system, blockers: arrived(block).length });
      block.targets = read.blockAt;
      const defense = read.defenders;
      const ctx = { hitter: o.team[call.hitter], hitterX: spot, set: setQuality(o.team.S, call, pass), block, defense, tendency: t, transition: pass.transition, tempo: call.tempo };
      const shot = pickShot(rng, policy, openFor(call.hitter), ctx, defaultShot(call.hitter));
      const res = resolveShot(rng, shot, ctx);
      remember(t, call.hitter, shot, shotTarget(shot, spot));
      st.attacks++;
      st.outcomes[res.outcome]++;
      st.byHitter[call.hitter]++;
      const key = `${call.id} · ${SHOTS.find((s) => s.id === shot)!.label}`;
      st.combos[key] ??= { n: 0, kills: 0 };
      st.combos[key].n++;
      if (res.outcome === "Kill") { st.combos[key].kills++; winner = "us"; }
      else if (res.outcome === "Blocked" || res.outcome === "Error") winner = "them";
      else {
        const c = counterattack(rng);
        if (c.outcome === "TheirKill") winner = "them";
        else if (c.outcome === "TheirError") winner = "us";
        else pass = c.pass!;
      }
    }
    if (winner === "us") us++; else them++;
  }
  st.games++;
  if (us > them) st.wins++;
  st.pointsFor += us;
  st.pointsAgainst += them;
}

export function simulateGames(n: number, policy: Policy, o: SimOptions): SimStats {
  const rng = makeRng(o.seed);
  const st = emptyStats();
  for (let i = 0; i < n; i++) playGame(rng, policy, o, st);
  return st;
}

export function summarize(st: SimStats) {
  const g = Math.max(1, st.games), a = Math.max(1, st.attacks);
  return {
    winRate: st.wins / g,
    avgFor: st.pointsFor / g,
    avgAgainst: st.pointsAgainst / g,
    ralliesPerGame: st.rallies / g,
    attacksPerRally: st.attacks / Math.max(1, st.rallies),
    pointWinRate: st.pointsFor / Math.max(1, st.pointsFor + st.pointsAgainst),
    kill: st.outcomes.Kill / a,
    blocked: st.outcomes.Blocked / a,
    dug: st.outcomes.Dug / a,
    error: st.outcomes.Error / a,
    hitterShare: { OH: st.byHitter.OH / a, MB: st.byHitter.MB / a, OPP: st.byHitter.OPP / a },
    topCombos: Object.entries(st.combos).sort((x, y) => y[1].n - x[1].n).slice(0, 5)
      .map(([k, v]) => ({ combo: k, share: v.n / a, kill: v.kills / v.n })),
  };
}
