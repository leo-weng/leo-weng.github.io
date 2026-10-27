// SVG views: the top-down court (both floors) and the net view (front-on, with the block forming).
// Pure string builders; no rules live here.
import { COVER } from "./tables";
import { BlockForm, colOf, Defender, fromNet, HITTER_X, N, Read, rowOf, shadowShapes, Side, Sq, Team, Tell, Tempo } from "./engine";

const f = (n: number) => n.toFixed(1);

// ---------- Tones: odds as a color and a word ----------
export type Tone = "great" | "good" | "even" | "risky" | "bad";
export const TONE_WORD: Record<Tone, string> = { great: "Wide open", good: "Good look", even: "Coin flip", risky: "Risky", bad: "Long shot" };
export function toneOf(win: number): Tone {
  return win >= 0.6 ? "great" : win >= 0.45 ? "good" : win >= 0.3 ? "even" : win >= 0.15 ? "risky" : "bad";
}
/** Plain words for what a square will do, before you swing. */
export function verdictWords(v: Read, damageNote: string): { word: string; tone: Tone; why: string } {
  const who = v.by ? (v.by.id === "L" ? "the libero" : v.by.id) : "";
  switch (v.kind) {
    case "kill": return { word: "Open", tone: "great", why: `nobody's circle reaches it · ${damageNote}` };
    case "hole": return { word: "Open hole", tone: "great", why: "a hole nobody's circle reaches · +1" };
    case "tool": return { word: "Off the hands", tone: "good", why: "it clips the edge of their block and goes out · +1" };
    case "scramble": return { word: "Scramble", tone: "risky", why: `the edge of ${who}'s circle: dug, but badly${v.hole ? " (they dive into the hole)" : ""}` };
    case "clean": return { word: "Dug", tone: "bad", why: `right at ${who}: a clean dig` };
    case "touch": return v.back
      ? { word: "Block touch", tone: "even", why: "it hits a good part of their hands and bounces back to your side: you cover it and swing again off a high ball" }
      : { word: "Soft touch", tone: "bad", why: "it grazes their hands and drops into their court: an easy dig for them" };
    case "stuff": return { word: "Stuffed", tone: "bad", why: "the solid middle of their block" };
    default: return { word: "Can't reach", tone: "bad", why: "this set or shot can't get there" };
  }
}
export { HITTER_X };

// ---------- Court view (top-down, portrait) ----------
const CX0 = 30, TW = 100, TH = 86, NET_Y = 286, SW = TW / 2, SH = TH / 2;
const tileX = (c: number) => CX0 + c * TW;
const theirY = (r: number) => NET_Y - 6 - (r + 1) * TH;
const ourY = (r: number) => NET_Y + 6 + r * TH;
/** The middle of one third-by-third zone (row 0-2, lane 0-2): where passers and serve targets sit. */
export function zoneCenter(side: Side, row: number, lane: number): [number, number] {
  return [tileX(lane) + TW / 2, (side === "them" ? theirY(row) : ourY(row)) + TH / 2];
}
/** Top-left corner of a small square (index row*6+col). */
function sqXYpx(side: Side, i: number): [number, number] {
  const r = rowOf(i), c = colOf(i);
  return [CX0 + c * SW, side === "them" ? NET_Y - 6 - (r + 1) * SH : NET_Y + 6 + r * SH];
}
export function squareCenter(side: Side, i: number): [number, number] { const [x, y] = sqXYpx(side, i); return [x + SW / 2, y + SH / 2]; }
export function sqCenter(side: Side, s: Sq): [number, number] {
  return [CX0 + (s.c + 0.5) * SW, side === "them" ? NET_Y - 6 - (s.r + 0.5) * SH : NET_Y + 6 + (s.r + 0.5) * SH];
}
/** A spot on one floor (meters) in court pixels. */
export function courtPoint(side: Side, x: number, y: number): [number, number] { return [mx(x), my(side, y)]; }
/** Meters to court pixels: x along the net, y as depth from the net on one side. */
const mx = (m: number) => CX0 + (m / 9) * 300;
const my = (side: Side, m: number) => (side === "them" ? NET_Y - 6 - (m / 9) * 3 * TH : NET_Y + 6 + (m / 9) * 3 * TH);

