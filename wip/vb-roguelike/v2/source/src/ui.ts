// The game screen: one decision at a time, each with clear action buttons. Drives the engine step by step.
import {
  BlockForm, BlockSystem, Call, callsFor, canAim, colOf, defenseSpots, endRally, Formation, formOurBlock, formTheirBlock, Game, Grade, killValue,
  newGame, odds, ourAttackCtx, ourServe, passers, planTheirAttack, resolveSwing, rotationNumber, rowOf, setQuality, Side, SwingCtx, SwingResult,
  Team, theirAttackCtx, theirServe, TheirPlan, tileIdx, trackAttack, Upgrade, upgradeChoices,
} from "./engine";
import { DIALS, DIFFICULTY, Level, LEVELS, SCORING, SERVE_TYPES, ServeType, SHOT_KINDS, SHOTS, ShotKind } from "./tables";
import { ballBlocked, ballFromNet, ballOut, ballServe, courtSvg, CourtOpts, netSvg, NetToken, reasons, tileCenter, toneOf, TONE_WORD } from "./views";

type Screen = "start" | "serve" | "set" | "hit" | "result" | "defend" | "upgrade" | "end";
interface ResultView {
  callout: string;
  tone: "win" | "lose" | "plain";
  sub: string;
  pts?: string;
  court: CourtOpts;
  nextLabel: string;
  next: () => void;
  shake?: boolean;
}
interface State {
  screen: Screen;
  level: Level;
  system: BlockSystem;
  formation: Formation;
  g?: Game;
  grade?: Grade;
  callId?: string;
  call?: Call;
  block?: BlockForm;
  ctx?: SwingCtx;
  tile?: number;
  shot: ShotKind;
  serveType: ServeType;
  passer?: number;
  plan?: TheirPlan;
  protect: number;
  result?: ResultView;
  upgrades?: Upgrade[];
  chain: { pass: boolean; set: boolean; kill: boolean };
  netAnim: boolean;
  lab: boolean;
}
const st: State = { screen: "start", level: "Normal", system: "Bunch", formation: "Perimeter", shot: "Hard", serveType: "Float", protect: -1, chain: { pass: false, set: false, kill: false }, netAnim: false, lab: false };

const GRADE_WORD: Record<Grade, string> = { "#": "Perfect", "+": "Good", "!": "OK", "-": "Poor" };
const GRADE_OPEN: Record<Grade, string> = {
  "#": "Perfect pass: every set is open, combos included.",
  "+": "Good pass: every set but the combo is open.",
  "!": "OK pass: high balls only.",
  "-": "Poor pass: high balls only, and the set will be off.",
};
const ZONE_ROW = ["Short", "Mid", "Deep"];
function zoneName(tile: number, h: number): string {
  const c = colOf(tile);
  const lane = h === 1 ? (c === 1 ? "middle" : c === 0 ? "left" : "right") : c === h ? "line" : c === 1 ? "seam" : "cross";
  return `${ZONE_ROW[rowOf(tile)]} ${lane}`;
}
const who = (id: string) => (id === "L" ? "libero" : id);
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

