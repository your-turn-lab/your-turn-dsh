export const TASK_SIZES = Object.freeze({
  short: 'short',
  medium: 'medium',
  long: 'long',
});

export const PARTICIPATION_GOALS = Object.freeze({
  fastFinish: 'fast_finish',
  balanced: 'balanced',
  learning: 'learning',
});

export function normalizeTaskProfile(taskProfile = {}) {
  const taskSize = Object.values(TASK_SIZES).includes(taskProfile.taskSize)
    ? taskProfile.taskSize
    : TASK_SIZES.medium;
  const participationGoal = Object.values(PARTICIPATION_GOALS).includes(taskProfile.participationGoal)
    ? taskProfile.participationGoal
    : PARTICIPATION_GOALS.balanced;

  return { taskSize, participationGoal };
}

export function getRecallBudgetConfig(taskProfile = {}) {
  const profile = normalizeTaskProfile(taskProfile);

  let baseThreshold = 0.5;
  let maxRecall = 3;

  if (profile.taskSize === TASK_SIZES.short) {
    baseThreshold = 0.65;
  }

  if (profile.taskSize === TASK_SIZES.long) {
    baseThreshold = 0.45;
  }

  let goalPenalty = 0;

  if (profile.participationGoal === PARTICIPATION_GOALS.fastFinish) {
    goalPenalty = 0.2;
  }

  if (profile.participationGoal === PARTICIPATION_GOALS.learning) {
    goalPenalty = -0.1;
  }

  return {
    ...profile,
    baseThreshold,
    maxRecall,
    goalPenalty,
  };
}

export function calculateDynamicThreshold({
  sessionRecallState = {},
  taskProfile = {},
  now = Date.now(),
} = {}) {
  const config = getRecallBudgetConfig(taskProfile);

  let threshold = config.baseThreshold + config.goalPenalty;
  const recallCount = sessionRecallState.recallCount || 0;

  const budgetPenalty = recallCount >= config.maxRecall ? 1 : 0;
  threshold += budgetPenalty;

  const lastRecallAt = sessionRecallState.lastRecallAt;
  const hasRecentRecall = Boolean(lastRecallAt && now - lastRecallAt < 2 * 60 * 1000);
  const recentPenalty = hasRecentRecall ? 0.15 : 0;
  threshold += recentPenalty;

  threshold = Math.max(0, Math.min(1, threshold));

  return {
    threshold,
    baseThreshold: config.baseThreshold,
    maxRecall: config.maxRecall,
    goalPenalty: config.goalPenalty,
    recallCount,
    recentPenalty,
    budgetPenalty,
    taskSize: config.taskSize,
    participationGoal: config.participationGoal,
  };
}
