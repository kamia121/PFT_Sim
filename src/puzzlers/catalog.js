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
]);

export function findPuzzler(id) {
  const c = PUZZLERS.find((item) => item.id === id);
  if (!c) throw new RangeError('Unknown puzzler');
  return c;
}
