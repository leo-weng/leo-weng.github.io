// 2D views for the UI: a net view (front-on, from our side) and a court view (top-down on their court).
// Pure string builders over engine results; no rules live here.
import { BLOCK, BLOCK_START, BlockSystem, Clarity, Defender, OPPONENT, PERIMETER_DEFENSE, OFF_BLOCKER_DEPTH, Tempo } from "./data";
import { BlockResult, blockLineup, digReach, reachOval, BlockerState, Hands, Odds, overDepth } from "./engine";

// ---------- Ratings: odds as a word and a color ----------
export type Tone = "great" | "good" | "even" | "risky" | "bad" | "plain";
const TONE_WORD: Record<Tone, string> = { great: "Great look", good: "Good look", even: "Even", risky: "Risky", bad: "Long shot", plain: "" };

/** A shot's worth: kills minus points lost; a dug ball is slightly bad because they get to swing back. */
export function rateShot(o: Odds): Tone {
  const v = o.Kill - o.Blocked - o.Error - 0.15 * o.Dug;
  return v >= 0.18 ? "great" : v >= 0.08 ? "good" : v >= -0.02 ? "even" : v >= -0.12 ? "risky" : "bad";
}
/** A set call's worth, from the rough kill chance of the default shot. */
export function rateCall(kill: number): Tone {
  return kill >= 0.42 ? "great" : kill >= 0.32 ? "good" : kill >= 0.22 ? "even" : kill >= 0.14 ? "risky" : "bad";
}
export function rateChip(tone: Tone, clarity: Clarity): string {
  const word = TONE_WORD[tone] + (clarity === "Fuzzy" ? "?" : "");
  if (clarity === "Blind") return `<span class="rate rate-guess r-${tone}" title="No read on the block, so this is a guess">${word} (guess)</span>`;
  return `<span class="rate r-${tone}">${word}</span>`;
}

// ---------- Shared geometry ----------
const blockerSpeed = () => BLOCK.speedBase + BLOCK.speedPerPoint * (OPPONENT.blockerSpeed - 5);
const APEX: Record<Tempo, number> = { High: 6.6, Medium: 4.4, Fast: 3.5 };
/** Slow-motion length of the set animation, in seconds. Faster sets stay faster. */
export const slowMo = (time: number) => Math.min(3.2, Math.max(1.3, time * 1.8));

export interface PlacedBlocker {
  slot: 0 | 1 | 2;
  state: BlockerState;
  startX: number;
  x: number;
  /** Jump height in meters at contact. */
  jump: number;
  /** Fractions of the set's flight when the blocker starts and stops moving. */
  moveStart: number;
  moveEnd: number;
}

/** Where each blocker ends up at contact. Blockers who got there line up around the hitter. */
export function placeBlock(block: BlockResult, hitterX: number, setTime: number): PlacedBlocker[] {
  const lineup = blockLineup(block, hitterX);
  return block.blockers.map((b) => {
    if (b.state === "Home") return { slot: b.slot, state: b.state, startX: b.startX, x: b.startX, jump: 0, moveStart: 1, moveEnd: 1 };
    // Missing blockers aim where the block would form and get part of the way.
    const target = lineup.get(b.slot) ?? clampX(hitterX + (b.startX < hitterX ? -0.4 : 0.4));
    const dist = Math.abs(target - b.startX);
    const speed = blockerSpeed();
    const run = dist / speed;
    const reaction = setTime - b.margin - run;
    const covered = b.state === "Missing" ? Math.max(0, Math.min(0.92, dist ? (dist + b.margin * speed) / dist : 0)) : 1;
    const x = b.startX + (target - b.startX) * covered;
    const moveStart = clamp01(reaction / setTime);
    const moveEnd = b.state === "Missing" ? 1 : clamp01((reaction + run) / setTime);
    return { slot: b.slot, state: b.state, startX: b.startX, x, jump: b.state === "Formed" ? 0.75 : b.state === "Late" ? 0.35 : 0, moveStart, moveEnd };
  });
}
const clampX = (x: number) => Math.max(0.3, Math.min(8.7, x));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const f = (n: number) => n.toFixed(1);

// ---------- Net view ----------
// Front-on from our side: x along the net (0–9 m), height up. Their blockers stand behind the net.
const NX = (x: number) => 30 + x * 100;
const NH = (h: number) => 290 - h * 40;
const NET_TOP = 2.43;

