/** @typedef {'agent' | 'human_leads' | 'agent_coaches'} CollaborationMode */
/** @typedef {'pending' | 'in_progress' | 'waiting_for_user' | 'awaiting_feedback' | 'feedback_ready' | 'completed'} NodeStatus */

export const MODES = Object.freeze({ agent: 'agent', humanLeads: 'human_leads', agentCoaches: 'agent_coaches' });
export const STATUS = Object.freeze({
  pending: 'pending',
  inProgress: 'in_progress',
  waitingForUser: 'waiting_for_user',
  awaitingFeedback: 'awaiting_feedback',
  feedbackReady: 'feedback_ready',
  completed: 'completed',
});

function clone(value) { return structuredClone(value); }
function substepStatus(nodeStatus, index) {
  if (nodeStatus === STATUS.completed) return STATUS.completed;
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
      status: [STATUS.pending, STATUS.inProgress, STATUS.completed].includes(substep.status) ? substep.status : substepStatus(node.status, index),
      instruction: String(substep.instruction || substep.title || '').trim(), result: String(substep.result || '').trim(),
    };
  });
}

export function createSessionState(sessionId, agentInfo = {}) {
  return {
    id: sessionId, title: '等待 Agent 发布任务路径', scenario: '当前 DSH 会话', runMode: 'agent', revision: 1,
    selectedNodeId: null, nodes: [], suggestions: [], interventions: [], impacts: [], outcome: null, finalAcceptedAt: null, pendingDecision: null,
    telemetry: { agentStatus: 'idle', turn: 0, step: 0, currentTool: null, lastEvent: 'session-attached' },
    agent: { provider: agentInfo.provider, model: agentInfo.model },
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
      ...(node.recallKind ? { recallKind: node.recallKind } : {}),
    };
    value.substeps = normalizeSubsteps({ ...value, substeps: node.substeps });
    return value;
  });
  state.selectedNodeId = state.nodes[0].id;
  state.suggestions = []; state.interventions = []; state.impacts = []; state.pendingDecision = null; state.outcome = null; state.finalAcceptedAt = null;
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
    if (state.nodes.every((item) => item.status === STATUS.completed)) state.outcome = buildOutcomeSummary(state);
  }
  state.revision += 1;
  return state;
}

export function updateTaskSubstep(previous, update) {
  const state = clone(previous);
  state.finalAcceptedAt = null;
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
  }
  state.revision += 1;
  return state;
}

export function addSystemSuggestion(previous, suggestion) {
  const state = clone(previous);
  const node = findNode(state, suggestion.nodeId);
  const recallKind = ['growth', 'direction'].includes(suggestion.recallKind) ? suggestion.recallKind : suggestion.recommendedMode === MODES.agentCoaches ? 'growth' : 'direction';
  node.recallKind = recallKind;
  const existing = state.suggestions.find((item) => item.nodeId === suggestion.nodeId && item.status === 'open');
  const value = { id: existing?.id ?? `suggestion-${state.suggestions.length + 1}`, nodeId: suggestion.nodeId, recommendedMode: suggestion.recommendedMode, recallKind, reasons: (suggestion.reasons || []).map((label, index) => ({ code: `reason-${index + 1}`, label })), status: 'open' };
  if (existing) Object.assign(existing, value); else state.suggestions.push(value);
  state.revision += 1;
  return state;
}

export function requestHumanDecision(previous, request) {
  let state = clone(previous);
  state.finalAcceptedAt = null;
  if (state.pendingDecision) throw new Error('Resolve the current human decision before requesting another one.');
  const node = findNode(state, request.nodeId);
  const recallKind = ['growth', 'direction'].includes(request.decisionKind) ? request.decisionKind : request.recommendedMode === MODES.agentCoaches ? 'growth' : 'direction';
  node.recallKind = recallKind;
  node.mode = recallKind === 'growth' ? MODES.agentCoaches : MODES.humanLeads;
  node.status = STATUS.waitingForUser;
  const previousCoach = node.coach;
  node.coach = recallKind === 'growth' ? { phase: 'awaiting_answer', prompt: request.question, materials: request.materials ?? [], userAnswer: previousCoach?.userAnswer, feedback: previousCoach?.feedback } : undefined;
  state.selectedNodeId = node.id;
  state.pendingDecision = { nodeId: node.id, question: request.question, materials: request.materials ?? [], recommendedMode: node.mode, decisionKind: recallKind, requestedAt: new Date().toISOString() };
  state = addSystemSuggestion(state, { nodeId: node.id, recommendedMode: node.mode, recallKind, reasons: request.reasons?.length ? request.reasons : ['Agent 需要人的判断后才能继续'] });
  state.revision += 1;
  return state;
}

