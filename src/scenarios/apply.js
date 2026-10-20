/**
 * Selection and application of encounter scenarios.
 *
 * selectScenarios() draws which scenarios a case carries, using only createStream(seed, 'scenarios').
 * applyScenarios() resolves each pick's declarative effects (every two-number array [lo, hi] is drawn
 * from the 16 uniforms stored with the pick) and returns a plan with the hooks the case builder calls:
 *
 *   demographics   stated height, reference sex and requisition group the laboratory enters
 *   physiology     acute effects on the measured spirometric quantities (a copy of the truth)
 *   maneuver       extra and forced faults, set-wide effort, decline, set sizes
 *   volumes, dlco  plethysmography and diffusing-capacity effects, carboxyhemoglobin, hemoglobin availability
 *   describe       statements, technologist comments, caveats, decoys and the stated-versus-true record
 *
 * The lungs are never edited: the laboratory's inputs (height, sex, group) and the measurement process
 * change, and the interpretation key is computed from what the laboratory entered.
 */
import { createStream } from '../core/prng.js';
import { resolveDescriptor } from '../core/descriptor.js';
import { normQuantile } from '../core/stats.js';
import { applyAcuteEffects, cohbDlcoFactor } from '../core/physiology.js';
import { interpret } from '../interpret/interpret.js';
import { SCENARIOS, getScenario, compatible } from './library.js';
import { SCENARIO_CONSTANTS as C } from './constants.js';

/** Scenarios per level: [min, max] total count (explicit ids are always included). */
export const LEVEL_TARGETS = { none: [0, 0], light: [1, 1], moderate: [2, 2], heavy: [3, 4] };
const U_COUNT = 16; // uniforms stored per pick: 0 to 11 for effect ranges, 12 to 15 for model draws (height, sex)

/**
 * @typedef {object} Selection
 * @property {string} level
 * @property {string[]} ids
 * @property {{ id: string, variant: number, u: number[] }[]} picks
 */

/**
 * Draw the scenarios for a case. Uses only createStream(seed, 'scenarios'). Applicability predicates see
 * the descriptor (never the true physiology), so the same seed, level and overrides give the same picks.
 * @param {{ seed: number, level?: string, archetype: string, panel?: string, forcedIds?: string[], descriptor?: object }} args
 * @returns {Selection}
 */
export function selectScenarios({ seed, level = 'none', archetype, panel = 'full', forcedIds = [], descriptor = null }) {
  if (!LEVEL_TARGETS[level]) throw new RangeError(`unknown scenario level: ${level}`);
  const forced = [...new Set(forcedIds)];
  for (const id of forced) if (!getScenario(id)) throw new RangeError(`unknown scenario: ${id}`);
  if (level === 'none' && !forced.length) return { level, ids: [], picks: [] };
  const d = descriptor ?? resolveDescriptor({ seed, archetype, panel });
  const rng = createStream(seed, 'scenarios');
  const [lo, hi] = LEVEL_TARGETS[level];
  const target = Math.max(rng.int(lo, hi), forced.length);
  const chosen = [];
  for (const id of forced) {
    const s = getScenario(id);
    const clash = chosen.find((c) => !compatible(c, s));
    if (clash) throw new RangeError(`scenarios ${clash.id} and ${s.id} cannot be combined`);
    chosen.push(s);
  }
  while (chosen.length < target) {
    const pool = SCENARIOS.filter((s) => !chosen.includes(s) && chosen.every((c) => compatible(c, s)) && s.applies(d, null));
    const weights = pool.map((s) => Math.max(0, typeof s.weight === 'function' ? s.weight(d) : s.weight));
    const total = weights.reduce((a, b) => a + b, 0);
    if (!pool.length || total <= 0) break;
    let x = rng.uniform() * total, k = 0;
    while (k < pool.length - 1 && x >= weights[k]) { x -= weights[k]; k++; }
    chosen.push(pool[k]);
  }
  const picks = chosen.map((s) => ({ id: s.id, variant: rng.int(0, s.variants.length - 1), u: Array.from({ length: U_COUNT }, () => rng.uniform()) }));
  return { level, ids: chosen.map((s) => s.id), picks };
}

