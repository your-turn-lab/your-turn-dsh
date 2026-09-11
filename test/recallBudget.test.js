import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDynamicThreshold } from '../src/recall/recallBudget.js';

test('short task has higher threshold with the shared recall cap', () => {
  const result = calculateDynamicThreshold({
    taskProfile: {
      taskSize: 'short',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(result.threshold, 0.65);
  assert.equal(result.maxRecall, 3);
});

test('long task has lower threshold with the shared recall cap', () => {
  const result = calculateDynamicThreshold({
    taskProfile: {
      taskSize: 'long',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 0,
    },
  });

  assert.equal(result.threshold, 0.45);
  assert.equal(result.maxRecall, 3);
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

  assert.equal(result.threshold, 0.7);
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

  assert.equal(result.threshold, 0.4);
});

test('recent recall penalty raises the threshold before the cap', () => {
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

  assert.equal(result.budgetPenalty, 0);
  assert.equal(result.recentPenalty, 0.15);
  assert.equal(result.threshold, 0.8);
});

test('budget cap raises the threshold to one after three recalls', () => {
  const result = calculateDynamicThreshold({
    taskProfile: {
      taskSize: 'medium',
      participationGoal: 'balanced',
    },
    sessionRecallState: {
      recallCount: 3,
    },
  });

  assert.equal(result.budgetPenalty, 1);
  assert.equal(result.threshold, 1);
  assert.equal(result.maxRecall, 3);
});
