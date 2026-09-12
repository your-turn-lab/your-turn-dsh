import { calculateDynamicThreshold } from './recallBudget.js';
import { scoreRecallCandidate } from './recallScorer.js';
import { scoringConfigFromPreference } from './recallPreferences.js';

export function decideRecall({
  candidate = {},
  sessionRecallState = {},
  taskProfile = {},
  preferenceProfile,
  now = Date.now(),
} = {}) {
  const score = scoreRecallCandidate(candidate, scoringConfigFromPreference(preferenceProfile));
  const budget = calculateDynamicThreshold({
    sessionRecallState,
    taskProfile,
    preferenceProfile,
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

  if (budget.recallCount >= budget.maxRecall) {
    return {
      action: 'AUTO',
      reason: 'recall_budget_exhausted',
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
