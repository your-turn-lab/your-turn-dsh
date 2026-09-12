/** @typedef {'agent' | 'human_leads' | 'agent_coaches'} CollaborationMode */
/** @typedef {'pending' | 'in_progress' | 'waiting_for_user' | 'awaiting_feedback' | 'feedback_ready' | 'completed' | 'skipped'} NodeStatus */

import { normalizeTaskProfile } from './recall/recallBudget.js';
import { decideRecall } from './recall/recallPolicy.js';
import { normalizeRecallTags } from './recall/recallScorer.js';
import { normalizePreferenceProfile } from './recall/recallPreferences.js';

export const MODES = Object.freeze({ agent: 'agent', humanLeads: 'human_leads', agentCoaches: 'agent_coaches' });
export const STATUS = Object.freeze({
  pending: 'pending',
  inProgress: 'in_progress',
  waitingForUser: 'waiting_for_user',
  awaitingFeedback: 'awaiting_feedback',
  feedbackReady: 'feedback_ready',
  completed: 'completed',
  skipped: 'skipped',
});

function clone(value) { return structuredClone(value); }
function isTerminalStatus(status) { return status === STATUS.completed || status === STATUS.skipped; }
function taskIsComplete(state) { return state.nodes.length > 0 && state.nodes.every((node) => isTerminalStatus(node.status)); }
function markInSync(state) { state.pathSync = null; }
function substepStatus(nodeStatus, index) {
  if (isTerminalStatus(nodeStatus)) return nodeStatus;
  if (nodeStatus === STATUS.inProgress && index === 0) return STATUS.inProgress;
  return STATUS.pending;
}
function defaultSubsteps(node) {
  return [['prepare', '准备输入'], ['execute', '完成核心工作'], ['review', '检查结果']].map(([id, title], index) => ({
    id, title, status: substepStatus(node.status, index),
    instruction: index === 1 ? node.instruction : index === 0 ? `准备完成“${node.title}”所需的输入。` : `检查“${node.title}”是否满足目标。`,
    result: '',
  }));
}
function normalizeSubsteps(node) {
  if (!Array.isArray(node.substeps) || node.substeps.length === 0) return defaultSubsteps(node);
  const seen = new Set();
  return node.substeps.slice(0, 6).map((substep, index) => {
    const id = String(substep.id || `part-${index + 1}`).trim();
    if (!id || seen.has(id)) throw new Error('Substep ids must be non-empty and unique inside a task node.');
    seen.add(id);
    return {
      id, title: String(substep.title || `小步骤 ${index + 1}`).trim(),
      status: [STATUS.pending, STATUS.inProgress, STATUS.completed, STATUS.skipped].includes(substep.status) ? substep.status : substepStatus(node.status, index),
      instruction: String(substep.instruction || substep.title || '').trim(), result: String(substep.result || '').trim(),
    };
  });
}

export function createSessionState(sessionId, agentInfo = {}) {
  return {
    id: sessionId, title: '等待 Agent 发布任务路径', scenario: '当前 DSH 会话', runMode: 'agent', revision: 1,
    selectedNodeId: null, nodes: [], suggestions: [], interventions: [], impacts: [], planRevisions: [], outcome: null, finalAcceptedAt: null, pendingDecision: null,
    pathSync: null, runCompletion: null,
    taskProfile: normalizeTaskProfile(),
    preferenceProfile: null,
    preferenceOnboarding: { status: 'needed', askedAt: null, completedAt: null, source: null },
    recallState: { recallCount: 0, lastRecallAt: null, lastRecallNodeId: null },
    recallDecisions: [],
    telemetry: { agentStatus: 'idle', turn: 0, step: 0, currentTool: null, lastEvent: 'session-attached' },
    agent: { provider: agentInfo.provider, model: agentInfo.model },
  };
}

export function beginPreferenceOnboarding(previous, source = 'cold_start') {
  const state = clone(previous);
  if (['completed', 'skipped'].includes(state.preferenceOnboarding?.status)) return state;
  state.preferenceOnboarding = {
    ...(state.preferenceOnboarding ?? {}),
    status: 'asking',
    askedAt: new Date().toISOString(),
    source,
  };
  state.revision += 1;
  return state;
}

export function applyPreferenceProfile(previous, profile, source = 'migrated_local') {
  const state = clone(previous);
  state.preferenceProfile = normalizePreferenceProfile(profile);
  state.preferenceOnboarding = {
    ...(state.preferenceOnboarding ?? {}),
    status: 'completed',
    completedAt: new Date().toISOString(),
    source,
  };
  state.revision += 1;
  return state;
}