export function setArcPath(fromX: number, toX: number, tempo: Tempo): string {
  const x0 = NX(fromX), y0 = NH(2.6), x1 = NX(toX), y1 = NH(3.1);
  const yc = 2 * NH(APEX[tempo]) - (y0 + y1) / 2;
  return `M${f(x0)} ${f(y0)} Q${f((x0 + x1) / 2)} ${f(yc)} ${f(x1)} ${f(y1)}`;
}

function figure(state: BlockerState | "Ready", jump: number): string {
  const top = (h: number) => NH(h + jump);
  const arm = state === "Home" ? 1.75 : 2.35;
  return `<rect class="b-body" x="-15" y="${f(top(1.55))}" width="30" height="${f(top(0.15) - top(1.55))}" rx="9"/>
    <circle class="b-head" cx="0" cy="${f(top(1.78))}" r="11"/>
    <path class="b-arm" d="M-11 ${f(top(1.45))} L-16 ${f(top(arm))} M11 ${f(top(1.45))} L16 ${f(top(arm))}"/>`;
}

export interface Token { x: number; label: string; sub?: string; kind: "setter" | "hitter" | "decoy" }

export interface NetOpts {
  mode: "set" | "hit";
  clarity: Clarity;
  system: BlockSystem;
  setterX: number;
  tokens: Token[];
  /** Hit mode: the formed block, the set and whether to play the slow-motion set. */
  placed?: PlacedBlocker[];
  hitterX?: number;
  tempo?: Tempo;
  dur?: number;
  animate?: boolean;
  /** After the swing: play the ball's flight for this outcome instead of the set. */
  result?: ResultFlight;
  /** Set mode: the picked call's arc and spot, drawn until another call is pointed at. */
  pick?: { d: string; x: number };
}

