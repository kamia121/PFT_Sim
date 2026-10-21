/**
 * The concise interpretation summary of the report: the main impression first, then short labelled lines that carry the findings, the
 * basis on which each was classified, and the caveats that bear on them. It is a deterministic function of the interpretation (the key,
 * the z-scores and the case), so the report, the practice page, the standalone report and the printed copies show the same text. The
 * longer teaching explanation (src/interpret/narrative.js, `finalStatement`) is kept apart as the supporting explanation; nothing the
 * narrative says about quality, uncertainty or limits is dropped from the pair, only moved out of the paragraph a reader must get through first.
 * Classifications are those of interpret(); this module only words them.
 */
import { LLN_Z, TWO_SIDED, PATTERNS } from '../interpret/interpret.js';
import { hbKnown, coHbMeasured } from '../app/format.js';
import { cohbReferenceMultiplier } from '../core/physiology.js';
import { bdPctPredText } from '../interpret/precision.js';

const MINUS = '−';
const zt = (z) => `${z < 0 ? MINUS : ''}${Math.abs(z).toFixed(2)}`;
const word = (id, z) => (z < LLN_Z ? 'below LLN' : TWO_SIDED.has(id) && z > -LLN_Z ? 'above ULN' : 'within limits');

const HEAD = {
  normal: 'Normal spirometry',
  obstruction: 'Airflow obstruction',
  'obstruction-low-fvc': 'Airflow obstruction with a low FVC (lung volumes needed)',
  restriction: 'Restriction',
  mixed: 'Mixed obstruction and restriction',
  nonspecific: 'Nonspecific pattern (preserved ratio, low FVC or FEV₁, TLC not low)',
  prism: 'Preserved ratio with a low FVC or FEV₁ (PRISm; lung volumes needed)',
  indeterminate: 'Not interpretable',
};
const SUB = { 'low-kco-preserved-va': 'low KCO with preserved VA', 'low-va-high-kco': 'low VA with raised KCO', 'low-va-normal-kco': 'low VA with normal KCO', 'both-low': 'VA and KCO both low', 'low-dlco-only': 'VA and KCO individually within limits' };

/**
 * @param {{ caseData: object, interp: object, cmp?: object|null, caveats?: { major: string[], minor: string[] } }} a
 * @returns {{ impression: string, lines: { label: string, text: string }[] }}
 */
