import { scoringConfigFromPreference } from './recallPreferences.js';

export const RECALL_TAGS = Object.freeze({
  preferenceDependent: 'preference_dependent',
  downstreamImpact: 'downstream_impact',
  irreversible: 'irreversible',
  coreJudgment: 'core_judgment',
  learningValue: 'learning_value',
  ownershipValue: 'ownership_value',
});

export const RECALL_TAG_VALUES = Object.freeze(Object.values(RECALL_TAGS));

export function normalizeRecallTags(tags = []) {
  const allowed = new Set(RECALL_TAG_VALUES);
  const normalized = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    const value = String(tag || '').trim();
    if (!allowed.has(value) || normalized.includes(value)) continue;
    normalized.push(value);
  }
  return normalized;
}

export function scoreRecallCandidate(candidate = {}, scoringConfig) {
  const config = scoringConfig ?? scoringConfigFromPreference();
  const tags = new Set(normalizeRecallTags(candidate.tags));

  const preferenceRisk = tags.has(RECALL_TAGS.preferenceDependent) ? 1 : 0;
  const downstreamImpact = tags.has(RECALL_TAGS.downstreamImpact) ? 1 : 0;
  const irreversibility = tags.has(RECALL_TAGS.irreversible) || candidate.isCritical ? 1 : 0;

  const coreJudgment = tags.has(RECALL_TAGS.coreJudgment) ? 1 : 0;
  const learningValue = tags.has(RECALL_TAGS.learningValue) ? 1 : 0;
  const ownershipValue = tags.has(RECALL_TAGS.ownershipValue) ? 1 : 0;

  const autoRisk = (config.autoRiskWeights.preferenceRisk * preferenceRisk)
    + (config.autoRiskWeights.downstreamImpact * downstreamImpact)
    + (config.autoRiskWeights.irreversibility * irreversibility);
  const humanValue = (config.humanValueWeights.coreJudgment * coreJudgment)
    + (config.humanValueWeights.learningValue * learningValue)
    + (config.humanValueWeights.ownershipValue * ownershipValue);
  const recallValue = (config.blendWeights.autoRisk * autoRisk) + (config.blendWeights.humanValue * humanValue);

  return {
    autoRisk,
    humanValue,
    recallValue,
    detail: {
      preferenceRisk,
      downstreamImpact,
      irreversibility,
      coreJudgment,
      learningValue,
      ownershipValue,
    },
  };
}
