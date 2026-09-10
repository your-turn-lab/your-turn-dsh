import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDynamicThreshold } from '../src/recall/recallBudget.js';

test('short task has higher threshold and lower max recall', () => {
  const result = calculateDynamicThreshold({
    taskProfile: {
      taskSize: 'short',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(result.threshold, 0.75);
  assert.equal(result.maxRecall, 1);
});

test('long task has lower threshold and higher max recall', () => {
  const result = calculateDynamicThreshold({
    taskProfile: {
      taskSize: 'long',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(result.threshold, 0.5);
  assert.equal(result.maxRecall, 5);
});

test('fast finish goal raises threshold', () => {
  const result = calculateDynamicThreshold({
    taskProfile: {
      taskSize: 'medium',
      participationGoal: 'fast_finish',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(result.threshold, 0.8);
});

test('learning goal lowers threshold', () => {
  const result = calculateDynamicThreshold({
    taskProfile: {
      taskSize: 'medium',
      participationGoal: 'learning',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(result.threshold, 0.5);
});

test('budget and recent recall penalties raise the threshold', () => {
  const now = Date.now();
  const result = calculateDynamicThreshold({
    taskProfile: {
      taskSize: 'short',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 1,
      lastRecallAt: now - 30 * 1000,
    },
    now,
  });

  assert.equal(result.budgetPenalty, 0.35);
  assert.equal(result.recentPenalty, 0.15);
  assert.equal(result.threshold, 1);
});
