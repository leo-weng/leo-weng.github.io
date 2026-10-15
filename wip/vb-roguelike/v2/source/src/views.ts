// SVG views: the top-down court (both floors) and the net view (front-on, with the block forming).
// Pure string builders; no rules live here.
import { Blocker, BlockSystem, colOf, Odds, rowOf, Side, Spot, Team, Tempo } from "./engine";

const f = (n: number) => n.toFixed(1);

// ---------- Tones: odds as a color and a word ----------
export type Tone = "great" | "good" | "even" | "risky" | "bad";
export const TONE_WORD: Record<Tone, string> = { great: "Wide open", good: "Good look", even: "Coin flip", risky: "Risky", bad: "Long shot" };
export function toneOf(kill: number): Tone {
  return kill >= 0.6 ? "great" : kill >= 0.45 ? "good" : kill >= 0.3 ? "even" : kill >= 0.15 ? "risky" : "bad";
}
/** Plain words for why a tile is what it is. */
export function reasons(o: Odds): string[] {
  const out: string[] = [];
  if (o.hole) return ["It's a hole: nobody can dig it"];
  if (!o.inRange) out.push("hard to reach off this set");
  if (o.laneBlockers) out.push(o.laneBlockers > 1 ? `${o.laneBlockers} blockers in this lane` : "a blocker is in this lane");
  if (o.digP >= 0.45) out.push("a digger is right there");
  else if (o.digP >= 0.2) out.push("a digger is close");
  else out.push("nobody's near it");
  return out;
}

// ---------- Net positions ----------
/** Where a hitter in each screen column attacks along the net (meters from the left antenna, 0-9). */
export const HITTER_X = [1.2, 4.5, 7.8];
const BLOCK_HOME: Record<BlockSystem, number[]> = { Bunch: [3.4, 4.5, 5.6], Spread: [1.4, 4.5, 7.6] };
/** Where a blocker stands to take a lane against a hitter in column h. */
export function laneX(h: number, lane: number): number {
  const hx = HITTER_X[h];
  if (h === 1) return lane === 1 ? 4.5 : lane === 0 ? 3.75 : 5.25;
  const toward = h === 0 ? 1 : -1;
  if (lane === h) return hx - toward * 0.1;
  if (lane === 1) return hx + toward * 0.7;
  return hx + toward * 1.4;
}
export interface PlacedBlocker { home: number; x: number; jump: number; state: "formed" | "late" | "home"; lane: number }
/** Match the block's lanes to the three front-row blockers by who is closest. */
export function placeBlockers(system: BlockSystem, h: number, blockers: Blocker[]): PlacedBlocker[] {
  const homes = BLOCK_HOME[system];
  const free = [0, 1, 2];
  const placed: PlacedBlocker[] = homes.map((x) => ({ home: x, x, jump: 0, state: "home", lane: -1 }));
  for (const b of [...blockers].sort((a, b) => laneX(h, a.lane) - laneX(h, b.lane))) {
    const target = laneX(h, b.lane);
    const k = free.reduce((best, i) => (Math.abs(homes[i] - target) < Math.abs(homes[best] - target) ? i : best), free[0]);
    free.splice(free.indexOf(k), 1);
    const x = b.formed ? target : homes[k] + (target - homes[k]) * 0.6;
    placed[k] = { home: homes[k], x, jump: b.formed ? 0.75 : 0.3, state: b.formed ? "formed" : "late", lane: b.lane };
  }
  return placed;
}

// ---------- Court view (top-down, portrait) ----------
const CX0 = 30, TW = 100, TH = 86, NET_Y = 286;
const tileX = (c: number) => CX0 + c * TW;
const theirY = (r: number) => NET_Y - 6 - (r + 1) * TH;
const ourY = (r: number) => NET_Y + 6 + r * TH;
export function tileCenter(side: Side, i: number): [number, number] {
  const r = rowOf(i), c = colOf(i);
  return [tileX(c) + TW / 2, (side === "them" ? theirY(r) : ourY(r)) + TH / 2];
}
const courtX = (m: number) => CX0 + (m / 9) * 300;

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