function appendIntervention(state, intervention) {
  const sequence = state.interventions.length + 1;
  state.interventions.push({ id: `decision-${sequence}`, sequence, at: new Date().toISOString(), ...intervention });
  return state.interventions.at(-1);
}

export function resolveHumanDecision(previous, response) {
  const state = clone(previous);
  state.finalAcceptedAt = null;
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
  return String(item.after ?? item.kind);
}
function assertEditable(node) { if (node.status === STATUS.completed) throw new Error('Completed nodes cannot be edited.'); }

export function reduceTask(previous, action) {
  const state = clone(previous);
  state.revision += 1;
  switch (action.type) {
    case 'SELECT_NODE': findNode(state, action.nodeId); state.selectedNodeId = action.nodeId; return state;
    case 'ACCEPT_SUGGESTION': {
      state.finalAcceptedAt = null;
      const suggestion = state.suggestions.find((item) => item.id === action.suggestionId);
      if (!suggestion || suggestion.status !== 'open') throw new Error('Suggestion is not available.');
      const node = findNode(state, suggestion.nodeId); assertEditable(node); const before = node.mode;
      node.mode = action.mode;
      node.recallKind = action.mode === MODES.agent ? undefined : ['growth', 'direction'].includes(action.recallKind) ? action.recallKind : action.mode === MODES.agentCoaches ? 'growth' : 'direction';
      node.status = action.mode === MODES.agent ? STATUS.inProgress : STATUS.waitingForUser;
      suggestion.status = 'accepted';
      appendIntervention(state, { source: 'user', suggestedBy: 'system', kind: 'mode_change', recallKind: node.recallKind, nodeId: node.id, before, after: action.mode });
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
      appendIntervention(state, { source: 'user', kind: 'mode_change', recallKind: node.recallKind, nodeId: node.id, before, after: action.mode });
      return state;
    }
    case 'EDIT_INSTRUCTION': {
      state.finalAcceptedAt = null; const node = findNode(state, action.nodeId); assertEditable(node);
      const instruction = String(action.instruction ?? '').trim();
      if (!instruction) throw new Error('Instruction cannot be empty.');
      if (node.instruction === instruction) return previous;
      const decision = appendIntervention(state, { source: 'user', kind: 'instruction_change', nodeId: node.id, before: node.instruction, after: instruction });
      node.instruction = instruction;
      for (const candidate of downstreamNodes(state, node)) {
        candidate.impact = { kind: 'affected', causedBy: decision.id, reason: `${node.title}的执行要求已改变`, sequence: decision.sequence };
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
      const decision = appendIntervention(state, { source: 'user', kind: 'substep_revision', nodeId: node.id, substepId: substep.id, before: substep.instruction, after: instruction });
      substep.instruction = instruction; substep.status = STATUS.inProgress; substep.result = '等待按新要求重做';
      for (const later of node.substeps.slice(index + 1)) { later.status = STATUS.pending; later.result = ''; }
      node.status = STATUS.inProgress; node.activity = `正在从“${substep.title}”重新执行。`;
      node.impact = { kind: 'affected', causedBy: decision.id, reason: `小步骤“${substep.title}”已修改`, sequence: decision.sequence };
      for (const candidate of downstreamNodes(state, node)) {
        candidate.impact = { kind: 'affected', causedBy: decision.id, reason: `${node.title}将从“${substep.title}”重做`, sequence: decision.sequence };
        state.impacts.push({ id: `impact-${state.impacts.length + 1}`, decisionId: decision.id, affectedNodeId: candidate.id, before: candidate.activity, after: `等待“${substep.title}”重做结果`, reason: candidate.impact.reason });
      }
      state.outcome = null; return state;
    }
    case 'ACCEPT_FINAL_RESULT':
      if (state.nodes.length === 0 || !state.nodes.every((node) => node.status === STATUS.completed)) throw new Error('Final result can only be accepted after every task node is complete.');
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