// ---------------------------------------------------------------------------------------------
// Effect resolution

const roundHours = (x) => (x < 1 ? Math.round(x * 4) / 4 : Math.round(x * 2) / 2);
const fmtHours = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const lerp = (lo, hi, u) => lo + (hi - lo) * u;
const isRange = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number');

/** Replace every [lo, hi] in an effects object with a value drawn from the pick's uniforms (in key order). */
export function resolveEffects(effects, u) {
  let i = 0;
  const next = () => { if (i >= 12) throw new RangeError('scenario effects use more than 12 ranges'); return u[i++]; };
  const walk = (v, key) => {
    if (isRange(v)) {
      const [lo, hi] = v, x = next();
      if (key === 'first') return Math.min(hi, lo + Math.floor(x * (hi - lo + 1)));
      const val = lerp(lo, hi, x);
      if (key === 'coHbPercent') return Math.round(val * 10) / 10;
      return /Hours$/.test(key) ? roundHours(val) : Math.round(val * 1e4) / 1e4;
    }
    if (Array.isArray(v)) return v.map((e) => walk(e, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, walk(e, k)]));
    return v;
  };
  return walk(effects, '');
}

const prod = (xs) => xs.reduce((a, b) => a * b, 1);
const defined = (xs) => xs.filter((x) => x !== undefined);

/** Combine the resolved effects of all picks. Multipliers multiply, probabilities take the larger value, flags OR together. */
function mergeEffects(list) {
  const get = (path) => list.map((e) => path.reduce((o, k) => o?.[k], e));
  const out = { preTest: {}, physiology: {}, volumes: {}, dlco: {}, maneuver: {}, report: {}, traceFaults: {} };
  for (const e of list) {
    const { notes, ...rest } = e.preTest ?? {};
    Object.assign(out.preTest, rest);
    if (notes) out.preTest.notes = [...(out.preTest.notes ? [out.preTest.notes] : []), notes].join('; ');
    for (const [k, arr] of Object.entries(e.traceFaults ?? {})) out.traceFaults[k] = [...new Set([...(out.traceFaults[k] ?? []), ...arr])];
  }
  const shift = defined(get(['physiology', 'baselineShiftToPost']));
  if (shift.length) out.physiology.baselineShiftToPost = 1 - prod(shift.map((s) => 1 - s));
  for (const k of ['postResponseMult', 'fvcMult', 'fev1Mult']) {
    const v = defined(get(['physiology', k]));
    if (v.length) out.physiology[k] = prod(v);
  }
  const po = list.map((e) => e.physiology?.preOnlyMult).filter(Boolean);
  if (po.length) out.physiology.preOnlyMult = { fvc: prod(po.map((p) => p.fvc ?? 1)), fev1: prod(po.map((p) => p.fev1 ?? 1)) };
  for (const k of ['frcMult', 'ervMult', 'icMult']) {
    const v = defined(get(['volumes', k]));
    if (v.length) out.volumes[k] = prod(v);
  }
  if (get(['volumes', 'vaFollowsTlc']).some(Boolean)) out.volumes.vaFollowsTlc = true;
  for (const k of ['mult', 'vaMult']) {
    const v = defined(get(['dlco', k]));
    if (v.length) out.dlco[k] = prod(v);
  }
  const vi = defined(get(['dlco', 'viFraction']));
  if (vi.length) out.dlco.viFraction = Math.min(...vi);
  const co = defined(get(['dlco', 'coHbPercent']));
  if (co.length) out.dlco.coHbPercent = Math.max(...co);
  if (get(['dlco', 'coHbMeasured']).some(Boolean)) out.dlco.coHbMeasured = true;
  if (get(['dlco', 'hbAvailable']).some((x) => x === false)) out.dlco.hbAvailable = false;

  const fp = {};
  for (const e of list) for (const [k, p] of Object.entries(e.maneuver?.faultProb ?? {})) fp[k] = Math.max(fp[k] ?? 0, p);
  if (Object.keys(fp).length) out.maneuver.faultProb = fp;
  const forced = list.flatMap((e) => e.maneuver?.forced ?? []);
  if (forced.length) out.maneuver.forced = forced;
  const eff = list.map((e) => e.maneuver?.effort).filter(Boolean);
  if (eff.length) out.maneuver.effort = { fvc: prod(eff.map((x) => x.fvc ?? 1)), fev1: prod(eff.map((x) => x.fev1 ?? 1)), r: Math.max(...eff.map((x) => x.r ?? 0)) };
  const dec = defined(get(['maneuver', 'decline', 'perBlow']));
  if (dec.length) out.maneuver.decline = { perBlow: Math.max(...dec) };
  for (const k of ['maxManeuvers', 'postMaxManeuvers']) {
    const v = defined(get(['maneuver', k]));
    if (v.length) out.maneuver[k] = Math.min(...v);
  }
  if (get(['report', 'forcePostBd']).some(Boolean)) out.report.forcePostBd = true;
  return out;
}

