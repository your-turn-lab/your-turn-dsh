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

test('preference scoring config can change the same candidate value', () => {
  const candidate = {
    tags: ['learning_value'],
    isCritical: false,
  };
  const baseline = scoreRecallCandidate(candidate);
  const participatory = scoreRecallCandidate(candidate, {
    autoRiskWeights: { preferenceRisk: 0.35, downstreamImpact: 0.3, irreversibility: 0.35 },
    humanValueWeights: { coreJudgment: 0.4, learningValue: 0.45, ownershipValue: 0.15 },
    blendWeights: { autoRisk: 0.35, humanValue: 0.65 },
  });

  assert.ok(participatory.recallValue > baseline.recallValue);
});