export function conciseSummary({ caseData, interp, cmp = null, caveats = { major: [], minor: [] } }) {
  const m = interp.measures;
  const has = (k) => m[k] && m[k].available !== false && Number.isFinite(m[k].z);
  const sev = interp.severity;
  const lines = [];

  // Impression: the pattern, its severity where the scale grades it, the findings that change what a reader does with it, and the standing of the study.
  let head = HEAD[interp.pattern] ?? PATTERNS[interp.pattern] ?? 'Not classified';
  if (sev?.scored) head += `, ${sev.id}`;
  else if (sev?.notGraded) head += ', not graded (FEV₁ within normal limits)';
  const extra = [];
  if (interp.flags.some((f) => f.id === 'hyperinflation')) extra.push('hyperinflation');
  if (interp.flags.some((f) => f.id === 'air-trapping')) extra.push('air trapping');
  if (interp.dlco && interp.dlco.category !== 'normal') extra.push(`${interp.dlco.category} DLCO`);
  if (interp.bd?.rule2022.significant) extra.push('a significant bronchodilator response');
  const joined = extra.length > 1 ? `${extra.slice(0, -1).join(', ')} and ${extra[extra.length - 1]}` : extra[0];
  let impression = `${head}${extra.length ? `${sev?.scored || sev?.notGraded ? ',' : ''} with ${joined}` : ''}.`;
  if (interp.dlco?.category === 'normal' && interp.pattern !== 'indeterminate') impression += ' DLCO normal.';
  if (interp.bd && !interp.bd.rule2022.significant) impression += ' No significant bronchodilator response.';
  if (interp.qualityLimited) impression += ' Test quality limits confidence in these values.';

  // Quality.
  const g = caseData.report?.grades;
  if (g?.fev1) {
    const post = caseData.spirometry?.post?.summary?.grades;
    lines.push({ label: 'Quality', text: `Grades FEV₁ ${g.fev1}, FVC ${g.fvc}${post ? ` (after bronchodilator ${post.fev1}, ${post.fvc})` : ''}: ${interp.qualityLimited ? 'a grade of D or worse limits confidence in the values' : 'adequate for interpretation'}.` });
  }

  // Spirometry and severity.
  const sp = ['fev1_fvc', 'fev1', 'fvc'].filter(has).map((k) => `${{ fev1_fvc: 'FEV₁/FVC', fev1: 'FEV₁', fvc: 'FVC' }[k]} ${zt(m[k].z)}${m[k].z < LLN_Z ? ' (low)' : ''}`);
  let spText = sp.length ? `z-scores ${sp.join(', ')}.` : '';
  if (sev?.scored) spText += ` Severity ${sev.id} by the FEV₁ z-score (2022 scale: mild to ${MINUS}2.5, moderate to ${MINUS}4.0, severe below).`;
  else if (sev?.notGraded) spText += ` Severity not graded: the FEV₁ is within the normal range of the 2022 scale, which defines bands only below the LLN; a low ratio with normal FEV₁ and FVC may be a normal variant.`;
  else if (interp.pattern !== 'normal' && interp.pattern !== 'indeterminate') spText += ' Severity not graded for this pattern.';
  if (spText) lines.push({ label: 'Spirometry', text: spText.trim() });

  // Lung volumes.
  if (has('tlc')) {
    const parts = [`TLC ${zt(m.tlc.z)} (${m.tlc.z < LLN_Z ? 'reduced: restriction' : m.tlc.z > -LLN_Z ? 'above ULN: hyperinflation' : 'not reduced: no restriction'})`];
    const abn = ['rv', 'rv_tlc'].filter((k) => has(k) && word(k, m[k].z) !== 'within limits');
    if (abn.length) parts.push(`${abn.map((k) => `${{ rv: 'RV', rv_tlc: 'RV/TLC' }[k]} ${zt(m[k].z)}`).join(', ')} ${abn.every((k) => m[k].z > 0) ? 'above ULN: air trapping' : 'outside limits'}`);
    lines.push({ label: 'Lung volumes', text: `z-scores ${parts.join('; ')}.` });
  }

  // Diffusing capacity, with the basis of the classification.
  const dl = caseData.dlco;
  if (interp.dlco && has('dlco')) {
    const hb = hbKnown(dl);
    const basis = hb ? 'measured value against the reference adjusted for hemoglobin' : 'no hemoglobin available: reference not adjusted';
    const sub = interp.dlco.subtype && SUB[interp.dlco.subtype] ? `; ${SUB[interp.dlco.subtype]}` : '';
    let text = `${interp.dlco.category[0].toUpperCase()}${interp.dlco.category.slice(1)}, z ${zt(m.dlco.z)}${sub}; ${basis}.`;
    const sc = caseData.scenario;
    if (coHbMeasured(sc) && cohbReferenceMultiplier(sc.coHbPercent) !== null) text += ` COHb ${sc.coHbPercent.toFixed(1)}% is above 2%: the supplementary COHb-adjusted line on the report is not the basis of this classification.`;
    else if (sc && Number.isFinite(sc.coHbPercent) && sc.coHbPercent > 0 && !coHbMeasured(sc)) text += ' COHb was not measured; recent smoking could lower the DLCO.';
    lines.push({ label: 'DLCO', text });
  }

  // Bronchodilator response.
  const bd = interp.bd;
  if (bd) {
    const which = bd.rule2022.which.length ? ` (${bd.rule2022.which.join(' and ')})` : '';
    let text = `${bd.rule2022.significant ? 'Significant' : 'Not significant'} by the 2022 rule${which}: change in FEV₁ ${bdPctPredText(bd.pctPred.fev1)}% and FVC ${bdPctPredText(bd.pctPred.fvc)}% of predicted (threshold above 10%).`;
    if (!bd.rulesAgree) text += ` The earlier rule (at least 12% and 200 mL) gives ${bd.rule2005.significant ? 'significant' : 'not significant'}.`;
    if (bd.discordant) text += ' FEV₁ and FVC responses are discordant.';
    lines.push({ label: 'Bronchodilator', text });
  }

  // Uncertainty: values near a limit and sensitivity to the reference equation.
  const nearLimit = (k) => Math.abs(m[k].z - LLN_Z) <= 0.25 || (TWO_SIDED.has(k) && Math.abs(m[k].z + LLN_Z) <= 0.25);
  const near = ['fev1', 'fvc', 'fev1_fvc', 'tlc', 'dlco'].filter((k) => has(k) && nearLimit(k)).map((k) => `${{ fev1: 'FEV₁', fvc: 'FVC', fev1_fvc: 'FEV₁/FVC', tlc: 'TLC', dlco: 'DLCO' }[k]} z ${zt(m[k].z)}`);
  const flips = cmp?.labelChanges ?? [];
  const unc = [];
  if (near.length) unc.push(`${near.join(', ')} ${near.length > 1 ? 'are' : 'is'} within 0.25 z of a limit, so the label could change under another reference equation or on repeat testing`);
  if (flips.length || cmp?.patternChanged || cmp?.bronchodilatorChanged || cmp?.severityChanged) unc.push('GLI-2012 and GLI Global classify this case differently');
  if (unc.length) lines.push({ label: 'Uncertainty', text: `${unc.join('; ')}.` });

  // Caveats of the session, one line each, and the reference population.
  for (const c of [...(caveats.major ?? []), ...(caveats.minor ?? [])]) lines.push({ label: 'Caveat', text: `${c.charAt(0).toUpperCase()}${c.slice(1)}.` });
  if (['tlc', 'dlco'].some((k) => m[k] && m[k].available !== false && m[k].matched === false)) lines.push({ label: 'Reference', text: 'The volume and DLCO references come from a European-ancestry population and may represent this patient less well; no ancestry adjustment is applied.' });

  return { impression, lines };
}

/** The summary as plain text: the impression, then one line per item. */
export const conciseText = ({ impression, lines }) => `Impression: ${impression}\n${lines.map((l) => `- ${l.label}: ${l.text}`).join('\n')}`;