export function netSvg(o: NetOpts): string {
  const anim = !!o.animate && o.mode === "hit";
  const dur = o.dur ?? 1.5;
  // Better teams are bigger: blockers grow with their Block Jump.
  const k = 1 + 0.07 * (OPPONENT.blockJump - 5);
  const size = `translate(0,${f(NH(0))}) scale(${k.toFixed(2)}) translate(0,${f(-NH(0))})`;
  const blockers = o.mode === "set"
    ? BLOCK_START[o.system].map((x) => `<g class="blk blk-ready" transform="translate(${f(NX(x))},0)"><g transform="${size}">${figure("Ready", 0)}</g></g>`).join("")
    : (o.placed ?? []).map((b) => {
      const dx = NX(b.startX) - NX(b.x);
      const jumpPx = b.jump * 40;
      const move = anim && Math.abs(dx) > 0.5
        ? `<animateTransform attributeName="transform" type="translate" values="${f(dx)} 0;${f(dx)} 0;0 0;0 0" keyTimes="0;${b.moveStart.toFixed(3)};${Math.max(b.moveStart + 0.001, b.moveEnd).toFixed(3)};1" dur="${dur}s" fill="freeze"/>`
        : "";
      const hop = anim && jumpPx
        ? `<animateTransform attributeName="transform" type="translate" values="0 ${f(jumpPx)};0 ${f(jumpPx)};0 0" keyTimes="0;0.78;1" dur="${dur}s" fill="freeze"/>`
        : "";
      return `<g class="blk blk-${b.state.toLowerCase()}" transform="translate(${f(NX(b.x))},0)"><g>${move}<g>${hop}<g transform="${size}">${figure(b.state, b.jump)}</g></g></g></g>`;
    }).join("");

  const blurMax = 4.5;
  const filter = o.clarity === "Fuzzy"
    ? `<filter id="fz" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${anim ? 0 : blurMax}">${anim ? `<animate attributeName="stdDeviation" values="0;0;${blurMax}" keyTimes="0;0.45;1" dur="${dur}s" fill="freeze"/>` : ""}</feGaussianBlur></filter>`
    : "";
  const fog = o.clarity === "Blind"
    ? `<g class="fog"><rect x="${NX(0)}" y="${NH(4.6)}" width="900" height="${f(NH(0) - NH(4.6))}">${anim ? `<animate attributeName="opacity" values="0.4;0.95" keyTimes="0;0.3" dur="${dur}s" fill="freeze"/>` : ""}</rect><text x="${NX(4.5)}" y="${NH(3.2)}">Can't read their block</text></g>`
    : "";

  let ball = "";
  if (o.result && o.hitterX !== undefined && o.tempo) {
    ball = `<path class="set-trail" d="${setArcPath(o.setterX, o.hitterX, o.tempo)}"/>` + flightSvg(o.result, o.hitterX, o.placed ?? [], !!o.animate);
  } else if (o.mode === "hit" && o.hitterX !== undefined && o.tempo) {
    const d = setArcPath(o.setterX, o.hitterX, o.tempo);
    const end = `${f(NX(o.hitterX))} ${f(NH(3.1))}`;
    ball = `<path class="set-trail" d="${d}"/>` + (anim
      ? `<circle class="ball" r="9"><animateMotion dur="${dur}s" fill="freeze" path="${d}" keyPoints="0;1" keyTimes="0;1" calcMode="linear"/></circle>`
      : `<circle class="ball" r="9" transform="translate(${end})"/>`);
  }
  const preview = o.mode === "set"
    ? `<path id="set-arc" class="set-arc" d="${o.pick?.d ?? ""}" data-pick-d="${o.pick?.d ?? ""}"/><circle id="set-target" class="set-target" r="10" cx="${o.pick ? f(NX(o.pick.x)) : -50}" cy="${f(NH(3.1))}" data-pick-x="${o.pick?.x ?? -1}"/>`
    : "";

  const tokens = o.tokens.map((t) => `<g class="tok tok-${t.kind}" transform="translate(${f(NX(t.x))},${t.kind === "setter" ? 318 : 322})">
      <circle r="${t.kind === "setter" ? 15 : 17}"/><text class="tok-label" y="5">${t.label}</text>${t.sub ? `<text class="tok-sub" y="34">${t.sub}</text>` : ""}</g>`).join("");

  const meshTop = NH(NET_TOP), meshBot = NH(NET_TOP - 1);
  return `<svg class="view netview" viewBox="0 0 960 360" role="img" aria-label="Net view: their blockers behind the net, your setter and hitters in front">
    <defs>${filter}<pattern id="mesh" width="12" height="12" patternUnits="userSpaceOnUse"><path class="mesh-line" d="M0 0 L12 0 M0 0 L0 12"/></pattern></defs>
    <text class="side-label" x="${NX(0) + 6}" y="22">Their side</text>
    <line class="floor" x1="0" y1="${NH(0)}" x2="960" y2="${NH(0)}"/>
    <g class="blockers"${filter ? ` filter="url(#fz)"` : ""}>${blockers}</g>
    <rect class="net-mesh" x="${NX(0)}" y="${meshTop}" width="900" height="${meshBot - meshTop}" fill="url(#mesh)"/>
    <rect class="net-tape" x="${NX(0)}" y="${meshTop - 3}" width="900" height="7"/>
    <line class="post" x1="${NX(0) - 6}" y1="${NH(0)}" x2="${NX(0) - 6}" y2="${meshTop - 3}"/><line class="post" x1="${NX(9) + 6}" y1="${NH(0)}" x2="${NX(9) + 6}" y2="${meshTop - 3}"/>
    <line class="antenna" x1="${NX(0)}" y1="${NH(NET_TOP + 0.85)}" x2="${NX(0)}" y2="${meshBot}"/><line class="antenna" x1="${NX(9)}" y1="${NH(NET_TOP + 0.85)}" x2="${NX(9)}" y2="${meshBot}"/>
    ${fog}${preview}${ball}
    ${tokens}
  </svg>`;
}

// ---------- Result flight (net view) ----------
export interface ResultFlight {
  outcome: "Kill" | "Blocked" | "Dug" | "Error";
  land?: { x: number; y: number };
  touch?: boolean;
  tool?: boolean;
}
export const FLIGHT_SECONDS = 1.1;