// ---------------------------------------------------------------------------------------------
// What the laboratory enters: height, sex, group

const clampU = (u) => Math.min(Math.max(u, 1e-6), 1 - 1e-6);
const half = (x) => Math.round(x * 2) / 2;
const sexWord = (s) => (s === 'M' ? 'male' : 'female');
const other = (s) => (s === 'M' ? 'F' : 'M');

/**
 * Height the laboratory enters when standing height is unavailable. The individual's measured proxy (arm span,
 * ulna length) scatters around its population ratio; the laboratory converts with a fixed ratio, so the stated
 * height differs from the true one. All constants are unverified (src/scenarios/constants.js).
 */
function heightModel(method, d, u, labSex) {
  const trueCm = d.heightCm, sex = d.sex;
  const z = normQuantile(clampU(u[12]));
  const source = { 'arm-span': 'arm-span', kyphoscoliosis: 'arm-span', 'half-span': 'arm-span', ulna: 'ulna', chart: 'reported' }[method];
  if (method === 'chart') {
    const [lo, hi] = C.chartHeightOverstatementCm.range;
    const statedCm = half(trueCm + lerp(lo, hi, u[12]));
    return { method, source, trueCm, statedCm, note: `Height carried over from an earlier record (${statedCm.toFixed(1)} cm); not remeasured.` };
  }
  if (method === 'ulna') {
    const ratio = C.ulnaToHeightRatio.value;
    const ulnaCm = Math.round(trueCm * ratio * (1 + C.ulnaIndividualSd.value * z) * 10) / 10;
    const statedCm = half(ulnaCm / ratio);
    return { method, source, trueCm, statedCm, ulnaCm, note: `Height estimated from ulna length (${ulnaCm.toFixed(1)} cm).` };
  }
  const sd = method === 'half-span' ? C.halfSpanIndividualSd.value : C.armSpanIndividualSd.value;
  const spanCm = half(trueCm * (C.armSpanMeanRatio[sex] + sd * z));
  // The laboratory converts with the divisor of the sex it entered, which can differ from the patient's birth sex.
  const divisor = u[13] < 0.7 ? C.armSpanDivisor[labSex] : C.armSpanDivisor.singleAlternative;
  const statedCm = half(spanCm / divisor);
  const out = { method, source, trueCm, statedCm, spanCm, divisor };
  if (method === 'kyphoscoliosis') {
    const [lo, hi] = C.standingHeightLossKyphoscoliosis.range;
    out.standingCm = half(trueCm * (1 - lerp(lo, hi, u[14])));
    out.note = `Standing height ${out.standingCm.toFixed(1)} cm is unreliable (spinal curvature); height estimated from arm span ${spanCm.toFixed(1)} cm divided by ${divisor.toFixed(2)}.`;
  } else if (method === 'half-span') {
    out.note = `Height estimated as twice the half arm span (${(spanCm / 2).toFixed(1)} cm), divided by ${divisor.toFixed(2)}.`;
  } else {
    out.note = `Height estimated from arm span ${spanCm.toFixed(1)} cm divided by ${divisor.toFixed(2)}.`;
  }
  return out;
}