export function skipPreferenceOnboarding(previous) {
  const state = clone(previous);
  state.preferenceOnboarding = {
    ...(state.preferenceOnboarding ?? {}),
    status: 'skipped',
    source: 'skipped',
  };
  state.revision += 1;
  return state;
}
function recallKindFor(value, fallbackMode) {
  return ['growth', 'direction'].includes(value) ? value : fallbackMode === MODES.agentCoaches ? 'growth' : 'direction';
}
function fallbackRecallTagsForKind(recallKind) {
  return recallKind === 'growth' ? ['core_judgment', 'learning_value'] : ['preference_dependent', 'downstream_impact'];
}
function nodeRecallCandidate(node, overrides = {}) {
  const recallKind = recallKindFor(overrides.decisionKind ?? node.recallKind, overrides.recommendedMode ?? node.mode);
  const tags = normalizeRecallTags(overrides.tags ?? node.recallTags ?? fallbackRecallTagsForKind(recallKind));
  return {
    nodeId: node.id,
    question: overrides.question ?? node.objective,
    options: overrides.options ?? [],
    reason: overrides.reason ?? overrides.whyAsk ?? node.recallReason ?? node.rationale,
    tags,
    isCritical: Boolean(overrides.isCritical ?? node.isCritical),
    source: overrides.source,
  };
}
function acceptedRecallDecision(recallDecision, currentRecallState = {}) {
  if (!recallDecision) return undefined;
  const recallCountBefore = currentRecallState.recallCount || 0;
  const recallCount = recallCountBefore + 1;
  return {
    ...clone(recallDecision),
    budget: {
      ...clone(recallDecision.budget ?? {}),
      recallCountBefore,
      recallCount,
    },
  };
}

export function publishTaskPlan(previous, plan) {
  const state = clone(previous);
  if (!Array.isArray(plan.nodes) || plan.nodes.length === 0 || plan.nodes.length > 12) throw new Error('Task plan must contain 1–12 nodes.');
  const seen = new Set();
  state.title = String(plan.title || '当前任务').trim();
  state.scenario = String(plan.goal || state.scenario).trim();
  state.nodes = plan.nodes.map((node, index) => {
    const id = String(node.id || `step-${index + 1}`).trim();
    if (!id || seen.has(id)) throw new Error('Task node ids must be non-empty and unique.');
    seen.add(id);
    const value = {
      id, order: index + 1, title: String(node.title || `步骤 ${index + 1}`).trim(), objective: String(node.objective || '').trim(),
      instruction: String(node.instruction || '').trim(), acceptanceCriteria: [],
      dependsOn: index === 0 ? [] : [String(plan.nodes[index - 1].id || `step-${index}`)],
      mode: Object.values(MODES).includes(node.mode) ? node.mode : MODES.agent,
      status: index === 0 ? STATUS.inProgress : STATUS.pending,
      activity: index === 0 ? 'Agent 正在执行此节点。' : '等待前序节点完成。',
      rationale: String(node.rationale || '由 Agent 根据当前任务显式规划。').trim(), evidence: [],
      recallTags: normalizeRecallTags(node.recall_tags ?? node.recallTags ?? []),
      recallReason: String(node.recall_reason ?? node.recallReason ?? '').trim(),
      isCritical: Boolean(node.is_critical ?? node.isCritical),
      ...(node.recallKind ? { recallKind: node.recallKind } : {}),
    };
    value.substeps = normalizeSubsteps({ ...value, substeps: node.substeps });
    return value;
  });
  state.selectedNodeId = state.nodes[0].id;
  state.suggestions = []; state.interventions = []; state.impacts = []; state.planRevisions = []; state.pendingDecision = null; state.outcome = null; state.finalAcceptedAt = null; state.runCompletion = null;
  state.recallState = { recallCount: 0, lastRecallAt: null, lastRecallNodeId: null };
  state.recallDecisions = [];
  markInSync(state);
  state.revision += 1;
  return state;
}

function findNode(state, nodeId) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  return node;
}
function downstreamNodes(state, node) { return state.nodes.filter((item) => item.order > node.order); }
function startNextNode(state, node) {
  const next = state.nodes.find((item) => item.order === node.order + 1);
  if (!next || next.status !== STATUS.pending) return;
  next.status = STATUS.inProgress;
  const first = next.substeps.find((item) => item.status === STATUS.pending);
  if (first) first.status = STATUS.inProgress;
}

