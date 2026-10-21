/**
 * Closed vocabulary of the written-impression grader. Hand-written; nothing here is learned or fitted, and nothing is a threshold.
 * An entry is [class, value, phrase]; phrases are matched on normalized tokens, longest phrase first.
 *
 * Classes: HEAD (a thing being talked about), VAL (a value word), SEV (a severity word), ADV (ignored modifier), NEG, POSTNEG, HEDGE, SOFT,
 * LIMIT (cue that the claim is conditional or limited), COND (clause-wide conditional), ATTRIB (source noun), SAYV (reporting verb), FIRST (first person),
 * CORR (self-correction), NOTDONE, RESPW (response word), RED (reduction noun), ADJ (adjusted/corrected), HB, COHB.
 */

/** @type {Array<[string, string, string]>} */
const E = [];
const add = (c, v, ...phrases) => { for (const p of phrases) E.push([c, v, p]); };

add('HEAD', 'obs', 'obstruction', 'obstructive', 'obstructed', 'obstruct', 'obstr', 'obst', 'airflow obstruction', 'airflow limitation', 'airflow limited', 'obstructive ventilatory defect');
add('HEAD', 'res', 'restriction', 'restrictive', 'restricted', 'restrict', 'restr');
add('HEAD', 'mix', 'mixed');
add('HEAD', 'prism', 'prism', 'preserved ratio impaired spirometry');
add('HEAD', 'nsp', 'nonspecific', 'non specific', 'unspecific');
add('HEAD', 'ratio', 'fev1 / fvc', 'fev1/fvc', 'fev1 fvc ratio', 'fev1fvc', 'ratio', 'tiffeneau');
add('HEAD', 'fev1', 'fev1');
add('HEAD', 'fvc', 'fvc');
add('HEAD', 'spiro', 'spirometry', 'spirometric', 'spiro');
add('HEAD', 'study', 'pft', 'pfts', 'pulmonary function', 'pulmonary function test', 'pulmonary function tests', 'lung function', 'study', 'studies', 'test', 'tests', 'results', 'overall', 'everything', 'all');
add('HEAD', 'tlc', 'tlc', 'total lung capacity');
add('HEAD', 'vol', 'lung volumes', 'lung volume', 'volumes', 'volume', 'plethysmography', 'plethysmographic', 'pleth', 'body box', 'rv', 'frc', 'residual volume');
add('HEAD', 'hyper', 'hyperinflation', 'hyperinflated', 'air trapping', 'gas trapping', 'trapping');
add('HEAD', 'bd', 'bronchodilator', 'bronchodilators', 'bronchodilation', 'bd', 'bdr', 'bdt', 'albuterol', 'salbutamol', 'reversibility');
add('HEAD', 'dlco', 'dlco', 'tlco', 'dlcoc', 'dlcoadj', 'diffusing capacity', 'diffusion capacity', 'diffusion', 'diffusing', 'gas transfer', 'transfer factor');
add('HEAD', 'kco', 'kco', 'dlco / va', 'dlco/va', 'transfer coefficient');
add('HEAD', 'va', 'va', 'alveolar volume');
add('HEAD', 'qual', 'quality', 'effort', 'efforts', 'technique', 'repeatability', 'reproducibility', 'acceptability', 'validity', 'maneuvers', 'manoeuvres', 'maneuver', 'test quality');
add('HEAD', 'defect', 'defect', 'impairment', 'abnormality', 'limitation', 'ventilatory defect', 'deficit', 'abnormalities');
add('HB', 'hb', 'hemoglobin', 'haemoglobin', 'hb', 'hgb');
add('COHB', 'cohb', 'carboxyhemoglobin', 'carboxyhaemoglobin', 'cohb', 'co hb');
add('ADJ', 'adj', 'adjusted', 'corrected', 'adjustment', 'correcting', 'adjusting');