const CRACKS = ["M8 6 L18 17 L15 25 L25 35", "M40 5 L32 15 L35 22 L28 31", "M6 35 L17 29 L24 31 L35 24 L44 26"];
function squareSvg(side: Side, t: Team, i: number, extra: string, cls: string, idAttr: string): string {
  const [x, y] = sqXYpx(side, i);
  const hp = t.tiles[i];
  const dmg = t.maxHp - hp;
  let body = `<rect class="tile ${cls}" x="${x}" y="${y}" width="${SW}" height="${SH}"/>`;
  if (hp <= 0) {
    body += `<path class="hole" d="M${x + 5} ${y + 8} L${x + 16} ${y + 4} L${x + 27} ${y + 9} L${x + 40} ${y + 3} L${x + 46} ${y + 13} L${x + 43} ${y + 26} L${x + 47} ${y + 38} L${x + 33} ${y + 40} L${x + 20} ${y + 37} L${x + 8} ${y + 40} L${x + 4} ${y + 27} L${x + 7} ${y + 17} Z"/>`;
  } else if (dmg > 0) {
    const n = Math.min(CRACKS.length, Math.ceil((dmg / t.maxHp) * CRACKS.length));
    body += `<g class="cracks" transform="translate(${x},${y})">${CRACKS.slice(0, n).map((d) => `<path d="${d}"/>`).join("")}</g>`;
  }
  // The square's center: a ball here is dug if the center sits inside a circle.
  if (hp > 0) body += `<circle class="ctr" cx="${x + SW / 2}" cy="${y + SH / 2}" r="1.8"/>`;
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
  /** Tap targets on their floor (squares). */
  pick?: "their";
  theirSelected?: number;
  /** What the selected square will do, shown as a mark on it. */
  theirSelectedTone?: Tone;
  theirDefense?: Defender[];
  ourDefense?: Defender[];
  /** Each defender's dig circle (meters), in the same order as the defense. */
  theirCircles?: number[];
  ourCircles?: number[];
  /** Their defenders leaning toward your recent swings: where each one started. */
  theirLean?: { from: Sq; to: Sq }[];
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
  /** Squares that just changed, flashed with a pop. */
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
/** Each defender's dig circle: inside it the ball is always dug, clean in the inner ring, a scramble in the outer. */
function circlesSvg(defs: Defender[] | undefined, radii: number[] | undefined, side: Side): string {
  if (!defs || !radii) return "";
  return defs.map((d, k) => {
    const [x, y] = sqCenter(side, d.sq), R = radii[k] ?? 0;
    const rx = R * 300 / 9, ry = R * 3 * TH / 9;
    return `<ellipse class="dig dig-${side}" cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}"/>`;
  }).join("");
}
function leanSvg(lean: CourtOpts["theirLean"]): string {
  if (!lean) return "";
  return lean.filter((l) => l.from.r !== l.to.r || l.from.c !== l.to.c).map((l) => {
    const [x0, y0] = sqCenter("them", l.from), [x1, y1] = sqCenter("them", l.to);
    return `<g class="lean"><circle class="lean-from" cx="${f(x0)}" cy="${f(y0)}" r="9"/><path class="lean-arrow" d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" marker-end="url(#lean-head)"/></g>`;
  }).join("");
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
  return list.map((p) => { const [x, y] = zoneCenter("us", 2, p.col); return `<g class="tok tok-us" transform="translate(${f(x)},${f(y)})"><circle r="17"/><text y="5">${p.label}</text></g>`; }).join("");
}
/** The nine big tiles on a floor: each holds four boxes that share its hits. */
function bigTiles(side: Side): string {
  let out = "";
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out += `<rect class="big-tile" x="${tileX(c)}" y="${side === "them" ? theirY(r) : ourY(r)}" width="${TW}" height="${TH}"/>`;
  return out;
}
/** The 10-foot (3 m) attack line on one floor. */
function attackLine(side: Side): string {
  const y = side === "them" ? NET_Y - 6 - 2 * SH : NET_Y + 6 + 2 * SH;
  return `<line class="attack-line" x1="${CX0}" y1="${y}" x2="${CX0 + 300}" y2="${y}"/>`;
}

export function courtSvg(o: CourtOpts): string {
  const vb = o.focus === "their" ? "0 10 360 318" : o.focus === "our" ? "0 244 360 320" : "0 10 360 552";
  const floor = (side: Side) => {
    const t = side === "them" ? o.them : o.us;
    const pick = side === "them" && o.pick === "their";
    return Array.from({ length: N * N }, (_, i) => {
      const sel = side === "them" && o.theirSelected === i;
      const flash = (side === "them" ? o.flashTheir : o.flashOur) === i;
      const [x, y] = sqXYpx(side, i);
      let extra = "";
      if (flash) extra += `<rect class="flash" x="${x}" y="${y}" width="${SW}" height="${SH}"/>`;
      const id = pick ? ` data-tile="${i}" role="button" tabindex="0" aria-label="Row ${rowOf(i) + 1}, column ${colOf(i) + 1}"` : "";
      return squareSvg(side, t, i, extra, pick ? "pickable" : "", id);
    }).join("") + bigTiles(side);
  };
  const targets = o.defend
    ? o.defend.squares.map((s) => { const [x, y] = sqCenter("us", s); return `<rect class="sq-target" data-sq="${s.r},${s.c}" role="button" tabindex="0" aria-label="Move here" x="${f(x - SW / 2 + 3)}" y="${f(y - SH / 2 + 3)}" width="${SW - 6}" height="${SH - 6}" rx="5"/>`; }).join("")
      + o.defend.blockXs.map((bx) => `<rect class="sq-target" data-bx="${bx}" role="button" tabindex="0" aria-label="Slide here" x="${f(mx(bx) - 21)}" y="${NET_Y + 3}" width="42" height="14" rx="5"/>`).join("")
    : "";
  let selMark = "";
  if (o.theirSelected !== undefined) {
    const [x, y] = sqXYpx("them", o.theirSelected);
    selMark = `<rect class="sel${o.theirSelectedTone ? ` sel-${o.theirSelectedTone}` : ""}" x="${x + 2}" y="${y + 2}" width="${SW - 4}" height="${SH - 4}" rx="5"/>`;
  }
  const ball = o.ball
    ? `<g class="ball-g ball-${o.ball.kind}"><path class="ball-trail" d="${o.ball.path}"/><circle class="ball" r="8"><animateMotion dur="0.75s" fill="freeze" path="${o.ball.path}"/></circle>${o.ball.land ? `<circle class="burst" cx="${f(o.ball.land[0])}" cy="${f(o.ball.land[1])}" r="6"/>` : ""}</g>`
    : "";
  return `<svg class="court" viewBox="${vb}" role="img" aria-label="Court from above: their floor on top, the net, your floor below">
    <defs><clipPath id="clip-them"><rect x="${CX0}" y="${theirY(2)}" width="300" height="${3 * TH}"/></clipPath><clipPath id="clip-us"><rect x="${CX0}" y="${ourY(0)}" width="300" height="${3 * TH}"/></clipPath><marker id="lean-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="lean-head" d="M0 0 L10 5 L0 10 z"/></marker></defs>
    <text class="side-tag" x="${CX0}" y="${theirY(2) - 4}">THEIR FLOOR</text>
    ${floor("them")}${attackLine("them")}
    <g clip-path="url(#clip-them)">${fanSvg(o.theirBlock, "them")}${circlesSvg(o.theirDefense, o.theirCircles, "them")}</g>
    <line class="net-line" x1="${CX0 - 10}" y1="${NET_Y}" x2="${CX0 + 310}" y2="${NET_Y}"/>
    ${floor("us")}${attackLine("us")}
    <g clip-path="url(#clip-us)">${fanSvg(o.ourBlock, "us")}${circlesSvg(o.ourDefense, o.ourCircles, "us")}</g>
    <text class="side-tag" x="${CX0}" y="${ourY(3) + 14}">YOUR FLOOR</text>
    ${selMark}${leanSvg(o.theirLean)}${targets}
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
/** A ball off the block: back onto the hitter's side (a stuff or a firm touch), or popping over into the blockers' court (a soft touch). */
export function ballBlocked(side: Side, h: number, over = false): { path: string; land: [number, number] } {
  const x0 = mx(HITTER_X[h]);
  const back = (side === "us") !== over ? NET_Y + 90 : NET_Y - 90;
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