// ---------- Flow ----------
function startMatch() {
  st.g = newGame({ level: st.level, system: st.system, formation: st.formation });
  nextRally();
}
function nextRally() {
  const g = st.g!;
  st.chain = { pass: false, set: false, kill: false };
  st.tile = undefined;
  if (g.serving === "us") { st.screen = "serve"; st.passer = undefined; render(); return; }
  const s = theirServe(g);
  const ps = passers(g.us)[s.passerIdx];
  const to = tileCenter("us", tileIdx(2, ps.col));
  const court: CourtOpts = { ...base(), focus: "both", ourPassers: ourPasserToks(), ball: { path: ballServe("them", to), kind: "serve", land: to } };
  if (s.outcome === "ace") return showResult({ callout: "Ace", tone: "lose", sub: `Their ${s.type.toLowerCase()} serve beats your ${ps.p.id}.`, pts: `+${SCORING.ace} them`, court, nextLabel: "Next rally", next: () => afterRally("them") });
  if (s.outcome === "error") return showResult({ callout: "Service error", tone: "win", sub: "Their serve goes into the net.", pts: `+${SCORING.error} you`, court, nextLabel: "Next rally", next: () => afterRally("us") });
  showResult({
    callout: `${GRADE_WORD[s.grade!]} pass`, tone: "plain", court,
    sub: `They serve ${s.type.toLowerCase()} at your ${who(ps.p.id)}${ps.front ? " (front row, so passing is harder)" : ""}, who passes ${s.grade}.`,
    nextLabel: "Set the ball", next: () => toSet(s.grade!),
  });
}
function toSet(grade: Grade) {
  const g = st.g!;
  st.grade = grade;
  st.chain = { pass: grade === "#", set: false, kill: false };
  const calls = callsFor(g.us, grade);
  st.callId = (calls.find((c) => c.enabled && c.tempo === "High") ?? calls.find((c) => c.enabled))?.id;
  st.screen = "set";
  render();
}
function confirmSet() {
  const g = st.g!;
  const call = callsFor(g.us, st.grade!).find((c) => c.id === st.callId && c.enabled);
  if (!call) return;
  st.call = call;
  st.block = formTheirBlock(g, call);
  st.ctx = ourAttackCtx(g, call, st.block, st.grade!);
  st.chain.set = setQuality(st.grade!, call.tempo) === "Perfect";
  st.tile = undefined;
  st.shot = "Hard";
  st.netAnim = true;
  st.screen = "hit";
  render();
}
function swing() {
  const g = st.g!, call = st.call!, ctx = st.ctx!;
  if (st.shot !== "Tool" && st.tile === undefined) return;
  const aimed = st.tile ?? tileIdx(1, 1);
  trackAttack(g, call, aimed);
  const res = resolveSwing(g, ctx, aimed, st.shot);
  st.chain.kill = res.outcome === "Kill" && ctx.combo;
  showResult(swingView(res, "us", call.col, () => (res.winner ? afterRally(res.winner) : toDefend(res.nextGrade ?? "+"))));
}
function toDefend(grade: Grade) {
  const g = st.g!;
  st.grade = grade;
  st.plan = planTheirAttack(g, grade);
  st.protect = -1;
  st.screen = "defend";
  render();
}
function ready() {
  const g = st.g!, plan = st.plan!;
  const block = formOurBlock(g, plan, st.protect);
  const ctx = theirAttackCtx(g, plan, block, st.grade!, st.protect);
  const res = resolveSwing(g, ctx, plan.target, plan.shot);
  const v = swingView(res, "them", plan.call.col, () => (res.winner ? afterRally(res.winner) : toSet(res.nextGrade ?? "+")));
  v.court.ourBlock = { system: g.us.system, h: plan.call.col, blockers: block.blockers };
  v.court.ourDefense = ctx.spots;
  v.court.ourMarked = st.protect >= 0 ? st.protect : undefined;
  const guessed = st.protect === plan.target;
  if (st.protect >= 0) v.sub += guessed ? " You read it: that's the tile you protected." : ` They went ${zoneName(plan.target, plan.call.col).toLowerCase()}.`;
  showResult(v);
}
function serveNow() {
  const g = st.g!;
  if (st.passer === undefined) return;
  const s = ourServe(g, st.serveType, st.passer);
  const ps = passers(g.them)[st.passer];
  const to = tileCenter("them", tileIdx(2, ps.col));
  const court: CourtOpts = { ...base(), focus: "both", theirPassers: theirPasserToks(), passerSelected: st.passer, ball: { path: ballServe("us", to), kind: "serve", land: to } };
  if (s.outcome === "ace") return showResult({ callout: "Ace!", tone: "win", sub: `Your ${st.serveType.toLowerCase()} serve beats their ${ps.p.id}.`, pts: `+${SCORING.ace} you`, court, nextLabel: "Next rally", next: () => afterRally("us"), shake: true });
  if (s.outcome === "error") return showResult({ callout: "Service error", tone: "lose", sub: `Your ${st.serveType.toLowerCase()} serve goes into the net.`, pts: `+${SCORING.error} them`, court, nextLabel: "Next rally", next: () => afterRally("them") });
  showResult({
    callout: `They pass ${s.grade}`, tone: s.grade === "#" || s.grade === "+" ? "plain" : "win", court,
    sub: `Their ${ps.p.id} passes ${GRADE_WORD[s.grade!].toLowerCase()}. ${s.grade === "#" || s.grade === "+" ? "They can run a fast offense." : "They're stuck with a high ball."}`,
    nextLabel: "Defend their attack", next: () => toDefend(s.grade!),
  });
}
function afterRally(winner: Side) {
  const g = st.g!;
  endRally(g, winner);
  if (g.winner) { st.screen = "end"; render(); return; }
  st.upgrades = upgradeChoices(g);
  st.screen = "upgrade";
  render();
}
function showResult(r: ResultView) {
  st.result = r;
  st.screen = "result";
  render();
  if (r.shake) { const el = document.getElementById("court"); el?.classList.remove("shake"); void el?.offsetWidth; el?.classList.add("shake"); }
}

