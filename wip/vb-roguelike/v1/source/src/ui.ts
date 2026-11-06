// Text UI for the v0.1 offense sandbox. All rules live in engine.ts; this file only renders and routes clicks.
import {
  BlockSystem, callById, CONTACT, DIG, SWING, Transition, OPPONENT, OpponentLevel, setOpponentLevel, Clarity, GamePlan, Hitter, Player, Role, SET_CALLS, SetCall, defaultShot, SHOTS, ShotId, shotsFor, STARTING_PLAN, STARTING_TEAM, Stats,
  Grade, GRADES, GRADE_NAME, Spot, zonePlayer, LINEUP, ROSTER, frontRow, setTheirRotation, OUT,
} from "./data";
import {
  activeCalls, arrived, AttackContext, BlockResult, blockHands, callAvailable, lockReason, clampAim, contactHeight, swingAngle, depthWord, hitWindow, isGeometric, nearestShot, previewOdds as previewAim, swingCone, Callout, calloutFor, callSpot, coneMultiplier, counterattack,
  CounterResult, DefenseRead, defenseFor, emptyTendency, formBlock, gameWinner, keyedOn, remember, Tendency, hitterClarity, makePass, makeRng, OddsRange, othersFor, Outcome, Pass, PassMode, previewCall, previewOdds, resolveShot, withCall, shiftGrades, rollGrade, passFromGrade,
  Resolution, setQuality, SetResult, setterClarity, shotTarget,
} from "./engine";
import { heatMap, heatAt, HEAT_STEP, HeatCell } from "./engine";
import { CONTACT_Y, courtPoint, courtSvg, FLIGHT_SECONDS, netSvg, placeBlock, rateCall, rateChip, rateShot, setArcPath, ShotMark, slowMo, Token } from "./views";
import type { Tone } from "./views";
import { BOOST, HOLES, allTiles, DiggerTag, SERVE_TYPES, ServeType, importTables, resetTables, rollTile, setTableValue, T as TABLES, TABLE_NOTES, Tables, tileOdds as modelOdds, TILE_NAME } from "./model";
import { Foe, gameTo, offerRewards, planRoute, Reward, RunState, START_CALLS } from "./run";
import { emptyStats, playGame, Policy, POLICIES, summarize } from "./sim";

type Phase = "set" | "hit" | "result" | "reward" | "runEnd" | "serve" | "note";
type Side = "us" | "them";
interface RallyRecord { n: number; steps: string[]; winner: Side; score: string }
interface Tally { [key: string]: Record<Outcome, number> }

const HITTERS: Hitter[] = ["OH", "MB", "OPP"];
const HITTER_NAME: Record<Hitter, string> = { OH: "Outside", MB: "Middle", OPP: "Opposite" };
const OUTCOMES: Outcome[] = ["Kill", "Blocked", "Dug", "Error"];

const S = {
  seed: (Date.now() >>> 0) as number,
  rng: makeRng(Date.now() >>> 0),
  team: JSON.parse(JSON.stringify(STARTING_TEAM)) as Record<Role, Player>,
  plan: { ...STARTING_PLAN } as GamePlan,
  passMode: "Serve" as PassMode | "Serve",
  system: "Bunch" as BlockSystem,
  unlockAll: false,
  phase: "set" as Phase,
  pass: null as unknown as Pass,
  call: null as SetCall | null,
  set: null as SetResult | null,
  block: null as BlockResult | null,
  hitterX: 0,
  result: null as (Resolution & { shot: ShotId; name: string; contact?: { miss: number; pos: number } }) | null,
  n: 0,
  tally: {} as Tally,
  // Score (spec §10). A point is only scored when the rally ends.
  score: { us: 0, them: 0 } as Record<Side, number>,
  games: { us: 0, them: 0 } as Record<Side, number>,
  rallyNo: 0,
  steps: [] as string[],
  counter: null as CounterResult | null,
  pointTo: null as Side | null,
  gameOver: null as Side | null,
  history: [] as RallyRecord[],
  // Game simulator (sidebar)
  simPolicy: "Default" as Policy,
  simGames: 50,
  simRunning: false,
  simHtml: "",
  // 2D views
  aim: "Seam" as ShotId,
  /** What kind of attack: a hard swing, a tip, a roll shot or a tool. Where it goes is the aim point. */
  kind: "Hard" as Kind,
  numbers: false,
  sound: true,
  animToken: 0,
  animShown: -1,
  flightShown: -1,
  /** Where a hard swing is aimed, in court meters (null: the aimed shot's usual target). */
  aimPoint: null as { x: number; y: number } | null,
  math: true,
  tiles: true,
  floor: { us: [] as number[], them: [] as number[] },
  chain: 0,
  digBoost: 0,
  cracks: [] as string[],
  ups: null as null | Upgrade[],
  upTaken: -1,
  serveType: "Float" as ServeType,
  serveAt: 0,
  lead: "",
  note: null as null | { title: string; text: string; odds?: Record<Grade, number>; grade?: Grade; extra?: string },
  numbersOpen: false,
  rot: { us: 0, them: 0 } as Record<Side, number>,
  serve: "us" as Side,
  roster: null as Record<Spot, Player> | null,
  dragging: false,
  /** A run: the route of teams, where you are on it, what you've earned. Null in free play. */
  run: null as null | { route: Foe[]; node: number; state: RunState; offer: Reward[] | null; bigLeft: number; outcome: "won" | "lost" | null; picked: string[] },
  /** Big swing armed: this swing is timed (and hits harder). */
  big: false,
  /** The contact meter: running from `start` (ms) with one sweep every `period` seconds. */
  meter: null as { start: number; period: number; shot: ShotId } | null,
  /** How you timed the last contact: 0 perfect, 1 at the edge; pos < 0.5 is early. */
  contact: null as { miss: number; pos: number } | null,
  /** Rating of the free aim in Easy mode, cached per spot. */
  aimRate: null as { key: string; tone: Tone } | null,
  /** Your own names for the set calls ("yaya" for a 32). */
  names: loadNames(),
  namesOpen: false,
  /** The set call picked on the setter screen, waiting for a confirm (tap again or press Set). */
  pick: null as string | null,
  // Their memory of you, and how they line up this ball
  tendency: emptyTendency() as Tendency,
  defense: null as DefenseRead | null,
  keyedBlock: 0,
  level: "Rookie" as OpponentLevel,
  /** Easy shows a rating on every choice; Normal makes you read the court. */
  mode: "Normal" as "Normal" | "Easy",
  /** Hard mode: no ratings on the court, you read the block and defense yourself. */
  hard: false,
  odds: null as { token: number; map: Map<ShotId, OddsRange> } | null,
  /** Success-rate heat map for this swing (built once per ball). */
  heat: null as { token: number; kind: Kind; cells: HeatCell[] } | null,
};

function loadNames(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem("vb-call-names") ?? "{}") ?? {}; } catch { return {}; }
}
function saveNames() {
  try { localStorage.setItem("vb-call-names", JSON.stringify(S.names)); } catch { /* storage blocked */ }
}
/** Easy mode keeps one plain call per hitter. */
const EASY_CALLS: Record<string, string> = { "4": "High ball outside", "1": "Fast ball middle", "5": "High ball right side" };
/** What a call is called on screen: your own name for it, else its usual name. */
const callName = (c: SetCall) => S.names[c.id]?.trim() || c.id;

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pct = (p: number) => `${Math.round(p * 100)}%`;

function clarityChip(c: Clarity, who: string): string {
  const text = { Clear: "Clear read", Fuzzy: "Fuzzy read", Blind: "No read" }[c];
  return `<span class="chip chip-${c.toLowerCase()}" title="${esc(who)}'s Vision decides how clearly you see the block">${text}</span>`;
}

// ---------- Rally setup ----------
function startRun() {
  const team = JSON.parse(JSON.stringify(STARTING_TEAM)) as Record<Role, Player>;
  S.run = { route: planRoute(S.rng), node: 0, state: { team, calls: new Set(START_CALLS), shots: new Set(), perks: new Set() }, offer: null, bigLeft: 1, outcome: null, picked: [] };
  S.team = team; S.roster = null;
  S.games = { us: 0, them: 0 };
  startMatch();
}
const foe = () => S.run!.route[S.run!.node];
/** Line up against the next team on the route: fresh score, fresh memory, their personality. */
function startMatch() {
  const f = foe();
  setOpponentLevel(f.level, f.mods);
  S.system = f.system;
  S.score = { us: 0, them: 0 }; S.rot = { us: 0, them: 0 }; S.serve = "us"; resetFloors();
  S.gameOver = null;
  S.rallyNo = 0;
  S.history = [];
  S.tendency = emptyTendency();
  S.run!.bigLeft = 1 + (S.run!.state.perks.has("big") ? 1 : 0);
  S.odds = null;
  S.rallyNo++;
  S.steps = [];
  beginRally();
}
function leaveRun() {
  S.run = null;
  S.team = JSON.parse(JSON.stringify(STARTING_TEAM)); S.roster = null;
  setOpponentLevel(S.level);
  S.gameOver = null;
  S.score = { us: 0, them: 0 }; S.rot = { us: 0, them: 0 }; S.serve = "us"; resetFloors();
  newRally();
}
/** After the last point of a game on a run: a reward, the next team, or the end. */
function afterGame() {
  const r = S.run!;
  if (S.gameOver === "them") { r.outcome = "lost"; S.phase = "runEnd"; return render(); }
  if (r.node === r.route.length - 1) { r.outcome = "won"; S.phase = "runEnd"; return render(); }
  r.offer = offerRewards(S.rng, r.state);
  S.phase = "reward";
  render();
}
function takeReward(i: number) {
  const r = S.run!;
  const w = r.offer![i];
  w.apply(r.state);
  r.picked.push(w.title);
  r.offer = null;
  r.node++;
  startMatch();
}
const gameLength = () => (S.run ? gameTo(foe()) : 11);
const callOpen = (c: SetCall) => !S.run || S.run.state.calls.has(c.id);
const shotOpen = (s: { id: ShotId; unlocked: boolean }) => s.unlocked || S.unlockAll || !!S.run?.state.shots.has(s.id);

function newRally() {
  if (S.gameOver) {
    S.score = { us: 0, them: 0 }; S.rot = { us: 0, them: 0 }; S.serve = "us"; resetFloors();
    S.gameOver = null;
    S.rallyNo = 0;
    S.history = [];
    S.tendency = emptyTendency();
  }
  S.rallyNo++;
  S.steps = [];
  beginRally();
}

// ---------- Tiles mode: crack their floor before they crack yours ----------
const TILE_HP = 3, BREAK_TO_WIN = 5, TILES_POINTS = 15;
function resetFloors() {
  S.floor = { us: Array(9).fill(TILE_HP), them: Array(9).fill(TILE_HP) };
  HOLES.clear();
  BOOST.base = { Hard: 0, Tip: 0, Roll: 0, Tool: 0 }; BOOST.block = 0;
  S.digBoost = 0; S.chain = 0; S.ups = null; S.upTaken = -1;
}
const broken = (side: Side) => S.floor[side].filter((h) => h <= 0).length;
const chainMult = () => (S.chain >= 3 ? 2 : 1);
function bumpChain(why: string) { if (!S.tiles) return; S.chain++; S.cracks.push(`Chain ${S.chain}: ${why}${S.chain === 3 ? " — double damage!" : ""}`); }
function damage(side: Side, idx: number, amt: number, why: string) {
  if (!S.tiles || !S.floor[side].length) return;
  const f = S.floor[side];
  if (f[idx] <= 0) return;
  const hit = side === "them" ? amt * chainMult() : amt;
  f[idx] = Math.max(0, f[idx] - hit);
  const where = `${side === "them" ? "their" : "your"} ${TILE_NAME[Math.floor(idx / 3)][idx % 3]}`;
  if (f[idx] <= 0 && side === "them") HOLES.add(idx);
  S.cracks.push(`${why}: ${f[idx] <= 0 ? `💥 broke ${where}` : `cracked ${where} (${f[idx]} left)`}${hit > amt ? " ×2" : ""}`);
}
/** Where their attack lands on your floor: they go after cracked tiles. */
function theirTarget(): number {
  const w = S.floor.us.map((h) => (h <= 0 ? 0 : 1 + (TILE_HP - h) * 2));
  let r = S.rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 9; i++) { if (r < w[i]) return i; r -= w[i]; }
  return 4;
}
/** Damage from their attack: a kill hits your floor for 2, a shanked dig for 1, a clean dig protects it. */
function theirAttackDamage(c: CounterResult) {
  if (c.outcome === "TheirKill") damage("us", theirTarget(), 2, "Their kill");
  else if (c.outcome === "YouDig" && (c.grade === "-" || c.grade === "/")) damage("us", theirTarget(), 1, "You shank the dig");
}
/** Your holes make their attack harder to dig; your libero drills make it easier. */
const ourDigShift = () => (S.tiles ? S.digBoost - 0.08 * broken("us") : 0);

