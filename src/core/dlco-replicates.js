/** Deterministic synthetic acquisitions; clinical assessment/reporting stays in the pure session module. */
import { createStream } from './prng.js';
import { buildDlcoTrace } from './dlco-trace.js';
import { summarizeDlcoSession } from './dlco-session.js';

export function buildDlcoReplicates({ seed, truth, dlco, vcL, patient, technique, scenario, ratioZ }) {
  const tests = [], maneuvers = [];
  const stream = createStream(seed, 'dlco-replicates-v4');
  let session = summarizeDlcoSession({ maneuvers, vcL, completed: true });
  if (Number.isFinite(vcL) && vcL > 0) {
    for (let i = 1; i <= 5; i++) {
      const replicateSeed = stream.int(0, 0xffffffff);
      // Dispersion is a teaching choice, not a published frequency or uncertainty model.
      const raw = dlco.raw * Math.exp(.012 * stream.normal()), va = dlco.va * Math.exp(.006 * stream.normal());
      const trace = buildDlcoTrace({ seed: replicateSeed, truth, dlco: { raw, va }, volumes: { vc: vcL }, patient, technique, scenario, ratioZ, fullPrecisionQuality: true });
      trace.maneuverId = i;
      tests.push(trace);
      maneuvers.push({ id: i, dlco: trace.values.dlcoMlMinMmHg, vaL: trace.values.vaL, viL: trace.inspired.volumeL, quality: trace.quality });
      session = summarizeDlcoSession({ maneuvers, vcL, completed: false });
      if (session.status === 'repeatable') break;
    }
    session = summarizeDlcoSession({ maneuvers, vcL, completed: true });
  } else {
    session = { ...session, status: 'pending', policy: 'missing-same-session-VC', warnings: ['The largest eligible same-session VC is unavailable; VI/VC cannot be assessed and no DLCO is reported.'] };
  }
  for (const trace of tests) {
    const assessment = session.assessments.find((a) => a.id === trace.maneuverId);
    trace.assessment = assessment;
    trace.selected = session.selectedIds.includes(trace.maneuverId);
    trace.grade = { ...assessment, grade: assessment.grade ?? 'unassigned', origin: 'interim2017', wouldBeRejected: !assessment.acceptable, invalid: [], noted: assessment.alternative === 'unconfirmed' ? ['Low-VI A alternative unconfirmed; no other acceptable VA comparator.'] : [] };
  }
  const representative = tests.find((t) => t.selected) ?? tests[0] ?? null;
  return { ...(representative ?? {}), tests, session, representativeId: representative?.maneuverId ?? null };
}
