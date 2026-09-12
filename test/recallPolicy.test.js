import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRecall } from '../src/recall/recallPolicy.js';

test('suppresses low-value recall', () => {
  const result = decideRecall({
    candidate: {
      question: '标题用 A 还是 B？',
      tags: [],
      isCritical: false,
    },
    taskProfile: {
      taskSize: 'medium',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(result.action, 'AUTO');
});

test('recalls high-value core decision', () => {
  const result = decideRecall({
    candidate: {
      question: '你希望报告采用哪种整体方向？',
      tags: [
        'preference_dependent',
        'downstream_impact',
        'core_judgment',
        'ownership_value',
      ],
      isCritical: false,
    },
    taskProfile: {
      taskSize: 'medium',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(result.action, 'RECALL');
});

test('short task suppresses medium-value recall', () => {
  const result = decideRecall({
    candidate: {
      question: '你希望语气更正式还是更轻松？',
      tags: [
        'preference_dependent',
        'ownership_value',
      ],
      isCritical: false,
    },
    taskProfile: {
      taskSize: 'short',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(result.action, 'AUTO');
});

test('critical recall bypasses budget', () => {
  const result = decideRecall({
    candidate: {
      question: '是否确认提交最终版本？',
      tags: ['irreversible'],
      isCritical: true,
    },
    taskProfile: {
      taskSize: 'short',
      participationGoal: 'fast_finish',
    },
    sessionRecallState: {
      recallCount: 5,
    },
  });

  assert.equal(result.action, 'RECALL');
  assert.equal(result.reason, 'critical_override');
});

test('non-critical recall stops after the shared budget is exhausted', () => {
  const result = decideRecall({
    candidate: {
      question: '还要不要继续细化方向？',
      tags: [
        'preference_dependent',
        'downstream_impact',
        'core_judgment',
        'ownership_value',
      ],
      isCritical: false,
    },
    taskProfile: {
      taskSize: 'long',
      participationGoal: 'learning',
    },
    sessionRecallState: {
      recallCount: 3,
    },
  });

  assert.equal(result.action, 'AUTO');
  assert.equal(result.reason, 'recall_budget_exhausted');
});

test('the same learning candidate can recall under participatory preference', () => {
  const candidate = {
    question: '你想先判断这个证据说明什么吗？',
    tags: ['learning_value'],
    isCritical: false,
  };
  const baseline = decideRecall({
    candidate,
    taskProfile: {
      taskSize: 'medium',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });
  const participatory = decideRecall({
    candidate,
    preferenceProfile: {
      preset: 'participatory',
      thresholdBias: -0.2,
      maxRecall: 4,
      recentPenalty: 0.1,
      autoRiskWeights: { preferenceRisk: 0.35, downstreamImpact: 0.3, irreversibility: 0.35 },
      humanValueWeights: { coreJudgment: 0.3, learningValue: 0.7, ownershipValue: 0 },
      blendWeights: { autoRisk: 0.25, humanValue: 0.75 },
    },
    taskProfile: {
      taskSize: 'medium',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(baseline.action, 'AUTO');
  assert.equal(participatory.action, 'RECALL');
});