export function updateTaskNode(previous, update) {
  const state = clone(previous);
  state.finalAcceptedAt = null;
  state.runCompletion = null;
  markInSync(state);
  const node = findNode(state, update.nodeId);
  if (update.status === STATUS.completed && node.recallKind === 'growth' && node.coach && node.coach.phase !== 'confirmed') {
    throw new Error('Growth recall requires AI feedback and human confirmation before this node can complete.');
  }
  if (update.status) node.status = update.status;
  if (update.activity) node.activity = String(update.activity);
  if (Array.isArray(update.evidence)) node.evidence = [...new Set([...node.evidence, ...update.evidence.map(String)])];
  if (update.status === STATUS.inProgress && !node.substeps.some((item) => item.status === STATUS.inProgress)) {
    const nextSubstep = node.substeps.find((item) => item.status === STATUS.pending);
    if (nextSubstep) nextSubstep.status = STATUS.inProgress;
  }
  if (update.status === STATUS.inProgress) state.selectedNodeId = node.id;
  if (update.status === STATUS.completed) {
    node.substeps = node.substeps.map((item, index) => ({ ...item, status: STATUS.completed, result: item.result || (index === node.substeps.length - 1 ? String(update.activity || node.activity) : '已完成') }));
    startNextNode(state, node);
    if (taskIsComplete(state)) state.outcome = buildOutcomeSummary(state);
  }
  state.revision += 1;
  return state;
}

export function updateTaskSubstep(previous, update) {
  const state = clone(previous);
  state.finalAcceptedAt = null;
  state.runCompletion = null;
  markInSync(state);
  const node = findNode(state, update.nodeId);
  const index = node.substeps.findIndex((item) => item.id === update.substepId);
  const substep = node.substeps[index];
  if (!substep) throw new Error(`Unknown substep: ${update.substepId}`);
  if (update.status) substep.status = update.status;
  if (update.instruction) substep.instruction = String(update.instruction).trim();
  if (update.result !== undefined) substep.result = String(update.result).trim();
  if (update.status === STATUS.inProgress) { node.status = STATUS.inProgress; node.activity = `正在进行：${substep.title}`; state.selectedNodeId = node.id; }
  if (update.status === STATUS.completed) {
    const next = node.substeps[index + 1];
    if (next?.status === STATUS.pending) next.status = STATUS.inProgress;
    if (node.substeps.every((item) => isTerminalStatus(item.status))) {
      if (node.recallKind === 'growth' && node.coach && node.coach.phase !== 'confirmed') {
        throw new Error('Growth recall requires AI feedback and human confirmation before this node can complete.');
      }
      node.status = STATUS.completed;
      node.activity = substep.result || `已完成“${node.title}”。`;
      startNextNode(state, node);
      if (taskIsComplete(state)) state.outcome = buildOutcomeSummary(state);
    }
  }
  state.revision += 1;
  return state;
}

export function addSystemSuggestion(previous, suggestion) {
  const state = clone(previous);
  markInSync(state);
  const node = findNode(state, suggestion.nodeId);
  const recallKind = recallKindFor(suggestion.recallKind, suggestion.recommendedMode);
  node.recallKind = recallKind;
  node.recallTags = normalizeRecallTags(suggestion.tags ?? node.recallTags ?? fallbackRecallTagsForKind(recallKind));
  if (suggestion.whyAsk) node.recallReason = String(suggestion.whyAsk).trim();
  if (suggestion.isCritical !== undefined) node.isCritical = Boolean(suggestion.isCritical);
  const existing = state.suggestions.find((item) => item.nodeId === suggestion.nodeId && item.status === 'open');
  const value = { id: existing?.id ?? `suggestion-${state.suggestions.length + 1}`, nodeId: suggestion.nodeId, recommendedMode: suggestion.recommendedMode, recallKind, reasons: (suggestion.reasons || []).map((label, index) => ({ code: `reason-${index + 1}`, label })), tags: node.recallTags, whyAsk: suggestion.whyAsk, isCritical: Boolean(suggestion.isCritical), status: 'open' };
  if (existing) Object.assign(existing, value); else state.suggestions.push(value);
  state.revision += 1;
  return state;
}

export function updateTaskProfile(previous, taskProfile) {
  const state = clone(previous);
  state.taskProfile = normalizeTaskProfile({ ...state.taskProfile, ...taskProfile });
  state.revision += 1;
  return state;
}

export function traceRecallDecision(previous, trace) {
  const state = clone(previous);
  const entries = Array.isArray(state.recallDecisions) ? state.recallDecisions : [];
  const decision = trace.recallDecision ?? trace.decision ?? {};
  const candidate = trace.candidate ?? {};
  const entry = {
    id: `recall-${entries.length + 1}`,
    at: new Date().toISOString(),
    nodeId: candidate.nodeId,
    question: candidate.question,
    source: candidate.source ?? trace.source,
    tags: normalizeRecallTags(candidate.tags),
    isCritical: Boolean(candidate.isCritical),
    action: decision.action,
    reason: decision.reason,
    recallValue: decision.recallValue,
    threshold: decision.budget?.threshold,
    autoRisk: decision.autoRisk,
    humanValue: decision.humanValue,
    budget: decision.budget,
  };
  state.recallDecisions = [...entries.slice(-19), entry];
  state.revision += 1;
  return state;
}

