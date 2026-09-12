const BASELINE_SCORING = Object.freeze({
  autoRiskWeights: {
    preferenceRisk: 0.4,
    downstreamImpact: 0.3,
    irreversibility: 0.3,
  },
  humanValueWeights: {
    coreJudgment: 0.5,
    learningValue: 0.3,
    ownershipValue: 0.2,
  },
  blendWeights: {
    autoRisk: 0.45,
    humanValue: 0.55,
  },
});

const PRESETS = Object.freeze({
  conservative: {
    preset: 'conservative',
    thresholdBias: 0.10,
    maxRecall: 1,
    recentPenalty: 0.25,
    autoRiskWeights: {
      preferenceRisk: 0.4,
      downstreamImpact: 0.3,
      irreversibility: 0.3,
    },
    humanValueWeights: {
      coreJudgment: 0.55,
      learningValue: 0.2,
      ownershipValue: 0.25,
    },
    blendWeights: {
      autoRisk: 0.55,
      humanValue: 0.45,
    },
  },
  balanced: {
    preset: 'balanced',
    thresholdBias: 0,
    maxRecall: 3,
    recentPenalty: 0.15,
    ...BASELINE_SCORING,
  },
  participatory: {
    preset: 'participatory',
    thresholdBias: -0.08,
    maxRecall: 4,
    recentPenalty: 0.10,
    autoRiskWeights: {
      preferenceRisk: 0.35,
      downstreamImpact: 0.3,
      irreversibility: 0.35,
    },
    humanValueWeights: {
      coreJudgment: 0.45,
      learningValue: 0.35,
      ownershipValue: 0.2,
    },
    blendWeights: {
      autoRisk: 0.40,
      humanValue: 0.60,
    },
  },
});

const ANSWER_MAP = Object.freeze({
  interruption_style: {
    '只问关键风险': 'critical_only',
    '重要判断问我': 'balanced',
    '多给我参与': 'participatory',
  },
  preference_ownership: {
    '你先自动选': 'agent_first',
    '重要选择问我': 'ask_important',
    '多数选择问我': 'ask_often',
  },
  learning_intent: {
    '快速完成': 'fast_finish',
    '平衡参与': 'balanced',
    '练习判断': 'practice_judgment',
  },
  recall_budget: {
    '1 次以内': 'minimal',
    '2 到 3 次': 'standard',
    '有价值就问': 'open',
  },
});

const DEFAULT_ANSWERS = Object.freeze({
  interruptionStyle: 'balanced',
  preferenceOwnership: 'ask_important',
  learningIntent: 'balanced',
  recallBudget: 'standard',
});

export const PREFERENCE_ONBOARDING_QUESTIONS = Object.freeze([
  {
    id: 'interruption_style',
    header: '打断频率',
    question: '你希望我什么时候暂停下来问你？',
    options: [
      { label: '只问关键风险', description: '多数情况自动推进，只在高风险或不可逆时问你。' },
      { label: '重要判断问我', description: '方向、偏好、关键判断会问你，普通执行自动推进。' },
      { label: '多给我参与', description: '有练习价值或需要判断时更积极地问你。' },
    ],
  },
  {
    id: 'preference_ownership',
    header: '方向偏好',
    question: '遇到风格、方向、取舍选择时，你更希望怎么处理？',
    options: [
      { label: '你先自动选', description: 'AI 根据上下文选择，并在需要时说明理由。' },
      { label: '重要选择问我', description: '影响结果的偏好选择先问你。' },
      { label: '多数选择问我', description: '只要明显涉及你的偏好，就倾向先问你。' },
    ],
  },
  {
    id: 'learning_intent',
    header: '学习目标',
    question: '你希望这个插件更多帮助你完成任务，还是帮助你练习判断？',
    options: [
      { label: '快速完成', description: '少打断，优先交付。' },
      { label: '平衡参与', description: '重要处参与，其他地方自动推进。' },
      { label: '练习判断', description: '遇到有学习价值的判断时更常让你先想。' },
    ],
  },
  {
    id: 'recall_budget',
    header: '打断上限',
    question: '单个任务中，你通常最多接受几次 Your Turn？',
    options: [
      { label: '1 次以内', description: '只保留最关键的一次。' },
      { label: '2 到 3 次', description: '适合中等或较长任务。' },
      { label: '有价值就问', description: '可以多问，但不要连续打断。' },
    ],
  },
]);

