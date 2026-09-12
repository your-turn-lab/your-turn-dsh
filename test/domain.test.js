import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, STATUS, applyTurnEnd, beginNativeQuestion, buildOutcomeSummary, createSessionState, endNativeQuestion, finishTaskRun, publishTaskPlan, reduceTask, requestHumanDecision, resolveHumanDecision, reviseTaskNode, traceRecallDecision, updateTaskNode, updateTaskSubstep } from '../src/domain.js';

const plan = { title: '发布新功能', goal: '从信息到交付', nodes: [
  { id: 'research', title: '整理信息', objective: '形成事实基础', instruction: '整理已有材料', rationale: '适合自动执行', mode: MODES.agent, substeps: [{ id: 'collect', title: '收集材料', instruction: '读取输入' }, { id: 'organize', title: '整理证据', instruction: '保留来源' }] },
  { id: 'judge', title: '判断重点', objective: '形成关键判断', instruction: '先由用户判断', rationale: '值得练习', mode: MODES.agentCoaches },
  { id: 'deliver', title: '生成交付物', objective: '交付结果', instruction: '依据确认结论生成', rationale: '机械执行', mode: MODES.agent },
] };

test('a live task starts empty and accepts a model-published path', () => {
  const empty = createSessionState('session-a');
  assert.equal(empty.nodes.length, 0);
  assert.deepEqual(empty.taskProfile, { taskSize: 'medium', participationGoal: 'balanced' });
  assert.equal(empty.preferenceProfile, null);
  assert.equal(empty.preferenceOnboarding.status, 'needed');
  const state = publishTaskPlan(empty, {
    ...plan,
    nodes: plan.nodes.map((node, index) => index === 1
      ? { ...node, recall_tags: ['core_judgment', 'learning_value', 'not_a_tag', 'core_judgment'], recall_reason: '用户练习判断有价值' }
      : node),
  });
  assert.equal(state.nodes.length, 3);
  assert.equal(state.nodes[0].status, STATUS.inProgress);
  assert.deepEqual(state.nodes[1].recallTags, ['core_judgment', 'learning_value']);
});

test('preference profile can be migrated into the current session', () => {
  const state = reduceTask(createSessionState('preference'), {
    type: 'APPLY_PREFERENCE_PROFILE',
    source: 'migrated_local',
    profile: {
      summary: '平衡参与：重要方向会问你',
      profile: {
        preset: 'balanced',
        thresholdBias: 0,
        maxRecall: 3,
      },
    },
  });

  assert.equal(state.preferenceProfile.preset, 'balanced');
  assert.equal(state.preferenceOnboarding.status, 'completed');
  assert.equal(state.preferenceOnboarding.source, 'migrated_local');
});

test('skipping preference onboarding suppresses it for this session', () => {
  const state = reduceTask(createSessionState('skip-preference'), {
    type: 'SKIP_PREFERENCE_ONBOARDING',
  });

  assert.equal(state.preferenceProfile, null);
  assert.equal(state.preferenceOnboarding.status, 'skipped');
  assert.equal(state.preferenceOnboarding.source, 'skipped');
});

test('task profile can be updated for dynamic recall budgets', () => {
  const state = reduceTask(createSessionState('profile'), {
    type: 'UPDATE_TASK_PROFILE',
    taskProfile: {
      taskSize: 'long',
      participationGoal: 'learning',
    },
  });

  assert.deepEqual(state.taskProfile, { taskSize: 'long', participationGoal: 'learning' });
});

test('recall decisions are traced for demo and debug visibility', () => {
  const state = traceRecallDecision(createSessionState('trace'), {
    candidate: {
      nodeId: 'judge',
      question: '采用哪个方向？',
      tags: ['core_judgment'],
      isCritical: false,
    },
    recallDecision: {
      action: 'RECALL',
      reason: 'recall_value_passed',
      recallValue: 0.67,
      autoRisk: 0.3,
      humanValue: 0.86,
      budget: { threshold: 0.6, recallCount: 0, maxRecall: 3 },
    },
  });

  assert.equal(state.recallDecisions.length, 1);
  assert.equal(state.recallDecisions[0].threshold, 0.6);
});

test('user initiated My Turn updates recall score for the selected node', () => {
  let state = publishTaskPlan(createSessionState('manual-recall'), {
    ...plan,
    nodes: plan.nodes.map((node, index) => index === 1
      ? { ...node, mode: MODES.agent, recall_tags: ['core_judgment', 'learning_value'], recall_reason: '用户练习判断有价值' }
      : node),
  });

  state = reduceTask(state, {
    type: 'CHANGE_MODE',
    nodeId: 'judge',
    mode: MODES.agentCoaches,
  });

  assert.equal(state.recallDecisions.at(-1).source, 'user_initiated_mode_change');
  assert.equal(state.recallDecisions.at(-1).action, 'RECALL');
  assert.equal(state.nodes[1].lastRecallDecision.reason, 'user_initiated');
  assert.deepEqual(state.nodes[1].recallTags, ['core_judgment', 'learning_value']);
});

