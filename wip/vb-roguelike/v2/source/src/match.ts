// Plays whole matches with a bot policy, for the health check. Same engine calls the UI makes.
import {
  callsFor, canAim, killValue, colOf, formOurBlock, formTheirBlock, Game, Grade, isBroken, newGame, odds, other, ourAttackCtx, ourServe, planTheirAttack,
  resolveSwing, rowOf, Side, SwingCtx, team, theirAttackCtx, theirServe, tileIdx, trackAttack, upgradeChoices, endRally, Call, TheirPlan,
} from "./engine";
import { DIALS, Level, SHOT_KINDS, ShotKind } from "./tables";

export interface Policy {
  call(g: Game, calls: Call[]): Call;
  aim(g: Game, ctx: SwingCtx): { tile: number; shot: ShotKind };
  protect(g: Game, plan: TheirPlan): number;
}

export function bestAim(ctx: SwingCtx): { tile: number; shot: ShotKind; value: number } {
  let best = { tile: 4, shot: "Hard" as ShotKind, value: -1 };
  for (const shot of SHOT_KINDS) {
    for (let i = 0; i < 9; i++) {
      if (shot === "Tool" && i > 0) break;
      if (!canAim(i, shot)) continue;
      const o = odds(ctx, i, shot);
      const v = o.kill * killValue(ctx, i, shot) - (shot === "Hard" ? o.blockP * 0.6 : 0);
      if (v > best.value) best = { tile: i, shot, value: v };
    }
  }
  return best;
}

export const SMART: Policy = {
  call: (g, calls) => {
    const order = ["Combo", "Fast", "High"];
    const sorted = [...calls].sort((a, b) => order.indexOf(a.tempo) - order.indexOf(b.tempo));
    // Spread it around: skip the hitter they're keyed on when there's another choice.
    const fresh = sorted.filter((c) => !(g.track.hitter === c.hitter.id && g.track.hitterStreak >= 2));
    const pool = fresh.length ? fresh : sorted;
    return g.rng() < 0.7 ? pool[0] : pool[Math.floor(g.rng() * pool.length)];
  },
  aim: (_g, ctx) => bestAim(ctx),
  protect: (_g, plan) => {
    const c = plan.habit === "line" ? plan.call.col : plan.habit === "cross" ? 2 - plan.call.col : 1;
    return tileIdx(plan.call.hitter.role === "MB" ? 1 : 2, c);
  },
};
export const RANDOM: Policy = {
  call: (g, calls) => calls[Math.floor(g.rng() * calls.length)],
  aim: (g) => {
    const shot = SHOT_KINDS[Math.floor(g.rng() * 4)];
    const tiles = Array.from({ length: 9 }, (_, i) => i).filter((i) => canAim(i, shot));
    return { tile: tiles[Math.floor(g.rng() * tiles.length)] ?? 0, shot };
  },
  protect: (g) => Math.floor(g.rng() * 9),
};

export interface MatchStats { winner: Side; us: number; them: number; rallies: number; ourBroken: number; theirBroken: number; swings: number; kills: number; topPickBest: number; topPickTotal: number }
export function playMatch(level: Level, policy: Policy, seed: number): MatchStats {
  const g = newGame({ level, system: "Bunch", formation: "Perimeter", seed });
  let swings = 0, kills = 0, topBest = 0, topTotal = 0;
  while (!g.winner && g.rallies < 400) {
    const s = g.serving === "us" ? ourServe(g, "Float", Math.floor(g.rng() * 3)) : theirServe(g);
    let winner: Side | null = s.outcome === "ace" ? s.side : s.outcome === "error" ? other(s.side) : null;
    let attacker: Side = other(s.side);
    let grade: Grade = s.grade ?? "+";
    let touches = 0;
    while (!winner && touches++ < 30) {
      let res;
      if (attacker === "us") {
        const calls = callsFor(g.us, grade).filter((c) => c.enabled);
        const call = policy.call(g, calls);
        const ctx = ourAttackCtx(g, call, formTheirBlock(g, call), grade);
        const aim = policy.aim(g, ctx);
        // Health check: is the greenest tile (highest kill chance for a hard swing) also the best value pick?
        const greenest = Array.from({ length: 9 }, (_, i) => i).reduce((a, b) => (odds(ctx, b, "Hard").kill > odds(ctx, a, "Hard").kill ? b : a), 0);
        const best = bestAim(ctx);
        topTotal++;
        if (best.shot === "Hard" && best.tile === greenest) topBest++;
        trackAttack(g, call, aim.tile);
        res = resolveSwing(g, ctx, aim.tile, aim.shot);
        swings++;
        if (res.outcome === "Kill" || res.outcome === "Tool") kills++;
      } else {
        const plan = planTheirAttack(g, grade);
        const protect = policy.protect(g, plan);
        const block = formOurBlock(g, plan, protect);
        res = resolveSwing(g, theirAttackCtx(g, plan, block, grade, protect), plan.target, plan.shot);
      }
      winner = res.winner;
      if (!winner) { grade = res.nextGrade ?? "+"; attacker = other(attacker); }
    }
    endRally(g, winner ?? "them");
    if (!g.winner) { const ch = upgradeChoices(g); if (ch.length) ch[Math.floor(g.rng() * ch.length)].apply(g); }
  }
  const broken = (s: Side) => team(g, s).tiles.filter((h) => h <= 0).length;
  return { winner: g.winner ?? "them", us: g.us.score, them: g.them.score, rallies: g.rallies, ourBroken: broken("us"), theirBroken: broken("them"), swings, kills, topPickBest: topBest, topPickTotal: topTotal };
}
export { DIALS, rowOf, colOf };