interface Upgrade { name: string; text: string; apply: () => void }
const UPGRADES: Upgrade[] = [
  { name: "Spike training", text: "Hard swings +5% base kill.", apply: () => { BOOST.base.Hard += 0.05; } },
  { name: "Soft hands", text: "Tips and rolls +5% base kill.", apply: () => { BOOST.base.Tip += 0.05; BOOST.base.Roll += 0.05; } },
  { name: "Libero drills", text: "Every dig a little cleaner.", apply: () => { S.digBoost += 0.08; } },
  { name: "Patch the floor", text: "Your most cracked tile gets 1 back.", apply: () => { const f = S.floor.us; let i = 0; for (let k = 0; k < 9; k++) if (f[k] < f[i]) i = k; f[i] = Math.min(TILE_HP, f[i] + 1); } },
  { name: "Connection", text: "Setter control +1: more perfect sets.", apply: () => { S.team.S.stats.control++; } },
  { name: "Read the block", text: "Get stuffed 4% less.", apply: () => { BOOST.block += 0.04; } },
];
function offerUpgrades() {
  const pool = [...UPGRADES];
  S.ups = [0, 1, 2].map(() => pool.splice(Math.floor(S.rng() * pool.length), 1)[0]);
  S.upTaken = -1;
}
function upgradePicker(): string {
  if (!S.tiles || !S.ups || S.gameOver) return "";
  return `<div class="ups"><p class="sub">Pick an upgrade</p><div class="ups-row">${S.ups.map((u, i) => `<button class="call${i === S.upTaken ? " call-on" : ""}" data-up="${i}" ${S.upTaken >= 0 ? "disabled" : ""}><span class="call-name">${u.name}</span><span class="call-meta">${u.text}</span></button>`).join("")}</div></div>`;
}
function crackLines(): string {
  return S.tiles && S.cracks.length ? `<ul class="cracks">${S.cracks.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : "";
}
function floorWidget(): string {
  if (!S.tiles) return "";
  const grid = (side: Side) => `<div class="floor"><span class="floor-name">${side === "them" ? "Their floor" : "Your floor"} · ${broken(side)}/${BREAK_TO_WIN} broken</span><div class="floor-grid">${
    // Their floor drawn deep at the top (as on the court); yours drawn net at the top.
    (side === "them" ? [2, 1, 0] : [0, 1, 2]).flatMap((r) => [0, 1, 2].map((c) => { const h = S.floor[side][r * 3 + c]; return `<span class="ft${h <= 0 ? " ft-broken" : h < TILE_HP ? " ft-cracked" : ""}" title="${TILE_NAME[r][c]}">${h <= 0 ? "✕" : "●".repeat(h)}</span>`; })).join("")}</div></div>`;
  return `<div class="floors">${grid("them")}${S.chain ? `<span class="chain">Chain ${S.chain}${chainMult() > 1 ? " · ×2" : ""}</span>` : ""}${grid("us")}</div>`;
}

// ---------- Serve and receive ----------
/** Each rally starts with a serve: yours (you pick it) or theirs (rolled, and you pass it). Sandbox pass modes skip it. */
function beginRally() {
  if (!S.floor.us.length) resetFloors();
  S.note = null;
  S.chain = 0;
  S.cracks = [];
  S.ups = null;
  S.pointTo = null;
  S.counter = null;
  if (S.passMode !== "Serve") return startAttack(makePass(S.rng, S.passMode as PassMode));
  syncRotation();
  if (S.serve === "us") { S.phase = "serve"; S.result = null; render(); return; }
  theirServe();
}
const SERVE_ABOUT: Record<ServeType, string> = { Safe: "Easy to keep in. Gives them a good pass.", Float: "Floats and moves. Middle risk.", Jump: "Hard and fast. Aces and errors both go up." };
/** Who passes: the libero and both outsides. A front-row outside has to pass and then attack, so passes a step worse. */
function passers(side: Side): { name: string; tag: DiggerTag }[] {
  const f = frontRow(S.rot[side]);
  const step = (t: DiggerTag): DiggerTag => (t === "strong" ? "average" : "weak");
  const oh = (p: Spot): DiggerTag => { const base: DiggerTag = p === "OH2" ? "strong" : "average"; return f.OH === p ? step(base) : base; };
  return [
    { name: `${side === "us" ? "your" : "their"} OH1${f.OH === "OH1" ? " (front row)" : ""}`, tag: oh("OH1") },
    { name: `${side === "us" ? "your" : "their"} libero`, tag: "strong" },
    { name: `${side === "us" ? "your" : "their"} OH2${f.OH === "OH2" ? " (front row)" : ""}`, tag: oh("OH2") },
  ];
}
function serveOdds(type: ServeType, tag: DiggerTag) {
  const sv = TABLES.serve[type];
  const pass = shiftGrades({ ...TABLES.servePass[type], "=": 0 }, TABLES.passer[tag]);
  pass["/"] += pass["="]; pass["="] = 0; // a shanked serve-receive pass is an overpass, never an extra ace
  return { ace: sv.ace, error: sv.error, pass };
}
const plain = (h: string) => h.replace(/<[^>]+>/g, "");
function toNote(title: string, text: string, side: Side | null, extra?: Partial<NonNullable<typeof S.note>>) {
  S.steps.push(plain(text));
  if (side) awardPoint(side);
  S.note = { title, text, ...extra };
  S.phase = "note";
  render(true);
}
/** After any serve, their attack comes at you: you dig it and attack, or the point ends. */
function theirAttack(shift: number, force: string | undefined, lead: string) {
  const c = counterattack(S.rng, shift + ourDigShift(), frontRow(S.rot.us).back, force);
  S.counter = c;
  theirAttackDamage(c);
  if (c.outcome === "TheirKill") return toNote("Their attack", `${lead} They put it away (${c.incoming}, dug by the ${c.digger}: ${c.grade} ${GRADE_NAME[c.grade!]}).`, "them", { odds: c.odds, grade: c.grade });
  if (c.outcome === "TheirError") return toNote("Their attack", `${lead} Their swing goes out.`, "us");
  S.steps.push(plain(`${lead} You dig ${c.incoming}: ${c.grade}`));
  startAttack(c.pass!, `${lead} You dig ${c.incoming}: <b>${c.grade} ${GRADE_NAME[c.grade!]}</b>.`);
}
function ourServe() {
  syncRotation();
  const server = zonePlayer(S.rot.us, 1);
  const target = passers("them")[S.serveAt];
  const o = serveOdds(S.serveType, target.tag);
  const r = S.rng();
  const what = `Your ${server} serves ${S.serveType.toLowerCase()} at ${target.name}.`;
  if (r < o.error) return toNote("Your serve", `${what} Serve error.`, "them");
  if (r < o.error + o.ace) { damage("them", Math.floor(S.rng() * 9), 2, "Ace"); return toNote("Your serve", `${what} Ace!`, "us"); }
  const g = rollGrade(S.rng, o.pass);
  const lead = `${what} They pass <b>${g} ${GRADE_NAME[g]}</b>.`;
  if (g === "/") { S.steps.push(`${what} Overpass`); return startAttack({ ...passFromGrade(S.rng, "#"), incoming: "their overpass", gradeOdds: undefined }, `${lead} It comes straight back: your ball.`); }
  if (g === "-") return theirAttack(0, "a free ball", `${lead} They can only free-ball it.`);
  return theirAttack(TABLES.theirOffense[g as "#" | "+" | "!"], undefined, `${lead}`);
}
function theirServe() {
  const server = zonePlayer(S.rot.them, 1);
  const r0 = S.rng();
  const type: ServeType = r0 < 0.2 ? "Safe" : r0 < 0.7 ? "Float" : "Jump";
  const ps = passers("us");
  const target = ps[Math.floor(S.rng() * ps.length)];
  const o = serveOdds(type, target.tag);
  const r = S.rng();
  const what = `Their ${server} serves ${type.toLowerCase()} at ${target.name}.`;
  if (r < o.error) return toNote("Their serve", `${what} Serve error.`, "us", { odds: o.pass });
  if (r < o.error + o.ace) { damage("us", theirTarget(), 2, "Their ace"); return toNote("Their serve", `${what} Ace.`, "them", { odds: o.pass }); }
  const g = rollGrade(S.rng, o.pass);
  if (g === "/") return theirAttack(-0.15, undefined, `${what} Your pass goes straight over.`);
  const pass = { ...passFromGrade(S.rng, g), gradeOdds: o.pass, incoming: `a ${type.toLowerCase()} serve`, digger: target.name.replace("your ", "") };
  S.steps.push(`${what} Pass ${g}`);
  startAttack(pass, `${what} You pass <b>${g} ${GRADE_NAME[g]}</b>.`);
}

function renderServe(): string {
  const server = zonePlayer(S.rot.us, 1);
  const ps = passers("them");
  if (S.serveAt >= ps.length) S.serveAt = 0;
  const types = SERVE_TYPES.map((t) => {
    const sv = TABLES.serve[t];
    return `<button class="shot${t === S.serveType ? " shot-on" : ""}" data-serve-type="${t}" aria-pressed="${t === S.serveType}"><span class="shot-name">${t}</span><span class="shot-about">${SERVE_ABOUT[t]}${S.math ? ` Ace ${pct(sv.ace)}, error ${pct(sv.error)}.` : ""}</span></button>`;
  }).join("");
  const targets = ps.map((p, i) => {
    const o = serveOdds(S.serveType, p.tag);
    const bad = o.pass["-"] + o.pass["/"];
    return `<button class="call${i === S.serveAt ? " call-on" : ""}" data-serve-at="${i}" aria-pressed="${i === S.serveAt}"><span class="call-name">${esc(p.name.replace("their ", ""))}</span><span class="call-meta">${p.tag} passer${S.math ? ` · bad pass ${pct(bad)}` : ""}</span></button>`;
  }).join("");
  const sel = serveOdds(S.serveType, ps[S.serveAt].tag);
  return `
  <section class="phase" aria-labelledby="ph-serve">
    <header class="phase-head"><h2 id="ph-serve">Your serve</h2></header>
    ${rotationLine()}
    <p class="lede">Your <b>${server === "S" ? "setter" : server}</b> is serving. Pick a serve and who to serve at. A bad pass takes away their quick sets; a − pass means they can only free-ball it back.</p>
    ${S.math ? `<details class="math" open><summary>Math</summary><p>${S.serveType} at ${esc(ps[S.serveAt].name)} (${ps[S.serveAt].tag}): ace ${pct(sel.ace)}, error ${pct(sel.error)}. If it's in, their pass:</p>${gradeRow(sel.pass, undefined)}<p class="muted small">Their pass then shifts your dig grade odds: # by ${TABLES.theirOffense["#"]}, + by ${TABLES.theirOffense["+"]}, ! by ${TABLES.theirOffense["!"]}. A − pass is a free ball to you; / comes straight back.</p></details>` : ""}
    <h3 class="sub">Serve</h3><div class="shots serve-types">${types}</div>
    <h3 class="sub">Serve at</h3><div class="calls">${targets}</div>
    <div class="action-bar"><button class="primary go" id="serve-go">Serve ${S.serveType.toLowerCase()} <kbd>Enter</kbd></button></div>
  </section>`;
}
function nextButton(): string {
  return S.gameOver && S.run
    ? `<button class="primary" id="after-game">${S.gameOver === "them" ? "See how the run ended" : S.run.node === S.run.route.length - 1 ? "Finish the run" : "Choose a reward"} <kbd>Enter</kbd></button>`
    : S.gameOver ? `<button class="primary" id="new-game">New game <kbd>Enter</kbd></button>`
    : `<button class="primary" id="next">Next rally <kbd>Enter</kbd></button>`;
}
function renderNote(): string {
  const n = S.note!;
  return `
  <section class="phase result" aria-labelledby="ph-note">
    <header class="phase-head"><h2 id="ph-note">${esc(n.title)}</h2></header>
    <p class="note-text">${n.text}</p>
    ${S.math && n.odds ? gradeRow(n.odds, n.grade) : ""}
    ${crackLines()}
    ${S.pointTo ? `<p class="point point-${S.pointTo}">Point ${S.pointTo === "us" ? "you" : "them"}. ${S.score.us}–${S.score.them}</p>` : ""}
    ${upgradePicker()}
    ${nextButton()}
  </section>`;
}

/** A new attack on our side: a free ball, or a dig in transition. */
function startAttack(pass: Pass, lead = "") {
  syncRotation();
  if (pass.grade === "#") bumpChain("perfect pass");
  S.lead = lead;
  if (S.run?.state.perks.has("legs") && pass.transition === "Rushed") pass = { ...pass, transition: "Clean" };
  S.pass = pass;
  S.big = false;
  S.counter = null;
  S.pointTo = null;
  S.phase = "set";
  S.call = S.set = S.block = null;
  S.pick = null;
  S.result = null;
  S.plan = S.mode === "Easy" ? { OH: "4", MB: "1", OPP: "5" } : { ...STARTING_PLAN };
  render();
}

function currentCalls(): Record<Hitter, SetCall> {
  return activeCalls(S.plan, S.pass);
}

function chooseCall(call: SetCall) {
  const calls = { ...currentCalls(), [call.hitter]: call };
  const spot = callSpot(call, S.pass.setterX);
  S.call = call;
  S.hitterX = spot;
  S.kind = "Hard";
  S.aimPoint = tileCenter(tileOf(clampAim(spot, shotTarget(defaultShot(call.hitter), spot), hitWindow(S.team[call.hitter], spot, call.tempo))));
  S.aim = shotFor(call.hitter, spot, S.aimPoint);
  S.meter = null;
  S.contact = null;
  S.aimRate = null;
  S.animToken++;
  S.set = setQuality(S.team.S, call, S.pass);
  if (S.set.quality === "Perfect") bumpChain("perfect set");
  S.keyedBlock = keyedOn(S.tendency, call.hitter);
  S.block = formBlock(S.rng, call, spot, othersFor(call, calls, S.pass.setterX), S.system, S.keyedBlock);
  S.defense = defenseFor(S.rng, S.tendency, spot, call.tempo, { system: S.system, blockers: arrived(S.block).length });
  S.block.targets = S.defense.blockAt;
  S.phase = "hit";
  render();
}

/** Your six players, built from the team's base stats with each player's strengths. */
function makeRoster(): Record<Spot, Player> {
  const out = {} as Record<Spot, Player>;
  for (const sp of LINEUP) {
    const role = sp === "S" ? "S" : sp.startsWith("OH") ? "OH" : sp.startsWith("MB") ? "MB" : "OPP";
    const b = S.team[role as Role];
    out[sp] = { ...b, name: sp, stats: { ...b.stats, ...ROSTER[sp].stats }, spot: sp } as Player;
  }
  return out;
}
/** Put this rotation's front row in the hitter spots and set up their block and back row. */
function syncRotation() {
  if (!S.roster) S.roster = makeRoster();
  const f = frontRow(S.rot.us);
  Object.assign(S.team, { S: S.roster.S, OH: S.roster[f.OH], MB: S.roster[f.MB], OPP: S.roster.OPP });
  OUT.hitters = f.OPP ? [] : ["OPP"];
  setTheirRotation(S.rot.them);
}
function rotationLine(): string {
  const f = frontRow(S.rot.us), t = frontRow(S.rot.them);
  const us = f.OPP ? `3 hitters: ${f.OH}, ${f.MB}, OPP` : `setter front, 2 hitters: ${f.OH}, ${f.MB}`;
  const them = `${t.setterFront ? "their setter blocks your outside" : "their OPP blocks your outside"}, ${t.MB} in the middle, ${t.OH} on your right side`;
  return `<p class="rot-line"><b>Rotation ${S.rot.us + 1}</b> (${us}). <b>Them, rotation ${S.rot.them + 1}:</b> ${them}.</p>`;
}

function ctx(): AttackContext {
  const base = withCall(S.team[S.call!.hitter], S.call!);
  // A Big swing is a full, timed swing: two points more Power.
  const hitter = S.big ? { ...base, stats: { ...base.stats, power: base.stats.power + 2 } } : base;
  return { hitter, hitterX: S.hitterX, set: S.set!, block: S.block!, defense: S.defense?.defenders, tendency: S.tendency, transition: S.pass.transition,
    assist: S.mode === "Easy" ? SWING.easyAssist : undefined, tempo: S.call!.tempo, contact: S.contact?.miss,
    aim: S.aimPoint ?? undefined };
}
const shotById = (id: ShotId) => SHOTS.find((s) => s.id === id)!;
type Kind = "Hard" | "Tip" | "Roll" | "Tool";
const KINDS: { id: Kind; label: string; about: string }[] = [
  { id: "Hard", label: "Hard swing", about: "Full swing. Beats diggers, meets the block." },
  { id: "Tip", label: "Tip", about: "Soft over the block. Dies short, easy to run down if they're close." },
  { id: "Roll", label: "Roll shot", about: "Slow arc over the block into open court." },
  { id: "Tool", label: "Tool", about: "Swing off their hands and out." },
];
const kindOpen = (k: Kind) => k === "Hard" || shotOpen(shotById(k));
/** The shot this kind and aim make: a hard swing is named by where it goes (line, seam, cross). */
function shotFor(h: Hitter, hitterX: number, p: { x: number; y: number }, kind: Kind = S.kind): ShotId {
  if (kind !== "Hard") return kind;
  const id = nearestShot(h, hitterX, p);
  if (id === "Line" && shotOpen(shotById("HardLine"))) return "HardLine";
  if (id === "Cross" && shotOpen(shotById("HardCross"))) return "HardCross";
  return id;
}
/** Where the aimed swing is going: the free aim for hard swings, the usual target for tips and rolls. */
const aimSpot = () => ctx().aim ?? shotTarget(S.aim, S.hitterX);

function chooseShot(shot: ShotId) {
  // You pick a tile; the swing goes somewhere in it (the tile's rating is the average over it).
  if (S.aimPoint) { const t = tileOf(S.aimPoint); S.aimPoint = { x: t.c * 3 + 0.25 + S.rng() * 2.5, y: t.r * 3 + 0.25 + S.rng() * 2.5 }; }
  // The odds model: the tile's tags and your tables decide it (see the Numbers panel).
  const pickT = tileOf(S.aimPoint ?? aimSpot());
  const o = modelOdds(S.kind, pickT, ctx());
  const outcome = rollTile(S.rng, o);
  const ap = S.aimPoint ?? tileCenter(pickT);
  const land = outcome === "Blocked" ? undefined : outcome === "Error" ? (S.rng() < 0.5 ? undefined : { x: Math.max(-0.8, Math.min(9.8, ap.x + (ap.x < 4.5 ? -1.5 : 1.5))), y: Math.min(10, ap.y + 2) }) : ap;
  const res = { outcome, why: [o.chain], land, tool: S.kind === "Tool" && outcome !== "Error" } as ReturnType<typeof resolveShot>;
  const idx = pickT.r * 3 + pickT.c;
  if (outcome === "Kill") { if (o.kill < 0.5) bumpChain("kill in a risky tile"); damage("them", idx, 2, "Kill"); }
  else if (outcome === "Dug" && S.tiles && S.rng() < 0.3) damage("them", idx, 1, "They shank the dig");
  void resolveShot;
  S.result = { ...res, shot, name: aimName(), contact: S.contact ?? undefined };
  S.phase = "result";
  S.n++;
  const key = `${callName(S.call!)} · ${SHOTS.find((s) => s.id === shot)!.label}`;
  S.tally[key] ??= { Kill: 0, Blocked: 0, Dug: 0, Error: 0 };
  S.tally[key][res.outcome]++;
  remember(S.tendency, S.call!.hitter, shot, aimSpot());
  if (S.run?.state.perks.has("memory")) for (const a of [S.tendency.sets, S.tendency.shots, S.tendency.shotIds]) while (a.length > 3) a.shift();
  S.steps.push(`${S.call!.hitter} ${callName(S.call!)} · ${SHOTS.find((s) => s.id === shot)!.label} → ${res.outcome}`);
  if (res.outcome === "Kill") awardPoint("us");
  else if (res.outcome === "Blocked" || res.outcome === "Error") awardPoint("them");
  else {
    // Dug: the rally goes on. Their counterattack is a flat roll until the libero's defense call (v0.2).
    S.counter = counterattack(S.rng, ourDigShift(), frontRow(S.rot.us).back);
    const c = S.counter;
    theirAttackDamage(c);
    S.steps.push(c.outcome === "TheirKill" ? "their counter → Kill" : c.outcome === "TheirError" ? "their counter → Error" : `their counter → you dig ${c.incoming} (${c.grade} ${GRADE_NAME[c.grade!]}, ${c.pass!.transition!.toLowerCase()} transition)`);
    if (c.outcome === "TheirKill") awardPoint("them");
    else if (c.outcome === "TheirError") awardPoint("us");
  }
  render(true);
}

function awardPoint(side: Side) {
  S.pointTo = side;
  // Side out: the team that wins the point off the other's serve rotates and serves.
  if (side !== S.serve) { S.rot[side] = (S.rot[side] + 1) % 6; S.serve = side; }
  S.score[side]++;
  S.history.unshift({ n: S.rallyNo, steps: [...S.steps], winner: side, score: `${S.score.us}–${S.score.them}` });
  const w = S.tiles
    ? (broken("them") >= BREAK_TO_WIN ? "us" : broken("us") >= BREAK_TO_WIN ? "them" : S.score.us >= TILES_POINTS ? "us" : S.score.them >= TILES_POINTS ? "them" : null)
    : gameWinner(S.score.us, S.score.them, gameLength());
  if (S.tiles && !w) offerUpgrades();
  if (w) {
    S.gameOver = w;
    S.games[w]++;
  }
}

// ---------- Rendering ----------
const SHOT_ABOUT: Record<ShotId, string> = {
  Seam: "Between the blockers, deep middle",
  Line: "Down the sideline past the end blocker",
  Cross: "Sharp angle across the court",
  QLeft: "Sharp angle to the left, short by the 3 m line",
  QStraight: "Hammer it straight down in front of you",
  QRight: "Sharp angle to the right, short by the 3 m line",
  Tip: "Soft touch just over the block",
  Roll: "Slow arc into the middle of the court",
  HardLine: "Full swing down the line",
  HardCross: "Full swing cross court",
  Tool: "Off their hands and out",
};
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const numbersToggle = () => S.mode !== "Easy" ? "" : `<button class="ghost toggle" id="toggle-numbers" aria-pressed="${S.numbers}">${S.numbers ? "Hide numbers" : "Show numbers"}</button>`;

function renderSet(): string {
  const pass = S.pass;
  const clarity = setterClarity(S.team.S, pass);
  const calls = currentCalls();
  const perfect = pass.rating === 3;
  const passWord = { 3: "Perfect pass", 2: "OK pass", 1: "Poor pass" }[pass.rating];
  const pulled = pass.setterX - 6;
  const setterWhere = Math.abs(pulled) < 0.4 ? "You're at the target spot" : `You're pulled ${Math.abs(pulled).toFixed(1)} m ${pulled < 0 ? "left" : "right"}`;
  const blockLine = clarity === "Clear" ? `Their block is <b>${S.system.toLowerCase()}</b>.`
    : clarity === "Fuzzy" ? (S.system === "Bunch" ? "Their block looks pinched in." : "Their block looks spread out.")
    : "You can't see their block off this pass.";

  const tokens: Token[] = [
    ...HITTERS.map((h): Token => ({ x: callSpot(calls[h], pass.setterX), label: h, sub: S.mode === "Easy" ? (calls[h].tempo === "Fast" ? "fast" : "high") : callName(calls[h]), kind: "hitter" })),
    { x: pass.setterX, label: "S", kind: "setter" },
  ];
  // The picked call defaults to the outside's plan call.
  const easy = S.mode === "Easy";
  if (!S.pick || !callAvailable(callById(S.pick), pass) || !callOpen(callById(S.pick)) || (easy && !EASY_CALLS[S.pick])) S.pick = calls.OH.id;
  const pick = callById(S.pick);
  const pickSpot = callSpot(pick, pass.setterX);
  const hitterRows = HITTERS.map((h) => {
    // All four calls are always shown. On a perfect pass the game-plan call is marked; setting any
    // other call changes only that hitter's run (spec §5.3), and everyone else runs the plan.
    // Easy mode: one plain call per hitter, high or fast.
    const buttons = SET_CALLS.filter((c) => c.hitter === h && (!easy || EASY_CALLS[c.id])).map((c) => callButton(c, calls, clarity, !easy && perfect && c.id === calls[h].id)).join("");
    return `<div class="hitter-row"><div class="hitter-head"><span class="pos">${h}</span><span>${HITTER_NAME[h]} <span class="muted small">${esc(S.team[h].name)}</span></span></div><div class="calls">${buttons}</div></div>`;
  }).join("");

  return `
  <section class="phase" aria-labelledby="ph-set">
    <header class="phase-head"><h2 id="ph-set">Setter</h2><span class="head-tools">${clarityChip(clarity, "Setter")}${numbersToggle()}</span></header>
    ${S.run && S.rallyNo <= 3 && !S.steps.length ? `<p class="scout"><b>Scouting ${esc(foe().name)}:</b> ${esc(foe().scout)}</p>` : ""}
    <p class="lede"><b>${passWord}.</b> ${setterWhere}. ${blockLine}${transitionNote()}</p>
    ${S.lead ? `<p class="lead-line">${S.lead}</p>` : ""}
    ${crackLines()}
    ${rotationLine()}
    ${mathSet()}
    ${netSvg({ mode: "set", clarity, system: S.system, setterX: pass.setterX, tokens, pick: { d: setArcPath(pass.setterX, pickSpot, pick.tempo), x: pickSpot } })}
    <p class="hint">${easy
      ? "High balls give your hitter time but let their block get there. Fast balls beat the block but need a good pass. Tap one, then set it."
      : perfect
      ? `Your game plan is on: ${HITTERS.map((h) => `${h} ${callName(calls[h])}`).join(", ")}. Tap a call to see the set, then set it.`
      : "Off-target pass: the game plan is off. Medium and fast sets need at least an OK pass. Tap a call, then set it."}</p>
    <div class="hitters${easy ? " hitters-easy" : ""}">${hitterRows}</div>
    <div class="action-bar"><button class="primary go" id="set-go">Set ${HITTER_NAME[pick.hitter].toLowerCase()}: ${esc(easy ? EASY_CALLS[pick.id] ?? callName(pick) : callName(pick))} <kbd>Enter</kbd></button></div>
  </section>`;
}