/** The ball after contact, in straight lines: into the floor, off the hands, into the net, out, or popped up by a digger. */
function flightSvg(r: ResultFlight, hx: number, placed: PlacedBlocker[], animate: boolean): string {
  const up = placed.filter((b) => b.state === "Formed" || b.state === "Late");
  const bx = up.length ? up.reduce((a, b) => (Math.abs(b.x - hx) < Math.abs(a.x - hx) ? b : a)).x : hx;
  const hands = { x: bx, h: 3.0, r: 9 };
  // Points are (x along the net, height, radius); a smaller ball reads as farther away, deeper in their court.
  const pts: { x: number; h: number; r: number }[] = [{ x: hx, h: 3.1, r: 9 }];
  const lx = r.land ? Math.max(-0.4, Math.min(9.4, r.land.x)) : hx;
  const side = hx < 4.5 ? -1 : 1;
  if (r.outcome === "Blocked") pts.push(hands, { x: hx - side * 0.5, h: 0, r: 13 });
  else if (r.tool) pts.push(hands, { x: side < 0 ? -0.25 : 9.25, h: 2.3, r: 8 }, { x: side < 0 ? -0.25 : 9.25, h: 0, r: 8 });
  else if (r.outcome === "Error" && !r.land) pts.push({ x: hx + 0.2, h: 1.9, r: 9 }, { x: hx + 0.35, h: 0, r: 12 });
  else {
    if (r.touch) pts.push(hands);
    if (r.outcome === "Dug") pts.push({ x: lx, h: 0.5, r: 6 }, { x: lx + 0.3, h: r.touch ? 5.5 : 4.4, r: 6 });
    else if (r.outcome === "Error" && r.land && r.land.y > 9) pts.push({ x: lx, h: 1.7, r: 3.5 });
    else if (r.outcome === "Error") pts.push({ x: lx, h: 0.9, r: 6 });
    else pts.push({ x: lx, h: 0, r: 5 });
  }
  const P = pts.map((p) => ({ x: NX(p.x), y: NH(p.h), r: p.r }));
  const d = "M" + P.map((p) => `${f(p.x)} ${f(p.y)}`).join(" L");
  const end = P[P.length - 1];
  const cls = r.outcome === "Kill" ? "fl-kill" : r.outcome === "Blocked" ? "fl-block" : r.outcome === "Dug" ? "fl-dug" : "fl-err";
  if (!animate) return `<path class="flight ${cls}" d="${d}"/><circle class="ball" r="${end.r}" cx="${f(end.x)}" cy="${f(end.y)}"/><circle class="splat ${cls}" r="18" cx="${f(end.x)}" cy="${f(end.y)}"/>`;
  // Constant speed along the path, so radius keyframes follow the cumulative length.
  const seg = P.slice(1).map((p, i) => Math.hypot(p.x - P[i].x, p.y - P[i].y));
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const times = [0, ...seg.map((l) => (acc += l) / total)].map((t) => t.toFixed(3)).join(";");
  const T = FLIGHT_SECONDS;
  return `<path class="flight flight-draw ${cls}" d="${d}" pathLength="1" style="--fl:${T}s"/>
    <circle class="ball" r="9"><animateMotion dur="${T}s" fill="freeze" path="${d}" calcMode="paced"/><animate attributeName="r" dur="${T}s" fill="freeze" values="${P.map((p) => p.r).join(";")}" keyTimes="${times}"/></circle>
    <circle class="splat ${cls}" r="4" cx="${f(end.x)}" cy="${f(end.y)}" opacity="0"><animate attributeName="r" begin="${T}s" dur="0.45s" values="4;26" fill="freeze"/><animate attributeName="opacity" begin="${T}s" dur="0.45s" values="0.9;0" fill="freeze"/></circle>`;
}

// ---------- Court view ----------
// Top-down on their court as the hitter sees it: the net at the bottom, their baseline at the top.
const CX = (x: number) => (x + 1.2) * 40;
const CY = (y: number) => (9.8 - y) * 40;
export const CONTACT_Y = -1.15;

export interface ShotMark {
  id: string;
  label: string;
  x: number;
  y: number;
  /** One-sigma cone in meters. */
  rx: number;
  ry: number;
  tone: Tone;
  /** Draw offset for shots that share a target, in meters. */
  nudge?: number;
}

