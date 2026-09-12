import { decideRecall } from './vendor/recall/recallPolicy.js';
import { profileFromOnboardingAnswers, PREFERENCE_ONBOARDING_QUESTIONS } from './vendor/recall/recallPreferences.js';
export { normalizeTaskProfile } from './vendor/recall/recallBudget.js';

// These tags and the clock are scenario inputs, not live Agent observations.
// The scoring, threshold, recent-recall penalty and budget are original plugin code.
export const candidates = Object.freeze({
  main: { tags: ['preference_dependent', 'downstream_impact', 'core_judgment', 'learning_value', 'ownership_value'], isCritical: false },
  relation: { tags: ['core_judgment', 'learning_value', 'ownership_value'], isCritical: false },
  interaction: { tags: ['preference_dependent', 'downstream_impact', 'core_judgment', 'ownership_value'], isCritical: false },
});
export const policyClock = Object.freeze({ initial: 1_000_000, candidateInterval: 30_000 });

export function preferenceFromAnswers(answers) {
  const result = profileFromOnboardingAnswers({ answers: PREFERENCE_ONBOARDING_QUESTIONS.map((question, i) => ({
    id: question.id, selected: [question.options[answers[i]].label],
  })) });
  return { ...result.profile, summary: result.summary, answers: result.answers };
}

export function evaluateCandidate(state, key, now = state.policyNow) {
  return decideRecall({ candidate: candidates[key], taskProfile: state.taskProfile,
    preferenceProfile: state.preferenceProfile, sessionRecallState: state.recallState, now });
}