export interface CourtOpts {
  us: Team;
  them: Team;
  /** Which part to show: their floor and the net, ours and the net, or both. */
  focus: "both" | "their" | "our";
  /** Tap targets. */
  pick?: "their" | "our" | "passers";
  theirTones?: (Tone | null)[];
  theirSelected?: number;
  ourSelected?: number;
  ourMarked?: number;
  /** Tiles hatched as behind the block. */
  theirShadow?: number[];
  ourShadow?: number[];
  theirDefense?: Spot[];
  ourDefense?: Spot[];
  theirBlock?: { system: BlockSystem; h: number; blockers: Blocker[] };
  ourBlock?: { system: BlockSystem; h: number; blockers: Blocker[] };
  ourHitterCol?: number;
  theirHitterCol?: number;
  ourHitterLabel?: string;
  theirHitterLabel?: string;
  theirPassers?: { col: number; label: string; skill: string }[];
  ourPassers?: { col: number; label: string; skill: string }[];
  passerSelected?: number;
  ball?: { path: string; land?: [number, number]; kind: string };
  /** Tiles that just changed, flashed with a pop. */
  flashTheir?: number;
  flashOur?: number;
}

function tokens(spots: Spot[] | undefined, side: Side): string {
  if (!spots) return "";
  const seen = new Map<number, number>();
  return spots.map((s) => {
    const n = seen.get(s.tile) ?? 0;
    seen.set(s.tile, n + 1);
    const [x, y] = tileCenter(side, s.tile);
    return `<g class="tok tok-${side} tok-${s.who}" transform="translate(${f(x + n * 22 - 6)},${f(y + 8)})"><circle r="13"/><text y="4.5">${s.who}</text></g>`;
  }).join("");
}
function courtBlockers(b: CourtOpts["theirBlock"], side: Side): string {
  if (!b) return "";
  const placed = placeBlockers(b.system, b.h, b.blockers);
  const y = side === "them" ? NET_Y - 15 : NET_Y + 5;
  return placed.map((p) => `<rect class="cblk cblk-${p.state} cblk-${side}" x="${f(courtX(p.x) - 15)}" y="${y}" width="30" height="10" rx="4"/>`).join("");
}
function hitterTok(col: number | undefined, side: Side, label = "H"): string {
  if (col === undefined) return "";
  const x = courtX(HITTER_X[col]);
  const y = side === "us" ? NET_Y + 26 : NET_Y - 26;
  return `<g class="tok tok-hitter tok-${side}" transform="translate(${f(x)},${y})"><circle r="15"/><text y="5">${label}</text></g>`;
}
function passerToks(list: CourtOpts["theirPassers"], side: Side, pick: boolean, sel?: number): string {
  if (!list) return "";
  return list.map((p, i) => {
    const [x, y] = tileCenter(side, side === "them" ? 6 + p.col : 6 + p.col);
    return `<g class="tok tok-passer tok-${side} skill-${p.skill}${sel === i ? " is-sel" : ""}"${pick ? ` data-passer="${i}" role="button" tabindex="0" aria-label="Serve at ${p.label}"` : ""} transform="translate(${f(x)},${f(y)})"><circle r="19"/><text y="5">${p.label}</text><text class="tok-sub" y="34">${p.skill === "weak" ? "shaky passer" : p.skill === "strong" ? "solid passer" : ""}</text></g>`;
  }).join("");
}