export function evaluateRecallForNode(previous, nodeId, options = {}) {
  const state = clone(previous);
  const node = findNode(state, nodeId);
  const candidate = nodeRecallCandidate(node, options);
  const computed = decideRecall({
    candidate,
    sessionRecallState: state.recallState,
    taskProfile: state.taskProfile,
    preferenceProfile: state.preferenceProfile,
    now: options.now,
  });
  const recallDecision = options.forceAction
    ? { ...computed, action: options.forceAction, reason: options.forceReason ?? computed.reason }
    : computed;
  const traced = traceRecallDecision(state, { candidate, recallDecision, source: options.source });
  const tracedNode = findNode(traced, node.id);
  tracedNode.lastRecallDecision = clone(recallDecision);
  tracedNode.recallTags = candidate.tags;
  if (candidate.reason) tracedNode.recallReason = String(candidate.reason);
  tracedNode.isCritical = candidate.isCritical;
  return { state: traced, candidate, recallDecision };
}

export function requestHumanDecision(previous, request) {
  let state = clone(previous);
  state.finalAcceptedAt = null;
  markInSync(state);
  if (state.pendingDecision) throw new Error('Resolve the current human decision before requesting another one.');
  const node = findNode(state, request.nodeId);
  const recallKind = recallKindFor(request.decisionKind, request.recommendedMode);
  node.recallKind = recallKind;
  node.recallTags = normalizeRecallTags(request.tags ?? node.recallTags ?? fallbackRecallTagsForKind(recallKind));
  if (request.whyAsk) node.recallReason = String(request.whyAsk).trim();
  if (request.isCritical !== undefined) node.isCritical = Boolean(request.isCritical);
  node.mode = recallKind === 'growth' ? MODES.agentCoaches : MODES.humanLeads;
  node.status = STATUS.waitingForUser;
  const previousCoach = node.coach;
  node.coach = recallKind === 'growth' ? { phase: 'awaiting_answer', prompt: request.question, materials: request.materials ?? [], userAnswer: previousCoach?.userAnswer, feedback: previousCoach?.feedback } : undefined;
  const currentRecallState = state.recallState ?? {};
  const displayedRecallDecision = acceptedRecallDecision(request.recallDecision, currentRecallState);
  if (displayedRecallDecision) node.lastRecallDecision = displayedRecallDecision;
  state.selectedNodeId = node.id;
  state.pendingDecision = { nodeId: node.id, question: request.question, materials: request.materials ?? [], whyAsk: request.whyAsk, recommendedMode: node.mode, decisionKind: recallKind, requestedAt: new Date().toISOString(), recallDecision: displayedRecallDecision };
  state.recallState = {
    ...currentRecallState,
    recallCount: displayedRecallDecision?.budget?.recallCount ?? ((currentRecallState.recallCount || 0) + 1),
    lastRecallAt: Date.now(),
    lastRecallNodeId: node.id,
  };
  state = addSystemSuggestion(state, { nodeId: node.id, recommendedMode: node.mode, recallKind, reasons: request.reasons?.length ? request.reasons : ['Agent 需要人的判断后才能继续'] });
  state.revision += 1;
  return state;
}

function appendIntervention(state, intervention) {
  const sequence = state.interventions.length + 1;
  state.interventions.push({ id: `decision-${sequence}`, sequence, at: new Date().toISOString(), ...intervention });
  return state.interventions.at(-1);
}

function isTaskShapingQuestion(questions = []) {
  const text = questions.map((item) => `${item.header || ''} ${item.question || ''} ${(item.options || []).map((option) => option.label || '').join(' ')}`).join(' ');
  return /范围|交付|形式|方向|优先|目标|受众|方法|方案|取舍|scope|deliver|format|direction|priority|audience|method|approach/iu.test(text);
}

function nativeAnswerText(answer) {
  const answers = Array.isArray(answer?.answers) ? answer.answers : [];
  return answers.map((item) => {
    const custom = String(item.custom || '').trim();
    const selected = Array.isArray(item.selected) ? item.selected.filter(Boolean).join('、') : '';
    return custom || selected;
  }).filter(Boolean).join('；');
}

