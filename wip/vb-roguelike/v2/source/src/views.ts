// SVG views: the top-down court (both floors) and the net view (front-on, with the block forming).
// Pure string builders; no rules live here.
import { COVER, REACH_SIZE } from "./tables";
import { BlockForm, colOf, Defender, fromNet, HITTER_X, Odds, rowOf, shadowShapes, Side, Sq, Team, Tell, Tempo } from "./engine";

const f = (n: number) => n.toFixed(1);

// ---------- Tones: odds as a color and a word ----------
export type Tone = "great" | "good" | "even" | "risky" | "bad";
export const TONE_WORD: Record<Tone, string> = { great: "Wide open", good: "Good look", even: "Coin flip", risky: "Risky", bad: "Long shot" };
export function toneOf(win: number): Tone {
  return win >= 0.6 ? "great" : win >= 0.45 ? "good" : win >= 0.3 ? "even" : win >= 0.15 ? "risky" : "bad";
}
/** Plain words for why a tile is what it is. */
export function reasons(o: Odds): string[] {
  const out: string[] = [];
  if (o.hole) return ["It's a hole: nobody can dig it"];
  if (o.inShadow) return ["Behind the block: a hard swing can't get there"];
  if (!o.inRange) out.push("a reach off this set, so more risk of an error");
  if (o.blockP >= 0.25) out.push("the edge of the block is on it");
  else if (o.blockP > 0) out.push("it grazes the block's edge");
  if (o.digP >= 0.45) out.push("a digger is right there");
  else if (o.digP >= 0.2) out.push("a digger is close");
  else out.push("nobody's near it");
  return out;
}
export { HITTER_X };

// ---------- Court view (top-down, portrait) ----------
const CX0 = 30, TW = 100, TH = 86, NET_Y = 286, SW = TW / 2, SH = TH / 2;
const tileX = (c: number) => CX0 + c * TW;
const theirY = (r: number) => NET_Y - 6 - (r + 1) * TH;
const ourY = (r: number) => NET_Y + 6 + r * TH;
export function tileCenter(side: Side, i: number): [number, number] {
  const r = rowOf(i), c = colOf(i);
  return [tileX(c) + TW / 2, (side === "them" ? theirY(r) : ourY(r)) + TH / 2];
}
export function sqCenter(side: Side, s: Sq): [number, number] {
  return [CX0 + (s.c + 0.5) * SW, side === "them" ? NET_Y - 6 - (s.r + 0.5) * SH : NET_Y + 6 + (s.r + 0.5) * SH];
}
/** Meters to court pixels: x along the net, y as depth from the net on one side. */
const mx = (m: number) => CX0 + (m / 9) * 300;
const my = (side: Side, m: number) => (side === "them" ? NET_Y - 6 - (m / 9) * 3 * TH : NET_Y + 6 + (m / 9) * 3 * TH);

const CRACKS = [
  "M18 12 L38 34 L33 50 L52 70",
  "M80 10 L64 30 L70 44 L56 62",
  "M12 70 L34 58 L48 62 L70 48 L88 52",
  "M50 8 L46 28 L58 40 L50 76",
];
function tileSvg(side: Side, t: Team, i: number, extra: string, cls: string, idAttr: string): string {
  const r = rowOf(i), c = colOf(i);
  const x = tileX(c), y = side === "them" ? theirY(r) : ourY(r);
  const hp = t.tiles[i];
  const dmg = t.maxHp - hp;
  let body = `<rect class="tile ${cls}" x="${x}" y="${y}" width="${TW}" height="${TH}"/>`;
  if (hp <= 0) {
    body += `<path class="hole" d="M${x + 8} ${y + 14} L${x + 30} ${y + 6} L${x + 52} ${y + 16} L${x + 78} ${y + 5} L${x + 93} ${y + 24} L${x + 88} ${y + 52} L${x + 95} ${y + 78} L${x + 66} ${y + 82} L${x + 40} ${y + 76} L${x + 14} ${y + 82} L${x + 6} ${y + 56} L${x + 12} ${y + 34} Z"/>`;
  } else if (dmg > 0) {
    const n = Math.min(CRACKS.length, Math.ceil((dmg / t.maxHp) * 4));
    body += `<g class="cracks" transform="translate(${x + 5},${y + 4}) scale(0.9)">${CRACKS.slice(0, n).map((d) => `<path d="${d}"/>`).join("")}</g>`;
  }
  // Hits left as small pips in the corner.
  if (hp > 0) body += `<g class="pips">${Array.from({ length: t.maxHp }, (_, k) => `<circle cx="${x + TW - 10 - k * 9}" cy="${y + 10}" r="3" class="${k < hp ? "pip-on" : "pip-off"}"/>`).join("")}</g>`;
  return `<g class="tile-g"${idAttr}>${body}${extra}</g>`;
}