export interface CourtOpts {
  hitterX: number;
  placed: PlacedBlocker[];
  arrivedCount: number;
  /** Their back-court defenders this ball (defaults to the base perimeter). */
  defenders?: Defender[];
  /** Where they'd stand before reading you; ghosts show how far they've cheated from it. */
  baseDefenders?: Defender[];
  /** Speed of the aimed ball; slow balls give defenders more reach. */
  ballSpeed?: number;
  clarity: Clarity;
  shots: ShotMark[];
  aim?: string;
  /** The hitter's contact height and the hands they face: shadows end where the ball goes over. */
  height?: number;
  hands?: Hands[];
  /** The angles this set lets you swing at; the rest of the court is dimmed. */
  window?: { min: number; max: number };
  /** A free aim: the spot and its cone (one σ along and across the swing, in meters). */
  aimCone?: { x: number; y: number; along: number; across: number; ux: number; uy: number; tone: Tone; label: string };
  result?: { outcome: "Kill" | "Blocked" | "Dug" | "Error"; land?: { x: number; y: number }; net?: boolean };
  /** The court as a grid of target tiles, each rated good / ok / bad (unrated in Hard mode). */
  tiles?: { c: number; r: number; kill?: number; tag?: string; on: boolean; fuzzy: boolean }[];
  /** Success-rate heat map: kill chance per spot. `blur` softens it for a fuzzy read. */
  heat?: { cells: { x: number; y: number; kill: number }[]; step: number; blur: number };
}

/** Kill chance to a heat color: red under 20%, yellow around 45%, green from 70%. */
/** Tile ratings: good from this kill chance, ok from this, bad below. */
export const TILE_GOOD = 0.5, TILE_OK = 0.3;
export function heatColor(kill: number): string {
  const t = Math.max(0, Math.min(1, (kill - 0.2) / 0.5));
  const hue = Math.round(t * 125);
  return `hsl(${hue} 78% 48%)`;
}

/** Where a shot's dot is drawn (court meters). */
export const markAt = (m: ShotMark) => ({ x: m.x + (m.nudge ?? 0), y: m.y });

