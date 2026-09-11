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

export function scoreRecallCandidate(candidate = {}) {
  const tags = new Set(normalizeRecallTags(candidate.tags));

  const preferenceRisk = tags.has(RECALL_TAGS.preferenceDependent) ? 1 : 0;
  const downstreamImpact = tags.has(RECALL_TAGS.downstreamImpact) ? 1 : 0;
  const irreversibility = tags.has(RECALL_TAGS.irreversible) || candidate.isCritical ? 1 : 0;

  const coreJudgment = tags.has(RECALL_TAGS.coreJudgment) ? 1 : 0;
  const learningValue = tags.has(RECALL_TAGS.learningValue) ? 1 : 0;
  const ownershipValue = tags.has(RECALL_TAGS.ownershipValue) ? 1 : 0;

  const autoRisk = (0.4 * preferenceRisk) + (0.3 * downstreamImpact) + (0.3 * irreversibility);
  const humanValue = (0.5 * coreJudgment) + (0.3 * learningValue) + (0.2 * ownershipValue);
  const recallValue = (0.45 * autoRisk) + (0.55 * humanValue);

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