export interface ServeMark { col: number; label: string; sub: string; tone: Tone; seam: boolean }
export interface DefendPick {
  /** Selected player: a defender id, or "blk:<id>" for a blocker. */
  selected?: string;
  squares: Sq[];
  blockXs: number[];
  moved: string[];
  canMove: boolean;
}
export interface CourtOpts {
  us: Team;
  them: Team;
  /** Which part to show: their floor and the net, ours and the net, or both. */
  focus: "both" | "their" | "our";
  /** Tap targets on their floor (tiles). */
  pick?: "their";
  theirTones?: (Tone | null)[];
  theirSelected?: number;
  theirDefense?: Defender[];
  ourDefense?: Defender[];
  /** Blocks: blockers at the net, plus their shadow on the floor behind. */
  theirBlock?: BlockForm;
  ourBlock?: BlockForm;
  ourHitterCol?: number;
  theirHitterCol?: number;
  ourHitterLabel?: string;
  theirHitterLabel?: string;
  serveMarks?: ServeMark[];
  serveSelected?: number;
  ourPassers?: { col: number; label: string }[];
  defend?: DefendPick;
  ball?: { path: string; land?: [number, number]; kind: string };
  /** Tiles that just changed, flashed with a pop. */
  flashTheir?: number;
  flashOur?: number;
}