export function courtSvg(o: CourtOpts): string {
  const cx = CX(o.hitterX), cy = CY(CONTACT_Y);
  // Block shadow: the court behind each blocker's hands, from your contact point. It ends where your swing
  // crosses the net higher than their reach, so a big jump shortens it.
  const height = o.height ?? 3.15;
  const ray = (edge: number, y: number) => o.hitterX + (edge - o.hitterX) * (y - CONTACT_Y) / -CONTACT_Y;
  const shadows = o.clarity === "Blind" ? "" : (o.hands ?? []).map((h) => {
    const end = Math.min(9.6, overDepth(height, h.top));
    const a = h.x - h.half, b = h.x + h.half;
    const cut = end < 9 ? `<line class="shadow-end" x1="${f(CX(ray(a, end)))}" y1="${f(CY(end))}" x2="${f(CX(ray(b, end)))}" y2="${f(CY(end))}"/>` : "";
    return `<polygon class="shadow shadow-${h.state.toLowerCase()}" points="${f(CX(a))},${f(CY(0))} ${f(CX(ray(a, end)))},${f(CY(end))} ${f(CX(ray(b, end)))},${f(CY(end))} ${f(CX(b))},${f(CY(0))}"/>${cut}`;
  }).join("");
  // Hitting window: dim the part of the court this set doesn't let you reach.
  const wedge = (a1: number, a2: number) => {
    const pts = [`${f(cx)},${f(cy)}`];
    for (let i = 0; i <= 8; i++) { const a = a1 + (a2 - a1) * i / 8; pts.push(`${f(CX(o.hitterX + Math.sin(a) * 16))},${f(CY(CONTACT_Y + Math.cos(a) * 16))}`); }
    return `<polygon class="off-window" points="${pts.join(" ")}"/>`;
  };
  const edgeRay = (a: number) => `<line class="window-edge" x1="${f(cx)}" y1="${f(cy)}" x2="${f(CX(o.hitterX + Math.sin(a) * 16))}" y2="${f(CY(CONTACT_Y + Math.cos(a) * 16))}"/>`;
  const win = o.window && !o.result ? wedge(-1.6, o.window.min) + wedge(o.window.max, 1.6) + edgeRay(o.window.min) + edgeRay(o.window.max) : "";
  // Too short to get over the net from this height.
  const hands = o.clarity === "Blind" ? "" : o.placed.filter((b) => b.state !== "Missing").map((b) =>
    `<rect class="hands hands-${b.state.toLowerCase()}" x="${f(CX(b.x - 0.3))}" y="${f(CY(0) - (b.state === "Home" ? -2 : 5))}" width="24" height="${b.state === "Home" ? 6 : 10}" rx="3"/>`).join("");

  const hs = o.heat ? o.heat.step * 40 : 0;
  const heat = o.heat && !o.result ? `<g class="heat" clip-path="url(#courtclip)"${o.heat.blur ? ` filter="url(#heatblur)"` : ""}>${o.heat.cells.map((c) =>
    `<rect x="${f(CX(c.x) - hs / 2)}" y="${f(CY(c.y) - hs / 2)}" width="${f(hs + 0.5)}" height="${f(hs + 0.5)}" fill="${heatColor(c.kill)}"/>`).join("")}</g>` : "";
  const TW = 3 * 40;
  const tiles = o.tiles && !o.result ? `<g class="tiles">${o.tiles.map((t) => {
    const x = CX(t.c * 3), y = CY((t.r + 1) * 3);
    const tone = t.kill === undefined ? "none" : t.kill >= TILE_GOOD ? "good" : t.kill >= TILE_OK ? "ok" : "bad";
    const word = t.kill === undefined ? (t.tag ?? "").toUpperCase() : `${t.fuzzy ? "~" : ""}${Math.round(t.kill * 100)}%`;
    return `<g class="tile tile-${tone}${t.on ? " tile-on" : ""}" data-tile="${t.c},${t.r}"><rect x="${f(x + 3)}" y="${f(y + 3)}" width="${TW - 6}" height="${TW - 6}" rx="10"/>${word ? `<text x="${f(x + TW / 2)}" y="${f(y + TW / 2 + 8)}">${word}</text>` : ""}</g>`;
  }).join("")}</g>` : "";
  const bs = o.ballSpeed ?? 1;
  const reach = Math.min(4, digReach(bs, o.arrivedCount));
  const offBlockers = o.placed.filter((b) => b.state === "Home" && !(o.defenders ?? []).some((d) => d.name.startsWith("z"))).map((b) => ({ x: b.startX < 4.5 ? 1.5 : 7.5, y: OFF_BLOCKER_DEPTH }));
  const back = o.defenders ?? PERIMETER_DEFENSE;
  const all = [...back, ...offBlockers];
  // Faint ghosts show where they'd normally stand, so you can see them cheat.
  const ghosts = o.result ? "" : back.map((d, i) => {
    const b = (o.baseDefenders ?? PERIMETER_DEFENSE)[i];
    return Math.hypot(b.x - d.x, b.y - d.y) > 0.6 ? `<circle class="ghost-def" cx="${f(CX(b.x))}" cy="${f(CY(b.y))}" r="9"/><line class="ghost-line" x1="${f(CX(b.x))}" y1="${f(CY(b.y))}" x2="${f(CX(d.x))}" y2="${f(CY(d.y))}"/>` : "";
  }).join("");
  // Reach leans toward the net: they can run forward farther than they can back up.
  const defenders = ghosts + (o.result ? [] : all).map((d) => { const r = reachOval(d, reach); return `<ellipse class="reach" cx="${f(CX(r.x))}" cy="${f(CY(r.y))}" rx="${f(r.rx * 40)}" ry="${f(r.ry * 40)}"/>`; }).join("")
    + all.map((d) => `<circle class="defender" cx="${f(CX(d.x))}" cy="${f(CY(d.y))}" r="11"/>`).join("");

  const aimed = o.shots.find((s) => s.id === o.aim);
  const ac = o.aimCone;
  const coneAt = (k: number) => {
    const deg = (Math.atan2(-ac!.uy, ac!.ux) * 180) / Math.PI;
    return `<ellipse class="cone${k > 1 ? " cone-2" : ""} r-${ac!.tone}" cx="0" cy="0" rx="${f(ac!.along * 40 * k)}" ry="${f(ac!.across * 40 * k)}" transform="translate(${f(CX(ac!.x))},${f(CY(ac!.y))}) rotate(${deg.toFixed(1)})"/>`;
  };
  const cone = ac && !o.result && !o.tiles
    ? `<line class="aim-line r-${ac.tone}" x1="${f(cx)}" y1="${f(cy)}" x2="${f(CX(ac.x))}" y2="${f(CY(ac.y))}"/>${coneAt(2)}${coneAt(1)}
       <g class="aim-handle" transform="translate(${f(CX(ac.x))},${f(CY(ac.y))})"><circle r="9"/><text y="-16">${ac.label}</text></g>`
    : aimed && !o.result
    ? `<path class="aim-path r-${aimed.tone}" d="M${f(cx)} ${f(cy)} Q${f((cx + CX(aimed.x)) / 2)} ${f(CY(0) - 30)} ${f(CX(aimed.x))} ${f(CY(aimed.y))}"/>
       <ellipse class="cone cone-2 r-${aimed.tone}" cx="${f(CX(aimed.x))}" cy="${f(CY(aimed.y))}" rx="${f(aimed.rx * 80)}" ry="${f(aimed.ry * 80)}"/>
       <ellipse class="cone r-${aimed.tone}" cx="${f(CX(aimed.x))}" cy="${f(CY(aimed.y))}" rx="${f(aimed.rx * 40)}" ry="${f(aimed.ry * 40)}"/>`
    : "";
  // With a free aim, the usual targets shrink to small presets you can tap to snap to.
  const dots = o.result ? "" : o.shots.map((s) => {
    const p = markAt(s);
    return `<g class="mark r-${s.tone}${s.id === o.aim && !ac ? " mark-on" : ""}${ac ? " mark-preset" : ""}" data-aim="${s.id}" transform="translate(${f(CX(p.x))},${f(CY(p.y))})">
      <circle r="${ac ? 8 : 13}"/><text y="${ac ? 22 : 30}">${s.label}</text></g>`;
  }).join("");

  let result = "";
  if (o.result) {
    const r = o.result;
    if (r.outcome === "Blocked") result = `<g class="burst" transform="translate(${f(cx)},${f(CY(0))})"><circle r="22"/><path d="M-30 0 L30 0 M0 -30 L0 30 M-21 -21 L21 21 M-21 21 L21 -21"/></g><text class="res-label" x="${f(cx)}" y="${f(CY(0) - 34)}">Stuffed</text>`;
    else if (r.net || !r.land) result = `<g class="burst burst-err" transform="translate(${f(cx)},${f(CY(0))})"><circle r="16"/></g><text class="res-label res-err" x="${f(cx)}" y="${f(CY(0) - 26)}">Net</text>`;
    else {
      const lx = CX(r.land.x), ly = CY(r.land.y);
      const cls = r.outcome === "Kill" ? "land-kill" : r.outcome === "Dug" ? "land-dug" : "land-err";
      result = `<path class="ball-path ball-draw ${cls}" pathLength="1" d="M${f(cx)} ${f(cy)} Q${f((cx + lx) / 2)} ${f(CY(0) - 30)} ${f(lx)} ${f(ly)}"/>
        <g class="land land-pop ${cls}" transform="translate(${f(lx)},${f(ly)})"><circle r="10"/><path d="M-7 -7 L7 7 M-7 7 L7 -7"/></g>`;
    }
  }

  return `<svg class="view courtview" id="court" viewBox="0 0 456 464" role="img" aria-label="Their court from above. Drag or tap to aim.">
    <defs><linearGradient id="shade" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="shade-a"/><stop offset="1" class="shade-b"/></linearGradient>
      <clipPath id="courtclip"><rect x="${CX(0)}" y="${CY(9)}" width="360" height="360"/></clipPath>${o.clarity === "Fuzzy" ? `<filter id="fz2"><feGaussianBlur stdDeviation="5"/></filter>` : ""}${o.heat?.blur ? `<filter id="heatblur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${o.heat.blur}"/></filter>` : ""}</defs>
    <rect class="court" x="${CX(0)}" y="${CY(9)}" width="360" height="360"/>
    <line class="court-line" x1="${CX(0)}" y1="${CY(3)}" x2="${CX(9)}" y2="${CY(3)}"/>
    ${heat}
    ${tiles}
    <g clip-path="url(#courtclip)">${win}</g>
    <g clip-path="url(#courtclip)"${o.clarity === "Fuzzy" ? ` filter="url(#fz2)"` : ""}>${shadows}</g>
    ${defenders}
    <line class="court-net" x1="${CX(-0.3)}" y1="${CY(0)}" x2="${CX(9.3)}" y2="${CY(0)}"/>
    <g${o.clarity === "Fuzzy" ? ` filter="url(#fz2)"` : ""}>${hands}</g>
    ${o.clarity === "Blind" ? `<text class="side-label" x="${CX(4.5)}" y="${CY(0) - 12}" text-anchor="middle">Block unseen</text>` : ""}
    ${cone}${dots}${result}
    <g class="tok tok-hitter" transform="translate(${f(cx)},${f(cy)})"><circle r="14"/><text class="tok-label" y="5">You</text></g>
  </svg>`;
}

/** Convert a click on the court SVG to court meters. */
export function courtPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } | null {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x / 40 - 1.2, y: 9.8 - p.y / 40 };
}