const shownName = (c: SetCall) => (S.mode === "Easy" && EASY_CALLS[c.id]) || callName(c);

let pvCache = new WeakMap<Pass, Map<string, ReturnType<typeof previewCall>>>();
const pvReset = () => { pvCache = new WeakMap(); };
function previewFor(c: SetCall, calls: Record<Hitter, SetCall>) {
  const merged = { ...calls, [c.hitter]: c };
  const key = `${c.id}|${HITTERS.map((h) => merged[h].id).join(",")}|${keyedOn(S.tendency, c.hitter).toFixed(2)}|${S.system}`;
  let m = pvCache.get(S.pass);
  if (!m) pvCache.set(S.pass, (m = new Map()));
  if (!m.has(key)) {
    const pv = previewCall(S.team, c, S.pass, othersFor(c, merged, S.pass.setterX), S.system, 10, 1, keyedOn(S.tendency, c.hitter));
    // Kill: the best hard-swing tile from the odds model, averaged over how their block and defense usually set up.
    const rng = makeRng(77);
    let kill = 0;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const block = formBlock(rng, c, pv.spot, othersFor(c, merged, S.pass.setterX), S.system, keyedOn(S.tendency, c.hitter));
      const def = defenseFor(rng, S.tendency, pv.spot, c.tempo, { system: S.system, blockers: arrived(block).length });
      const cx: AttackContext = { hitter: withCall(S.team[c.hitter], c), hitterX: pv.spot, set: pv.set, block, defense: def.defenders, tempo: c.tempo, transition: S.pass.transition };
      kill += Math.max(...allTiles("Hard", cx).map((t) => t.kill));
    }
    m.set(key, { ...pv, roughKill: kill / n });
  }
  return m.get(key)!;
}