export function resolveHumanDecision(previous, response) {
  const state = clone(previous);
  state.finalAcceptedAt = null;
  markInSync(state);
  if (!state.pendingDecision || state.pendingDecision.nodeId !== response.nodeId) throw new Error('This session is not waiting for that decision.');
  const node = findNode(state, response.nodeId);
  const text = String(response.response ?? '').trim();
  if (response.mode !== MODES.agent && !text) throw new Error('Please provide your direction or initial analysis.');
  const before = node.mode;
  const recallKind = state.pendingDecision.decisionKind || node.recallKind;
  const priorCoachDecision = [...state.interventions].reverse().find((item) => item.nodeId === node.id && (item.kind === 'coach_answer' || item.kind === 'coach_revision'));
  const priorAnswer = priorCoachDecision?.after;
  const confirmOnly = Boolean(priorAnswer && /^(?:确认|确认并继续|继续)$/u.test(text));
  node.mode = response.mode;
  node.recallKind = response.mode === MODES.agent ? undefined : recallKind;
  node.status = STATUS.inProgress;
  node.activity = response.mode === MODES.agent ? '用户选择交给 AI 继续完成。' : '已收到用户判断，Agent 将据此继续。';
  if (node.coach) { node.coach.userAnswer = confirmOnly ? priorAnswer : text || undefined; node.coach.phase = response.mode === MODES.agentCoaches && !priorAnswer ? 'awaiting_feedback' : 'confirmed'; }
  const kind = response.mode === MODES.agent ? 'decision_delegated' : recallKind === 'direction' ? 'direction_answer' : priorAnswer ? (confirmOnly ? 'coach_confirm' : 'coach_revision') : 'coach_answer';
  const decision = appendIntervention(state, { source: 'user', kind, recallKind, nodeId: node.id, before: priorAnswer || before, after: confirmOnly ? priorAnswer : text || response.mode });
  const firstGrowthAnswer = recallKind === 'growth' && response.mode === MODES.agentCoaches && !priorAnswer;
  if (!firstGrowthAnswer) {
    const afterEffect = response.mode === MODES.agent ? `用户确认由 AI 继续完成“${node.title}”。` : `后续工作采用用户判断：${confirmOnly ? priorAnswer : text}`;
    for (const affected of downstreamNodes(state, node)) {
      const beforeEffect = affected.activity;
      affected.impact = { kind: 'affected', causedBy: decision.id, reason: `“${node.title}”收到了用户决策`, sequence: decision.sequence };
      state.impacts.push({ id: `impact-${state.impacts.length + 1}`, decisionId: decision.id, affectedNodeId: affected.id, before: beforeEffect, after: afterEffect, reason: affected.impact.reason });
    }
  }
  state.pendingDecision = null;
  const suggestion = state.suggestions.find((item) => item.nodeId === node.id && item.status === 'open');
  if (suggestion) suggestion.status = 'accepted';
  node.lastDecisionId = decision.id;
  state.revision += 1;
  return state;
}

export function applyTelemetry(previous, patch) {
  const state = clone(previous);
  state.telemetry = { ...state.telemetry, ...patch };
  state.revision += 1;
  return state;
}

export function beginNativeQuestion(previous, question) {
  const state = clone(previous);
  if (state.pendingDecision || state.externalQuestion || state.nodes.length === 0) return state;
  const node = state.nodes.find((item) => [STATUS.inProgress, STATUS.awaitingFeedback].includes(item.status))
    ?? state.nodes.find((item) => item.id === state.selectedNodeId);
  if (!node || isTerminalStatus(node.status)) return state;
  state.externalQuestion = {
    callId: String(question.callId || ''),
    nodeId: node.id,
    previousStatus: node.status,
    previousActivity: node.activity,
    questions: clone(question.questions || []),
    taskShaping: isTaskShapingQuestion(question.questions),
    startedAt: new Date().toISOString(),
  };
  node.status = STATUS.waitingForUser;
  node.activity = 'DSH 正在等待你的补充信息。';
  state.selectedNodeId = node.id;
  state.revision += 1;
  return state;
}

export function endNativeQuestion(previous, question) {
  const state = clone(previous);
  const pending = state.externalQuestion;
  if (!pending) return state;
  const callId = String(question.callId || '');
  if (pending.callId && callId && pending.callId !== callId) return state;
  const node = state.nodes.find((item) => item.id === pending.nodeId);
  if (node && node.status === STATUS.waitingForUser && !state.pendingDecision) {
    node.status = [STATUS.inProgress, STATUS.awaitingFeedback].includes(pending.previousStatus)
      ? pending.previousStatus
      : STATUS.inProgress;
    node.activity = pending.previousActivity || '已收到补充信息，Agent 继续执行。';
  }
  const answer = nativeAnswerText(question.answer);
  if (!question.isError && pending.taskShaping && node && answer) {
    const decision = appendIntervention(state, {
      source: 'user',
      kind: 'native_task_decision',
      nodeId: node.id,
      before: pending.questions.map((item) => item.question).filter(Boolean).join('；') || 'Agent 请求用户确定任务方式',
      after: answer,
    });
    const targets = [node, ...downstreamNodes(state, node)];
    for (const affected of targets) {
      const beforeEffect = affected.activity;
      const afterEffect = affected.id === node.id
        ? `当前步骤采用用户选择：${answer}`
        : `后续工作需遵循用户选择：${answer}`;
      affected.impact = { kind: 'affected', causedBy: decision.id, reason: 'DSH 原生任务选择改变了执行约束', sequence: decision.sequence };
      state.impacts.push({ id: `impact-${state.impacts.length + 1}`, decisionId: decision.id, affectedNodeId: affected.id, before: beforeEffect, after: afterEffect, reason: affected.impact.reason });
    }
  }
  state.externalQuestion = null;
  if (state.outcome) state.outcome = buildOutcomeSummary(state);
  state.revision += 1;
  return state;
}