export function courtSvg(o: CourtOpts): string {
  const vb = o.focus === "their" ? "0 10 360 318" : o.focus === "our" ? "0 244 360 320" : "0 10 360 552";
  const floor = (side: Side) => {
    const t = side === "them" ? o.them : o.us;
    const pick = (side === "them" && o.pick === "their") || (side === "us" && o.pick === "our");
    return Array.from({ length: 9 }, (_, i) => {
      const tone = side === "them" ? o.theirTones?.[i] : null;
      const sel = side === "them" ? o.theirSelected === i : o.ourSelected === i;
      const mark = side === "us" && o.ourMarked === i;
      const shadow = (side === "them" ? o.theirShadow : o.ourShadow)?.includes(i);
      const flash = (side === "them" ? o.flashTheir : o.flashOur) === i;
      const [x, y] = [tileX(colOf(i)), side === "them" ? theirY(rowOf(i)) : ourY(rowOf(i))];
      let extra = "";
      if (tone) extra += `<rect class="tint t-${tone}" x="${x + 3}" y="${y + 3}" width="${TW - 6}" height="${TH - 6}" rx="4"/>`;
      if (shadow) extra += `<rect class="shadow" x="${x}" y="${y}" width="${TW}" height="${TH}" fill="url(#hatch)"/>`;
      if (mark) extra += `<rect class="mark" x="${x + 4}" y="${y + 4}" width="${TW - 8}" height="${TH - 8}" rx="6"/>`;
      if (sel) extra += `<rect class="sel" x="${x + 3}" y="${y + 3}" width="${TW - 6}" height="${TH - 6}" rx="6"/>`;
      if (flash) extra += `<rect class="flash" x="${x}" y="${y}" width="${TW}" height="${TH}"/>`;
      const id = pick ? ` data-tile="${i}" role="button" tabindex="0" aria-label="Row ${rowOf(i) + 1}, column ${colOf(i) + 1}"` : "";
      return tileSvg(side, t, i, extra, pick ? "pickable" : "", id);
    }).join("");
  };
  const ball = o.ball
    ? `<g class="ball-g ball-${o.ball.kind}"><path class="ball-trail" d="${o.ball.path}"/><circle class="ball" r="8"><animateMotion dur="0.75s" fill="freeze" path="${o.ball.path}"/></circle>${o.ball.land ? `<circle class="burst" cx="${f(o.ball.land[0])}" cy="${f(o.ball.land[1])}" r="6"/>` : ""}</g>`
    : "";
  return `<svg class="court" viewBox="${vb}" role="img" aria-label="Court from above: their floor on top, the net, your floor below">
    <defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" class="hatch-line"/></pattern></defs>
    <text class="side-tag" x="${CX0}" y="${theirY(2) - 4}">THEIR FLOOR</text>
    ${floor("them")}
    <line class="net-line" x1="${CX0 - 10}" y1="${NET_Y}" x2="${CX0 + 310}" y2="${NET_Y}"/>
    ${floor("us")}
    <text class="side-tag" x="${CX0}" y="${ourY(3) + 14}">YOUR FLOOR</text>
    ${tokens(o.theirDefense, "them")}${tokens(o.ourDefense, "us")}
    ${passerToks(o.theirPassers, "them", o.pick === "passers", o.passerSelected)}${passerToks(o.ourPassers, "us", false)}
    ${courtBlockers(o.theirBlock, "them")}${courtBlockers(o.ourBlock, "us")}
    ${hitterTok(o.ourHitterCol, "us", o.ourHitterLabel)}${hitterTok(o.theirHitterCol, "them", o.theirHitterLabel)}
    ${ball}
  </svg>`;
}
/** Ball paths on the court. */
export function ballFromNet(side: Side, h: number, to: [number, number]): string {
  const x0 = courtX(HITTER_X[h]), y0 = side === "us" ? NET_Y + 22 : NET_Y - 22;
  return `M${f(x0)} ${f(y0)} L${f(to[0])} ${f(to[1])}`;
}
export function ballBlocked(side: Side, h: number): { path: string; land: [number, number] } {
  const x0 = courtX(HITTER_X[h]);
  const back = side === "us" ? NET_Y + 90 : NET_Y - 90;
  return { path: `M${f(x0)} ${f(side === "us" ? NET_Y + 22 : NET_Y - 22)} L${f(x0)} ${NET_Y} L${f(x0 + 20)} ${back}`, land: [x0 + 20, back] };
}
export function ballOut(side: Side, h: number): string {
  const x0 = courtX(HITTER_X[h]);
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
  system: BlockSystem;
  /** Before the set: blockers at home. After: the block for this hitter and set. */
  block?: { h: number; blockers: Blocker[]; tempo: Tempo };
  animate: boolean;
  hitters: NetToken[];
}
export function netSvg(o: NetOpts): string {
  const dur = o.block ? SET_SECONDS[o.block.tempo] : 1;
  const placed = o.block ? placeBlockers(o.system, o.block.h, o.block.blockers) : BLOCK_HOME[o.system].map((x) => ({ home: x, x, jump: 0, state: "home" as const, lane: -1 }));
  const blockers = placed.map((b) => {
    const dx = NX(b.home) - NX(b.x);
    const move = o.animate && Math.abs(dx) > 0.5
      ? `<animateTransform attributeName="transform" type="translate" values="${f(dx)} 0;${f(dx)} 0;0 0" keyTimes="0;0.25;${b.state === "late" ? 1 : 0.8}" dur="${dur}s" fill="freeze"/>`
      : "";
    const jumpPx = b.jump * 40;
    const hop = o.animate && jumpPx ? `<animateTransform attributeName="transform" type="translate" values="0 ${f(jumpPx)};0 ${f(jumpPx)};0 0" keyTimes="0;0.8;1" dur="${dur}s" fill="freeze"/>` : "";
    return `<g class="blk blk-${o.block ? b.state : "ready"}" transform="translate(${f(NX(b.x))},0)"><g>${move}<g>${hop}${figure(b.jump, b.state !== "home")}</g></g></g>`;
  }).join("");
  let ball = "";
  if (o.block) {
    const d = setArc(6.0, HITTER_X[o.block.h], o.block.tempo);
    ball = `<path class="set-trail" d="${d}"/>` + (o.animate
      ? `<circle class="nball" r="9"><animateMotion dur="${dur}s" fill="freeze" path="${d}"/></circle>`
      : `<circle class="nball" r="9" cx="${f(NX(HITTER_X[o.block.h]))}" cy="${f(NH(3.1))}"/>`);
  }
  const toks = o.hitters.map((t) => `<g class="ntok${t.selected ? " is-sel" : ""}${t.disabled ? " is-off" : ""}" transform="translate(${f(NX(HITTER_X[t.col]))},318)"><circle r="30"/><text class="ntok-label" y="9">${t.label}</text></g>`).join("");
  const setter = `<g class="ntok ntok-setter" transform="translate(${f(NX(6))},318)"><circle r="22"/><text class="ntok-label" y="8">S</text></g>`;
  const meshTop = NH(NET_TOP), meshBot = NH(NET_TOP - 1);
  return `<svg class="netview" viewBox="0 0 960 365" role="img" aria-label="Net view: their blockers behind the net, your hitters in front">
    <defs><pattern id="mesh" width="12" height="12" patternUnits="userSpaceOnUse"><path class="mesh-line" d="M0 0 L12 0 M0 0 L0 12"/></pattern></defs>
    <text class="side-tag" x="${NX(0) + 6}" y="26">THEIR BLOCK</text>
    <line class="floor" x1="0" y1="${NH(0)}" x2="960" y2="${NH(0)}"/>
    <g class="blockers">${blockers}</g>
    <rect class="net-mesh" x="${NX(0)}" y="${meshTop}" width="900" height="${meshBot - meshTop}" fill="url(#mesh)"/>
    <rect class="net-tape" x="${NX(0)}" y="${meshTop - 3}" width="900" height="7"/>
    <line class="antenna" x1="${NX(0)}" y1="${NH(NET_TOP + 0.85)}" x2="${NX(0)}" y2="${meshBot}"/><line class="antenna" x1="${NX(9)}" y1="${NH(NET_TOP + 0.85)}" x2="${NX(9)}" y2="${meshBot}"/>
    ${ball}${setter}${toks}
  </svg>`;
}