/** Testing view: the pass grade, the odds it came from, and every option with its numbers. */
function gradeRow(odds: Record<Grade, number> | undefined, got: Grade | undefined): string {
  if (!odds) return "";
  return `<div class="grade-row">${GRADES.map((g) => `<span class="g${g === got ? " g-on" : ""}"><b>${g}</b> ${pct(odds[g])}</span>`).join("")}</div>`;
}
function mathSet(): string {
  if (!S.math) return "";
  const p = S.pass, calls = currentCalls();
  const g = p.grade ?? (p.rating === 3 ? "#" : p.rating === 2 ? "!" : "-");
  const rows = SET_CALLS.filter((c) => callOpen(c)).map((c) => {
    const why = lockReason(c, p);
    if (why) return `<tr class="locked"><td>${c.hitter}</td><td>${esc(callName(c))}</td><td>${c.tempo}</td><td colspan="4">locked: ${esc(why)}</td></tr>`;
    const pv = previewFor(c, calls);
    return `<tr${c.id === S.pick ? ' class="on"' : ""}><td>${c.hitter}</td><td>${esc(callName(c))}</td><td>${c.tempo}</td><td>${pv.set.quality} (${pv.set.score})</td><td>${pv.avgBlockers.toFixed(1)}</td><td><b>${pct(pv.roughKill)}</b></td><td class="muted">${pv.deceived ? "look-alike " : ""}${pv.frozen && !c.isQuick ? "middle held" : ""}</td></tr>`;
  }).join("");
  return `<details class="math" open><summary>Math</summary>
    <p><b>Pass ${g} ${GRADE_NAME[g]}</b>${p.incoming ? ` off ${esc(p.incoming)}` : ""}${p.digger ? `, dug by the ${esc(p.digger)}` : ""}. Setter ${Math.abs(p.setterX - 6).toFixed(1)} m off target${p.transition ? `, ${p.transition.toLowerCase()} transition` : ""}.</p>
    ${gradeRow(p.gradeOdds, g)}
    <div class="table-wrap"><table><thead><tr><th>Hitter</th><th>Call</th><th>Tempo</th><th>Set (score)</th><th>Blockers</th><th>Kill (best hard tile)</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">Set score = setter control + pass bonus − tempo; 7+ perfect, 4+ good. Kill = best hard-swing tile from the odds model, averaged over how their block and defense usually set up. Pass grade odds come from the ball that came over and who dug it.</p>
  </details>`;
}
function mathHit(cx: AttackContext, clarity: Clarity): string {
  if (!S.math) return "";
  const t = S.aimPoint ? tileOf(S.aimPoint) : null;
  const here = t ? modelOdds(S.kind, t, cx) : null;
  const rows = KINDS.filter((k) => kindOpen(k.id) && (k.id === "Hard" || shotsFor(S.call!.hitter).some((s) => s.id === k.id))).map((k) => {
    const all = allTiles(k.id, cx);
    const best = all.reduce((a, b) => (b.kill > a.kill ? b : a));
    const mine = t ? all.find((x) => x.c === t.c && x.r === t.r)! : null;
    return `<tr${k.id === S.kind ? ' class="on"' : ""}><td>${k.label}</td><td>${mine ? pct(mine.kill) : "–"}</td><td>${pct(best.kill)} <span class="muted">${TILE_NAME[best.r][best.c]}</span></td></tr>`;
  }).join("");
  const g = here?.tags;
  return `<details class="math" open><summary>Math</summary>
    ${here && t ? `<p><b>${TILE_NAME[t.r][t.c]}, ${S.kind.toLowerCase()}:</b> kill ${pct(here.kill)}, blocked ${pct(here.blocked)}, error ${pct(here.error)}, dug ${pct(here.dug)}.</p>
    <p class="chain">${esc(here.chain)}</p>
    <p class="muted small">Tags: reach ${g!.reach}, block ${g!.block}, defense ${g!.defense}${g!.defense !== "open" ? ` (${g!.digger}${g!.nearest ? `, ${esc(g!.nearest)}` : ""})` : ""}, ${g!.set.toLowerCase()} set, matchup ${g!.matchup}.${clarity !== "Clear" ? " Your read is " + clarity.toLowerCase() + "; these are the true odds." : ""}</p>` : `<p>Tap a tile to see its chain.</p>`}
    <div class="table-wrap"><table><thead><tr><th>Attack</th><th>This tile</th><th>Best tile</th></tr></thead><tbody>${rows}</tbody></table></div>
  </details>`;
}

function callButton(c: SetCall, calls: Record<Hitter, SetCall>, clarity: Clarity, isPlan: boolean): string {
  if (!callOpen(c)) return `<button class="call" disabled><span class="call-name">${esc(shownName(c))}</span><span class="call-meta">${c.tempo} · locked: earn it on this run</span></button>`;
  const why = lockReason(c, S.pass);
  if (why) {
    return `<button class="call call-locked" disabled><span class="call-name">${esc(shownName(c))}</span><span class="call-meta">🔒 ${why}</span></button>`;
  }
  const pv = previewFor(c, calls);
  const onto = keyedOn(S.tendency, c.hitter) >= 0.3 ? `<span class="tag tag-onto">they're onto this hitter</span>` : "";
  const plain = S.mode === "Easy";
  const tags = [onto, isPlan ? `<span class="tag tag-plan">game plan</span>` : "", plain ? "" : pv.deceived ? `<span class="tag tag-trick">look-alike</span>` : "", !plain && pv.frozen && !c.isQuick ? `<span class="tag tag-trick">quick holds middle</span>` : ""].join("");
  const arc = `data-arc="${setArcPath(S.pass.setterX, pv.spot, c.tempo)}" data-spot="${pv.spot.toFixed(2)}"`;
  if (!S.numbers) {
    const n = Math.round(pv.avgBlockers);
    const dots = clarity === "Blind" ? `<span class="dots dots-unknown">block ?</span>`
      : `<span class="dots${clarity === "Fuzzy" ? " dots-fuzzy" : ""}" title="About ${pv.avgBlockers.toFixed(1)} blockers get there">${[0, 1, 2].map((i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}<span>block</span></span>`;
    return `<button class="call${isPlan ? " call-plan" : ""}${c.id === S.pick ? " call-on" : ""}" data-call="${c.id}" aria-pressed="${c.id === S.pick}" ${arc}>
      <span class="call-name">${esc(shownName(c))}</span>
      <span class="call-meta">${S.mode === "Easy" ? (c.tempo === "Fast" ? "Fast" : "High") : c.tempo} · <span class="q q-${pv.set.quality.toLowerCase()}">${pv.set.quality} set</span></span>
      <span class="call-row">${dots}${S.mode === "Easy" ? rateChip(rateCall(pv.roughKill), clarity) : ""}</span>
      ${tags ? `<span class="tags">${tags}</span>` : ""}
    </button>`;
  }
  const blk = clarity === "Clear" ? `~${pv.avgBlockers.toFixed(1)} blockers` : clarity === "Fuzzy" ? `${Math.max(0, Math.floor(pv.avgBlockers - 0.5))}–${Math.min(3, Math.ceil(pv.avgBlockers + 0.5))} blockers` : "block ?";
  const kill = clarity === "Blind" ? "kill ?" : clarity === "Fuzzy"
    ? `kill ${pct(Math.max(0, pv.roughKill - 0.06))}–${pct(pv.roughKill + 0.06)}`
    : `kill ~${pct(pv.roughKill)}`;
  return `<button class="call${isPlan ? " call-plan" : ""}${c.id === S.pick ? " call-on" : ""}" data-call="${c.id}" aria-pressed="${c.id === S.pick}" ${arc}>
    <span class="call-name">${esc(shownName(c))}</span>
    <span class="call-meta">${c.tempo} · ${c.type.toLowerCase()} set · ${pv.spot.toFixed(1)} m</span>
    <span class="call-odds"><span class="q q-${pv.set.quality.toLowerCase()}">${pv.set.quality} set</span> · ${blk} · ${kill}</span>
    ${tags ? `<span class="tags">${tags}</span>` : ""}
  </button>`;
}