export function reviseTaskNode(previous, revision) {
  const state = clone(previous);
  const node = findNode(state, revision.nodeId);
  if (isTerminalStatus(node.status)) throw new Error('Completed or skipped nodes cannot be revised.');
  const before = { title: node.title, objective: node.objective, instruction: node.instruction, rationale: node.rationale };
  for (const field of ['title', 'objective', 'instruction', 'rationale']) {
    if (revision[field] === undefined) continue;
    const value = String(revision[field]).trim();
    if (!value) throw new Error(`${field} cannot be empty.`);
    node[field] = value;
  }
  if (Array.isArray(revision.substeps) && revision.substeps.length > 0) {
    const current = new Map(node.substeps.map((item) => [item.id, item]));
    node.substeps = normalizeSubsteps({
      ...node,
      substeps: revision.substeps.map((item) => {
        const old = current.get(String(item.id));
        return { ...item, status: old?.status ?? STATUS.pending, result: old?.result ?? '' };
      }),
    });
  }
  const changed = ['title', 'objective', 'instruction', 'rationale'].some((field) => before[field] !== node[field]) || Array.isArray(revision.substeps);
  if (!changed) throw new Error('A path revision must change at least one field or provide substeps.');
  state.planRevisions ??= [];
  state.planRevisions.push({
    id: `path-revision-${state.planRevisions.length + 1}`,
    nodeId: node.id,
    reason: String(revision.reason || '根据新上下文同步任务路径。').trim(),
    before,
    after: { title: node.title, objective: node.objective, instruction: node.instruction, rationale: node.rationale },
    at: new Date().toISOString(),
  });
  state.finalAcceptedAt = null;
  state.runCompletion = null;
  markInSync(state);
  state.revision += 1;
  return state;
}

export function finishTaskRun(previous, completion) {
  const state = clone(previous);
  if (state.pendingDecision) throw new Error('Resolve the pending human decision before finishing the task run.');
  if (state.nodes.length === 0) throw new Error('Publish a task plan before finishing the task run.');
  const resolutions = Array.isArray(completion.nodeResults) ? completion.nodeResults : [];
  const seen = new Set();
  for (const resolution of resolutions) {
    const node = findNode(state, resolution.nodeId);
    if (seen.has(node.id)) throw new Error(`Duplicate final resolution for node: ${node.id}`);
    seen.add(node.id);
    const status = resolution.status === STATUS.skipped ? STATUS.skipped : STATUS.completed;
    const result = String(resolution.result || '').trim();
    if (!result) throw new Error(`Final resolution for “${node.title}” requires a result.`);
    if (node.recallKind === 'growth' && node.coach && node.coach.phase !== 'confirmed') {
      throw new Error(`Growth recall for “${node.title}” still requires AI feedback and human confirmation.`);
    }
    node.status = status;
    node.activity = result;
    node.substeps = node.substeps.map((item) => ({ ...item, status, result: item.result || result }));
  }
  const unfinished = state.nodes.filter((node) => !isTerminalStatus(node.status));
  if (unfinished.length > 0) throw new Error(`Reconcile every unfinished path node before the final response: ${unfinished.map((node) => node.id).join(', ')}`);
  const summary = String(completion.summary || '').trim();
  if (!summary) throw new Error('finish_task_run requires a concise final summary.');
  state.outcome = buildOutcomeSummary(state);
  state.runCompletion = { summary, completedAt: new Date().toISOString() };
  state.finalAcceptedAt = null;
  markInSync(state);
  state.revision += 1;
  return state;
}

export function applyTurnEnd(previous, turn, reason) {
  const state = clone(previous);
  const reasonKind = typeof reason === 'string' ? reason : reason?.kind || 'unknown';
  state.telemetry = { ...state.telemetry, turn: Number.isFinite(turn) ? turn : state.telemetry.turn, agentStatus: 'idle', currentTool: null, lastEvent: 'turn/end', lastTurnEndReason: reasonKind };
  if (reasonKind === 'completed' && state.telemetry?.pathRequiredTurn === turn && state.telemetry?.pathPublishedTurn !== turn) {
    state.pathSync = { status: 'needs_plan', turn: Number.isFinite(turn) ? turn : state.telemetry.turn, reason: 'Agent 本轮已结束，但没有发布任务路径。' };
  } else if (reasonKind === 'completed' && state.nodes.length > 0 && !taskIsComplete(state) && !state.pendingDecision) {
    state.pathSync = { status: 'needs_sync', turn: Number.isFinite(turn) ? turn : state.telemetry.turn, reason: 'Agent 本轮已结束，但仍有路径节点未确认完成。' };
  } else if (taskIsComplete(state)) {
    state.outcome ??= buildOutcomeSummary(state);
    markInSync(state);
  }
  state.revision += 1;
  return state;
}