add('VAL', 'low', 'reduced', 'low', 'decreased', 'impaired', 'diminished', 'lowered', 'subnormal', 'depressed', 'reduction', 'decrease', 'down', 'dec', 'decr', 'below normal', 'below lln', 'below the lln', 'below the lower limit of normal', 'below lower limit of normal', 'lower');
add('VAL', 'high', 'increased', 'elevated', 'high', 'raised', 'higher', 'supranormal', 'above normal', 'above uln', 'increase', 'inc', 'incr', 'up');
add('VAL', 'norm', 'normal', 'wnl', 'within normal limits', 'within normal range', 'within normal', 'within limits', 'unremarkable', 'preserved', 'intact', 'nl', 'nml', 'ok', 'okay', 'normal limits');
add('VAL', 'abn', 'abnormal');
add('VAL', 'sig', 'significant', 'sig', 'pos', 'positive', 'responsive', 'reversible', 'improved', 'improvement', 'responder', 'clinically significant', 'responds');
add('VAL', 'nsig', 'negative', 'neg', 'insignificant', 'nonsignificant', 'non significant', 'unresponsive', 'nonresponsive', 'non responsive', 'irreversible', 'fixed');
add('VAL', 'notgraded', 'not graded', 'ungraded', 'no grade', 'not gradable');
add('VAL', 'qlim', 'poor', 'suboptimal', 'limited', 'unreliable', 'inadequate', 'submaximal', 'unacceptable', 'invalid', 'variable', 'not acceptable', 'low quality', 'technically limited', 'interpret with caution', 'grade d', 'grade e', 'grade u', 'grade f');
add('VAL', 'qgood', 'good', 'adequate', 'acceptable', 'satisfactory', 'excellent', 'meets criteria', 'reproducible', 'high quality', 'well performed', 'grade a', 'grade b');

add('SEV', 'mild', 'mild');
add('SEV', 'moderate', 'moderate', 'mod');
add('SEV', 'severe', 'severe', 'sev');
add('SEV', 'other', 'moderately severe', 'very severe', 'minimal', 'slight', 'marked', 'profound', 'extreme', 'end stage', 'gold');
add('ADV', 'adv', 'mildly', 'moderately', 'severely', 'markedly', 'slightly', 'significantly', 'clinically', 'very', 'somewhat', 'only', 'quite', 'mostly', 'also', 'definitely', 'clearly', 'pure', 'purely', 'solely', 'exclusively', 'lln', 'uln', 'lower limit of normal', 'upper limit of normal');

add('NEG', 'neg', 'no', 'not', 'without', 'never', 'neither', 'nor', 'dont', 'doesnt', 'isnt', 'wasnt', 'arent', 'didnt', 'nothing', 'none', 'negative for', 'free of', 'absence of', 'lack of', 'lacks', 'no evidence of', 'non', 'rules out', 'ruling out');
add('POSTNEG', 'postneg', 'absent', 'excluded', 'ruled out', 'not present', 'not seen', 'not found', 'not identified', 'not evident');
add('HEDGE', 'hedge', 'possible', 'possibly', 'probable', 'probably', 'likely', 'may', 'might', 'could', 'perhaps', 'maybe', 'questionable', 'uncertain', 'unclear', 'equivocal', 'vs', 'versus', 'differential', 'unlikely', 'borderline', 'suspect', 'suspected', 'suspicious', 'query', 'cannot exclude', 'cannot rule out', 'cant exclude', 'cant rule out', 'not excluded', 'not purely', 'not solely', 'not simply', 'not just', 'not only', 'not merely', 'r/o', 'rule out');
add('SOFT', 'soft', 'suggests', 'suggest', 'suggesting', 'suggestive', 'consistent with', 'compatible with', 'in keeping with', 'evidence of', 'indicates', 'indicative');
add('LIMIT', 'limit', 'cannot', 'cant', 'unable', 'needs', 'need', 'needed', 'requires', 'require', 'required', 'recommend', 'recommended', 'advise', 'not able', 'not possible', 'not certain', 'not sure', 'cannot say', 'cant say', 'cannot tell', 'cant tell', 'not clear', 'to confirm', 'to exclude', 'to assess', 'to evaluate', 'to determine', 'until', 'not confirmed', 'unconfirmed', 'not established', 'not proven', 'not demonstrated', 'not diagnostic', 'not assessed', 'not determined', 'undetermined', 'not assessable', 'not evaluable');
add('COND', 'cond', 'if', 'unless', 'when', 'once', 'pending', 'awaiting', 'should', 'would', 'whether');
add('ATTRIB', 'src', 'per', 'report', 'technologist', 'tech', 'rt', 'therapist', 'lab', 'laboratory', 'software', 'computer', 'patient', 'referring', 'summary', 'according to', 'per the report', 'as per');
add('SAYV', 'say', 'says', 'said', 'states', 'stated', 'shows', 'showed', 'lists', 'listed', 'flags', 'flagged', 'reads', 'reports', 'reported', 'notes', 'noted', 'indicated', 'claims', 'thinks', 'mentions', 'printed', 'prints', 'grades', 'graded', 'rates', 'gives', 'assigns', 'describes', 'described', 'calls', 'called', 'labels', 'labelled');
add('FIRST', 'first', 'i', 'my', 'me', 'we', 'our', 'mine');
add('CORR', 'corr', 'actually', 'correction', 'rather', 'sorry', 'scratch that', 'wait', 'instead', 'mistake', 'oops', 'i mean');
add('NOTDONE', 'nd', 'performed', 'done', 'measured', 'obtained', 'available', 'given', 'administered', 'tested', 'testing', 'data', 'undertaken', 'missing', 'unavailable', 'omitted', 'deferred', 'na', 'n/a', 'include', 'included', 'recorded');
add('RESPW', 'resp', 'resp', 'response', 'responsiveness', 'improvement', 'change', 'benefit', 'reversibility');
add('RED', 'red', 'defect', 'impairment', 'abnormality', 'reduction', 'decrease', 'limitation', 'problem', 'issue');