function defTokens(defs: Defender[] | undefined, side: Side, pick?: DefendPick): string {
  if (!defs) return "";
  return defs.map((d) => {
    const [x, y] = sqCenter(side, d.sq);
    const sel = pick?.selected === d.id, moved = pick?.moved.includes(d.id);
    const tap = pick && (pick.canMove || moved || sel) ? ` data-def="${d.id}" role="button" tabindex="0" aria-label="Move ${d.id}"` : "";
    return `<g class="tok tok-${side}${sel ? " is-sel" : ""}${moved ? " is-moved" : ""}"${tap} transform="translate(${f(x)},${f(y)})"><circle r="14"/><text y="4.5">${d.id}</text></g>`;
  }).join("");
}
/** Each defender's reach: a soft oval that fades out the way their dig confidence does. */
function reachSvg(defs: Defender[] | undefined, side: Side): string {
  if (!defs) return "";
  return defs.map((d) => {
    const [x, y] = sqCenter(side, d.sq), k = REACH_SIZE[d.zone];
    const rx = COVER.side * k * 300 / 9, ry = COVER.depth * k * 3 * TH / 9;
    return `<ellipse class="reach reach-${side}" cx="${f(x)}" cy="${f(y)}" rx="${f(2 * rx)}" ry="${f(2 * ry)}" fill="url(#reach-${side})"/>`
      + `<ellipse class="reach-ring reach-ring-${side}" cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}"/>`;
  }).join("");
}
/** Gradient stops that follow exp(-falloff * n^2) out to two oval radii. */
function reachGrad(side: Side): string {
  const stops = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map((t) => `<stop offset="${t}" stop-color="var(--${side})" stop-opacity="${(Math.exp(-COVER.falloff * (2 * t) ** 2) * (t < 1 ? 1 : 0)).toFixed(3)}"/>`).join("");
  return `<radialGradient id="reach-${side}">${stops}</radialGradient>`;
}
function fanSvg(b: BlockForm | undefined, side: Side): string {
  if (!b) return "";
  return shadowShapes(b).map((s) => {
    const pts = [[s.a, 0], [s.b, 0], [fromNet(b, s.b, s.depth), s.depth], [fromNet(b, s.a, s.depth), s.depth]].map(([x, y]) => `${f(mx(x))},${f(my(side, y))}`).join(" ");
    return `<polygon class="fan fan-${s.kind}${s.formed ? "" : " fan-late"}" points="${pts}"/>`;
  }).join("");
}
function blockerBars(b: BlockForm | undefined, side: Side, pick?: DefendPick): string {
  if (!b) return "";
  const y = side === "them" ? NET_Y - 17 : NET_Y + 3;
  return b.front.filter((p) => p.state !== "off").map((p) => {
    const sel = pick?.selected === `blk:${p.id}`, moved = pick?.moved.includes(p.id);
    const tap = pick && (pick.canMove || moved || sel) ? ` data-blk="${p.id}" role="button" tabindex="0" aria-label="Slide ${p.id} along the net"` : "";
    return `<g class="cblk cblk-${side} cblk-${p.state}${sel ? " is-sel" : ""}${moved ? " is-moved" : ""}"${tap}><rect x="${f(mx(p.x) - 21)}" y="${y}" width="42" height="14" rx="5"/><text x="${f(mx(p.x))}" y="${y + 11}">${p.id}</text></g>`;
  }).join("");
}
function hitterTok(col: number | undefined, side: Side, label = "H"): string {
  if (col === undefined) return "";
  const x = mx(HITTER_X[col]);
  const y = side === "us" ? NET_Y + 30 : NET_Y - 30;
  return `<g class="tok tok-hitter tok-${side}" transform="translate(${f(x)},${y})"><circle r="15"/><text y="5">${label}</text></g>`;
}
function serveMarks(list: ServeMark[] | undefined, sel?: number): string {
  if (!list) return "";
  return list.map((m, i) => {
    const x = CX0 + (m.col + 0.5) * TW, y = theirY(2) + TH / 2;
    const r = m.seam ? 13 : 19;
    return `<g class="tok tok-them tok-serve${m.seam ? " is-seam" : ""} tone-${m.tone}${sel === i ? " is-sel" : ""}" data-serve="${i}" role="button" tabindex="0" aria-label="Serve at ${m.label}" transform="translate(${f(x)},${f(y)})"><circle r="${r}"/><text y="${m.seam ? 4 : 5}">${m.label}</text>${m.sub ? `<text class="tok-sub" y="${r + 14}">${m.sub}</text>` : ""}</g>`;
  }).join("");
}
function passerToks(list: CourtOpts["ourPassers"]): string {
  if (!list) return "";
  return list.map((p) => { const [x, y] = tileCenter("us", 6 + p.col); return `<g class="tok tok-us" transform="translate(${f(x)},${f(y)})"><circle r="17"/><text y="5">${p.label}</text></g>`; }).join("");
}
function subGrid(side: Side): string {
  const y0 = side === "them" ? theirY(2) : ourY(0);
  let d = "";
  for (let k = 1; k < 6; k += 2) d += `M${CX0 + k * SW} ${y0} V${y0 + 3 * TH} `;
  for (let k = 1; k < 6; k += 2) d += `M${CX0} ${y0 + k * SH} H${CX0 + 300} `;
  return `<path class="subgrid" d="${d}"/>`;
}

