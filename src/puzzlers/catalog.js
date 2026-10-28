import { definePuzzler } from './session.js';

const ats2023 = ['ATS 2023: race and ethnicity in PFT interpretation', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10112445/'];
const ats2019 = ['ATS/ERS 2019: patient details', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6794117/'];
const ers2022 = ['ERS/ATS 2022: comparison with a healthy population', 'https://doi.org/10.1183/13993003.01499-2021'];
const foer = ['Foer 2021: reference inputs in transgender patients', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7919147/'];

/** Fixed synthetic raw values only. No numerical GLI outputs or unverified label changes are authored. */
export const PUZZLERS = Object.freeze([
  definePuzzler({
    id: 'same-breath-new-benchmark', version: 1, title: 'The lungs did not worsen overnight',
    intro: 'A Black patient brings two copies of the same acceptable study. The software prints different percent-predicted values. Investigate what changed before interpreting a trend.',
    measurements: [{ label: 'FEV₁, both copies', value: 2.7, unit: 'L' }, { label: 'FVC, both copies', value: 3.6, unit: 'L' }, { label: 'TLC, both copies', value: 5.4, unit: 'L' }],
    sources: [ats2023, ['GLI Global original study', 'https://pubmed.ncbi.nlm.nih.gov/36383197/']],
    stages: [
      { reveal: 'The measured liters, test date and quality assessment are identical. The reference headers are on the next page.',
        question: { id: 'check', domain: 'metadata', claims: ['reference.scope', 'reference.measurements', 'reference.inputs'], prompt: 'Which check best explains the discrepancy?', options: [['metadata', 'Compare equation family/version and demographic inputs'], ['decline', 'Call the change a physiological decline'], ['race', 'Apply a race adjustment to the measured liters']], accepted: ['metadata'], why: 'Identical measured values can receive different derived results when the reference model or its inputs change. Check the reference header before interpreting a trend.' } },
      { reveal: 'Copy A uses historical group-specific GLI-2012 spirometry. Copy B uses race-neutral GLI Global spirometry. Both use GLI-2021 for static lung volumes.',
        question: { id: 'domains', domain: 'metadata', claims: ['reference.scope', 'reference.measurements', 'reference.inputs'], prompt: 'Which comparison preserves the measurement/reference distinction?', options: [['same', 'Keep measured FEV₁/FVC/TLC fixed; compare spirometry reference outputs'], ['tlc2012', 'Compare GLI-2012 TLC with GLI-2021 TLC'], ['compensate', 'Assume a physiological racial compensation lowered measured FVC']], accepted: ['same'], why: 'GLI-2012 and Global provide spirometry references. GLI-2021 provides static-volume references. Race does not justify changing measured liters or adding a TLC adjustment factor.' } },
      { reveal: 'The patient asks whether the revised report proves disease, or proves the first report was normal.',
        question: { id: 'limits', domain: 'uncertainty', claims: ['reference.measurements'], prompt: 'Which conclusion is supported?', options: [['context', 'Explain the benchmark change and review quality, prior raw results and clinical context'], ['artifact', 'Any new abnormality must be an artifact'], ['disease', 'An equation switch establishes a new diagnosis']], accepted: ['context'], why: 'A reference change can affect classification without a measurement change. Discordance alone cannot settle disease; assess the complete study and context.' } },
    ],
  }),
  definePuzzler({
    id: 'registration-field-changed', version: 1, title: 'The demographic field changed, not the breath',
    intro: 'A transgender woman has two exports of one acceptable study after a registration update. The raw results agree. Identity and the sex input used by a reference model are separate information.',
    measurements: [{ label: 'FEV₁, both exports', value: 3.1, unit: 'L' }, { label: 'FVC, both exports', value: 4.2, unit: 'L' }],
    sources: [ats2019, ers2022, foer],
    stages: [
      { reveal: 'The registration system updated gender identity. The reference-input field is absent from the report export.',
        question: { id: 'input', domain: 'metadata', claims: ['reference.scope', 'reference.measurements', 'reference.inputs'], prompt: 'What should be checked before comparing percent predicted?', options: [['document', 'Ask respectfully and retrieve the actual reference input and measured height in each export'], ['guess', 'Infer the equation input from appearance or name'], ['normal', 'Choose the input that makes the study normal']], accepted: ['document'], why: 'Document the input actually used by the laboratory. Gender identity should not be guessed or silently substituted for a reference-model field.' } },
      { reveal: 'The laboratory confirms that the software changed its binary reference-sex input between exports. The equation family and measured values were unchanged.',
        question: { id: 'sensitivity', domain: 'uncertainty', claims: ['reference.inputs', 'reference.transgender-uncertainty'], prompt: 'How should the two calculations be described?', options: [['sensitivity', 'A sensitivity analysis of model input, with the laboratory approach and limitations documented'], ['true', 'The calculation matching identity is universally validated'], ['wrong', 'The identity update proves the original measurement was wrong']], accepted: ['sensitivity'], why: 'Changing an equation input can change derived results. Neither comparison validates an individual reference choice. Review the documented approach and the longitudinal raw values.' } },
      { reveal: 'Further history includes puberty suppression and gender-affirming hormones during adolescence. No numerical reference outputs or diagnostic category have been supplied.',
        question: { id: 'development', domain: 'uncertainty', claims: ['reference.transgender-uncertainty'], prompt: 'Which response acknowledges the evidence gap?', options: [['uncertain', 'Review developmental history and corroborating data; acknowledge uncertainty in reference selection'], ['switch', 'Automatically switch equations after a fixed hormone duration'], ['diagnosis', 'Assign a pulmonary diagnosis from gender identity']], accepted: ['uncertain'], why: 'The best reference equation for transgender patients is unresolved. A universal hormone-duration switch is not established; small adult studies do not validate adolescent prediction.' } },
    ],
  }),
  definePuzzler({
    id: 'normal-fev1-low-ratio', version: 1, title: 'A reassuring first-second volume',
    intro: 'An adult with exertional symptoms has a preserved FEV₁. The referral calls the study normal. Read the ratio before accepting the label.',
    measurements: [{ label: 'FEV₁', value: 4, unit: 'L' }, { label: 'FVC', value: 6, unit: 'L' }],
    sources: [ers2022, ['2024 authors clarification', 'https://doi.org/10.1183/13993003.00055-2024']],
    stages: [
      { reveal: 'The first page reports an FEV₁ within its reference range. Ratio limits and quality details are on the next page.',
        question: { id: 'ratio-check', domain: 'metadata', claims: ['reference.measurements'], prompt: 'What needs review before calling the study normal?', options: [['ratio', 'FEV₁/FVC against its reference limit, with test quality and metadata'], ['fev1', 'FEV₁ alone is enough to exclude obstruction'], ['copd', 'A large FVC establishes COPD']], accepted: ['ratio'], why: 'Obstruction is identified from a low ratio. FEV₁ and the ratio answer different questions.' } },
      { reveal: 'In this qualitative teaching scenario, the accepted report confirms FEV₁/FVC below LLN with FEV₁ above LLN. No numerical GLI prediction is implied by that condition.',
        question: { id: 'grade', domain: 'interpretation', claims: ['severity.obstruction-normal-fev1'], prompt: 'Which physiological interpretation follows under the 2024 authors clarification?', options: [['mild', 'Mild obstructive impairment'], ['normal', 'Normal spirometry because FEV₁ is normal'], ['ungraded', 'Obstruction cannot be graded when FEV₁ is normal']], accepted: ['mild'], why: 'The authors clarification grades low-ratio obstruction with a normal FEV₁ as mild. This is impairment grading, not a measure of overall disease severity.' } },
      { reveal: 'The FVC is large. There is no established pulmonary diagnosis and no longitudinal comparison yet.',
        question: { id: 'context', domain: 'uncertainty', claims: ['severity.obstruction-normal-fev1'], prompt: 'Which qualification is appropriate?', options: [['assess', 'Consider dysanapsis and assess symptoms, exposures, quality and prior results'], ['diagnose', 'The ratio alone proves COPD'], ['dismiss', 'A large FVC excludes clinically important disease']], accepted: ['assess'], why: 'A low ratio with preserved FEV₁ can occur with dysanapsis. The clinical setting and longitudinal results matter; the pattern alone is not a COPD diagnosis.' } },
    ],
  }),
  definePuzzler({
    id: 'normal-fvc-low-tlc', version: 1, title: 'The apparently reassuring spirometry',
    intro: 'An adult has spirometry described as within range, but the volume section has been flagged. Determine which result should settle the physiological question.',
    measurements: [{ label: 'FEV₁', value: 3, unit: 'L' }, { label: 'FVC', value: 3.7, unit: 'L' }, { label: 'TLC', value: 4.2, unit: 'L' }],
    sources: [ers2022, ['Restriction despite normal spirometry: original study', 'https://pubmed.ncbi.nlm.nih.gov/40927550/']],
    stages: [
      { reveal: 'The referral summary says that normal FVC rules out restriction. Plethysmography quality and its reference header have not yet been reviewed.',
        question: { id: 'volume-check', domain: 'metadata', claims: ['volume.restriction'], prompt: 'What is the most useful next check?', options: [['check', 'Review measured TLC, volume quality and reference metadata'], ['ignore', 'Ignore the volume section because FVC is normal'], ['adjust', 'Apply a race factor to TLC until it agrees']], accepted: ['check'], why: 'Review the available TLC and its reliability. A usual spirometric screening relationship should not override a directly available volume result.' } },
      { reveal: 'Assume the volume measurement and reference inputs are appropriate: TLC is below LLN, while FVC and FEV₁/FVC are not low. These are qualitative scenario conditions, not newly computed GLI outputs.',
        question: { id: 'restriction', domain: 'interpretation', claims: ['volume.restriction'], prompt: 'Which physiological pattern follows from those conditions?', options: [['restriction', 'Restrictive ventilatory impairment'], ['normal', 'Normal physiology because FVC is normal'], ['mixed', 'Mixed obstruction and restriction']], accepted: ['restriction'], why: 'TLC below LLN defines restrictive impairment. A normal ratio does not establish obstruction; normal FVC does not erase the measured TLC finding.' } },
      { reveal: 'The clinical team asks whether every patient with normal spirometry now needs lung-volume testing.',
        question: { id: 'scope', domain: 'uncertainty', claims: ['volume.restriction'], prompt: 'Which conclusion preserves the scope of the finding?', options: [['context', 'Use clinical probability and available test quality; this example is not a universal testing mandate'], ['all', 'Order volumes for every normal spirometry result'], ['ild', 'The discrepancy proves interstitial lung disease']], accepted: ['context'], why: 'This case addresses interpretation when volumes are already available. It does not specify a testing indication or establish the cause of restriction.' } },
    ],
  }),
]);

export function findPuzzler(id) {
  const c = PUZZLERS.find((item) => item.id === id);
  if (!c) throw new RangeError('Unknown puzzler');
  return c;
}