function sexModel(spec, d, u) {
  const birth = d.sex;
  if (spec.use === 'identity') {
    const used = other(birth);
    return { used, birth, identityWord: sexWord(used), birthWord: sexWord(birth), usedWord: sexWord(used), note: `Reference sex ${sexWord(used)}: the sex the patient identifies with, which differs from the sex assigned at birth (${sexWord(birth)}).` };
  }
  if (spec.use === 'default') {
    const used = u[12] < 0.5 ? 'M' : 'F';
    return { used, birth, identityWord: 'not disclosed', birthWord: sexWord(birth), usedWord: sexWord(used), note: `Sex not disclosed; the laboratory default (${sexWord(used)}) was used for the reference values.` };
  }
  const identityWord = spec.identityDraw > 0.85 ? 'nonbinary' : sexWord(other(birth));
  return { used: birth, birth, identityWord, birthWord: sexWord(birth), usedWord: sexWord(birth), note: `Reference sex ${sexWord(birth)}: sex assigned at birth, the laboratory default (ATS/ERS 2019). The patient identifies as ${identityWord}.` };
}

// ---------------------------------------------------------------------------------------------
// Text

function renderTemplate(template, vars, id) {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in vars)) throw new Error(`scenario ${id}: template placeholder {${name}} has no value`);
    return vars[name];
  });
}

const joinBlows = (idx) => (idx.length <= 1 ? idx.map((i) => i + 1).join('') : `${idx.slice(0, -1).map((i) => i + 1).join(', ')} and ${idx[idx.length - 1] + 1}`);
const list = (xs, dp, unit) => xs.map((x) => x.toFixed(dp)).join(', ') + (unit ? ` ${unit}` : '');

/**
 * Build the plan for a case.
 * @param {{ selection: Selection, descriptor: object }} args
 */
