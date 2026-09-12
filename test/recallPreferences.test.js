import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetConfigFromPreference, normalizePreferenceProfile, profileFromOnboardingAnswers, scoringConfigFromPreference } from '../src/recall/recallPreferences.js';

test('balanced onboarding answers produce the baseline-like preference profile', () => {
  const result = profileFromOnboardingAnswers({
    answers: [
      { id: 'interruption_style', selected: ['重要判断问我'] },
      { id: 'preference_ownership', selected: ['重要选择问我'] },
      { id: 'learning_intent', selected: ['平衡参与'] },
      { id: 'recall_budget', selected: ['2 到 3 次'] },
    ],
  });

  assert.equal(result.version, 1);
  assert.equal(result.profile.preset, 'balanced');
  assert.equal(result.profile.thresholdBias, 0);
  assert.equal(result.profile.maxRecall, 3);
  assert.equal(result.profile.blendWeights.autoRisk, 0.45);
  assert.match(result.summary, /平衡参与/);
});

test('conservative onboarding raises threshold and lowers recall budget', () => {
  const result = profileFromOnboardingAnswers({
    answers: [
      { id: 'interruption_style', selected: ['只问关键风险'] },
      { id: 'preference_ownership', selected: ['你先自动选'] },
      { id: 'learning_intent', selected: ['快速完成'] },
      { id: 'recall_budget', selected: ['1 次以内'] },
    ],
  });
  const budget = budgetConfigFromPreference(result);

  assert.equal(result.profile.preset, 'conservative');
  assert.equal(budget.maxRecall, 1);
  assert.ok(budget.thresholdBias > 0.1);
});

test('participatory onboarding lowers threshold and boosts learning value', () => {
  const result = profileFromOnboardingAnswers({
    answers: [
      { id: 'interruption_style', selected: ['多给我参与'] },
      { id: 'preference_ownership', selected: ['多数选择问我'] },
      { id: 'learning_intent', selected: ['练习判断'] },
      { id: 'recall_budget', selected: ['有价值就问'] },
    ],
  });
  const scoring = scoringConfigFromPreference(result);

  assert.equal(result.profile.preset, 'participatory');
  assert.equal(result.profile.maxRecall, 4);
  assert.ok(result.profile.thresholdBias < -0.08);
  assert.ok(scoring.humanValueWeights.learningValue > 0.35);
  assert.equal(Math.round(Object.values(scoring.humanValueWeights).reduce((sum, value) => sum + value, 0) * 1000), 1000);
});

test('localStorage wrapper profiles normalize to the nested profile', () => {
  const normalized = normalizePreferenceProfile({
    summary: 'saved summary',
    profile: {
      preset: 'participatory',
      thresholdBias: -0.08,
      maxRecall: 4,
    },
  });

  assert.equal(normalized.preset, 'participatory');
  assert.equal(normalized.summary, 'saved summary');
  assert.equal(normalized.maxRecall, 4);
});