function blockSummary(block: BlockResult, clarity: Clarity): string {
  const there = arrived(block);
  const formed = there.filter((b) => b.state === "Formed").length;
  if (clarity === "Blind") return "You swing without seeing the block.";
  if (clarity === "Fuzzy") {
    const lo = Math.max(0, there.length - 1), hi = Math.min(3, there.length + 1);
    return `Looks like ${lo === hi ? lo : `${lo}–${hi}`} blockers up. Hard to tell if they're set.`;
  }
  if (!there.length) return "Nobody up. Open net.";
  return `${there.length} blocker${there.length > 1 ? "s" : ""} up: ${formed} formed, ${there.length - formed} late.`;
}

function oddsBar(o: OddsRange): string {
  const seg = OUTCOMES.map((k) => `<span class="seg seg-${k.toLowerCase()}" style="flex-basis:${(o.mid[k] * 100).toFixed(1)}%"></span>`).join("");
  const nums = OUTCOMES.map((k) => {
    const lo = Math.round(o.lo[k] * 100), hi = Math.round(o.hi[k] * 100);
    const v = lo === hi ? `${lo}%` : `${lo}–${hi}%`;
    return `<span class="num num-${k.toLowerCase()}"><i>${k}</i>${v}</span>`;
  }).join("");
  return `<span class="bar" aria-hidden="true">${seg}</span><span class="nums">${nums}</span>`;
}

function hitOdds(cx: AttackContext, clarity: Clarity): Map<ShotId, OddsRange> {
  if (S.odds?.token === S.animToken) return S.odds.map;
  const c = S.call!;
  const prior: BlockResult[] = [];
  const pr = makeRng(5);
  const calls = { ...currentCalls(), [c.hitter]: c };
  for (let i = 0; i < 10; i++) prior.push(formBlock(pr, c, S.hitterX, othersFor(c, calls, S.pass.setterX), S.system, S.keyedBlock));
  const map = new Map<ShotId, OddsRange>();
  for (const s of shotsFor(c.hitter)) if (shotOpen(s)) map.set(s.id, previewOdds(s.id, { ...cx, aim: undefined }, clarity, prior));
  priorBlocks = prior;
  S.odds = { token: S.animToken, map };
  return map;
}

let priorBlocks: BlockResult[] = [];
const swingAngleOf = (p: { x: number; y: number }) => swingAngle(S.hitterX, p);

/** Easy mode: rate the free aim itself, once per spot. */
function aimTone(cx: AttackContext, clarity: Clarity): Tone {
  if (S.mode !== "Easy" || !cx.aim) return "plain";
  const key = `${S.animToken}:${cx.aim.x.toFixed(2)}:${cx.aim.y.toFixed(2)}:${S.aim}`;
  if (S.dragging) return S.aimRate?.tone ?? "plain";
  if (S.aimRate?.key !== key) S.aimRate = { key, tone: rateShot(previewAim(S.aim, cx, clarity, priorBlocks).mid) };
  return S.aimRate.tone;
}

/** Kill chance per spot. A clear read sees the real block; a blind read only knows how blocks usually form. */
function heatFor(cx: AttackContext, clarity: Clarity): HeatCell[] {
  if (S.heat?.token === S.animToken && S.heat.kind === S.kind) return S.heat.cells;
  const blocks = clarity === "Blind" && priorBlocks.length ? priorBlocks.slice(0, 4) : [cx.block];
  const cells = heatMap({ ...cx, aim: undefined, contact: undefined }, S.kind === "Hard" ? "Hard" : S.kind, blocks);
  S.heat = { token: S.animToken, kind: S.kind, cells };
  return cells;
}

/** The court picture for the hit screen (also redrawn alone while you drag). */
function hitCourt(cx: AttackContext, clarity: Clarity, odds: Map<ShotId, OddsRange>, placed: ReturnType<typeof placeBlock>): string {
  const hitter = S.team[S.call!.hitter];
  const shot = shotById(S.aim);
  const cone = cx.aim ? swingCone(shot, cx, cx.aim) : null;
  const cells = heatFor(cx, clarity);
  const here = cx.aim ? heatAt(cells, cx.aim) : undefined;
  void here; void HEAT_STEP;
  const label = aimName();
  const on = cx.aim ? tileOf(cx.aim) : null;
  void cells;
  const model = allTiles(S.kind, cx);
  const tiles = model.map((t) => ({ c: t.c, r: t.r, kill: t.kill, tag: undefined, on: !!on && on.c === t.c && on.r === t.r, fuzzy: clarity !== "Clear" }));
  return courtSvg({
    tiles,
    hitterX: S.hitterX, placed, arrivedCount: arrived(S.block!).length, defenders: S.defense?.defenders, baseDefenders: S.defense?.base,
    ballSpeed: shot.speed * (1 + DIG.powerPerPoint * (hitter.stats.power - 5)), clarity, shots: [], aim: S.aim,
    height: contactHeight(cx), hands: blockHands(S.block!, S.hitterX), window: hitWindow(hitter, S.hitterX, S.call!.tempo),
    aimCone: cone && cx.aim ? { x: cx.aim.x, y: cx.aim.y, along: cone.along, across: cone.across, ux: cone.ux, uy: cone.uy, tone: aimTone(cx, clarity), label } : undefined,
  });
}
/** The aimed swing's plain name: "Deep cross", "Line", "Hit left". */
function aimName(): string {
  const p = ctx().aim;
  if (!p) return shotLabel(S.aim);
  if (S.kind === "Tool") return "Tool";
  const w = depthWord(p.y);
  return w + (w ? shotLabel(S.aim).toLowerCase() : shotLabel(S.aim));
}
const shotLabel = (id: ShotId) => shotById(id).label.replace(" to 6", "").replace(" off the block", "").replace(" shot", "");

export function shotMarks(cx: AttackContext, odds: Map<ShotId, OddsRange>): ShotMark[] {
  const cm = coneMultiplier(cx);
  const win = hitWindow(S.team[S.call!.hitter], S.hitterX, S.call!.tempo);
  const reachable = (s: (typeof SHOTS)[number]) => { if (!isGeometric(s)) return true; const a = swingAngleOf(shotTarget(s.id, S.hitterX)); return a >= win.min - 0.02 && a <= win.max + 0.02; };
  return shotsFor(S.call!.hitter).filter((s) => odds.has(s.id) && reachable(s)).map((s) => {
    const t = shotTarget(s.id, S.hitterX);
    const inward = S.hitterX < 4.5 ? 1 : -1;
    return {
      id: s.id, label: s.label.replace(" to 6", "").replace(" off the block", "").replace(" shot", ""), x: t.x, y: t.y,
      rx: s.widthSpread * 0.75 * cm, ry: s.depthSpread * 0.75 * cm, tone: S.mode === "Easy" ? rateShot(odds.get(s.id)!.mid) : "plain",
      nudge: s.id === "HardLine" || s.id === "HardCross" ? inward * 0.9 : undefined,
    };
  });
}

function hitScene(final: boolean) {
  const c = S.call!;
  const block = S.block!;
  const placed = placeBlock(block, S.hitterX, c.time);
  const calls = { ...currentCalls(), [c.hitter]: c };
  const tokens: Token[] = [
    ...othersFor(c, calls, S.pass.setterX).map((o): Token => ({ x: o.spot, label: o.call.hitter, sub: o.call.id, kind: "decoy" })),
    { x: S.pass.setterX, label: "S", kind: "setter" },
    { x: S.hitterX, label: c.hitter, sub: c.id, kind: "hitter" },
  ];
  const animate = !final && S.animShown !== S.animToken && !reducedMotion();
  return { placed, tokens, animate, dur: slowMo(c.time) };
}

function transitionNote(): string {
  const dug = S.pass.dugBy ? ` <span class="keyed">Your ${HITTER_NAME[S.pass.dugBy].toLowerCase()} dug it, so only a high ball for them.</span>` : "";
  return dug + transitionLine();
}
function transitionLine(): string {
  const t = S.pass.transition ?? "Clean";
  if (t === "Rushed") return ` <span class="keyed">Your hitters are rushed off the dig.</span>`;
  if (t === "Scrambled") return ` <span class="keyed">Your hitters are scrambling: no quick sets this ball.</span>`;
  return "";
}

/** Tells you when they've caught on, so variety reads as a choice and not luck. */
function ontoBanner(h: Hitter): string {
  const notes: string[] = [];
  if (S.keyedBlock >= 0.3) notes.push(`Their block is reading your ${HITTER_NAME[h].toLowerCase()} early.`);
  if ((S.defense?.keyed ?? 0) >= 0.35) notes.push("Their defense is cheating toward where you keep hitting.");
  const last = S.tendency.shotIds;
  const top = last.length >= 3 ? SHOTS.find((s) => last.filter((x) => x === s.id).length / last.length > 0.5) : undefined;
  if (top) notes.push(`They're sitting on your ${shotLabel(top.id).toLowerCase()}.`);
  return notes.length ? `<div class="onto" role="status"><b>They're onto you.</b> ${notes.join(" ")} Mix it up.</div>` : "";
}

function renderHit(): string {
  const c = S.call!;
  const hitter = S.team[c.hitter];
  const clarity = hitterClarity(hitter, c, S.pass.transition);
  const block = S.block!;
  const cx = ctx();
  const odds = hitOdds(cx, clarity);
  if (!odds.has(S.aim)) S.aim = defaultShot(c.hitter);
  const scene = hitScene(false);
  S.animShown = S.animToken;
  const cm = coneMultiplier(cx);

  void odds; void cm;
  const shots = KINDS.filter((k) => k.id === "Hard" || shotsFor(c.hitter).some((s) => s.id === k.id)).map((k) => {
    if (!kindOpen(k.id)) return `<button class="shot" disabled><span class="shot-name">${k.label}</span><span class="locked">Unlock later</span></button>`;
    const on = k.id === S.kind;
    return `<button class="shot${on ? " shot-on" : ""}" data-kind="${k.id}" aria-pressed="${on}"><span class="shot-top"><span class="shot-name">${k.label}</span></span><span class="shot-about">${k.about}</span></button>`;
  }).join("");
  void shotsFor(c.hitter).map((s) => {
    const open = shotOpen(s);
    if (!open) return `<button class="shot" disabled><span class="shot-name">${s.label}</span><span class="locked">Unlock later</span></button>`;
    const o = odds.get(s.id)!;
    const on = s.id === S.aim && (!isGeometric(s) || nearPreset());
    return `<button class="shot${on ? " shot-on" : ""}" data-shot="${s.id}" aria-pressed="${on}">
      <span class="shot-top"><span class="shot-name">${s.label}</span>${S.mode === "Easy" ? rateChip(rateShot(o.mid), clarity) : ""}</span>
      <span class="shot-about">${SHOT_ABOUT[s.id]}</span>
      ${S.numbers ? `<span class="cone">cone ±${(s.depthSpread * 0.75 * cm).toFixed(1)} m deep, ±${(s.widthSpread * 0.75 * cm).toFixed(1)} m wide</span>${oddsBar(o)}` : ""}
    </button>`;
  }).join("");

  const delays = [...new Set(block.blockers.flatMap((b) => b.delays))];
  const aimLabel = aimName();
  return `
  <section class="phase" aria-labelledby="ph-hit" style="--slowmo:${scene.animate ? scene.dur : 0}s">
    <header class="phase-head"><h2 id="ph-hit">${HITTER_NAME[c.hitter]} · ${esc(shownName(c))}</h2><span class="head-tools">${clarityChip(clarity, HITTER_NAME[c.hitter])}<button class="ghost toggle" id="replay">Replay</button>${numbersToggle()}</span></header>
    ${ontoBanner(c.hitter)}
    <p class="lede"><b class="q q-${S.set!.quality.toLowerCase()}">${S.set!.quality} set.</b> ${blockSummary(block, clarity)}${transitionNote()}${S.numbers ? ` <span class="muted">(${esc(S.set!.parts.join(", "))})</span>` : ""}</p>
    ${mathHit(cx, clarity)}
    ${netSvg({ mode: "hit", clarity, system: S.system, setterX: S.pass.setterX, tokens: scene.tokens, placed: scene.placed, hitterX: S.hitterX, tempo: c.tempo, dur: scene.dur, animate: scene.animate })}
    <div class="hit-grid${scene.animate ? " reveal" : ""}">
      <div class="court-wrap">
        ${hitCourt(cx, clarity, odds, scene.placed)}
      </div>
      <div class="shots">${shots}</div>
    </div>
    <div class="action-bar${scene.animate ? " reveal" : ""}">${S.meter ? meterBar() : bigToggle()}<button class="primary go${S.meter ? " go-hit" : ""}" id="swing">${S.meter ? `Hit it! <kbd>Enter</kbd>` : `Swing: ${esc(aimLabel)} <kbd>Enter</kbd>`}</button></div>
    <p class="hint">${clarity === "Clear" ? "Clear read: what you see is what's there." : clarity === "Fuzzy" ? `Fuzzy read: the block blurs as you go up${S.mode === "Easy" ? ", so the ratings are rough" : ""}.` : `No read: you swing blind${S.mode === "Easy" ? ", so ratings are a guess" : ""}.`} Drag to aim. Green spots usually score, red ones usually don't: the colors come from their block, their diggers and your range. ${S.big ? "Big swing: press Swing, then hit it when the marker crosses the middle." : "Save a Big swing for when it counts: it hits harder, but you have to time it."}</p>
    ${S.defense?.note ? `<p class="hint">Their defense: ${esc(S.defense.note)}</p>` : ""}
    ${S.numbers ? `${clarity === "Clear" && delays.length ? `<p class="hint">Their block was slow: ${esc(delays.join("; "))}.</p>` : ""}<p class="hint">Stats: Jump ${hitter.stats.jump}, Power ${hitter.stats.power}, Control ${hitter.stats.control}, Vision ${hitter.stats.vision}.</p>` : ""}
  </section>`;
}

