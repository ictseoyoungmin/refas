import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const MACRO_FIT_SCHEMA = 'refas.macro-fit/v1';

export function createMacroFitCoordinatorPlan({id, scopeId, sourceSha256, maxOuterCycles = 3, improvementTolerance = 1e-6, evaluationBudget = 256, evidenceRefs = []} = {}) {
  const cycles = Number(maxOuterCycles), budget = Number(evaluationBudget), tolerance = Number(improvementTolerance);
  if (!Number.isInteger(cycles) || cycles < 1) throw new Error('maxOuterCycles must be a positive integer');
  if (!Number.isInteger(budget) || budget < 1) throw new Error('evaluationBudget must be a positive integer');
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('improvementTolerance must be non-negative and finite');
  const payload = {schema: MACRO_FIT_SCHEMA, id: assertId(id, 'id'), ownerCapability: 'shape-reconstruction', scopeId: assertId(scopeId, 'scopeId'), sourceSha256: assertDigest(sourceSha256, 'sourceSha256'), maxOuterCycles: cycles, improvementTolerance: tolerance, evaluationBudget: budget, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort(), policy: {fixedOwnerSequence: ['spatial-hypotheses', 'assembly', 'shape-reconstruction'], coordinatorCannotCertify: true, coordinatorCannotChooseFindingOwner: true, oneStageAtATime: true, stopOnRepresentationBlocker: true, selectedStageRequiresVisualReview: true} };
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

export function validateMacroFitCoordinatorPlan(plan) {
  const errors = [];
  try {
    if (plan?.schema !== MACRO_FIT_SCHEMA) errors.push('invalid schema');
    const recreated = createMacroFitCoordinatorPlan(plan);
    if (recreated.planDigest !== plan.planDigest) errors.push('macro-fit plan digest mismatch');
    if (digestJson(recreated) !== digestJson(plan)) errors.push('macro-fit plan is not canonical');
    if (JSON.stringify(plan?.policy?.fixedOwnerSequence) !== JSON.stringify(['spatial-hypotheses', 'assembly', 'shape-reconstruction'])) errors.push('macro-fit owner sequence is missing');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

/**
 * Alternate camera → pose → shape. Fitters are owner-local callbacks; the
 * coordinator records their reports and never writes a checkpoint or certifies.
 */
export async function runMacroFit({plan, initialState = {}, fitters = {}, verifyStage = null} = {}) {
  const validation = validateMacroFitCoordinatorPlan(plan);
  if (!validation.valid) throw new Error(`macro-fit plan is invalid: ${validation.errors.join('; ')}`);
  for (const name of ['camera', 'pose', 'shape']) if (typeof fitters[name] !== 'function') throw new Error(`macro-fit requires a ${name} owner-local fitter`);
  let state = structuredClone(initialState), evaluations = 0, previousLoss = null, stopReason = 'outer-cycle-budget', improvedAny = false;
  const cycles = [];
  for (let cycle = 1; cycle <= plan.maxOuterCycles; cycle += 1) {
    const stages = [];
    for (const [stage, ownerCapability] of [['camera', 'spatial-hypotheses'], ['pose', 'assembly'], ['shape', 'shape-reconstruction']]) {
      if (evaluations >= plan.evaluationBudget) { stopReason = 'evaluation-budget'; break; }
      const result = await fitters[stage](deepFreeze(structuredClone(state)), deepFreeze({cycle, stage, ownerCapability, planDigest: plan.planDigest}));
      if (!result || typeof result !== 'object') throw new Error(`${stage} fitter must return an object`);
      if (result.representationBlocker === true || result.status === 'REPRESENTATION_BLOCKER') { stopReason = 'representation-blocker'; stages.push({stage, ownerCapability, status: 'REPRESENTATION_BLOCKER', reportDigest: result.reportDigest ?? null}); break; }
      if (result.ownerCapability && result.ownerCapability !== ownerCapability) throw new Error(`${stage} fitter returned an unexpected owner capability`);
      const reportDigest = result.reportDigest ?? (result.report ? digestJson(result.report) : null);
      if (result.reportDigest != null) assertDigest(result.reportDigest, `${stage}.reportDigest`);
      stages.push({stage, ownerCapability, status: String(result.status ?? 'NO_IMPROVEMENT'), objectiveLoss: Number.isFinite(result.objectiveLoss) ? result.objectiveLoss : null, reportDigest, evidenceRefs: [...new Set((result.evidenceRefs ?? []).map(String).filter(Boolean))].sort()});
      if (result.state != null) state = structuredClone(result.state);
      if (Number.isFinite(result.evaluationCount)) evaluations += result.evaluationCount;
      if (result.improved === true || result.status === 'IMPROVED' || result.status === 'KEEP') improvedAny = true;
      if (typeof verifyStage === 'function') await verifyStage({stage, cycle, result, state: deepFreeze(structuredClone(state))});
    }
    cycles.push({cycle, stages});
    if (stages.some((stage) => stage.status === 'REPRESENTATION_BLOCKER')) break;
    const loss = stages.reduce((sum, stage) => sum + (Number(stage.objectiveLoss) || 0), 0);
    if (previousLoss != null && Math.abs(previousLoss - loss) <= plan.improvementTolerance) { stopReason = 'no-material-improvement'; break; }
    previousLoss = loss;
    if (evaluations >= plan.evaluationBudget) { stopReason = 'evaluation-budget'; break; }
  }
  const payload = {schema: MACRO_FIT_SCHEMA, plan, planDigest: plan.planDigest, ownerCapability: 'shape-reconstruction', scopeId: plan.scopeId, sourceSha256: plan.sourceSha256, status: improvedAny ? 'IMPROVED' : 'NO_IMPROVEMENT', stopReason, evaluationCount: evaluations, cycles, finalState: state, policy: plan.policy};
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}
