import { calculateDynamicThreshold } from './recallBudget.js';
import { scoreRecallCandidate } from './recallScorer.js';

export function decideRecall({
  candidate = {},
  sessionRecallState = {},
  taskProfile = {},
  now = Date.now(),
} = {}) {
  const score = scoreRecallCandidate(candidate);
  const budget = calculateDynamicThreshold({
    sessionRecallState,
    taskProfile,
    now,
  });

  if (candidate.isCritical) {
    return {
      action: 'RECALL',
      reason: 'critical_override',
      ...score,
      budget,
    };
  }

  const action = score.recallValue >= budget.threshold ? 'RECALL' : 'AUTO';

  return {
    action,
    reason: action === 'RECALL' ? 'recall_value_passed' : 'recall_value_below_threshold',
    ...score,
    budget,
  };
}