function resultCallout(): Callout {
  const c = S.counter;
  if (S.gameOver) return { text: S.gameOver === "us" ? `Game. You win ${S.score.us}–${S.score.them}.` : `Game. They win ${S.score.them}–${S.score.us}.`, tone: S.gameOver === "us" ? "big" : "bad" };
  if (!c) return calloutFor(S.result!, S.block!);
  if (c.outcome === "TheirKill") return { text: "Dug, and they put it away.", tone: "bad" };
  if (c.outcome === "TheirError") return { text: "Dug, but their swing goes out.", tone: "good" };
  return { text: "Dug both ways. Rally on.", tone: "neutral" };
}

function resultCourt(): string {
  const r = S.result!;
  const c = S.call!;
  const placed = placeBlock(S.block!, S.hitterX, c.time);
  // A tool has no landing spot: draw it flying off the hands to the side.
  const land = r.land ?? (r.tool && r.outcome !== "Blocked" ? { x: S.hitterX < 4.5 ? -0.9 : 9.9, y: r.outcome === "Kill" ? 6.5 : 2 } : undefined);
  return `<div class="court-result">${courtSvg({ hitterX: S.hitterX, placed, arrivedCount: arrived(S.block!).length, defenders: S.defense?.defenders, baseDefenders: S.defense?.base, clarity: "Clear", shots: [], height: contactHeight(ctx()), hands: blockHands(S.block!, S.hitterX), result: { outcome: r.outcome, land, net: !land && r.outcome === "Error" } })}</div>`;
}

const TRANSITION_LINE: Record<Transition, string> = {
  Clean: "Your hitters got back in time: <b>clean transition</b>.",
  Rushed: "It came back fast. Your hitters are <b>rushed</b>: a lower jump, a wilder swing and a blurrier read.",
  Scrambled: "Your hitters are <b>scrambled</b>: no quick sets, a much lower jump and a wild swing.",
};

/** The ball's flight after contact, on the net view. Plays once per swing. */
function resultNet(): string {
  const r = S.result!, c = S.call!;
  const scene = hitScene(true);
  const animate = S.flightShown !== S.animToken && !reducedMotion();
  S.flightShown = S.animToken;
  return netSvg({ mode: "hit", clarity: "Clear", system: S.system, setterX: S.pass.setterX, tokens: scene.tokens, placed: scene.placed, hitterX: S.hitterX, tempo: c.tempo,
    result: { outcome: r.outcome, land: r.land, touch: r.touch, tool: r.tool }, animate });
}

function renderResult(): string {
  const r = S.result!;
  const co = resultCallout();
  const label = r.name;
  const c = S.counter;
  const counterLine = c
    ? `<p class="result-line">Their counterattack → <b>${c.outcome === "TheirKill" ? "Kill" : c.outcome === "TheirError" ? "Error" : `you dig ${c.incoming}: ${c.grade} ${GRADE_NAME[c.grade!]}`}</b>${c.incoming && c.outcome === "TheirKill" ? ` <span class="muted">(${esc(c.incoming)}, dug by the ${esc(c.digger ?? "")}: ${c.grade} ${GRADE_NAME[c.grade!]})</span>` : ""}</p>${S.math && c.odds ? gradeRow(c.odds, c.grade) : ""}${c.pass ? `<p class="result-line">${TRANSITION_LINE[c.pass.transition ?? "Clean"]}</p>` : ""}`
    : "";
  const pointLine = S.pointTo ? `<p class="point point-${S.pointTo}">Point ${S.pointTo === "us" ? "you" : "them"}. ${S.score.us}–${S.score.them}</p>` : `<p class="point">Rally continues. No point yet.</p>`;
  const next = S.gameOver && S.run
    ? `<button class="primary" id="after-game">${S.gameOver === "them" ? "See how the run ended" : S.run.node === S.run.route.length - 1 ? "Finish the run" : "Choose a reward"} <kbd>Enter</kbd></button>`
    : S.gameOver
    ? `<button class="primary" id="new-game">New game <kbd>Enter</kbd></button>`
    : S.pointTo ? `<button class="primary" id="next">Next rally <kbd>Enter</kbd></button>`
    : `<button class="primary" id="again">Attack again <kbd>Enter</kbd></button>`;
  return `
  <section class="phase result tone-${co.tone}" aria-live="polite">
    <p class="callout">${esc(co.text)}</p>
    <p class="result-line">${HITTER_NAME[S.call!.hitter]} · ${esc(shownName(S.call!))} · ${label} → <b>${r.outcome}</b></p>
    ${r.contact ? `<p class="contact-line c-${r.contact.miss <= CONTACT.perfect ? "perfect" : r.contact.miss < 0.4 ? "good" : "off"}">${contactWord(r.contact)}</p>` : ""}
    ${resultNet()}
    ${resultCourt()}
    <ul class="why">${r.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
    ${counterLine}
    ${crackLines()}
    ${pointLine}
    ${upgradePicker()}
    ${next}
  </section>`;
}

function renderScore(): string {
  const touches = S.steps.filter((x) => !x.startsWith("their")).length;
  return `<section class="scoreboard" aria-label="Score">
    <div class="team"><span class="tname">You</span><span class="pts">${S.score.us}</span></div>
    <div class="score-mid"><span>vs ${esc(S.run ? foe().name : OPPONENT.name)}${S.run ? ` · match ${S.run.node + 1} of ${S.run.route.length}` : ""}</span><span>${S.tiles ? `Break ${BREAK_TO_WIN} tiles or first to ${TILES_POINTS}` : `Game to ${gameLength()} · win by 2`}</span><span>Rally ${S.rallyNo}${touches && !S.pointTo ? ` · attack ${touches + 1}` : ""}</span><span>Games ${S.games.us}–${S.games.them}</span></div>
    <div class="team them"><span class="pts">${S.score.them}</span><span class="tname">Them</span></div>
  </section>`;
}