test('substeps and nodes advance from progress updates', () => {
  let state = publishTaskPlan(createSessionState('progress'), plan);
  state = updateTaskSubstep(state, { nodeId: 'research', substepId: 'collect', status: STATUS.completed, result: '读取了三份输入' });
  assert.equal(state.nodes[0].substeps[1].status, STATUS.inProgress);
  state = updateTaskNode(state, { nodeId: 'research', status: STATUS.completed, activity: '证据整理完成' });
  assert.equal(state.nodes[1].status, STATUS.inProgress);
});

test('completing every substep automatically completes its parent node', () => {
  let state = publishTaskPlan(createSessionState('substep-rollup'), plan);
  state = updateTaskSubstep(state, { nodeId: 'research', substepId: 'collect', status: STATUS.completed, result: '材料读取完成' });
  state = updateTaskSubstep(state, { nodeId: 'research', substepId: 'organize', status: STATUS.completed, result: '证据整理完成' });
  assert.equal(state.nodes[0].status, STATUS.completed);
  assert.equal(state.nodes[1].status, STATUS.inProgress);
});

test('a changed delivery choice revises the visible path without replacing it', () => {
  let state = publishTaskPlan(createSessionState('revision-from-question'), plan);
  state = reviseTaskNode(state, {
    nodeId: 'deliver',
    reason: '用户在 DSH 问题卡中选择直接在对话交付',
    title: '在对话中交付',
    objective: '直接输出可用结论',
    instruction: '在最终回复中给出结构化内容，不创建 Markdown 文件',
  });
  const node = state.nodes.find((item) => item.id === 'deliver');
  assert.equal(node.title, '在对话中交付');
  assert.match(node.instruction, /不创建 Markdown/);
  assert.equal(state.planRevisions.length, 1);
});

test('growth recall requires feedback and confirmation', () => {
  let state = publishTaskPlan(createSessionState('growth'), plan);
  state = requestHumanDecision(state, { nodeId: 'judge', question: '你认为核心问题是什么？', decisionKind: 'growth', materials: ['证据 A'], reasons: ['这是核心判断'] });
  state = resolveHumanDecision(state, { nodeId: 'judge', mode: MODES.agentCoaches, response: '核心问题是信息无法复用。' });
  assert.equal(state.nodes[1].coach.phase, 'awaiting_feedback');
  assert.throws(() => updateTaskNode(state, { nodeId: 'judge', status: STATUS.completed, activity: '完成' }), /feedback and human confirmation/);
  state = requestHumanDecision(state, { nodeId: 'judge', question: '确认或修改？', decisionKind: 'growth', materials: ['AI 反馈'], reasons: ['继续前确认'] });
  state = resolveHumanDecision(state, { nodeId: 'judge', mode: MODES.agentCoaches, response: '确认并继续' });
  assert.equal(state.nodes[1].coach.phase, 'confirmed');
});

test('direction decisions affect downstream nodes', () => {
  let state = publishTaskPlan(createSessionState('direction'), plan);
  state = requestHumanDecision(state, { nodeId: 'judge', question: '采用哪个方向？', decisionKind: 'direction', materials: ['两个方向均可行'], reasons: ['影响最终结果'] });
  state = resolveHumanDecision(state, { nodeId: 'judge', mode: MODES.humanLeads, response: '方向 B' });
  assert.equal(state.interventions.at(-1).kind, 'direction_answer');
  assert.equal(state.impacts[0].affectedNodeId, 'deliver');
});

test('a user can revise a substep and reopen downstream work', () => {
  let state = publishTaskPlan(createSessionState('revision'), plan);
  state = reduceTask(state, { type: 'REVISE_SUBSTEP', nodeId: 'research', substepId: 'organize', instruction: '按来源可信度重新排序' });
  assert.equal(state.nodes[0].substeps[1].status, STATUS.inProgress);
  assert.equal(state.nodes[2].impact.kind, 'affected');
  assert.equal(buildOutcomeSummary(state).decisions[0].kind, 'substep_revision');
});

test('final acceptance requires all nodes to complete', () => {
  let state = publishTaskPlan(createSessionState('final'), plan);
  assert.throws(() => reduceTask(state, { type: 'ACCEPT_FINAL_RESULT' }));
  state.nodes.forEach((node) => { node.status = STATUS.completed; });
  state = reduceTask(state, { type: 'ACCEPT_FINAL_RESULT' });
  assert.ok(state.finalAcceptedAt);
});