export function applyScenarios({ selection, descriptor: d }) {
  const resolved = selection.picks.map((p) => {
    const scn = getScenario(p.id);
    const fx = resolveEffects(scn.effects, p.u);
    return { ...p, scn, fx, result: fx.referenceSex ? sexModel(fx.referenceSex, d, p.u) : null };
  });
  const labSex = resolved.find((p) => p.fx.referenceSex)?.result.used ?? d.sex;
  const picks = resolved.map((p) => (p.fx.height ? { ...p, result: heightModel(p.fx.height.method, d, p.u, labSex) } : p));
  const merged = mergeEffects(picks.map((p) => p.fx));
  const heightPick = picks.find((p) => p.fx.height);
  const sexPick = picks.find((p) => p.fx.referenceSex);
  const groupPick = picks.find((p) => p.fx.group);
  const lab = {
    heightCm: heightPick ? Math.min(Math.max(heightPick.result.statedCm, 130), 215) : d.heightCm,
    sex: sexPick ? sexPick.result.used : d.sex,
    group: groupPick ? groupPick.fx.group : d.group,
    hbAvailable: merged.dlco.hbAvailable !== false,
  };

  const plan = {
    active: true,
    selection,
    picks,
    merged,
    lab,
    forcePostBd: Boolean(merged.report.forcePostBd),

    /** Demographics hook: what the laboratory enters on the report. */
    demographics: () => ({ heightCm: lab.heightCm, sex: lab.sex, group: lab.group, hbGdl: lab.hbAvailable ? d.hbGdl : null }),

    /** Physiology hook: the true values with the documented acute effects applied. */
    physiology: (truth) => applyAcuteEffects(truth, merged.physiology),

    /** Maneuver hook: options for generateManeuvers. */
    maneuver(which) {
      const m = merged.maneuver;
      if (which === 'post') return m.postMaxManeuvers ? { maxManeuvers: m.postMaxManeuvers } : null;
      const { postMaxManeuvers, ...rest } = m;
      return Object.keys(rest).length ? rest : null;
    },

    /** Volume hook: modify the measured components; TLC, RV and VC are derived by the caller so the identities stay exact. */
    volumeComponents({ frc, erv, ic }) {
      const v = merged.volumes;
      const f = frc * (v.frcMult ?? 1);
      const e = Math.min(erv * (v.ervMult ?? 1), 0.85 * f);
      const i = ic * (v.icMult ?? 1);
      return { frc: f, erv: e, ic: i };
    },

    /** Diffusing-capacity hook: multipliers, incomplete inhalation, carboxyhemoglobin. Returns the measured (Hb-corrected-truth) values. */
    dlcoParts({ corrected, va, tlc, vc, tlcRatio }) {
      const x = merged.dlco;
      let c = corrected * (x.mult ?? 1), v = va;
      if (x.coHbPercent !== undefined) c *= cohbDlcoFactor(x.coHbPercent);
      if (x.viFraction !== undefined) {
        const vNew = Math.max(0.6 * v, v - (0.95 - x.viFraction) * vc);
        c *= 1 - 0.5 * (1 - vNew / v); // unverified: half the proportional loss of VA is carried by the DLCO
        v = vNew;
      }
      if (x.vaMult !== undefined) v *= x.vaMult;
      if (merged.volumes.vaFollowsTlc) v *= tlcRatio;
      return { corrected: c, va: Math.min(v, 0.99 * tlc) };
    },

    /** Caveats that apply given the data present in the case. */
    caveatsFor(has) {
      const byId = new Map();
      for (const p of picks) for (const c of p.scn.caveats) {
        if (c.requires && !has[c.requires]) continue;
        const prior = byId.get(c.id);
        if (!prior) byId.set(c.id, { id: c.id, text: c.text, weight: c.weight });
        else if (c.weight === 'major') prior.weight = 'major';
      }
      return [...byId.values()].sort((a, b) => (a.weight === b.weight ? 0 : a.weight === 'major' ? -1 : 1));
    },

    /**
     * Description hook: assembles case.scenario once the maneuvers and report exist.
     * @param {{ report: object, pre: object, post: object|null, volumes: object|null, dlco: object|null, resolve: Function, truthHeightCm: number }} ctx
     */
    describe(ctx) {
      const { report, pre, post, resolve } = ctx;
      const mans = pre.maneuvers;
      const blowsOf = (fault) => joinBlows(mans.filter((m) => m.faults.includes(fault)).map((m) => m.index));
      const pauses = mans.filter((m) => m.pauseSeconds !== undefined).map((m) => m.pauseSeconds);
      const cctx = {
        d, bmi: d.weightKg / (d.heightCm / 100) ** 2, hb: d.hbGdl, nBlows: mans.length,
        blows: blowsOf,
        pauseSeconds: pauses.length ? pauses.reduce((a, b) => a + b, 0) / pauses.length : 0,
        pefList: list(mans.slice(0, 3).map((m) => m.pef), 1, 'L/s'),
        fev1List: list(mans.slice(0, 3).map((m) => m.fev1), 2, 'L'),
        fev1Trend: list(mans.slice(0, 3).map((m) => m.fev1), 2, 'L'),
        result: null,
      };
      const has = { dlco: Boolean(ctx.dlco), volumes: Boolean(ctx.volumes), post: Boolean(post) };
      const statements = [], comments = [];
      for (const p of picks) {
        const fx = { ...p.fx, hours: fmtHours };
        const vars = p.scn.vars(fx, { ...cctx, result: p.result });
        const n = p.scn.variants.length;
        const render = (t) => renderTemplate(t, vars, p.id);
        statements.push({ id: p.id, category: p.scn.category, text: render(p.scn.variants[p.variant]) });
        const own = p.scn.comments.length ? p.scn.comments[p.variant % p.scn.comments.length] : p.scn.variants[(p.variant + 1) % n];
        comments.push(render(own));
      }
      const caveats = plan.caveatsFor(has);
      const caveatIds = new Set(caveats.map((c) => c.id));
      const seen = new Set();
      const decoys = [];
      for (const p of picks) for (const c of p.scn.decoyCaveats) {
        if (caveatIds.has(c.id) || seen.has(c.id)) continue;
        seen.add(c.id); decoys.push({ id: c.id, text: c.text });
      }

      const hp = heightPick?.result;
      const height = hp
        ? { statedCm: lab.heightCm, trueCm: d.heightCm, source: hp.source, note: hp.note }
        : { statedCm: d.heightCm, trueCm: d.heightCm, source: 'measured', note: '' };
      if (hp) {
        const atTrue = interpret({ ...report, patient: { ...report.patient, heightCm: d.heightCm } }, resolve, 'GLIglobal');
        const used = interpret(report, resolve, 'GLIglobal');
        height.zAtTrueHeight = Object.fromEntries(['fev1', 'fvc', 'fev1_fvc', 'tlc'].filter((k) => atTrue.measures[k]?.z !== undefined && used.measures[k]?.z !== undefined).map((k) => [k, { stated: used.measures[k].z, atTrueHeight: atTrue.measures[k].z }]));
      }

      const sp = sexPick?.result;
      const referenceSex = sp
        ? { used: sp.used, birth: sp.birth, note: sp.note }
        : { used: d.sex, birth: d.sex, note: '' };
      if (sp) {
        const alt = other(sp.used);
        const a = interpret(report, resolve, 'GLIglobal');
        const b = interpret({ ...report, patient: { ...report.patient, sex: alt } }, resolve, 'GLIglobal');
        const keys = ['fev1', 'fvc', 'fev1_fvc', 'tlc', 'dlco'].filter((k) => a.measures[k]?.z !== undefined && b.measures[k]?.z !== undefined);
        referenceSex.alternative = {
          sex: alt,
          pattern: b.pattern,
          patternUsed: a.pattern,
          z: Object.fromEntries(keys.map((k) => [k, { used: a.measures[k].z, alternative: b.measures[k].z }])),
          labelChanges: keys.filter((k) => a.measures[k].label !== b.measures[k].label).map((k) => ({ measure: k, from: a.measures[k].label, to: b.measures[k].label })),
        };
      }

      const { notes, ...preRest } = merged.preTest;
      const deviations = picks.map((p) => p.scn.deviation).filter(Boolean);
      const noteParts = [...(notes ? [notes] : []), ...deviations];
      const preTest = { ...preRest, ...(noteParts.length ? { notes: [...new Set(noteParts)].join('; ') } : {}) };

      const forcedFaults = (merged.maneuver.forced ?? []).map((f) => f.fault);
      return {
        level: d.scenarioLevel ?? selection.level,
        ids: selection.ids,
        statements,
        technologistComments: comments,
        caveats,
        decoyCaveats: decoys,
        preTest,
        height,
        referenceSex,
        coHbPercent: has.dlco && merged.dlco.coHbPercent !== undefined ? merged.dlco.coHbPercent : null,
        // Additive fields (not in the interface contract; consumers may ignore them).
        coHbMeasured: has.dlco && Boolean(merged.dlco.coHbMeasured),
        group: { used: lab.group, selfReported: d.group },
        hbAvailable: lab.hbAvailable,
        noncontributoryIds: picks.filter((p) => p.scn.noncontributory).map((p) => p.id),
        acute: merged.physiology,
        traceFaults: merged.traceFaults,
        forcedFaults: [...new Set(forcedFaults)].map((fault) => ({ fault, blows: mans.filter((m) => m.faults.includes(fault)).map((m) => m.index + 1) })),
        effectSizes: 'unverified',
      };
    },
  };
  return plan;
}

/** The case.scenario value of a case with no scenarios. */
export function emptyScenario(d) {
  return {
    level: 'none', ids: [], statements: [], technologistComments: [], caveats: [], decoyCaveats: [], preTest: {},
    height: { statedCm: d.heightCm, trueCm: d.heightCm, source: 'measured', note: '' },
    referenceSex: { used: d.sex, birth: d.sex, note: '' },
    coHbPercent: null,
    coHbMeasured: false,
    group: { used: d.group, selfReported: d.group },
    hbAvailable: true,
    noncontributoryIds: [],
    acute: {},
    traceFaults: {},
    forcedFaults: [],
    effectSizes: 'unverified',
  };
}