export function courtSvg(o: CourtOpts): string {
  const vb = o.focus === "their" ? "0 10 360 318" : o.focus === "our" ? "0 244 360 320" : "0 10 360 552";
  const floor = (side: Side) => {
    const t = side === "them" ? o.them : o.us;
    const pick = side === "them" && o.pick === "their";
    return Array.from({ length: 9 }, (_, i) => {
      const tone = side === "them" ? o.theirTones?.[i] : null;
      const sel = side === "them" && o.theirSelected === i;
      const flash = (side === "them" ? o.flashTheir : o.flashOur) === i;
      const [x, y] = [tileX(colOf(i)), side === "them" ? theirY(rowOf(i)) : ourY(rowOf(i))];
      let extra = "";
      if (tone) extra += `<rect class="tint t-${tone}" x="${x + 3}" y="${y + 3}" width="${TW - 6}" height="${TH - 6}" rx="4"/>`;
      if (sel) extra += `<rect class="sel" x="${x + 3}" y="${y + 3}" width="${TW - 6}" height="${TH - 6}" rx="6"/>`;
      if (flash) extra += `<rect class="flash" x="${x}" y="${y}" width="${TW}" height="${TH}"/>`;
      const id = pick ? ` data-tile="${i}" role="button" tabindex="0" aria-label="Row ${rowOf(i) + 1}, column ${colOf(i) + 1}"` : "";
      return tileSvg(side, t, i, extra, pick ? "pickable" : "", id);
    }).join("");
  };
  const targets = o.defend
    ? o.defend.squares.map((s) => { const [x, y] = sqCenter("us", s); return `<rect class="sq-target" data-sq="${s.r},${s.c}" role="button" tabindex="0" aria-label="Move here" x="${f(x - SW / 2 + 3)}" y="${f(y - SH / 2 + 3)}" width="${SW - 6}" height="${SH - 6}" rx="5"/>`; }).join("")
      + o.defend.blockXs.map((bx) => `<rect class="sq-target" data-bx="${bx}" role="button" tabindex="0" aria-label="Slide here" x="${f(mx(bx) - 21)}" y="${NET_Y + 3}" width="42" height="14" rx="5"/>`).join("")
    : "";
  const ball = o.ball
    ? `<g class="ball-g ball-${o.ball.kind}"><path class="ball-trail" d="${o.ball.path}"/><circle class="ball" r="8"><animateMotion dur="0.75s" fill="freeze" path="${o.ball.path}"/></circle>${o.ball.land ? `<circle class="burst" cx="${f(o.ball.land[0])}" cy="${f(o.ball.land[1])}" r="6"/>` : ""}</g>`
    : "";
  return `<svg class="court" viewBox="${vb}" role="img" aria-label="Court from above: their floor on top, the net, your floor below">
    <defs><clipPath id="clip-them"><rect x="${CX0}" y="${theirY(2)}" width="300" height="${3 * TH}"/></clipPath><clipPath id="clip-us"><rect x="${CX0}" y="${ourY(0)}" width="300" height="${3 * TH}"/></clipPath>${reachGrad("us")}${reachGrad("them")}</defs>
    <text class="side-tag" x="${CX0}" y="${theirY(2) - 4}">THEIR FLOOR</text>
    ${floor("them")}${subGrid("them")}
    <g clip-path="url(#clip-them)">${reachSvg(o.theirDefense, "them")}${fanSvg(o.theirBlock, "them")}</g>
    <line class="net-line" x1="${CX0 - 10}" y1="${NET_Y}" x2="${CX0 + 310}" y2="${NET_Y}"/>
    ${floor("us")}${subGrid("us")}
    <g clip-path="url(#clip-us)">${reachSvg(o.ourDefense, "us")}${fanSvg(o.ourBlock, "us")}</g>
    <text class="side-tag" x="${CX0}" y="${ourY(3) + 14}">YOUR FLOOR</text>
    ${targets}
    ${defTokens(o.theirDefense, "them")}${defTokens(o.ourDefense, "us", o.defend)}
    ${serveMarks(o.serveMarks, o.serveSelected)}${passerToks(o.ourPassers)}
    ${blockerBars(o.theirBlock, "them")}${blockerBars(o.ourBlock, "us", o.defend)}
    ${hitterTok(o.ourHitterCol, "us", o.ourHitterLabel)}${hitterTok(o.theirHitterCol, "them", o.theirHitterLabel)}
    ${ball}
  </svg>`;
}
/** Ball paths on the court. */
export function ballFromNet(side: Side, h: number, to: [number, number]): string {
  const x0 = mx(HITTER_X[h]), y0 = side === "us" ? NET_Y + 22 : NET_Y - 22;
  return `M${f(x0)} ${f(y0)} L${f(to[0])} ${f(to[1])}`;
}
export function ballBlocked(side: Side, h: number): { path: string; land: [number, number] } {
  const x0 = mx(HITTER_X[h]);
  const back = side === "us" ? NET_Y + 90 : NET_Y - 90;
  return { path: `M${f(x0)} ${f(side === "us" ? NET_Y + 22 : NET_Y - 22)} L${f(x0)} ${NET_Y} L${f(x0 + 20)} ${back}`, land: [x0 + 20, back] };
}
export function ballOut(side: Side, h: number): string {
  const x0 = mx(HITTER_X[h]);
  const y1 = side === "us" ? 8 : 560;
  return `M${f(x0)} ${f(side === "us" ? NET_Y + 22 : NET_Y - 22)} L${f(h === 0 ? -10 : 370)} ${y1}`;
}
export function ballServe(side: Side, to: [number, number]): string {
  const from = side === "us" ? [180, 556] : [180, 16];
  return `M${from[0]} ${from[1]} Q${f((from[0] + to[0]) / 2 + 40)} ${NET_Y} ${f(to[0])} ${f(to[1])}`;
}