test('finish refuses unresolved nodes and closes explicitly reconciled work', () => {
  let state = publishTaskPlan(createSessionState('finish'), plan);
  assert.throws(() => finishTaskRun(state, { summary: '交付完成', nodeResults: [] }), /research, judge, deliver/);
  state = finishTaskRun(state, {
    summary: '已直接在对话中完成交付',
    nodeResults: [
      { nodeId: 'research', status: STATUS.completed, result: '信息整理完成' },
      { nodeId: 'judge', status: STATUS.completed, result: '重点判断完成' },
      { nodeId: 'deliver', status: STATUS.completed, result: '已在对话中交付' },
    ],
  });
  assert.equal(state.nodes.every((node) => node.status === STATUS.completed), true);
  assert.equal(state.runCompletion.summary, '已直接在对话中完成交付');
});

test('finish cannot bypass an unconfirmed growth recall', () => {
  let state = publishTaskPlan(createSessionState('finish-growth'), plan);
  state = requestHumanDecision(state, { nodeId: 'judge', question: '你的判断？', decisionKind: 'growth', materials: ['证据'], reasons: ['值得练习'] });
  state = resolveHumanDecision(state, { nodeId: 'judge', mode: MODES.agentCoaches, response: '初步判断' });
  assert.throws(() => finishTaskRun(state, {
    summary: '完成',
    nodeResults: [
      { nodeId: 'research', status: STATUS.completed, result: '完成' },
      { nodeId: 'judge', status: STATUS.completed, result: '完成' },
      { nodeId: 'deliver', status: STATUS.completed, result: '完成' },
    ],
  }), /still requires AI feedback and human confirmation/);
});

test('substep rollup cannot bypass an unconfirmed growth recall', () => {
  let state = publishTaskPlan(createSessionState('substep-growth'), plan);
  state = requestHumanDecision(state, { nodeId: 'judge', question: '你的判断？', decisionKind: 'growth', materials: ['证据'], reasons: ['值得练习'] });
  state = resolveHumanDecision(state, { nodeId: 'judge', mode: MODES.agentCoaches, response: '初步判断' });
  state.nodes[1].substeps.slice(0, -1).forEach((item) => { item.status = STATUS.completed; item.result = '完成'; });
  const last = state.nodes[1].substeps.at(-1);
  assert.throws(() => updateTaskSubstep(state, { nodeId: 'judge', substepId: last.id, status: STATUS.completed, result: '完成' }), /feedback and human confirmation/);
});

test('completed turn with unresolved nodes reports path sync instead of fake completion', () => {
  let state = publishTaskPlan(createSessionState('turn-end'), plan);
  state = applyTurnEnd(state, 1, { kind: 'completed' });
  assert.equal(state.pathSync.status, 'needs_sync');
  assert.equal(state.nodes[0].status, STATUS.inProgress);
  assert.equal(state.telemetry.lastTurnEndReason, 'completed');
});

test('native DSH questions pause the current node without becoming a recall decision', () => {
  let state = publishTaskPlan(createSessionState('native-question'), plan);
  state = beginNativeQuestion(state, { callId: 'ask-1' });
  assert.equal(state.nodes[0].status, STATUS.waitingForUser);
  assert.equal(state.externalQuestion.nodeId, 'research');
  assert.equal(state.pendingDecision, null);
  assert.equal(state.interventions.length, 0);
  assert.equal(state.nodes[0].recallKind, undefined);
  state = endNativeQuestion(state, { callId: 'ask-1' });
  assert.equal(state.nodes[0].status, STATUS.inProgress);
  assert.equal(state.externalQuestion, null);
  assert.equal(state.interventions.length, 0);
});

test('task-shaping native choices are recorded while ordinary facts are not', () => {
  let state = publishTaskPlan(createSessionState('native-task-choice'), plan);
  state = beginNativeQuestion(state, {
    callId: 'scope-choice',
    questions: [{ id: 'scope', header: '调研范围', question: '这次调研覆盖哪些资料？', options: [{ label: '两块都做' }, { label: '只做 A' }] }],
  });
  state = endNativeQuestion(state, { callId: 'scope-choice', answer: { answers: [{ id: 'scope', selected: ['两块都做'] }] } });
  let outcome = buildOutcomeSummary(state);
  assert.equal(outcome.decisions.length, 1);
  assert.equal(outcome.decisions[0].kind, 'native_task_decision');
  assert.match(outcome.decisions[0].detail, /两块都做/);
  assert.ok(outcome.effects.length >= 1);

  state = beginNativeQuestion(state, {
    callId: 'fact-input',
    questions: [{ id: 'date', header: '补充信息', question: '报告日期是什么？' }],
  });
  state = endNativeQuestion(state, { callId: 'fact-input', answer: { answers: [{ id: 'date', selected: [], custom: '9 月 7 日' }] } });
  outcome = buildOutcomeSummary(state);
  assert.equal(outcome.decisions.length, 1);
});
