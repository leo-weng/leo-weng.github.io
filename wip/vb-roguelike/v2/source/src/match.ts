// Plays whole matches with a bot policy, for the health check. Same engine calls the UI makes.
import {
  callsFor, Call, chase, Defender, endRally, formTheirBlock, Game, Grade, newGame, other, ourAttackCtx, N, readSquare, verdictValue,
  ourServe, planTheirAttack, resolveSwing, Side, SwingCtx, takeTimeout, team, theirAttackCtx, theirDefense, theirServe, TheirPlan, readResponse,
  trackAttack, upgradeChoices, SERVE_TARGETS, serveOdds, defenseSetup,
} from "./engine";
import { Level, SHOT_KINDS, ShotKind } from "./tables";

export interface Policy {
  call(g: Game, calls: Call[]): Call;
  aim(g: Game, ctx: SwingCtx): { tile: number; shot: ShotKind };
  /** Your defense move(s): returns the defenders after moving. */
  defend(g: Game, plan: TheirPlan): Defender[];
  serve(g: Game): number;
}

export function bestAim(g: Game, ctx: SwingCtx): { tile: number; shot: ShotKind; value: number } {
  let best = { tile: 21, shot: "Roll" as ShotKind, value: -2 };
  for (const shot of ["Hard", "Tip", "Roll"] as ShotKind[]) {
    for (let i = 0; i < N * N; i++) {
      const v = verdictValue(ctx, i, shot);
      if (v > best.value) best = { tile: i, shot, value: v };
    }
  }
  // Save the tool for when nothing scores.
  if (best.value < 1 && g.mods.tool && g.toolCd === 0 && ctx.block.front.some((f) => f.state !== "off")) return { tile: 0, shot: "Tool", value: 1 };
  return best;
}
/** Read the approach: move the nearest defender toward where it says the ball is going. */
function readMove(g: Game, plan: TheirPlan): Defender[] {
  return readResponse(g.us, plan.defs, plan.call.col, plan.tell, g.mods.moves, g.mods.step);
}
export const SMART: Policy = {
  call: (g, calls) => {
    const order = ["Combo", "Fast", "High"];
    const sorted = [...calls].sort((a, b) => order.indexOf(a.tempo) - order.indexOf(b.tempo));
    const fresh = sorted.filter((c) => !(g.track.hitter === c.hitter.id && g.track.hitterStreak >= 2));
    const pool = fresh.length ? fresh : sorted;
    return g.rng() < 0.7 ? pool[0] : pool[Math.floor(g.rng() * pool.length)];
  },
  aim: (g, ctx) => bestAim(g, ctx),
  defend: readMove,
  serve: (g) => {
    let best = 0, bv = -1;
    for (let t = 0; t < SERVE_TARGETS; t++) { const o = serveOdds(g, "us", "Float", t); if (o.good - o.error > bv) { bv = o.good - o.error; best = t; } }
    return best;
  },
};
export const RANDOM: Policy = {
  call: (g, calls) => calls[Math.floor(g.rng() * calls.length)],
  aim: (g, ctx) => {
    const shot = SHOT_KINDS[Math.floor(g.rng() * 3)];
    const tiles = Array.from({ length: N * N }, (_, i) => i).filter((i) => readSquare(ctx, i, shot).kind !== "closed");
    return tiles.length ? { tile: tiles[Math.floor(g.rng() * tiles.length)], shot } : { tile: 21, shot: "Roll" };
  },
  defend: (_g, plan) => plan.defs,
  serve: (g) => Math.floor(g.rng() * SERVE_TARGETS),
};

export interface MatchStats { winner: Side; us: number; them: number; rallies: number; ourBroken: number; theirBroken: number; swings: number; kills: number; errors: number; repeats: number; repeatKills: number }
export function playMatch(level: Level, policy: Policy, seed: number): MatchStats {
  const g = newGame({ level, system: "Bunch", formation: "Perimeter", seed });
  let swings = 0, kills = 0, errors = 0, repeats = 0, repeatKills = 0, lastTile = -1;
  while (!g.winner && g.rallies < 400) {
    const s = g.serving === "us" ? ourServe(g, "Float", policy.serve(g)) : theirServe(g);
    let winner: Side | null = s.outcome === "ace" ? s.side : s.outcome === "error" ? other(s.side) : null;
    let attacker: Side = other(s.side);
    let grade: Grade = s.grade ?? "+";
    let touches = 0;
    while (!winner && touches++ < 30) {
      let res;
      if (attacker === "us") {
        const calls = callsFor(g.us, grade).filter((c) => c.enabled);
        const call = policy.call(g, calls);
        const block = formTheirBlock(g, call);
        const ctx = ourAttackCtx(g, call, block, theirDefense(g, call, block), grade);
        const aim = policy.aim(g, ctx);
        const rep = aim.tile === lastTile && aim.shot !== "Tool";
        lastTile = aim.tile;
        trackAttack(g, call, aim.tile, aim.shot);
        res = resolveSwing(g, ctx, aim.tile, aim.shot);
        swings++;
        if (rep) repeats++;
        if (res.outcome === "Kill" || res.outcome === "Tool") { kills++; if (rep) repeatKills++; }
        if (res.outcome === "Error") errors++;
      } else {
        const plan = planTheirAttack(g, grade);
        const defs = policy.defend(g, plan);
        res = resolveSwing(g, theirAttackCtx(g, plan, plan.block, defs, grade), plan.target, plan.shot);
      }
      winner = res.winner;
      if (!winner) { grade = res.nextGrade ?? "+"; attacker = other(attacker); }
    }
    endRally(g, winner ?? "them");
    if (takeTimeout(g)) { const ch = upgradeChoices(g); if (ch.length) ch[Math.floor(g.rng() * ch.length)].apply(g); }
  }
  const broken = (s: Side) => team(g, s).tiles.filter((h) => h <= 0).length;
  return { winner: g.winner ?? "them", us: g.us.score, them: g.them.score, rallies: g.rallies, ourBroken: broken("us"), theirBroken: broken("them"), swings, kills, errors, repeats, repeatKills };
}
export { chase, defenseSetup };