function nodeLabel(state, nodeId) { return state.nodes.find((node) => node.id === nodeId)?.title ?? nodeId; }
function modeLabel(mode) { return ({ agent: '“AI完成”', human_leads: '“主动介入”', agent_coaches: '“成长型召回”' })[mode] ?? mode; }
function describeDecision(state, item) {
  const label = nodeLabel(state, item.nodeId);
  if (item.kind === 'mode_change') return `将“${label}”改为${modeLabel(item.after)}`;
  if (item.kind === 'direction_answer') return `在结果型召回中为“${label}”选择：${item.after}`;
  if (item.kind === 'decision_delegated') return `将“${label}”交给 AI 完成`;
  if (item.kind === 'instruction_change') return `修改“${label}”的执行要求：${item.after}`;
  if (item.kind === 'substep_revision') return `修改“${label}”中的小步骤：${item.after}`;
  if (item.kind === 'coach_answer') return `提交初步判断：${item.after}`;
  if (item.kind === 'coach_revision') return `根据反馈完善判断：${item.after}`;
  if (item.kind === 'coach_confirm') return `确认用于后续工作的判断：${item.after}`;
  if (item.kind === 'native_task_decision') return `通过任务选项确定“${label}”：${item.after}`;
  return String(item.after ?? item.kind);
}
function assertEditable(node) { if (isTerminalStatus(node.status)) throw new Error('Completed or skipped nodes cannot be edited.'); }

