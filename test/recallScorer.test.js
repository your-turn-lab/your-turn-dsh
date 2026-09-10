import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRecallCandidate } from '../src/recall/recallScorer.js';

test('low value candidate gets low recall value', () => {
  const result = scoreRecallCandidate({
    tags: [],
    isCritical: false,
  });

  assert.equal(result.autoRisk, 0);
  assert.equal(result.humanValue, 0);
  assert.equal(result.recallValue, 0);
});

test('core preference decision gets high recall value', () => {
  const result = scoreRecallCandidate({
    tags: [
      'preference_dependent',
      'downstream_impact',
      'core_judgment',
      'ownership_value',
    ],
    isCritical: false,
  });

  assert.ok(result.recallValue > 0.6);
});

test('critical candidate contributes irreversibility risk', () => {
  const result = scoreRecallCandidate({
    tags: [],
    isCritical: true,
  });

  assert.equal(result.detail.irreversibility, 1);
  assert.equal(result.autoRisk, 0.3);
  assert.equal(result.recallValue, 0.135);
});