/** Turn a swing result into the result screen: callout, points, and the ball's flight. */
function swingView(res: SwingResult, attacker: Side, h: number, next: () => void): ResultView {
  const defSide: Side = attacker === "us" ? "them" : "us";
  const mine = attacker === "us";
  const court: CourtOpts = { ...base(), focus: "both" };
  if (mine) { court.ourHitterCol = h; court.ourHitterLabel = st.call!.hitter.id; court.theirBlock = { system: st.g!.them.system, h, blockers: st.block!.blockers }; court.theirDefense = st.ctx!.spots; }
  else { court.theirHitterCol = h; court.theirHitterLabel = st.plan!.call.hitter.id; }
  const land = res.landed !== null ? tileCenter(defSide, res.landed) : undefined;
  if (res.outcome === "Stuff" || res.outcome === "Touch") { const b = ballBlocked(attacker, h); court.ball = { ...b, kind: "blocked" }; }
  else if (res.outcome === "Error" || res.outcome === "Tool") court.ball = { path: ballOut(attacker, h), kind: res.outcome === "Tool" ? "tool" : "out" };
  else if (land) court.ball = { path: ballFromNet(attacker, h, land), land, kind: res.outcome === "Kill" ? "kill" : "dug" };
  if (res.landed !== null && (res.outcome === "Kill" || res.outcome === "Shank")) { if (mine) court.flashTheir = res.landed; else court.flashOur = res.landed; }

  const us = (n: number) => `+${n} you`, them = (n: number) => `+${n} them`;
  const nextLabel = res.winner ? "Next rally" : mine ? "Defend their attack" : "Set the ball";
  const who = mine ? "you" : "they";
  switch (res.outcome) {
    case "Kill":
      if (res.hole) return { callout: mine ? "Into the hole!" : "Into your hole", tone: mine ? "win" : "lose", sub: "Holes can't be dug.", pts: mine ? us(res.points) : them(res.points), court, nextLabel, next, shake: mine };
      if (res.broke) return { callout: mine ? "Tile broken!" : "They broke a tile", tone: mine ? "win" : "lose", sub: `${res.damage} damage${mine && st.chain.kill ? " (combo, double damage)" : ""}. That tile is a hole now.`, pts: mine ? us(res.points) : them(res.points), court, nextLabel, next, shake: true };
      return { callout: mine ? "Kill! Tile cracked" : "They crack a tile", tone: mine ? "win" : "lose", sub: `${res.damage} damage. No points until it breaks.`, pts: "+0", court, nextLabel, next, shake: mine };
    case "Tool": return { callout: "Tooled it!", tone: "win", sub: `Off their hands and out. A point, but no tile damage.`, pts: mine ? us(res.points) : them(res.points), court, nextLabel, next };
    case "Stuff": return { callout: mine ? "Stuffed" : "Stuff block!", tone: mine ? "lose" : "win", sub: mine ? "Their block got you." : "Your block shut it down.", pts: mine ? them(SCORING.stuff) : us(SCORING.stuff), court, nextLabel, next, shake: !mine };
    case "Error": return { callout: mine ? "Hitting error" : "They hit it out", tone: mine ? "lose" : "win", sub: res.text, pts: mine ? them(SCORING.error) : us(SCORING.error), court, nextLabel, next };
    case "Touch": return { callout: "Block touch", tone: "plain", sub: `${mine ? "They" : "You"} keep it alive off the block.`, court, nextLabel, next };
    case "Shank": return { callout: mine ? "They shank it" : "Shanked", tone: mine ? "win" : "lose", sub: `${res.damage ? "The tile cracks, " : ""}${mine ? "you get" : "they get"} a free ball.`, court, nextLabel, next };
    default: return { callout: mine ? "Dug" : "Great dig!", tone: mine ? "plain" : "win", sub: `${mine ? "They dig it" : "You dig it"} (${res.nextGrade}). ${mine ? "Now they swing back." : "Now you swing back."}`, court, nextLabel, next };
  }
  void who;
}