export function reduceTask(previous, action) {
  let state = clone(previous);
  state.revision += 1;
  switch (action.type) {
    case 'SELECT_NODE': findNode(state, action.nodeId); state.selectedNodeId = action.nodeId; return state;
    case 'UPDATE_TASK_PROFILE':
      return updateTaskProfile(previous, action.taskProfile);
    case 'APPLY_PREFERENCE_PROFILE':
      return applyPreferenceProfile(previous, action.profile, action.source);
    case 'SKIP_PREFERENCE_ONBOARDING':
      return skipPreferenceOnboarding(previous);
    case 'ACCEPT_SUGGESTION': {
      state.finalAcceptedAt = null;
      const suggestion = state.suggestions.find((item) => item.id === action.suggestionId);
      if (!suggestion || suggestion.status !== 'open') throw new Error('Suggestion is not available.');
      const node = findNode(state, suggestion.nodeId); assertEditable(node); const before = node.mode;
      node.mode = action.mode;
      node.recallKind = action.mode === MODES.agent ? undefined : ['growth', 'direction'].includes(action.recallKind) ? action.recallKind : action.mode === MODES.agentCoaches ? 'growth' : 'direction';
      node.status = action.mode === MODES.agent ? STATUS.inProgress : STATUS.waitingForUser;
      suggestion.status = 'accepted';
      if (action.mode !== MODES.agent) {
        state = evaluateRecallForNode(state, node.id, {
          source: 'user_initiated_suggestion',
          decisionKind: node.recallKind,
          recommendedMode: action.mode,
          tags: suggestion.tags,
          whyAsk: suggestion.whyAsk,
          isCritical: suggestion.isCritical,
          forceAction: 'RECALL',
          forceReason: 'user_initiated',
        }).state;
      }
      const updatedNode = findNode(state, suggestion.nodeId);
      appendIntervention(state, { source: 'user', suggestedBy: 'system', kind: 'mode_change', recallKind: node.recallKind, nodeId: node.id, before, after: action.mode });
      updatedNode.lastDecisionId = state.interventions.at(-1)?.id;
      return state;
    }
    case 'DISMISS_SUGGESTION': {
      const suggestion = state.suggestions.find((item) => item.id === action.suggestionId);
      if (!suggestion) throw new Error('Suggestion is not available.');
      suggestion.status = 'dismissed';
      const node = findNode(state, suggestion.nodeId);
      if (!state.pendingDecision || state.pendingDecision.nodeId !== node.id) node.recallKind = undefined;
      return state;
    }
    case 'CHANGE_MODE': {
      state.finalAcceptedAt = null; const node = findNode(state, action.nodeId); assertEditable(node);
      if (!Object.values(MODES).includes(action.mode)) throw new Error('Invalid collaboration mode.');
      if (node.mode === action.mode) return previous;
      const before = node.mode; node.mode = action.mode;
      node.recallKind = action.mode === MODES.agentCoaches ? 'growth' : action.mode === MODES.humanLeads ? 'direction' : undefined;
      node.status = action.mode === MODES.agent ? STATUS.inProgress : STATUS.waitingForUser;
      if (action.mode !== MODES.agent) {
        state = evaluateRecallForNode(state, node.id, {
          source: 'user_initiated_mode_change',
          decisionKind: node.recallKind,
          recommendedMode: action.mode,
          forceAction: 'RECALL',
          forceReason: 'user_initiated',
        }).state;
      }
      const updatedNode = findNode(state, action.nodeId);
      appendIntervention(state, { source: 'user', kind: 'mode_change', recallKind: updatedNode.recallKind, nodeId: updatedNode.id, before, after: action.mode });
      return state;
    }
    case 'EDIT_INSTRUCTION': {
      state.finalAcceptedAt = null; const node = findNode(state, action.nodeId); assertEditable(node);
      const instruction = String(action.instruction ?? '').trim();
      if (!instruction) throw new Error('Instruction cannot be empty.');
      if (node.instruction === instruction) return previous;
      state = evaluateRecallForNode(state, node.id, {
        source: 'user_initiated_instruction_edit',
        question: `修改“${node.title}”的执行要求`,
        tags: normalizeRecallTags([...node.recallTags ?? [], 'ownership_value', 'downstream_impact']),
        forceAction: 'RECALL',
        forceReason: 'user_initiated',
      }).state;
      const updatedNode = findNode(state, action.nodeId);
      const decision = appendIntervention(state, { source: 'user', kind: 'instruction_change', nodeId: node.id, before: node.instruction, after: instruction });
      updatedNode.instruction = instruction;
      for (const candidate of downstreamNodes(state, updatedNode)) {
        candidate.impact = { kind: 'affected', causedBy: decision.id, reason: `${updatedNode.title}的执行要求已改变`, sequence: decision.sequence };
        state.impacts.push({ id: `impact-${state.impacts.length + 1}`, decisionId: decision.id, affectedNodeId: candidate.id, before: candidate.activity, after: `需要依据“${instruction}”重新检查`, reason: candidate.impact.reason });
      }
      return state;
    }
    case 'REVISE_SUBSTEP': {
      state.finalAcceptedAt = null; const node = findNode(state, action.nodeId);
      const index = node.substeps.findIndex((item) => item.id === action.substepId);
      if (index < 0) throw new Error(`Unknown substep: ${action.substepId}`);
      const instruction = String(action.instruction ?? '').trim();
      if (!instruction) throw new Error('Instruction cannot be empty.');
      const substep = node.substeps[index];
      state = evaluateRecallForNode(state, node.id, {
        source: 'user_initiated_substep_revision',
        question: `修改“${node.title}”中的小步骤“${substep.title}”`,
        tags: normalizeRecallTags([...node.recallTags ?? [], 'ownership_value']),
        forceAction: 'RECALL',
        forceReason: 'user_initiated',
      }).state;
      const updatedNode = findNode(state, action.nodeId);
      const updatedSubstep = updatedNode.substeps[index];
      const decision = appendIntervention(state, { source: 'user', kind: 'substep_revision', nodeId: node.id, substepId: substep.id, before: substep.instruction, after: instruction });
      updatedSubstep.instruction = instruction; updatedSubstep.status = STATUS.inProgress; updatedSubstep.result = '等待按新要求重做';
      for (const later of updatedNode.substeps.slice(index + 1)) { later.status = STATUS.pending; later.result = ''; }
      updatedNode.status = STATUS.inProgress; updatedNode.activity = `正在从“${updatedSubstep.title}”重新执行。`;
      updatedNode.impact = { kind: 'affected', causedBy: decision.id, reason: `小步骤“${updatedSubstep.title}”已修改`, sequence: decision.sequence };
      for (const candidate of downstreamNodes(state, updatedNode)) {
        candidate.impact = { kind: 'affected', causedBy: decision.id, reason: `${updatedNode.title}将从“${updatedSubstep.title}”重做`, sequence: decision.sequence };
        state.impacts.push({ id: `impact-${state.impacts.length + 1}`, decisionId: decision.id, affectedNodeId: candidate.id, before: candidate.activity, after: `等待“${updatedSubstep.title}”重做结果`, reason: candidate.impact.reason });
      }
      state.outcome = null; return state;
    }
    case 'ACCEPT_FINAL_RESULT':
      if (!taskIsComplete(state)) throw new Error('Final result can only be accepted after every task node is complete.');
      state.outcome ??= buildOutcomeSummary(state); state.finalAcceptedAt = new Date().toISOString(); return state;
    default: throw new Error(`Unknown action: ${action.type}`);
  }
}

export function buildOutcomeSummary(state) {
  const decisions = state.interventions.filter((item) => item.source === 'user').map((item) => ({ id: item.id, nodeId: item.nodeId, kind: item.kind, detail: describeDecision(state, item) }));
  const effects = state.impacts.map((impact) => ({ decisionId: impact.decisionId, affectedNodeId: impact.affectedNodeId, before: impact.before, after: impact.after }));
  return { decisions, effects };
}

export function publicState(state, adapterInfo) { return { ...clone(state), adapter: clone(adapterInfo) }; }
