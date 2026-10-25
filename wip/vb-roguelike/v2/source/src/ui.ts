// The game screen: one decision at a time, each with clear action buttons. Drives the engine step by step.
import {
  BlockForm, blockMoveOptions, BlockSystem, blockersOf, Call, callsFor, canAim, colOf, Defender, digRadius, endRally, Formation, formTheirBlock, Game, Grade,
  isBroken, killValue, laneOf, moveOptions, newGame, ourAttackCtx, ourServe, passers, planTheirAttack, readSquare, resolveSwing, rotationNumber, rowOf, SERVE_TARGETS,
  serveOdds, setQuality, Side, Sq, SwingCtx, SwingResult, takeTimeout, Team, theirAttackCtx, theirDefense, TheirDefense, theirServe, TheirPlan,
  trackAttack, Upgrade, upgradeChoices, zonePlayers,
} from "./engine";
import { BLOCK_HOME, CHASE, DIALS, DIFFICULTY, Level, LEVELS, SCORING, SERVE_TYPES, ServeType, SHOT_KINDS, SHOTS, ShotKind, TIMEOUT_AT, TOOL } from "./tables";
import { ballBlocked, ballFromNet, ballOut, ballServe, courtPoint, courtSvg, CourtOpts, netSvg, NetOpts, NetToken, ServeMark, squareCenter, toneOf, TONE_WORD, verdictWords, zoneCenter } from "./views";

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
interface DefendState {
  plan: TheirPlan;
  defs: Defender[];
  block: BlockForm;
  /** Where each moved player started, so a move can be changed or undone. */
  origin: Record<string, Sq | number>;
  selected?: string;
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
  def?: TheirDefense;
  ctx?: SwingCtx;
  tile?: number;
  shot: ShotKind;
  serveType: ServeType;
  target?: number;
  defend?: DefendState;
  result?: ResultView;
  upgrades?: Upgrade[];
  chain: { pass: boolean; set: boolean; kill: boolean };
  netAnim: boolean;
  lab: boolean;
}
const st: State = { screen: "start", level: "Normal", system: "Bunch", formation: "Perimeter", shot: "Hard", serveType: "Float", chain: { pass: false, set: false, kill: false }, netAnim: false, lab: false };