function clone(value) {
  return structuredClone(value);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizeWeightGroup(group, fallback) {
  const keys = Object.keys(fallback);
  const values = Object.fromEntries(keys.map((key) => [key, Math.max(0, Number(group?.[key] ?? fallback[key]))]));
  const total = keys.reduce((sum, key) => sum + values[key], 0);
  if (total <= 0) return clone(fallback);
  return Object.fromEntries(keys.map((key) => [key, values[key] / total]));
}

function normalizeAnswerValue(groupId, value) {
  const cleaned = String(Array.isArray(value) ? value[0] : value || '').replace(/\s*\(Recommended\)\s*$/u, '').trim();
  return ANSWER_MAP[groupId]?.[cleaned] ?? cleaned;
}

function answersFromNativeResult(result) {
  const output = { ...DEFAULT_ANSWERS };
  const answers = Array.isArray(result?.answers) ? result.answers : Array.isArray(result) ? result : [];
  for (const answer of answers) {
    const selected = Array.isArray(answer?.selected) ? answer.selected[0] : answer?.selected;
    if (answer?.id === 'interruption_style') output.interruptionStyle = normalizeAnswerValue(answer.id, selected);
    if (answer?.id === 'preference_ownership') output.preferenceOwnership = normalizeAnswerValue(answer.id, selected);
    if (answer?.id === 'learning_intent') output.learningIntent = normalizeAnswerValue(answer.id, selected);
    if (answer?.id === 'recall_budget') output.recallBudget = normalizeAnswerValue(answer.id, selected);
  }
  return output;
}

function presetForAnswers(answers) {
  let conservative = 0;
  let participatory = 0;
  if (answers.interruptionStyle === 'critical_only') conservative += 1;
  if (answers.interruptionStyle === 'participatory') participatory += 1;
  if (answers.learningIntent === 'fast_finish') conservative += 1;
  if (answers.learningIntent === 'practice_judgment') participatory += 1;
  if (answers.recallBudget === 'minimal') conservative += 1;
  if (answers.recallBudget === 'open') participatory += 1;
  if (conservative >= 2 && conservative >= participatory) return 'conservative';
  if (participatory >= 2 && participatory > conservative) return 'participatory';
  return 'balanced';
}

function summaryFor(answers, preset) {
  if (preset === 'conservative') return '只保留关键打断：多数情况自动推进，高风险或不可逆时再问你';
  if (preset === 'participatory') return '更积极参与：有学习价值或方向判断时，会更常让你先想';
  if (answers.preferenceOwnership === 'agent_first') return '平衡参与：AI 先自动选择，重要判断再说明或询问';
  if (answers.preferenceOwnership === 'ask_often') return '平衡参与：明显涉及你的偏好时，会倾向先问你';
  return '平衡参与：重要方向会问你，普通执行自动推进';
}

export function normalizePreferenceProfile(input) {
  const source = input?.profile && typeof input.profile === 'object' ? input.profile : input;
  const preset = Object.hasOwn(PRESETS, source?.preset) ? source.preset : 'balanced';
  const fallback = PRESETS[preset];
  const profile = {
    preset,
    thresholdBias: Number(source?.thresholdBias ?? fallback.thresholdBias),
    maxRecall: Math.min(4, Math.max(1, Math.round(Number(source?.maxRecall ?? fallback.maxRecall)))),
    recentPenalty: clamp01(Number(source?.recentPenalty ?? fallback.recentPenalty)),
    autoRiskWeights: normalizeWeightGroup(source?.autoRiskWeights, fallback.autoRiskWeights),
    humanValueWeights: normalizeWeightGroup(source?.humanValueWeights, fallback.humanValueWeights),
    blendWeights: normalizeWeightGroup(source?.blendWeights, fallback.blendWeights),
  };
  if (input?.summary) profile.summary = String(input.summary);
  if (input?.answers) profile.answers = { ...input.answers };
  return profile;
}

export function profileFromOnboardingAnswers(result) {
  const answers = answersFromNativeResult(result);
  const preset = presetForAnswers(answers);
  const profile = clone(PRESETS[preset]);
  if (answers.recallBudget === 'minimal') profile.maxRecall = 1;
  if (answers.recallBudget === 'standard') profile.maxRecall = 3;
  if (answers.recallBudget === 'open') profile.maxRecall = 4;

  if (answers.preferenceOwnership === 'agent_first') {
    profile.autoRiskWeights.preferenceRisk -= 0.1;
    profile.thresholdBias += 0.05;
  }
  if (answers.preferenceOwnership === 'ask_often') {
    profile.autoRiskWeights.preferenceRisk += 0.1;
    profile.humanValueWeights.ownershipValue += 0.1;
  }
  if (answers.learningIntent === 'fast_finish') {
    profile.thresholdBias += 0.05;
    profile.humanValueWeights.learningValue -= 0.1;
  }
  if (answers.learningIntent === 'practice_judgment') {
    profile.thresholdBias -= 0.05;
    profile.humanValueWeights.learningValue += 0.1;
    profile.blendWeights.humanValue += 0.05;
    profile.blendWeights.autoRisk -= 0.05;
  }

  const normalized = normalizePreferenceProfile({
    ...profile,
    summary: summaryFor(answers, preset),
    answers,
  });
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    summary: normalized.summary,
    answers,
    profile: normalized,
  };
}

export function scoringConfigFromPreference(profile) {
  if (!profile) return BASELINE_SCORING;
  const normalized = normalizePreferenceProfile(profile);
  return {
    autoRiskWeights: normalized.autoRiskWeights,
    humanValueWeights: normalized.humanValueWeights,
    blendWeights: normalized.blendWeights,
  };
}

export function budgetConfigFromPreference(profile) {
  if (!profile) return {};
  const normalized = normalizePreferenceProfile(profile);
  return {
    thresholdBias: normalized.thresholdBias,
    maxRecall: normalized.maxRecall,
    recentPenalty: normalized.recentPenalty,
    preset: normalized.preset,
  };
}