/** Closed set of domain nouns that may be repaired when misspelled; never a value, negation or hedge word. */
export const NOUN_TARGETS = ['obstruction', 'obstructive', 'restriction', 'restrictive', 'bronchodilator', 'spirometry', 'diffusing', 'diffusion', 'hyperinflation', 'reversibility', 'hemoglobin', 'haemoglobin', 'carboxyhemoglobin', 'nonspecific', 'plethysmography', 'abnormality', 'impairment', 'response'];

/** Words that mark a clause as addressed to the grader or the system rather than a clinical statement. */
export const INJECTION = /\b(ignore|disregard|override|forget|bypass)\b[^.;\n]{0,60}\b(rubric|rules?|instructions?|grader|grading|scor\w*|previous|prior|above|key)\b|\bfull\s+(credit|marks?|points|score)\b|\b(give|award|assign|mark|grade|score)\b[^.;\n]{0,30}\b(100|full|perfect|maximum|all\s+correct|as\s+correct)\b|\bsystem\s*:|\bassistant\s*:|\bas an ai\b|\bgrader\b|\brubric\b|\b(you are|act as)\b[^.;\n]{0,20}\b(grader|assistant|ai)\b|\bscore\b[^.;\n]{0,10}\b100\b/i;

const EN = 'the a an and or of to in on with for is are was were be been it this that these those at as by from but if then than so such there here which who whom what has have had will would can could should do does did am i my me we our you your they their he she his her its one two three also very more most some any each both only just still yet about after before over under between into per via vs patient pt study test tests report shows show showed see seen noted note impression interpretation findings finding pattern consistent likely based'.split(' ');
export const ENGLISH_FUNCTION = new Set(EN);
/** Ordinary words that sit close to a domain noun and must never be repaired to it. */
const NEAR_MISS = ['construction', 'destruction', 'instruction', 'instructions', 'reconstruction', 'abstraction', 'distraction', 'obstructions', 'restrictions', 'restrictions', 'attraction', 'extraction', 'contraction', 'diffusions', 'responses', 'responsive', 'responder'];
const FOREIGN = 'el la los las de del con sin muy leve moderada moderado grave obstrucción restricción broncodilatador respuesta significativa normal y es una un por para le les des du une avec sans pas très légère modérée sévère obstruction est der die das und mit ohne kein keine leicht mittelgradig schwer ist nicht eine ein von zu bei sem nao resposta respuesta sans'.split(' ').filter((w) => !['normal', 'obstruction', 'de', 'a', 'no'].includes(w));
export const FOREIGN_WORDS = new Set(FOREIGN);

/** Words near which an unrecognized token suggests the trainee wrote a domain word that could not be read. */
export const UNREAD_ANCHORS = {
  pattern: ['obstruction', 'restriction', 'obstructive', 'restrictive', 'normal'],
  bd: ['bronchodilator', 'reversibility', 'significant', 'negative'],
  dlco: ['diffusing', 'diffusion', 'dlco', 'reduced', 'normal', 'increased', 'elevated'],
  severity: ['moderate', 'severe', 'mild'],
};

/** Phrase index: first token -> entries, longest first. */
export const INDEX = (() => {
  const m = new Map();
  for (const [c, v, p] of E) {
    const w = p.split(' ').flatMap((x) => (x.includes('/') && x.length > 1 ? x.split(/(\/)/).filter(Boolean) : [x]));
    if (!m.has(w[0])) m.set(w[0], []);
    m.get(w[0]).push({ c, v, w });
  }
  for (const l of m.values()) l.sort((a, b) => b.w.length - a.w.length);
  return m;
})();

/** Every word the vocabulary knows (first words are not enough: used so that known words are never repaired or flagged as unread). */
export const KNOWN_WORDS = (() => {
  const s = new Set([...ENGLISH_FUNCTION, ...NEAR_MISS]);
  for (const l of INDEX.values()) for (const e of l) for (const w of e.w) s.add(w);
  return s;
})();