const GRADE_WORD: Record<Grade, string> = { "#": "Perfect", "+": "Good", "!": "OK", "-": "Poor" };
const GRADE_OPEN: Record<Grade, string> = {
  "#": "Perfect pass: every set is open, combos included.",
  "+": "Good pass: every set but the combo is open.",
  "!": "OK pass: high balls only.",
  "-": "Poor pass: high balls only, and the set will be off.",
};
const THEIR_MENU: Record<Grade, string> = {
  "#": "They can run anything, fast sets included.",
  "+": "They can run fast sets.",
  "!": "They're stuck with a high ball.",
  "-": "They're stuck with a high ball, and it'll be off.",
};
const ZONE_ROW = ["Short", "Mid", "Deep"];
function zoneName(tile: number, h: number): string {
  const c = laneOf(tile);
  const lane = h === 1 ? (c === 1 ? "middle" : c === 0 ? "left" : "right") : c === h ? "line" : c === 1 ? "seam" : "cross";
  return `${ZONE_ROW[Math.floor(rowOf(tile) / 2)]} ${lane}`;
}
/** Each defender's dig circle against this shot. */
function circles(ctx: SwingCtx, defs: Defender[], shot: ShotKind): number[] {
  return defs.map((d) => digRadius(ctx, d, shot === "Tool" ? "Hard" : shot));
}
/** What a kill on this square would do to their floor. */
function damageNote(ctx: SwingCtx, tile: number, shot: ShotKind): string {
  if (isBroken(ctx.defender, tile)) return "+1";
  return killValue(ctx, tile, shot) === SCORING.break ? "breaks it, +3" : "cracks it, no points yet";
}
/** Why the Tool shot isn't available right now, or "" if it is. */
function toolWhy(): string {
  const g = st.g!;
  if (g.toolCd > 0) return `Back in ${g.toolCd} rall${g.toolCd === 1 ? "y" : "ies"}`;
  if (st.block && !blockersOf(st.block).length) return "No block to use";
  return "";
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
  if (g.serving === "us") { st.screen = "serve"; st.target = undefined; render(); return; }
  const s = theirServe(g);
  const ps = passers(g.us)[s.passerIdx];
  const to = zoneCenter("us", 2, ps.col);
  const court: CourtOpts = { ...base(), focus: "both", ourPassers: ourPasserToks(), ball: { path: ballServe("them", to), kind: "serve", land: to } };
  const at = s.seam ? "down the seam" : `at your ${who(ps.p.id)}`;
  if (s.outcome === "ace") return showResult({ callout: "Ace", tone: "lose", sub: `Their ${s.type.toLowerCase()} serve ${at} drops.`, pts: `+${SCORING.ace} them`, court, nextLabel: "Next rally", next: () => afterRally("them") });
  if (s.outcome === "error") return showResult({ callout: "Service error", tone: "win", sub: "Their serve goes into the net.", pts: `+${SCORING.error} you`, court, nextLabel: "Next rally", next: () => afterRally("us") });
  showResult({
    callout: `${GRADE_WORD[s.grade!]} pass`, tone: "plain", court,
    sub: `They serve ${s.type.toLowerCase()} ${at}. Your ${who(ps.p.id)} passes ${s.grade}.${ps.front ? ` ${ps.p.id} will be late to hit after passing.` : ""}`,
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
  st.def = theirDefense(g, call, st.block);
  st.ctx = ourAttackCtx(g, call, st.block, st.def, st.grade!);
  st.chain.set = setQuality(st.grade!, call.tempo) === "Perfect";
  st.tile = undefined;
  st.shot = "Hard";
  st.netAnim = true;
  st.screen = "hit";
  render();
}
function swing() {
  const g = st.g!, call = st.call!, ctx = st.ctx!;
  if (st.shot === "Tool" ? !!toolWhy() || !g.mods.tool : st.tile === undefined || readSquare(ctx, st.tile, st.shot).kind === "closed") return;
  const aimed = st.shot === "Tool" ? 0 : st.tile!;
  trackAttack(g, call, aimed, st.shot);
  const res = resolveSwing(g, ctx, aimed, st.shot);
  st.chain.kill = res.outcome === "Kill" && ctx.combo;
  showResult(swingView(res, "us", call.col, circles(ctx, ctx.defs, st.shot), () => (res.winner ? afterRally(res.winner) : toDefend(res.nextGrade ?? "+"))));
}
function toDefend(grade: Grade) {
  const g = st.g!;
  st.grade = grade;
  const plan = planTheirAttack(g, grade);
  st.defend = { plan, defs: plan.defs.map((d) => ({ ...d, sq: { ...d.sq } })), block: { ...plan.block, front: plan.block.front.map((f) => ({ ...f })) }, origin: {} };
  st.netAnim = true;
  st.screen = "defend";
  render();
}
function ready() {
  const g = st.g!, d = st.defend!, plan = d.plan;
  const ctx = theirAttackCtx(g, plan, d.block, d.defs, st.grade!);
  const res = resolveSwing(g, ctx, plan.target, plan.shot);
  const v = swingView(res, "them", plan.call.col, circles(ctx, d.defs, plan.shot), () => (res.winner ? afterRally(res.winner) : toSet(res.nextGrade ?? "+")));
  v.court.ourBlock = d.block;
  v.court.ourDefense = d.defs;
  if (res.outcome === "Dug") v.sub = `${res.digBy ? `Your ${who(res.digBy.id)} digs it` : "You dig it"}${Object.keys(d.origin).includes(res.digBy?.id ?? "") ? ", right where you moved them" : ""}. ${res.nextGrade === "+" ? "A clean dig: now you swing back." : "A scramble: you'll only get a high ball back."}`;
  showResult(v);
}
function serveNow() {
  const g = st.g!;
  if (st.target === undefined) return;
  const s = ourServe(g, st.serveType, st.target);
  const ps = passers(g.them)[s.passerIdx];
  const to = zoneCenter("them", 2, ps.col);
  const court: CourtOpts = { ...base(), focus: "both", serveMarks: serveMarkList(), serveSelected: st.target, ball: { path: ballServe("us", to), kind: "serve", land: to } };
  const at = s.seam ? "down the seam" : `at their ${ps.p.id}`;
  if (s.outcome === "ace") return showResult({ callout: "Ace!", tone: "win", sub: `Your ${st.serveType.toLowerCase()} serve ${at} drops.`, pts: `+${SCORING.ace} you`, court, nextLabel: "Next rally", next: () => afterRally("us"), shake: true });
  if (s.outcome === "error") return showResult({ callout: "Service error", tone: "lose", sub: `Your ${st.serveType.toLowerCase()} serve goes into the net.`, pts: `+${SCORING.error} them`, court, nextLabel: "Next rally", next: () => afterRally("them") });
  showResult({
    callout: `They pass ${s.grade}`, tone: s.grade === "#" || s.grade === "+" ? "plain" : "win", court,
    sub: `Their ${ps.p.id} passes ${GRADE_WORD[s.grade!].toLowerCase()}${s.seam ? " off the seam" : ""}. ${THEIR_MENU[s.grade!]}${ps.front ? ` ${ps.p.id} is late to hit after passing.` : ""}`,
    nextLabel: "Defend their attack", next: () => toDefend(s.grade!),
  });
}
function afterRally(winner: Side) {
  const g = st.g!;
  endRally(g, winner);
  if (g.winner) { st.screen = "end"; render(); return; }
  if (takeTimeout(g)) { st.upgrades = upgradeChoices(g); st.screen = "upgrade"; render(); return; }
  nextRally();
}
function showResult(r: ResultView) {
  st.result = r;
  st.screen = "result";
  render();
  if (r.shake) { const el = document.getElementById("court"); el?.classList.remove("shake"); void el?.offsetWidth; el?.classList.add("shake"); }
}

/** Turn a swing result into the result screen: callout, points, and the ball's flight. */
function swingView(res: SwingResult, attacker: Side, h: number, radii: number[], next: () => void): ResultView {
  const defSide: Side = attacker === "us" ? "them" : "us";
  const mine = attacker === "us";
  const court: CourtOpts = { ...base(), focus: "both" };
  if (mine) { court.ourHitterCol = h; court.ourHitterLabel = st.call!.hitter.id; court.theirBlock = st.block; court.theirDefense = st.def!.defs; court.theirCircles = radii; }
  else { court.theirHitterCol = h; court.theirHitterLabel = st.defend!.plan.call.hitter.id; court.ourCircles = radii; }
  const land = res.landed === null ? undefined : res.landAt ? courtPoint(defSide, res.landAt[0], res.landAt[1]) : squareCenter(defSide, res.landed);
  if (res.outcome === "Stuff" || res.outcome === "Touch") { const b = ballBlocked(attacker, h); court.ball = { ...b, kind: "blocked" }; }
  else if (res.outcome === "Error" || res.outcome === "Tool") court.ball = { path: ballOut(attacker, h), kind: res.outcome === "Tool" ? "tool" : "out" };
  else if (land) court.ball = { path: ballFromNet(attacker, h, land), land, kind: res.outcome === "Kill" ? "kill" : "dug" };
  if (res.landed !== null && (res.outcome === "Kill" || res.outcome === "Shank")) { if (mine) court.flashTheir = res.landed; else court.flashOur = res.landed; }

  const us = (n: number) => `+${n} you`, them = (n: number) => `+${n} them`;
  const nextLabel = res.winner ? "Next rally" : mine ? "Defend their attack" : "Set the ball";
  switch (res.outcome) {
    case "Kill":
      if (res.hole) return { callout: mine ? "Into the hole!" : "Into your hole", tone: mine ? "win" : "lose", sub: "Nobody can stand in a hole, and no circle reached it.", pts: mine ? us(res.points) : them(res.points), court, nextLabel, next, shake: mine };
      if (res.broke) return { callout: mine ? "Square broken!" : "They broke a square", tone: mine ? "win" : "lose", sub: `${res.damage} damage${mine && st.chain.kill ? " (combo, double damage)" : ""}. That square is a hole now.`, pts: mine ? us(res.points) : them(res.points), court, nextLabel, next, shake: true };
      return { callout: mine ? "Kill! Square cracked" : "They crack a square", tone: mine ? "win" : "lose", sub: `${res.damage} damage. No points until it breaks.`, pts: "+0", court, nextLabel, next, shake: mine };
    case "Tool": return { callout: mine ? "Tooled it!" : "They tooled you", tone: mine ? "win" : "lose", sub: "Off the hands and out. A point, but no damage.", pts: mine ? us(res.points) : them(res.points), court, nextLabel, next };
    case "Stuff": return { callout: mine ? "Stuffed" : "Stuff block!", tone: mine ? "lose" : "win", sub: mine ? "Straight into the solid middle of their block." : "Your block shut it down.", pts: mine ? them(SCORING.stuff) : us(SCORING.stuff), court, nextLabel, next, shake: !mine };
    case "Error": return { callout: mine ? "Hitting error" : "They miss", tone: mine ? "lose" : "win", sub: res.text, pts: mine ? them(SCORING.error) : us(SCORING.error), court, nextLabel, next };
    case "Touch": return { callout: "Block touch", tone: "plain", sub: `${mine ? "They" : "You"} keep it alive off the block.`, court, nextLabel, next };
    case "Shank": return { callout: mine ? "They shank it" : "Shanked", tone: mine ? "win" : "lose", sub: `${res.damage ? "The tile cracks, " : ""}${mine ? "you get" : "they get"} a free ball.`, court, nextLabel, next };
    default: return { callout: mine ? "Dug" : "Great dig!", tone: mine ? "plain" : "win", sub: `${mine ? `It's inside their ${res.digBy?.id ?? ""}'s circle` : "You dig it"}${res.nextGrade === "!" ? ", but it's a scramble" : ""}. ${mine ? "Now they swing back." : "Now you swing back."}`, court, nextLabel, next };
  }
}

// ---------- Court helpers ----------
function base(): Pick<CourtOpts, "us" | "them"> { return { us: st.g!.us, them: st.g!.them }; }
function ourPasserToks() { return passers(st.g!.us).map((p) => ({ col: p.col, label: p.p.id })); }
function serveMarkList(): ServeMark[] {
  const g = st.g!, ps = passers(g.them);
  return Array.from({ length: SERVE_TARGETS }, (_, t) => {
    const o = serveOdds(g, "us", st.serveType, t);
    if (t % 2 === 1) return { col: (ps[(t - 1) / 2].col + ps[(t + 1) / 2].col) / 2, label: "seam", sub: "", tone: toneOf(o.good), seam: true };
    const p = ps[t / 2];
    return { col: p.col, label: p.p.id, sub: p.front ? "front row" : p.p.passer === "strong" ? "solid passer" : p.p.passer === "weak" ? "shaky passer" : "", tone: toneOf(o.good), seam: false };
  });
}
/** Their front row standing at home, before the set. */
function homeFront(t: Team): NetOpts["front"] {
  return BLOCK_HOME[t.system].map((x) => ({ home: x, x, state: "off" as const }));
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
    : `<div class="chain chain-idle"><span class="chain-label">First to ${SCORING.toWin}${g.timeoutUsed ? "" : ` · timeout at ${TIMEOUT_AT}`}</span></div>`;
  return `<div class="score"><div class="team-score you"><span>You</span><b>${g.us.score}</b></div>
    <div class="score-mid">${pips}<span class="serving">${g.serving === "us" ? "▲ your serve" : "their serve ▼"} · rotation ${rotationNumber(g.us)}</span></div>
    <div class="team-score them"><b>${g.them.score}</b><span>${esc(g.them.name)}</span></div></div>`;
}
function role(chip: string, title: string, sub: string, cls = ""): string {
  return `<div class="role ${cls}">${chip ? `<span class="role-chip">${chip}</span>` : ""}<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>`;
}
function movesLeft(): number { return st.g!.mods.moves - Object.keys(st.defend!.origin).length; }

function render() {
  setSlot("top", scoreBar());
  let roleHtml = "", net = "", court = "", info = "", actions = "", go = "";
  const g = st.g;
  switch (st.screen) {
    case "start": {
      roleHtml = `<div class="title"><h1>Volleyball Roguelike</h1><p class="kicker">v2 · draft 3 · one match</p></div>
        <ul class="how"><li>You play whoever touches the ball: <b>server</b>, <b>setter</b>, <b>hitter</b>, and on defense the <b>puppet master</b> who gets one move per ball.</li>
        <li>Nothing is left to luck. Your swing lands on the exact square you tap. A ball inside a defender's circle is always dug. The solid middle of their block always stuffs a hard swing.</li>
        <li>Every kill cracks a square on their floor. <b>A broken square is 3 points</b> and becomes a hole nobody can stand in. Holes, tools, aces and errors are 1. <b>First to ${SCORING.toWin}</b>.</li>
        <li>They chase what you do. Hit the same spot again and they'll be waiting.</li></ul>`;
      actions = `<div class="group"><h3>Difficulty</h3><div class="pills">${LEVELS.map((l) => pill("level", l, l, `${CHASE[l].brain} · squares take ${DIFFICULTY[l].tileHits} hits`, st.level === l)).join("")}</div></div>
        <div class="group"><h3>Your block</h3><div class="pills">${pill("system", "Bunch", "Bunch", "Strong in the middle, slow to the pins", st.system === "Bunch")}${pill("system", "Spread", "Spread", "Always someone on the pins, weaker middle", st.system === "Spread")}</div></div>
        <div class="group"><h3>Your defense</h3><div class="pills">${pill("formation", "Perimeter", "Perimeter", "Diggers deep, short is open", st.formation === "Perimeter")}${pill("formation", "Rotational", "Rotational", "Line digger up for tips", st.formation === "Rotational")}${pill("formation", "SixUp", "6-up", "Middle back plays up", st.formation === "SixUp")}</div></div>`;
      go = `<button class="go" data-act="start">Start match</button>`;
      break;
    }
    case "serve": {
      roleHtml = role("Server", "Pick a serve and a target", "Greener targets are more likely to pass badly. A bad pass takes away their fast sets.");
      court = courtSvg({ ...base(), focus: "their", serveMarks: serveMarkList(), serveSelected: st.target });
      actions = `<div class="pills">${SERVE_TYPES.map((t) => pill("serve-type", t, t, t === "Safe" ? "Almost never misses" : t === "Float" ? "Tougher pass, some misses" : "Aces and errors", st.serveType === t)).join("")}</div>`;
      if (st.target !== undefined) {
        const ps = passers(g!.them);
        const m = serveMarkList()[st.target];
        const what = st.target % 2 === 1 ? `The seam between ${ps[(st.target - 1) / 2].p.id} and ${ps[(st.target + 1) / 2].p.id}: they might both go, or neither` : `${m.label}${m.sub ? `, ${m.sub}` : ""}`;
        const late = st.target === ps.findIndex((p) => p.front) * 2 ? ` If ${ps.find((p) => p.front)!.p.id} passes, they're late to hit.` : "";
        info = `<p class="info"><b>${esc(what)}</b> · <span class="tw t-${m.tone}">${TONE_WORD[m.tone]}</span>.${late}</p>`;
      } else info = `<p class="info muted">Tap a passer or a seam.</p>`;
      go = `<button class="go" data-act="serve"${st.target === undefined ? " disabled" : ""}>${st.target === undefined ? "Tap a target first" : "Serve"}</button>`;
      break;
    }
    case "set": {
      const calls = callsFor(g!.us, st.grade!);
      const sel = calls.find((c) => c.id === st.callId);
      roleHtml = role("Setter", "Who gets the set?", GRADE_OPEN[st.grade!]);
      const toks: NetToken[] = calls.filter((c, i, a) => a.findIndex((d) => d.hitter.id === c.hitter.id) === i)
        .map((c) => ({ col: c.col, label: c.hitter.id, sub: c.hitter.trait, selected: sel?.hitter.id === c.hitter.id, disabled: !calls.some((d) => d.hitter.id === c.hitter.id && d.enabled) }));
      net = netSvg({ attacker: "us", front: homeFront(g!.them), animate: false, hitters: toks });
      actions = `<div class="pills">${calls.map((c) => pill("call", c.id, c.name, c.desc, c.id === st.callId, !c.enabled, c.why)).join("")}</div>`;
      const notes: string[] = [];
      if (g!.track.hitterStreak >= 2) notes.push(`<p class="note warn">They're keying on ${g!.track.hitter}: set them again and an extra blocker will be waiting.</p>`);
      if (g!.late.us) notes.push(`<p class="note warn">${g!.late.us} just passed, so they'll be late to hit.</p>`);
      info = notes.join("");
      go = `<button class="go" data-act="set"${sel?.enabled ? "" : " disabled"}>Set ${sel ? esc(sel.hitter.id) : "it"}</button>`;
      break;
    }
    case "hit": {
      const call = st.call!, ctx = st.ctx!, block = st.block!;
      const bl = block.front.filter((f) => f.state !== "off");
      roleHtml = role(`Hitter · ${call.hitter.id}`, "Pick a square and a shot", `${bl.length === 0 ? "No block up!" : `${bl.length} blocker${bl.length > 1 ? "s" : ""} up${bl.some((b) => b.state === "late") ? ", one is late" : ""}.`} Find a square outside every circle and the dark shadow.`);
      net = netSvg({ attacker: "us", front: block.front, set: { h: call.col, tempo: call.tempo }, animate: st.netAnim, hitters: [{ col: call.col, label: call.hitter.id, sub: "", selected: true, disabled: false }] });
      const sv = st.shot !== "Tool" && st.tile !== undefined ? verdictWords(readSquare(ctx, st.tile, st.shot), damageNote(ctx, st.tile, st.shot)) : undefined;
      const lean = st.def!.from.map((f) => ({ from: f.sq, to: ctx.defs.find((d) => d.id === f.id)!.sq }));
      court = courtSvg({ ...base(), focus: "their", pick: st.shot === "Tool" ? undefined : "their", theirSelected: st.shot === "Tool" ? undefined : st.tile, theirSelectedTone: sv?.tone, theirDefense: ctx.defs, theirCircles: circles(ctx, ctx.defs, st.shot), theirLean: lean, theirBlock: block, ourHitterCol: call.col, ourHitterLabel: call.hitter.id });
      const notes: string[] = [];
      if (ctx.combo) notes.push(`<p class="note good">Combo: perfect pass and perfect set. A kill does double damage.</p>`);
      if (block.keyed) notes.push(`<p class="note warn">They're onto ${call.hitter.id}: an extra blocker keyed on them.</p>`);
      if (block.bait) notes.push(`<p class="note good">Their middle bit on your quick and is late.</p>`);
      if (lean.some((l) => l.from.r !== l.to.r || l.from.c !== l.to.c)) notes.push(`<p class="note warn">They're leaning toward where you've been hitting (arrows).</p>`);
      if (st.shot === "Tool") {
        info = `<p class="info"><b>Tool</b> · off their hands and out: +1, no damage. Then it's gone for ${TOOL.cooldown} rallies.</p>`;
      } else if (st.tile !== undefined && sv) {
        info = !canAim(st.tile, st.shot)
          ? `<p class="info"><b>${zoneName(st.tile, call.col)}</b> · ${st.shot === "Hard" && rowOf(st.tile) <= 1 ? "inside the 10-foot line: tip it there, you can't swing hard that short." : `a ${st.shot.toLowerCase()} can't reach that row.`}</p>`
          : `<p class="info"><b>${zoneName(st.tile, call.col)}</b> · <span class="tw t-${sv.tone}">${sv.word}</span> · ${sv.why}</p>`;
      } else info = `<p class="info muted">Tap a square on their floor.</p>`;
      info = notes.join("") + info;
      const shots = SHOT_KINDS.filter((k) => k !== "Tool" || g!.mods.tool);
      actions = `<div class="pills">${shots.map((k) => pill("shot", k, k, SHOTS[k].blurb, st.shot === k, k === "Tool" && !!toolWhy(), toolWhy())).join("")}</div>`;
      const ok = st.shot === "Tool" ? !toolWhy() : st.tile !== undefined && readSquare(ctx, st.tile, st.shot).kind !== "closed";
      go = `<button class="go" data-act="swing"${ok ? "" : " disabled"}>${ok ? "Swing" : st.tile === undefined ? "Tap a square first" : "This set can't reach that square"}</button>`;
      break;
    }
    case "defend": {
      const d = st.defend!, plan = d.plan;
      const left = movesLeft();
      const sel = d.selected;
      roleHtml = role("Puppet master", "Read it, then make your move", left > 0 ? `Their approach tells you the shot. Anything inside a circle gets dug. Tap one of your players, then a square next to them. ${left === 1 ? "You have one move." : `You have ${left} moves.`}` : "Move made. Tap that player again to change it, or go.");
      net = netSvg({ attacker: "them", front: d.block.front, set: { h: plan.call.col, tempo: plan.call.tempo }, animate: st.netAnim, hitters: [{ col: plan.call.col, label: plan.call.hitter.id, sub: "", selected: true, disabled: false }], tell: plan.tell });
      let squares: Sq[] = [], blockXs: number[] = [];
      if (sel && !sel.startsWith("blk:")) {
        const p = d.defs.find((x) => x.id === sel)!;
        const from = (d.origin[sel] as Sq | undefined) ?? p.sq;
        squares = [...moveOptions(g!.us, d.defs, { ...p, sq: from }, g!.mods.step), ...(d.origin[sel] ? [from] : [])].filter((s) => !(s.r === p.sq.r && s.c === p.sq.c));
      } else if (sel) {
        const id = sel.slice(4);
        const f = d.block.front.find((x) => x.id === id)!;
        const from = (d.origin[id] as number | undefined) ?? f.x;
        blockXs = [...blockMoveOptions(d.block, { ...f, x: from }, g!.mods.step), ...(d.origin[id] !== undefined ? [from] : [])].filter((x) => Math.abs(x - f.x) > 0.01);
      }
      const dctx = theirAttackCtx(g!, plan, d.block, d.defs, st.grade!);
      court = courtSvg({ ...base(), focus: "our", ourDefense: d.defs, ourCircles: circles(dctx, d.defs, plan.tell === "tip" ? "Tip" : "Hard"), ourBlock: d.block, theirHitterCol: plan.call.col, theirHitterLabel: plan.call.hitter.id, defend: { selected: sel, squares, blockXs, moved: Object.keys(d.origin), canMove: left > 0 } });
      info = `<p class="note intent">${esc(plan.intent)}</p>`;
      actions = Object.keys(d.origin).length ? `<div class="pills">${pill("reset", "", "Reset", "Put everyone back", false)}</div>` : "";
      go = `<button class="go" data-act="ready">${Object.keys(d.origin).length ? "Ready" : "Play it straight"}</button>`;
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
      roleHtml = role("Timeout", "Pick one upgrade", `Someone reached ${TIMEOUT_AT}. This is your one pick this match.`);
      actions = `<div class="cards">${st.upgrades!.map((u) => `<button class="card" data-act="upgrade" data-v="${u.id}"><span class="card-dial">${u.dial}</span><span class="card-name">${esc(u.name)}</span><span class="card-desc">${esc(u.desc)}</span></button>`).join("")}</div>`;
      court = courtSvg({ ...base(), focus: "both" });
      break;
    }
    case "end": {
      const won = g!.winner === "us";
      const broke = (t: Team) => t.tiles.filter((h) => h <= 0).length;
      roleHtml = `<div class="result r-${won ? "win" : "lose"}"><p class="callout">${won ? "You win!" : `${esc(g!.them.name)} wins`}</p><p class="pts">${g!.us.score}–${g!.them.score}</p>
        <p class="sub">You broke ${broke(g!.them)} of their squares; they broke ${broke(g!.us)} of yours, in ${g!.rallies} rallies.</p></div>`;
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
  document.getElementById("net")!.hidden = !net;
  if (st.lab) renderLab();
}

function renderLab() {
  const g = st.g;
  const el = document.getElementById("lab")!;
  const d = g ? DIFFICULTY[g.level] : DIFFICULTY[st.level];
  let sel = "";
  if (st.screen === "hit" && st.ctx && st.tile !== undefined && st.shot !== "Tool") {
    const v = readSquare(st.ctx, st.tile, st.shot);
    sel = `<h4>Selected: ${st.shot} at row ${rowOf(st.tile) + 1} col ${colOf(st.tile) + 1}</h4>
      <p class="mono">${v.kind}${v.by ? ` (${v.by.id})` : ""} · block covers ${pct(v.shade)} of the square</p>`;
  }
  if (st.screen === "defend" && st.defend) {
    const p = st.defend.plan;
    sel = `<h4>Their plan</h4><p class="mono">${p.call.hitter.id} ${p.call.tempo} · ${p.shot} at row ${rowOf(p.target) + 1} col ${colOf(p.target) + 1} · approach shows "${p.tell}"</p>`;
  }
  const heat = g ? g.track.heat.map((h, i) => (h >= 0.05 ? `r${rowOf(i) + 1}c${colOf(i) + 1}:${h.toFixed(1)}` : "")).filter(Boolean).join(" ") || "cold" : "";
  el.innerHTML = `<div class="lab-head"><h3>Lab</h3><button class="pill-small" data-act="lab">Close</button></div>
    <p class="muted small">The numbers behind the game. Players never see this.</p>
    <h4>Dials (base × difficulty × your upgrades)</h4>
    <p class="mono">Power ${DIALS.power} × ${d.yourPower} × ${(g?.mods.power ?? 1).toFixed(2)} · Their circles vs your hard swings × ${(g?.mods.spike ?? 1).toFixed(2)} · Extra damage +${g?.mods.dmg ?? 0}<br>
    Their block × ${d.theirBlock} · Your hands +${(g?.mods.hands ?? 0).toFixed(1)} m<br>
    Dig circle ${DIALS.dig} m × their ${d.theirDig} · Yours × ${(g?.mods.reach ?? 1).toFixed(2)} · Moves ${g?.mods.moves ?? 1}, step ${g?.mods.step ?? 1}</p>
    ${g ? `<h4>Their chase (${CHASE[g.level].brain})</h4><p class="mono">heat by square (row 1 first): ${heat}</p>` : ""}
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
    case "reset": {
      const d = st.defend!;
      d.defs = d.plan.defs.map((x) => ({ ...x, sq: { ...x.sq } }));
      d.block = { ...d.plan.block, front: d.plan.block.front.map((f) => ({ ...f })) };
      d.origin = {};
      d.selected = undefined;
      break;
    }
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
  if (st.screen === "hit" && st.shot !== "Tool") { if (!canAim(i, st.shot)) st.shot = rowOf(i) <= 1 ? "Tip" : "Hard"; st.tile = i; st.netAnim = false; render(); }
}
/** Defense: pick a player, then where they go. A moved player can be moved again (from where they started) or put back. */
function pickDefender(id: string) {
  const d = st.defend!;
  const moved = d.origin[id.replace("blk:", "")] !== undefined;
  if (d.selected === id) d.selected = undefined;
  else if (moved || movesLeft() > 0) d.selected = id;
  st.netAnim = false;
  render();
}
function moveTo(sq?: Sq, bx?: number) {
  const d = st.defend!, sel = d.selected;
  if (!sel) return;
  if (sq) {
    const p = d.defs.find((x) => x.id === sel)!;
    const from = (d.origin[sel] as Sq | undefined) ?? p.sq;
    p.sq = sq;
    if (sq.r === from.r && sq.c === from.c) delete d.origin[sel]; else d.origin[sel] = from;
  } else if (bx !== undefined) {
    const id = sel.slice(4);
    const f = d.block.front.find((x) => x.id === id)!;
    const from = (d.origin[id] as number | undefined) ?? f.x;
    f.x = bx;
    if (Math.abs(bx - from) < 0.01) delete d.origin[id]; else d.origin[id] = from;
  }
  d.selected = undefined;
  st.netAnim = false;
  render();
}
function onClick(e: Event) {
  const t = e.target as Element;
  const b = t.closest("[data-act]") as HTMLElement | null;
  if (b && !(b as HTMLButtonElement).disabled) { act(b.dataset.act!, b.dataset.v ?? ""); return; }
  const tile = t.closest("[data-tile]") as HTMLElement | null;
  if (tile) { pickTile(Number(tile.dataset.tile)); return; }
  const sv = t.closest("[data-serve]") as HTMLElement | null;
  if (sv && st.screen === "serve") { st.target = Number(sv.dataset.serve); render(); return; }
  if (st.screen !== "defend") return;
  const dd = t.closest("[data-def]") as HTMLElement | null;
  if (dd) { pickDefender(dd.dataset.def!); return; }
  const bk = t.closest("[data-blk]") as HTMLElement | null;
  if (bk) { pickDefender(`blk:${bk.dataset.blk}`); return; }
  const sq = t.closest("[data-sq]") as HTMLElement | null;
  if (sq) { const [r, c] = sq.dataset.sq!.split(",").map(Number); moveTo({ r, c }); return; }
  const bx = t.closest("[data-bx]") as HTMLElement | null;
  if (bx) moveTo(undefined, Number(bx.dataset.bx));
}
function onKey(e: KeyboardEvent) {
  if (e.key !== "Enter" && e.key !== " ") return;
  const t = e.target as Element;
  if (t.closest("[data-tile],[data-serve],[data-def],[data-blk],[data-sq],[data-bx]")) { e.preventDefault(); onClick(e); }
}
document.addEventListener("click", onClick);
document.addEventListener("keydown", onKey);
render();
void zonePlayers;
