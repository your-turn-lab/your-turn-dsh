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