function renderSide(): string {
  const rows = Object.entries(S.tally).sort((a, b) => sum(b[1]) - sum(a[1])).slice(0, 12).map(([k, t]) => {
    const n = sum(t);
    return `<tr><th scope="row">${esc(k)}</th><td>${n}</td><td>${pct(t.Kill / n)}</td><td>${pct(t.Error / n)}</td><td>${pct(t.Blocked / n)}</td></tr>`;
  }).join("");
  const log = S.history.slice(0, 15).map((h) => `<li class="o-${h.winner}"><span class="ln">${h.n}</span><span class="steps">${h.steps.map(esc).join("<br>")}</span><b>${h.winner === "us" ? "You" : "Them"} ${h.score}</b></li>`).join("");
  const statRows = (["S", "OH", "MB", "OPP"] as Role[]).map((r) => {
    const keys: (keyof Stats)[] = r === "S" ? ["control", "vision"] : ["jump", "power", "control", "vision"];
    return `<div class="stat-row"><span class="pos">${r}</span><span class="stat-list">${keys.map((k) => `<span class="stat"><i>${k}</i><button class="mini" data-stat="${r}:${k}:-1" aria-label="Lower ${r} ${k}">−</button><b>${S.team[r].stats[k]}</b><button class="mini" data-stat="${r}:${k}:1" aria-label="Raise ${r} ${k}">+</button></span>`).join("")}</span></div>`;
  }).join("");
  return `
  <aside class="side">
    <section class="panel">
      <h3>This session</h3>
      ${S.n ? `<div class="table-wrap"><table><thead><tr><th>Call · shot</th><th>n</th><th>Kill</th><th>Err</th><th>Blk</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="muted">Play a few rallies. Results by call and shot collect here so you can see if one choice always wins.</p>`}
    </section>
    ${S.history.length ? `<section class="panel"><h3>Rally log</h3><ol class="log">${log}</ol></section>` : ""}
    ${renderRunPanel()}
    ${renderNumbersPanel()}
    ${renderNamesPanel()}
    <section class="panel">
      <h3>Sandbox</h3>
      <label class="field" for="level">Opponent<select id="level">${(["Rookie", "Club", "Elite"] as OpponentLevel[]).map((m) => `<option ${m === S.level ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      <label class="field" for="game-mode">Game<select id="game-mode"><option value="tiles" ${S.tiles ? "selected" : ""}>Tiles: break 5 of their floor</option><option value="points" ${S.tiles ? "" : "selected"}>Classic: points</option></select></label>
      <label class="field" for="pass-mode">Rally starts with<select id="pass-mode">${(["Serve", "Free ball", "Random", "Perfect", "OK", "Poor"] as const).map((m) => `<option ${m === S.passMode ? "selected" : ""}>${m === "Serve" ? "Serve" : m}</option>`).join("")}</select></label>
      <label class="field" for="block-system">Their block<select id="block-system">${(["Bunch", "Spread"] as BlockSystem[]).map((m) => `<option ${m === S.system ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      <label class="check" for="sound"><input type="checkbox" id="sound" ${S.sound ? "checked" : ""}> Sound</label>
      <label class="check" for="math"><input type="checkbox" id="math" ${S.math ? "checked" : ""}> Math panel (testing)</label>
      <label class="check" for="unlock-all"><input type="checkbox" id="unlock-all" ${S.unlockAll ? "checked" : ""}> Unlock all shots (testing)</label>
      <details><summary class="small">Player stats</summary>
      <p class="muted small">Changes apply from the next ball. Stat tweaks show how upgrades move the odds.</p>
      <div class="stats">${statRows}</div></details>
      <button class="ghost" id="reset">Reset stats and session</button>
    </section>
  </aside>`;
}

function renderRunPanel(): string {
  if (!S.run) return `<section class="panel"><h3>Run</h3><p class="muted small">Free play. A run is three matches and a boss, with a reward after every win.</p><button class="primary" id="start-run">Start a run</button></section>`;
  const r = S.run;
  const route = r.route.map((f, i) => `<li class="${i < r.node ? "done" : i === r.node ? "now" : ""}"><b>${esc(f.name)}</b> <span class="muted small">${f.boss ? "boss · to 21" : `${f.level} · to 11`}</span></li>`).join("");
  return `<section class="panel"><h3>Run</h3><ol class="route">${route}</ol>
    ${r.picked.length ? `<p class="muted small">Earned: ${r.picked.map(esc).join(", ")}</p>` : ""}
    <button class="ghost" id="leave-run">Leave run (free play)</button></section>`;
}

function renderReward(): string {
  const r = S.run!;
  const next = r.route[r.node + 1];
  const cards = r.offer!.map((w, i) => `<button class="reward reward-${w.kind.toLowerCase()}" data-reward="${i}"><span class="tag">${w.kind}</span><span class="reward-title">${esc(w.title)}</span><span class="reward-text">${esc(w.text)}</span></button>`).join("");
  return `<section class="phase result tone-big"><p class="callout">You beat ${esc(foe().name)} ${S.score.us}–${S.score.them}.</p>
    <p class="lede">Pick one reward. Next up: <b>${esc(next.name)}</b>. ${esc(next.scout)}</p>
    <div class="rewards">${cards}</div></section>`;
}

function renderRunEnd(): string {
  const r = S.run!;
  const won = r.outcome === "won";
  return `<section class="phase result tone-${won ? "big" : "bad"}"><p class="callout">${won ? "Run won. You took down The Fortress." : `Run over. ${esc(foe().name)} beat you ${S.score.them}–${S.score.us}.`}</p>
    <p class="lede">You made it through ${won ? r.route.length : r.node} of ${r.route.length} matches.${r.picked.length ? ` Rewards: ${r.picked.map(esc).join(", ")}.` : ""}</p>
    <button class="primary" id="start-run">Start a new run</button> <button class="ghost" id="leave-run">Free play</button></section>`;
}

/** Every team calls its sets differently: rename any call to what you'd shout. */
function renderNamesPanel(): string {
  const rows = HITTERS.map((h) => `<div class="name-row"><span class="pos">${h}</span>${SET_CALLS.filter((c) => c.hitter === h).map((c) =>
    `<label class="name-field"><span>${esc(c.id)} <i>${c.tempo.toLowerCase()}</i></span><input type="text" maxlength="10" data-name="${esc(c.id)}" value="${esc(S.names[c.id] ?? "")}" placeholder="${esc(c.id)}" autocomplete="off"></label>`).join("")}</div>`).join("");
  return `<section class="panel"><details id="names" ${S.namesOpen ? "open" : ""}><summary><h3>Your calls</h3></summary>
    <p class="muted small">Call your sets what your team calls them. A 32 can be your "yaya".</p>${rows}</details></section>`;
}

/** Every number the odds model uses, editable. Saved in this browser; copy them out to keep or share. */
function renderNumbersPanel(): string {
  const num = (path: string, v: number) => `<input class="tnum" type="number" step="0.05" min="0" max="2" data-t="${path}" value="${v}" aria-label="${esc(path)}">`;
  const flat = (key: keyof Tables) => {
    const o = TABLES[key] as unknown as Record<string, number>;
    return `<table class="ttable"><tr>${Object.keys(o).map((k) => `<th>${esc(k)}</th>`).join("")}</tr><tr>${Object.keys(o).map((k) => `<td>${num(`${key}.${k}`, o[k])}</td>`).join("")}</tr></table>`;
  };
  const byKind = (key: keyof Tables) => {
    const o = TABLES[key] as unknown as Record<string, Record<string, number>>;
    const rows = Object.keys(o), cols = Object.keys(o[rows[0]]);
    return `<table class="ttable"><tr><th></th>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${rows.map((k) => `<tr><th>${k}</th>${cols.map((c) => `<td>${num(`${key}.${k}.${c}`, o[k][c])}</td>`).join("")}</tr>`).join("")}</table>`;
  };
  const sec = (key: keyof Tables, title: string, kind: boolean) => `<div class="tsec"><h4>${title}</h4><p class="muted small">${TABLE_NOTES[key]}</p>${kind ? byKind(key) : flat(key)}</div>`;
  return `<section class="panel"><details id="numbers" ${S.numbersOpen ? "open" : ""}><summary><h3>Numbers</h3></summary>
    <p class="muted small">Kill % = base × reach × block × defense × digger × set × matchup. These tables are the only numbers behind a swing. Edits apply right away and stay in this browser.</p>
    ${sec("base", "Base kill rate", false)}${sec("reach", "Reach", false)}${sec("reachError", "Reach: error chance", false)}
    ${sec("block", "Block", true)}${sec("blocked", "Block: stuff chance", true)}${sec("defense", "Defense", true)}
    ${sec("digger", "Digger quality", false)}${sec("set", "Set quality", false)}${sec("setError", "Set: error chance", false)}${sec("matchup", "Matchup", false)}
    <h4 class="tgroup">Serve and pass</h4>
    ${sec("serve", "Serve: ace and error", true)}${sec("servePass", "Serve receive: pass grade", true)}${sec("passer", "Passer quality", false)}${sec("theirOffense", "Their pass → your dig", false)}
    <div class="tbtns"><button class="ghost" id="t-copy">Copy numbers</button><button class="ghost" id="t-paste">Paste numbers</button><button class="ghost" id="t-reset">Reset to defaults</button></div>
    <textarea id="t-json" class="tjson" rows="3" placeholder="Paste numbers here, then press Paste numbers" hidden></textarea>
  </details></section>`;
}

function renderSimPanel(): string {
  const about = POLICIES.find((p) => p.id === S.simPolicy)!.about;
  return `<section class="panel">
    <h3>Simulate games</h3>
    <p class="muted small">Plays whole games to 11 with a fixed way of choosing, using your current stats, their block and the pass setting.</p>
    <label class="field" for="sim-policy">Decisions<select id="sim-policy">${POLICIES.map((p) => `<option ${p.id === S.simPolicy ? "selected" : ""}>${p.id}</option>`).join("")}</select></label>
    <p class="muted small">${esc(about)}</p>
    <label class="field" for="sim-games">Games<select id="sim-games">${[20, 50, 100, 200].map((n) => `<option ${n === S.simGames ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <button class="ghost" id="sim-run" ${S.simRunning ? "disabled" : ""}>${S.simRunning ? "Running…" : "Run simulation"}</button>
    <div id="sim-out">${S.simHtml}</div>
  </section>`;
}

function simResultHtml(policy: Policy, st: ReturnType<typeof emptyStats>): string {
  const r = summarize(st);
  const row = (k: string, v: string) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`;
  return `<div class="table-wrap"><table class="sim-table"><tbody>
    ${row("Decisions", policy)}
    ${row("Games", String(st.games))}
    ${row("Win rate", pct(r.winRate))}
    ${row("Avg score", `${r.avgFor.toFixed(1)}–${r.avgAgainst.toFixed(1)}`)}
    ${row("Points won", pct(r.pointWinRate))}
    ${row("Attacks per rally", r.attacksPerRally.toFixed(2))}
    ${row("Kill / blk / dug / err", `${pct(r.kill)} / ${pct(r.blocked)} / ${pct(r.dug)} / ${pct(r.error)}`)}
    ${row("Sets OH / MB / OPP", `${pct(r.hitterShare.OH)} / ${pct(r.hitterShare.MB)} / ${pct(r.hitterShare.OPP)}`)}
    ${r.topCombos.slice(0, 3).map((c, i) => row(i ? "" : "Most used", `${esc(c.combo)} ${pct(c.share)} (kill ${pct(c.kill)})`)).join("")}
  </tbody></table></div>`;
}

function runSim() {
  if (S.simRunning) return;
  S.simRunning = true;
  const policy = S.simPolicy, total = S.simGames;
  const opts = { team: JSON.parse(JSON.stringify(S.team)), system: S.system, passMode: (S.passMode === "Serve" ? "Free ball" : S.passMode) as PassMode, unlockAll: S.unlockAll, seed: Date.now() >>> 0 };
  const rng = makeRng(opts.seed);
  const st = emptyStats();
  const perTick = policy === "Best odds" ? 1 : 25;
  S.simHtml = `<p class="muted small">0 / ${total} games…</p>`;
  render();
  const tick = () => {
    for (let i = 0; i < perTick && st.games < total; i++) playGame(rng, policy, opts, st);
    const out = document.getElementById("sim-out");
    if (st.games < total) {
      if (out) out.innerHTML = `<p class="muted small">${st.games} / ${total} games…</p>`;
      setTimeout(tick, 0);
      return;
    }
    S.simRunning = false;
    S.simHtml = simResultHtml(policy, st);
    render();
  };
  setTimeout(tick, 30);
}

const sum = (t: Record<Outcome, number>) => t.Kill + t.Blocked + t.Dug + t.Error;

function render(flash = false) {
  const main = S.phase === "set" ? renderSet() : S.phase === "hit" ? renderHit() : S.phase === "reward" ? renderReward() : S.phase === "runEnd" ? renderRunEnd() : S.phase === "serve" ? renderServe() : S.phase === "note" ? renderNote() : renderResult();
  $("#app").innerHTML = `<div class="layout"><div class="stage">${renderScore()}${floorWidget()}${main}</div>${renderSide()}</div>`;
  if (flash && S.result) {
    const el = $(".result");
    el.classList.add("pending");
    const co = resultCallout();
    const o = S.result.outcome;
    setTimeout(() => {
      el.classList.remove("pending");
      sfx(o === "Kill" ? (co.tone === "big" ? "bigDing" : "ding") : o === "Blocked" ? "thud" : o === "Error" ? "miss" : "dig");
      if (!reducedMotion() && (co.tone === "big" || (o === "Blocked" && co.text.startsWith("STUFFED")))) {
        el.classList.add("shake");
        setTimeout(() => el.classList.remove("shake"), 450);
      }
    }, reducedMotion() ? 0 : FLIGHT_SECONDS * 1000 + 60);
  }
  snapshot();
}

// ---------- Sound: a ding on a kill, a thud on a block (spec §15). Synthesized, no files. ----------
let audio: AudioContext | null = null;
function tone(freq: number, end: number, dur: number, gain: number, type: OscillatorType, delay = 0) {
  const a = audio!;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(end, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
function sfx(kind: "ding" | "bigDing" | "thud" | "miss" | "dig" | "pop") {
  if (!S.sound) return;
  try {
    audio ??= new AudioContext();
    if (kind === "ding" || kind === "bigDing") {
      tone(1568, 1568, 0.35, 0.18, "sine");
      tone(2352, 2352, 0.25, 0.07, "sine");
      if (kind === "bigDing") tone(2093, 2093, 0.45, 0.16, "sine", 0.09);
    } else if (kind === "thud") {
      tone(160, 45, 0.22, 0.5, "sine");
      tone(90, 40, 0.3, 0.25, "triangle");
    } else if (kind === "miss") tone(220, 110, 0.25, 0.12, "triangle");
    else if (kind === "pop") { tone(900, 500, 0.06, 0.25, "square"); tone(140, 60, 0.12, 0.3, "sine"); }
    else tone(420, 300, 0.08, 0.08, "sine");
  } catch { /* no audio */ }
}

// ---------- Events ----------
/** Aim at a shot. Choosing the shot that's already aimed swings it (double-tap to swing). */
// ---------- Contact meter: the swing is a timing tap ----------
/** First press starts your approach (the meter sweeps); the second press is contact. */
function swingPress() {
  if (S.phase !== "hit") return;
  // A normal swing is just the decision. Only a Big swing asks you to time it.
  if (!S.big) { S.contact = null; return chooseShot(S.aim); }
  if (!S.meter) {
    if (S.run) S.run.bigLeft--;
    const period = CONTACT.sweep[S.call!.tempo] * (S.mode === "Easy" ? CONTACT.easySlow : 1);
    S.meter = { start: performance.now(), period, shot: S.aim };
    render();
    requestAnimationFrame(tickMeter);
    return;
  }
  const pos = meterPos();
  S.contact = { miss: Math.min(1, Math.abs(pos - 0.5) * 2), pos };
  const shot = S.meter.shot;
  S.meter = null;
  if (S.contact.miss <= CONTACT.perfect) sfx("pop");
  chooseShot(shot);
}
/** Marker position, 0 to 1, sweeping back and forth. */
function meterPos(): number {
  const m = S.meter!;
  const u = (((performance.now() - m.start) / 1000) / m.period) % 2;
  return u < 1 ? u : 2 - u;
}
function tickMeter() {
  if (!S.meter || S.phase !== "hit") return;
  const el = document.getElementById("meter-mark");
  if (el) el.style.left = `${(meterPos() * 100).toFixed(2)}%`;
  requestAnimationFrame(tickMeter);
}
function bigToggle(): string {
  const left = S.run ? S.run.bigLeft : Infinity;
  if (!S.big && left <= 0) return `<p class="muted small big-none">No Big swings left this game.</p>`;
  return `<button class="ghost big-toggle${S.big ? " big-on" : ""}" id="big" aria-pressed="${S.big}">${S.big ? "Big swing armed: harder, but timed" : `Big swing${S.run ? ` (${left} left this game)` : ""}`}</button>`;
}
function meterBar(): string {
  const z = CONTACT.perfect * 50;
  return `<div class="meter" id="meter" role="button" aria-label="Tap to make contact">
    <div class="meter-zone" style="left:${(50 - z * 3.2).toFixed(1)}%;width:${(z * 6.4).toFixed(1)}%"></div>
    <div class="meter-sweet" style="left:${(50 - z).toFixed(1)}%;width:${(z * 2).toFixed(1)}%"></div>
    <div class="meter-mark" id="meter-mark"></div>
    <span class="meter-l">early</span><span class="meter-r">late</span>
  </div>`;
}
const contactWord = (c: { miss: number; pos: number }) =>
  c.miss <= CONTACT.perfect ? "Perfect contact" : c.miss < 0.4 ? "Good contact" : c.miss < CONTACT.shank ? (c.pos < 0.5 ? "A bit early" : "A bit late") : c.pos < 0.5 ? "Way early" : "Way late";

function aimAt(shot: ShotId, swingIfAimed: boolean) {
  if (swingIfAimed && S.aim === shot && (!isGeometric(shotById(shot)) || nearPreset())) return swingPress();
  S.aim = shot;
  if (isGeometric(shotById(shot))) S.aimPoint = shotTarget(shot, S.hitterX);
  render();
}
/** Is the free aim sitting on the aimed shot's usual target? */
function nearPreset(): boolean {
  if (!S.aimPoint) return true;
  const t = shotTarget(S.aim, S.hitterX);
  return Math.hypot(t.x - S.aimPoint.x, t.y - S.aimPoint.y) < 0.4;
}

/** Drag (or tap) on their court to aim a hard swing anywhere. */
/** The court is 3×3 tiles of 3 m: c across from your left, r from the net. */
const tileOf = (p: { x: number; y: number }) => ({ c: Math.max(0, Math.min(2, Math.floor(p.x / 3))), r: Math.max(0, Math.min(2, Math.floor(p.y / 3))) });
const tileCenter = (t: { c: number; r: number }) => ({ x: t.c * 3 + 1.5, y: t.r * 3 + 1.5 });
function aimFree(p: { x: number; y: number }) {
  const c = S.call!;
  if (S.meter) return; // aim is locked once you start your approach
  S.aimPoint = tileCenter(tileOf(p));
  S.aim = shotFor(c.hitter, S.hitterX, S.aimPoint);
}
function redrawCourt() {
  const wrap = document.querySelector(".court-wrap");
  const clarity = hitterClarity(S.team[S.call!.hitter], S.call!, S.pass.transition);
  if (wrap && S.odds) wrap.innerHTML = hitCourt(ctx(), clarity, S.odds.map, hitScene(true).placed);
}
document.addEventListener("pointerdown", (e) => {
  const wrap = (e.target as Element).closest?.(".court-wrap") as HTMLElement | null;
  if (!wrap || S.phase !== "hit" || (e.target as Element).closest("[data-aim]")) return;
  const p = courtPoint(wrap.querySelector("svg")!, e.clientX, e.clientY);
  if (!p || p.y < CONTACT_Y + 0.4) return;
  e.preventDefault();
  S.dragging = true;
  wrap.setPointerCapture(e.pointerId);
  aimFree(p);
  redrawCourt();
});
document.addEventListener("pointermove", (e) => {
  if (!S.dragging) return;
  const svg = document.querySelector(".court-wrap svg") as SVGSVGElement | null;
  const p = svg && courtPoint(svg, e.clientX, e.clientY);
  if (!p) return;
  aimFree(p);
  redrawCourt();
});
const endDrag = () => { if (!S.dragging) return; S.dragging = false; render(); };
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

document.addEventListener("click", (e) => {
  if ((e.target as Element).closest?.("#meter")) return swingPress();
  // Tap a preset target on the court to snap your aim to it (tap it again to swing).
  const mark = (e.target as Element).closest?.("#court [data-aim]") as SVGGElement | null;
  if (mark && S.phase === "hit") return aimAt(mark.dataset.aim as ShotId, true);
  const t = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!t || t.disabled) return;
  if (t.id === "t-copy") {
    const box = $("#t-json") as HTMLTextAreaElement;
    box.hidden = false; box.value = JSON.stringify(TABLES); box.select();
    try { void navigator.clipboard?.writeText(box.value); } catch { /* clipboard blocked */ }
    t.textContent = "Copied";
    return;
  }
  if (t.id === "t-paste") {
    const box = $("#t-json") as HTMLTextAreaElement;
    if (box.hidden || !box.value.trim()) { box.hidden = false; box.focus(); return; }
    t.textContent = importTables(box.value) ? "Loaded" : "Couldn't read that";
    S.odds = null; S.heat = null; pvReset(); render();
    return;
  }
  if (t.id === "t-reset") { resetTables(); pvReset(); render(); return; }
  if (t.dataset.call) {
    // Tap to pick and see the set; tap the picked call again (or Set) to set it.
    if (S.pick === t.dataset.call) chooseCall(callById(t.dataset.call));
    else { S.pick = t.dataset.call; render(); }
  }
  else if (t.id === "set-go" && S.pick) chooseCall(callById(S.pick));
  else if (t.dataset.kind) { S.kind = t.dataset.kind as Kind; S.aim = shotFor(S.call!.hitter, S.hitterX, S.aimPoint!); render(); }
  else if (t.id === "swing") swingPress();
  else if (t.id === "replay") { S.animShown = -1; render(); }
  else if (t.id === "toggle-numbers") { S.numbers = !S.numbers; render(); }
  else if (t.id === "next" || t.id === "new-game") newRally();
  else if (t.id === "after-game") afterGame();
  else if (t.dataset.reward) takeReward(Number(t.dataset.reward));
  else if (t.id === "start-run") startRun();
  else if (t.id === "leave-run") leaveRun();
  else if (t.id === "big") { if (S.big) { S.big = false; } else if (!S.run || S.run.bigLeft > 0) S.big = true; render(); }
  else if (t.id === "sim-run") runSim();
  else if (t.id === "again") startAttack(S.counter!.pass!);
  else if (t.id === "serve-go") ourServe();
  else if (t.dataset.up && S.ups && S.upTaken < 0) { S.upTaken = +t.dataset.up; S.ups[S.upTaken].apply(); pvReset(); render(); }
  else if (t.dataset.serveType) { S.serveType = t.dataset.serveType as ServeType; render(); }
  else if (t.dataset.serveAt) { S.serveAt = +t.dataset.serveAt; render(); }
  else if (t.dataset.stat) {
    const [r, k, d] = t.dataset.stat.split(":");
    const st = S.team[r as Role].stats;
    st[k as keyof Stats] = Math.max(1, Math.min(10, st[k as keyof Stats] + Number(d)));
    S.odds = null;
    render();
  } else if (t.id === "reset") {
    S.team = JSON.parse(JSON.stringify(STARTING_TEAM)); S.roster = null;
    S.tally = {}; S.n = 0; S.history = []; S.tendency = emptyTendency(); S.score = { us: 0, them: 0 }; S.rot = { us: 0, them: 0 }; S.serve = "us"; resetFloors(); S.games = { us: 0, them: 0 }; S.rallyNo = 0; S.gameOver = null;
    newRally();
  }
});

document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.dataset.t) { setTableValue(t.dataset.t, parseFloat(t.value)); pvReset(); setTimeout(() => render(), 0); return; }
  if (t.dataset.name) {
    const v = t.value.trim();
    if (v) S.names[t.dataset.name] = v; else delete S.names[t.dataset.name];
    saveNames();
  }
  else if (t.id === "game-mode") { S.tiles = t.value === "tiles"; resetFloors(); render(); }
  else if (t.id === "pass-mode") S.passMode = t.value as PassMode | "Serve";
  else if (t.id === "block-system") S.system = t.value as BlockSystem;
  else if (t.id === "hard") { S.hard = (t as HTMLInputElement).checked; if (S.phase === "hit") render(); }
  else if (t.id === "unlock-all") { S.unlockAll = (t as HTMLInputElement).checked; S.odds = null; }
  else if (t.id === "mode") {
    S.mode = t.value as "Normal" | "Easy";
    if (S.mode === "Normal") S.numbers = false;
    if (S.phase === "set") S.plan = S.mode === "Easy" ? { OH: "4", MB: "1", OPP: "5" } : { ...STARTING_PLAN };
  }
  else if (t.id === "level") { S.level = t.value as OpponentLevel; setOpponentLevel(S.level); S.odds = null; }
  else if (t.id === "math") { S.math = (t as HTMLInputElement).checked; render(); }
  else if (t.id === "sound") S.sound = (t as HTMLInputElement).checked;
  else if (t.id === "sim-policy") S.simPolicy = t.value as Policy;
  else if (t.id === "sim-games") S.simGames = Number(t.value);
  if (S.phase !== "result") render();
});

// Setter: pointing at a call draws its set on the net view.
function previewSet(e: Event) {
  const b = (e.target as HTMLElement).closest?.("button[data-arc]") as HTMLButtonElement | null;
  const arc = document.getElementById("set-arc"), dot = document.getElementById("set-target");
  if (!arc || !dot) return;
  // Off any call, fall back to the picked one.
  arc.setAttribute("d", b?.dataset.arc ?? arc.dataset.pickD ?? "");
  dot.setAttribute("cx", String(30 + Number(b?.dataset.spot ?? dot.dataset.pickX ?? -1) * 100));
}
document.addEventListener("pointerover", previewSet);
document.addEventListener("toggle", (e) => {
  const el = e.target as HTMLDetailsElement;
  if (el.id === "names") S.namesOpen = el.open;
  if (el.id === "numbers") S.numbersOpen = el.open;
}, true);
document.addEventListener("focusin", previewSet);

document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "Enter" && S.phase === "set" && S.pick && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) {
    e.preventDefault();
    chooseCall(callById(S.pick));
    return;
  }
  if ((e.key === "Enter" || e.key === " ") && S.phase === "hit" && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) {
    e.preventDefault();
    swingPress();
    return;
  }
  if (e.key === "Enter" && S.phase === "serve" && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); return ourServe(); }
  if (e.key === "Enter" && S.phase === "note" && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); return S.gameOver && S.run ? afterGame() : newRally(); }
  if (e.key === "Enter" && S.phase === "result" && !(e.target instanceof HTMLSelectElement)) {
    e.preventDefault();
    if (S.gameOver && S.run) return afterGame();
    if (!S.gameOver && !S.pointTo && S.counter?.pass) startAttack(S.counter.pass);
    else newRally();
  }
});

