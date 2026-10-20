/**
 * Builds one case and its interpretations for the quiz.
 */
import { buildCase } from '../core/case.js';
import { interpret, compareEquations } from '../interpret/interpret.js';
import { descriptorExtras } from './adapters.js';

/**
 * @typedef {object} QuizContext
 * @property {Record<string, object>} datasets
 * @property {(measure: string, patient: object, family?: string) => object} resolve resolveReference
 * @property {'GLIglobal'|'GLI2012'} equation spirometry equation shown on the chart and used for the key
 * @property {object} adapters from loadAdapters()
 * @property {string[]} [skills] skills included, default all
 */

export const otherEquation = (eq) => (eq === 'GLIglobal' ? 'GLI2012' : 'GLIglobal');

/**
 * @param {object} descriptor { seed, archetype, severity, technique, panel, scenarioLevel? }
 * @param {QuizContext} ctx
 */
export function prepareCase(descriptor, ctx) {
  const { scenarioLevel, ...input } = descriptor;
  const extras = descriptorExtras(ctx.adapters, scenarioLevel);
  let caseData;
  try {
    caseData = buildCase({ ...input, ...extras }, ctx.datasets);
  } catch (e) {
    if (!Object.keys(extras).length) throw e;
    caseData = buildCase(input, ctx.datasets); // the installed generator does not accept the scenario field
  }
  const a = interpret(caseData.report, ctx.resolve, ctx.equation);
  const b = interpret(caseData.report, ctx.resolve, otherEquation(ctx.equation));
  const cmp = compareEquations(caseData.report, ctx.resolve, 'GLI2012', 'GLIglobal');
  return { caseData, a, b, cmp, equation: ctx.equation, descriptor };
}