// ---------- Net view (front-on, from our side) ----------
const NX = (x: number) => 30 + x * 100;
const NH = (h: number) => 290 - h * 40;
const NET_TOP = 2.43;
const APEX: Record<Tempo, number> = { High: 6.4, Combo: 4.6, Fast: 3.6 };
export const SET_SECONDS: Record<Tempo, number> = { High: 1.6, Combo: 1.25, Fast: 1.0 };
function setArc(fromX: number, toX: number, tempo: Tempo): string {
  const x0 = NX(fromX), y0 = NH(2.6), x1 = NX(toX), y1 = NH(3.1);
  const yc = 2 * NH(APEX[tempo]) - (y0 + y1) / 2;
  return `M${f(x0)} ${f(y0)} Q${f((x0 + x1) / 2)} ${f(yc)} ${f(x1)} ${f(y1)}`;
}
function figure(jump: number, arms: boolean): string {
  const top = (h: number) => NH(h + jump);
  return `<rect class="b-body" x="-15" y="${f(top(1.55))}" width="30" height="${f(top(0.15) - top(1.55))}" rx="9"/>
    <circle class="b-head" cx="0" cy="${f(top(1.78))}" r="11"/>
    <path class="b-arm" d="M-11 ${f(top(1.45))} L-16 ${f(top(arms ? 2.35 : 1.75))} M11 ${f(top(1.45))} L16 ${f(top(arms ? 2.35 : 1.75))}"/>`;
}
export interface NetToken { col: number; label: string; sub: string; selected: boolean; disabled: boolean; callId?: string }
export interface NetOpts {
  /** Whose attack this is. Blockers are the other side's. */
  attacker: Side;
  /** The front row of the blocking side; before the set they stand at home. */
  front: { home: number; x: number; state: "formed" | "late" | "off" }[];
  /** After the set: the hitter's column and the tempo, for the set arc and the block moving. */
  set?: { h: number; tempo: Tempo };
  animate: boolean;
  hitters: NetToken[];
  /** Their hitter's approach, shown on defense. */
  tell?: Tell;
}
const TELL_WORD: Record<Tell, string> = { line: "Straight approach", cross: "Wide approach", tip: "Slow approach" };
export function netSvg(o: NetOpts): string {
  const dur = o.set ? SET_SECONDS[o.set.tempo] : 1;
  const blockSide: Side = o.attacker === "us" ? "them" : "us";
  const blockers = o.front.map((b) => {
    const state = o.set ? b.state : "off";
    const x = o.set ? b.x : b.home;
    const jump = state === "formed" ? 0.75 : state === "late" ? 0.3 : 0;
    const dx = NX(b.home) - NX(x);
    const move = o.animate && Math.abs(dx) > 0.5
      ? `<animateTransform attributeName="transform" type="translate" values="${f(dx)} 0;${f(dx)} 0;0 0" keyTimes="0;0.25;${state === "late" ? 1 : 0.8}" dur="${dur}s" fill="freeze"/>`
      : "";
    const jumpPx = jump * 40;
    const hop = o.animate && jumpPx ? `<animateTransform attributeName="transform" type="translate" values="0 ${f(jumpPx)};0 ${f(jumpPx)};0 0" keyTimes="0;0.8;1" dur="${dur}s" fill="freeze"/>` : "";
    return `<g class="blk blk-${blockSide} blk-${o.set ? state : "ready"}" transform="translate(${f(NX(x))},0)"><g>${move}<g>${hop}${figure(jump, state !== "off")}</g></g></g>`;
  }).join("");
  // The setter stands right of middle on our side; theirs (facing us) is left of middle.
  const setterX = o.attacker === "us" ? 6.0 : 3.0;
  let ball = "";
  if (o.set) {
    const d = setArc(setterX, HITTER_X[o.set.h], o.set.tempo);
    ball = `<path class="set-trail" d="${d}"/>` + (o.animate
      ? `<circle class="nball" r="9"><animateMotion dur="${dur}s" fill="freeze" path="${d}"/></circle>`
      : `<circle class="nball" r="9" cx="${f(NX(HITTER_X[o.set.h]))}" cy="${f(NH(3.1))}"/>`);
  }
  const toks = o.hitters.map((t) => `<g class="ntok ntok-${o.attacker}${t.selected ? " is-sel" : ""}${t.disabled ? " is-off" : ""}" transform="translate(${f(NX(HITTER_X[t.col]))},318)"><circle r="30"/><text class="ntok-label" y="9">${t.label}</text></g>`).join("");
  const setter = `<g class="ntok ntok-${o.attacker} ntok-setter" transform="translate(${f(NX(setterX))},318)"><circle r="22"/><text class="ntok-label" y="8">S</text></g>`;
  let tell = "";
  if (o.tell && o.set) {
    // The approach arrow runs in to the hitter: straight on for the line, from wide for the cross, short and slow for a tip.
    const hx = NX(HITTER_X[o.set.h]);
    const wide = o.set.h === 2 ? 1 : -1;
    const from: [number, number] = o.tell === "cross" ? [hx + wide * 130, 368] : [hx, o.tell === "tip" ? 360 : 368];
    const to: [number, number] = o.tell === "tip" ? [hx, 352] : [hx + (o.tell === "cross" ? wide * 34 : 0), 352];
    const wordX = o.set.h === 2 ? hx - 44 : hx + 44;
    tell = `<g class="tell tell-${o.tell}${o.animate ? " tell-anim" : ""}"><path class="tell-arrow" d="M${f(from[0])} ${from[1]} L${f(to[0])} ${to[1]}" marker-end="url(#tell-head)"/>
      <text class="tell-word" x="${f(wordX)}" y="300" text-anchor="${o.set.h === 2 ? "end" : "start"}">${TELL_WORD[o.tell]}</text></g>`;
  }
  const meshTop = NH(NET_TOP), meshBot = NH(NET_TOP - 1);
  return `<svg class="netview" viewBox="0 0 960 372" role="img" aria-label="Net view: ${o.attacker === "us" ? "their blockers behind the net, your hitters in front" : "your blockers, their setter and hitter"}">
    <defs><pattern id="mesh" width="12" height="12" patternUnits="userSpaceOnUse"><path class="mesh-line" d="M0 0 L12 0 M0 0 L0 12"/></pattern>
    <marker id="tell-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="tell-head" d="M0 0 L10 5 L0 10 z"/></marker></defs>
    <text class="side-tag" x="${NX(0) + 6}" y="26">${o.attacker === "us" ? "THEIR BLOCK" : "THEIR ATTACK · YOUR BLOCK"}</text>
    <line class="floor" x1="0" y1="${NH(0)}" x2="960" y2="${NH(0)}"/>
    <g class="blockers">${blockers}</g>
    <rect class="net-mesh" x="${NX(0)}" y="${meshTop}" width="900" height="${meshBot - meshTop}" fill="url(#mesh)"/>
    <rect class="net-tape" x="${NX(0)}" y="${meshTop - 3}" width="900" height="7"/>
    <line class="antenna" x1="${NX(0)}" y1="${NH(NET_TOP + 0.85)}" x2="${NX(0)}" y2="${meshBot}"/><line class="antenna" x1="${NX(9)}" y1="${NH(NET_TOP + 0.85)}" x2="${NX(9)}" y2="${meshBot}"/>
    ${ball}${setter}${toks}${tell}
  </svg>`;
}