// ---------- Keep the session across live updates ----------
type Snap = Pick<typeof S, "team" | "passMode" | "system" | "unlockAll" | "n" | "tally" | "score" | "games" | "rallyNo" | "history" | "numbers" | "sound" | "mode" | "level" | "names">;
declare global { interface Window { claude?: { hot?: { snapshot?: (fn: () => unknown) => void; ready?: (fn: (d: unknown) => void) => void; data?: unknown } } } }
function snapshot() {
  try { window.claude?.hot?.snapshot?.(() => ({ team: S.team, passMode: S.passMode, system: S.system, unlockAll: S.unlockAll, n: S.n, tally: S.tally, score: S.score, games: S.games, rallyNo: S.rallyNo, history: S.history, numbers: S.numbers, sound: S.sound, mode: S.mode, level: S.level, names: S.names })); } catch { /* not in a viewer */ }
}
function start(data: unknown) {
  const d = (data ?? {}) as Partial<Snap>;
  if (d.team) Object.assign(S, d);
  setOpponentLevel(S.level);
  if (S.rallyNo > 0) S.rallyNo--; // newRally() counts the rally that was in progress again
  // New players land in a run; the sidebar has free play.
  if (!d.team) startRun();
  else newRally();
}
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
// Test hook: dist/smoke.html#test lets scripts jump to the end of a game.
if (location.hash === "#test") (window as unknown as { __vb: unknown }).__vb = { winGame: () => { S.gameOver = "us"; S.score = { us: 11, them: 5 }; afterGame(); } };
void renderSimPanel; // simulator retired with the old odds; kept until it reads the tables