// ---------- Court helpers ----------
function base(): Pick<CourtOpts, "us" | "them"> { return { us: st.g!.us, them: st.g!.them }; }
function theirPasserToks() { return passers(st.g!.them).map((p) => ({ col: p.col, label: p.p.id, skill: p.front ? "weak" : p.p.passer })); }
function ourPasserToks() { return passers(st.g!.us).map((p) => ({ col: p.col, label: p.p.id, skill: p.front ? "weak" : p.p.passer })); }
function laneShadow(block: BlockForm): number[] {
  return block.blockers.flatMap((b) => [tileIdx(1, b.lane), tileIdx(2, b.lane)]);
}

// ---------- Rendering ----------
function setSlot(id: string, html: string) {
  const el = document.getElementById(id);
  if (el && el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
}
function pill(act: string, v: string, label: string, sub: string, on: boolean, disabled = false, why = "") {
  return `<button class="pill${on ? " is-on" : ""}" data-act="${act}" data-v="${esc(v)}"${disabled ? " disabled" : ""} aria-pressed="${on}">
    <span class="pill-name">${esc(label)}</span><span class="pill-sub">${esc(disabled && why ? why : sub)}</span></button>`;
}
function scoreBar(): string {
  const g = st.g;
  if (!g) return "";
  const pips = st.screen === "set" || st.screen === "hit" || (st.screen === "result" && st.chain.pass)
    ? `<div class="chain" aria-label="Combo chain"><span class="chain-label">Combo</span>${(["pass", "set", "kill"] as const).map((k) => `<span class="cpip${st.chain[k] ? " lit" : ""}">${k}</span>`).join("")}</div>`
    : `<div class="chain chain-idle"><span class="chain-label">First to ${SCORING.toWin}</span></div>`;
  return `<div class="score"><div class="team-score you"><span>You</span><b>${g.us.score}</b></div>
    <div class="score-mid">${pips}<span class="serving">${g.serving === "us" ? "▲ your serve" : "their serve ▼"} · rotation ${rotationNumber(g.us)}</span></div>
    <div class="team-score them"><b>${g.them.score}</b><span>${esc(g.them.name)}</span></div></div>`;
}
function role(chip: string, title: string, sub: string, cls = ""): string {
  return `<div class="role ${cls}">${chip ? `<span class="role-chip">${chip}</span>` : ""}<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>`;
}

function render() {
  setSlot("top", scoreBar());
  let roleHtml = "", net = "", court = "", info = "", actions = "", go = "";
  const g = st.g;
  switch (st.screen) {
    case "start": {
      roleHtml = `<div class="title"><h1>Volleyball Roguelike</h1><p class="kicker">v2 · draft 1 · one match</p></div>
        <ul class="how"><li>You play whoever touches the ball: <b>server</b>, <b>setter</b>, <b>hitter</b>, and on defense the <b>puppet master</b> who sets up the block and the libero.</li>
        <li>Every kill cracks a tile on their floor. <b>A broken tile is 3 points</b> and becomes a hole. A crack scores nothing until it breaks.</li>
        <li>Holes, tools, aces and errors are 1 point each. <b>First to ${SCORING.toWin}</b> wins.</li>
        <li>A perfect pass and a perfect set build a combo: better aim, and a kill does double damage.</li></ul>`;
      actions = `<div class="group"><h3>Difficulty</h3><div class="pills">${LEVELS.map((l) => pill("level", l, l, `Their tiles take ${DIFFICULTY[l].tileHits} hit${DIFFICULTY[l].tileHits > 1 ? "s" : ""}`, st.level === l)).join("")}</div></div>
        <div class="group"><h3>Your block</h3><div class="pills">${pill("system", "Bunch", "Bunch", "Strong in the middle, slow to the pins", st.system === "Bunch")}${pill("system", "Spread", "Spread", "Always someone on the pins, weaker middle", st.system === "Spread")}</div></div>
        <div class="group"><h3>Your defense</h3><div class="pills">${pill("formation", "Perimeter", "Perimeter", "Diggers deep, short is open", st.formation === "Perimeter")}${pill("formation", "Rotational", "Rotational", "Line digger up for tips", st.formation === "Rotational")}${pill("formation", "SixUp", "6-up", "Middle back plays up", st.formation === "SixUp")}</div></div>`;
      go = `<button class="go" data-act="start">Start match</button>`;
      break;
    }
    case "serve": {
      roleHtml = role("Server", "Pick a serve and a target", "Tap one of their passers. Shaky passers give you a better chance at a bad pass.");
      court = courtSvg({ ...base(), focus: "both", pick: "passers", theirPassers: theirPasserToks(), passerSelected: st.passer });
      actions = `<div class="pills">${SERVE_TYPES.map((t) => pill("serve-type", t, t, t === "Safe" ? "Almost never misses" : t === "Float" ? "Tougher pass, some misses" : "Aces and errors", st.serveType === t)).join("")}</div>`;
      go = `<button class="go" data-act="serve"${st.passer === undefined ? " disabled" : ""}>${st.passer === undefined ? "Tap a passer first" : "Serve"}</button>`;
      break;
    }
    case "set": {
      const calls = callsFor(g!.us, st.grade!);
      const sel = calls.find((c) => c.id === st.callId);
      roleHtml = role("Setter", "Who gets the set?", GRADE_OPEN[st.grade!]);
      const toks: NetToken[] = calls.filter((c, i, a) => a.findIndex((d) => d.hitter.id === c.hitter.id) === i)
        .map((c) => ({ col: c.col, label: c.hitter.id, sub: c.hitter.trait, selected: sel?.hitter.id === c.hitter.id, disabled: !calls.some((d) => d.hitter.id === c.hitter.id && d.enabled) }));
      net = netSvg({ system: g!.them.system, animate: false, hitters: toks });
      actions = `<div class="pills">${calls.map((c) => pill("call", c.id, c.name, c.desc, c.id === st.callId, !c.enabled, c.why)).join("")}</div>`;
      if (g!.track.hitterStreak >= 2) info = `<p class="note warn">They're keying on ${g!.track.hitter}: set them again and an extra blocker will be waiting.</p>`;
      go = `<button class="go" data-act="set"${sel?.enabled ? "" : " disabled"}>Set ${sel ? esc(sel.hitter.id) : "it"}</button>`;
      break;
    }
    case "hit": {
      const call = st.call!, ctx = st.ctx!, block = st.block!;
      roleHtml = role(`Hitter · ${call.hitter.id}`, "Pick a spot and a shot", `${block.blockers.length === 0 ? "No block up!" : `${block.blockers.length} blocker${block.blockers.length > 1 ? "s" : ""} up${block.blockers.some((b) => !b.formed) ? ", one is late" : ""}.`} Greener tiles are better looks.`);
      net = netSvg({ system: g!.them.system, animate: st.netAnim, block: { h: call.col, blockers: block.blockers, tempo: call.tempo }, hitters: [{ col: call.col, label: call.hitter.id, sub: "", selected: true, disabled: false }] });
      const tones = Array.from({ length: 9 }, (_, i) => (st.shot === "Tool" || !canAim(i, st.shot) ? null : toneOf(odds(ctx, i, st.shot).kill)));
      court = courtSvg({ ...base(), focus: "their", pick: st.shot === "Tool" ? undefined : "their", theirTones: tones, theirSelected: st.tile, theirShadow: st.shot === "Hard" ? laneShadow(block) : [], theirDefense: ctx.spots, theirBlock: { system: g!.them.system, h: call.col, blockers: block.blockers }, ourHitterCol: call.col, ourHitterLabel: call.hitter.id });
      const notes: string[] = [];
      if (ctx.combo) notes.push(`<p class="note good">Combo: perfect pass and perfect set. Better aim, and a kill does double damage.</p>`);
      if (block.keyed) notes.push(`<p class="note warn">They're onto ${call.hitter.id}: an extra blocker keyed on them.</p>`);
      if (ctx.readTile >= 0) notes.push(`<p class="note warn">Their libero is camping ${zoneName(ctx.readTile, call.col).toLowerCase()}, where you keep hitting.</p>`);
      if (st.shot === "Tool") {
        const o = odds(ctx, 0, "Tool");
        info = `<p class="info"><b>${TONE_WORD[toneOf(o.kill)]}</b> · aim off their hands. ${block.blockers.length ? `${block.blockers.length} blocker${block.blockers.length > 1 ? "s" : ""} to use` : "There's no block to use"}. Scores 1, no tile damage.</p>`;
      } else if (st.tile !== undefined) {
        const o = odds(ctx, st.tile, st.shot);
        const v = killValue(ctx, st.tile, st.shot);
        const what = o.hole ? "hole, +1" : v === SCORING.break ? "breaks the tile, +3" : "cracks it, no points yet";
        info = `<p class="info"><b>${zoneName(st.tile, call.col)}</b> · <span class="tw t-${toneOf(o.kill)}">${TONE_WORD[toneOf(o.kill)]}</span> · ${reasons(o).join(", ")} · ${what}</p>`;
      } else info = `<p class="info muted">Tap a tile on their floor.</p>`;
      info = notes.join("") + info;
      actions = `<div class="pills">${SHOT_KINDS.map((k) => pill("shot", k, k, SHOTS[k].blurb, st.shot === k)).join("")}</div>`;
      const ok = st.shot === "Tool" || st.tile !== undefined;
      go = `<button class="go" data-act="swing"${ok ? "" : " disabled"}>${ok ? "Swing" : "Tap a tile first"}</button>`;
      break;
    }
    case "defend": {
      const plan = st.plan!;
      roleHtml = role("Puppet master", "Where do you defend?", "Tap the tile to protect. Your libero goes there, and your block slides over if it can.");
      const blockPreview = formPreview();
      court = courtSvg({ ...base(), focus: "our", pick: "our", ourSelected: st.protect >= 0 ? st.protect : undefined, ourDefense: previewSpots(blockPreview.blockers.length), ourBlock: { system: g!.us.system, h: plan.call.col, blockers: blockPreview.blockers }, theirHitterCol: plan.call.col, theirHitterLabel: plan.call.hitter.id, ourShadow: laneShadow(blockPreview) });
      info = `<p class="note intent">${esc(plan.intent)}</p>`;
      actions = st.protect >= 0 ? `<div class="pills">${pill("protect-clear", "", "Play it straight", "Clear your pick", false)}</div>` : "";
      go = `<button class="go" data-act="ready">${st.protect >= 0 ? `Protect ${zoneName(st.protect, plan.call.col).toLowerCase()}` : "Play it straight"}</button>`;
      break;
    }
    case "result": {
      const r = st.result!;
      roleHtml = `<div class="result r-${r.tone}"><p class="callout">${esc(r.callout)}</p>${r.pts ? `<p class="pts">${esc(r.pts)}</p>` : ""}<p class="sub">${esc(r.sub)}</p></div>`;
      court = courtSvg(r.court);
      go = `<button class="go" data-act="next">${esc(r.nextLabel)}</button>`;
      break;
    }
    case "upgrade": {
      roleHtml = role("", "Pick an upgrade", "Your team gets better after every rally.");
      actions = `<div class="cards">${st.upgrades!.map((u) => `<button class="card" data-act="upgrade" data-v="${u.id}"><span class="card-dial">${u.dial}</span><span class="card-name">${esc(u.name)}</span><span class="card-desc">${esc(u.desc)}</span></button>`).join("")}</div>`;
      court = courtSvg({ ...base(), focus: "both" });
      break;
    }
    case "end": {
      const won = g!.winner === "us";
      const broke = (t: Team) => t.tiles.filter((h) => h <= 0).length;
      roleHtml = `<div class="result r-${won ? "win" : "lose"}"><p class="callout">${won ? "You win!" : `${esc(g!.them.name)} wins`}</p><p class="pts">${g!.us.score}–${g!.them.score}</p>
        <p class="sub">You broke ${broke(g!.them)} of their tiles; they broke ${broke(g!.us)} of yours, in ${g!.rallies} rallies.</p></div>`;
      court = courtSvg({ ...base(), focus: "both" });
      go = `<button class="go" data-act="again">Play again</button>`;
      break;
    }
  }
  setSlot("role", roleHtml);
  setSlot("net", net);
  setSlot("court", court);
  setSlot("info", info);
  setSlot("actions", actions);
  setSlot("go", go);
  if (st.lab) renderLab();
}
/** What your block and defense will look like for the protect pick, before the ball is live (no randomness). */
function formPreview(): BlockForm {
  const plan = st.plan!, g = st.g!;
  const n = plan.call.tempo === "Fast" ? 1 : g.us.system === "Bunch" && plan.call.hitter.role !== "MB" ? 2 : plan.call.hitter.role === "MB" && g.us.system === "Bunch" ? 2 : g.us.system === "Spread" && plan.call.hitter.role === "MB" ? 1 : 2;
  const lanes = plan.call.col === 1 ? [1, 0, 2] : [1, plan.call.col, 2 - plan.call.col];
  const blockers = lanes.slice(0, n).map((lane) => ({ lane, formed: true }));
  if (st.protect >= 0 && rowOf(st.protect) >= 1 && !blockers.some((b) => b.lane === colOf(st.protect))) blockers[blockers.length - 1].lane = colOf(st.protect);
  return { blockers, keyed: false };
}
function previewSpots(n: number) {
  const spots = defenseSpots(st.g!.us.formation, st.plan!.call.col, n);
  return st.protect >= 0 ? spots.map((s) => (s.who === "L" ? { ...s, tile: st.protect } : s)) : spots;
}

function renderLab() {
  const g = st.g;
  const el = document.getElementById("lab")!;
  const d = g ? DIFFICULTY[g.level] : DIFFICULTY[st.level];
  let sel = "";
  if (st.screen === "hit" && st.ctx && (st.tile !== undefined || st.shot === "Tool")) {
    const o = odds(st.ctx, st.tile ?? 0, st.shot);
    sel = `<h4>Selected: ${st.shot}${st.tile !== undefined && st.shot !== "Tool" ? ` at row ${rowOf(st.tile) + 1} col ${colOf(st.tile) + 1}` : ""}</h4>
      <p class="mono">accuracy ${pct(o.acc)} · block ${pct(o.blockP)} · dig ${pct(o.digP)} · kill ${pct(o.kill)}${st.shot === "Tool" ? ` · tool ${pct(o.tool)}` : ""}</p>`;
  }
  el.innerHTML = `<div class="lab-head"><h3>Lab</h3><button class="pill-small" data-act="lab">Close</button></div>
    <p class="muted small">The numbers behind the game. Players never see this.</p>
    <h4>Dials (base × difficulty × your upgrades)</h4>
    <p class="mono">Accuracy ${pct(DIALS.accuracy)} × ${d.yourAcc} × ${(g?.mods.acc ?? 1).toFixed(2)} · Soft shots × ${(g?.mods.soft ?? 1).toFixed(2)}<br>
    Power ${DIALS.power} × ${d.yourPower} × ${(g?.mods.power ?? 1).toFixed(2)} · Spike vs their dig × ${(g?.mods.spike ?? 1).toFixed(2)}<br>
    Their block ${pct(DIALS.block)} × ${d.theirBlock} · Your block × ${(g?.mods.block ?? 1).toFixed(2)}<br>
    Their dig ${pct(DIALS.dig)} × ${d.theirDig} · Your dig × ${(g?.mods.dig ?? 1).toFixed(2)} · Pass bonus +${(g?.mods.pass ?? 0).toFixed(2)}</p>
    ${sel}
    <h4>Last swings</h4><pre class="mono log">${esc((g?.lab ?? []).slice(-18).join("\n")) || "Nothing yet."}</pre>`;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

// ---------- Events ----------
function act(a: string, v: string) {
  switch (a) {
    case "level": st.level = v as Level; break;
    case "system": st.system = v as BlockSystem; break;
    case "formation": st.formation = v as Formation; break;
    case "start": return startMatch();
    case "serve-type": st.serveType = v as ServeType; break;
    case "serve": return serveNow();
    case "call": st.callId = v; break;
    case "set": return confirmSet();
    case "shot": st.shot = v as ShotKind; if (st.tile !== undefined && !canAim(st.tile, st.shot)) st.tile = undefined; break;
    case "swing": return swing();
    case "protect-clear": st.protect = -1; break;
    case "ready": return ready();
    case "next": return st.result!.next();
    case "upgrade": st.upgrades!.find((u) => u.id === v)!.apply(st.g!); return nextRally();
    case "again": st.screen = "start"; st.g = undefined; break;
    case "lab": {
      st.lab = !st.lab;
      const el = document.getElementById("lab")!;
      el.hidden = !st.lab;
      if (st.lab) renderLab();
      return;
    }
  }
  st.netAnim = false;
  render();
}
function pickTile(i: number) {
  if (st.screen === "hit" && st.shot !== "Tool") { if (!canAim(i, st.shot)) { st.shot = "Hard"; } st.tile = i; st.netAnim = false; render(); }
  else if (st.screen === "defend") { st.protect = st.protect === i ? -1 : i; render(); }
}
function onClick(e: Event) {
  const t = e.target as Element;
  const b = t.closest("[data-act]") as HTMLElement | null;
  if (b && !(b as HTMLButtonElement).disabled) { act(b.dataset.act!, b.dataset.v ?? ""); return; }
  const tile = t.closest("[data-tile]") as HTMLElement | null;
  if (tile) { pickTile(Number(tile.dataset.tile)); return; }
  const ps = t.closest("[data-passer]") as HTMLElement | null;
  if (ps && st.screen === "serve") { st.passer = Number(ps.dataset.passer); render(); }
}
function onKey(e: KeyboardEvent) {
  if (e.key !== "Enter" && e.key !== " ") return;
  const t = e.target as Element;
  if (t.closest("[data-tile]") || t.closest("[data-passer]")) { e.preventDefault(); onClick(e); }
}
document.addEventListener("click", onClick);
document.addEventListener("keydown", onKey);
render();
