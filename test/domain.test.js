import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, STATUS, buildOutcomeSummary, createSessionState, publishTaskPlan, reduceTask, requestHumanDecision, resolveHumanDecision, updateTaskNode, updateTaskSubstep } from '../src/domain.js';

const plan = { title: '发布新功能', goal: '从信息到交付', nodes: [
  { id: 'research', title: '整理信息', objective: '形成事实基础', instruction: '整理已有材料', rationale: '适合自动执行', mode: MODES.agent, substeps: [{ id: 'collect', title: '收集材料', instruction: '读取输入' }, { id: 'organize', title: '整理证据', instruction: '保留来源' }] },
  { id: 'judge', title: '判断重点', objective: '形成关键判断', instruction: '先由用户判断', rationale: '值得练习', mode: MODES.agentCoaches },
  { id: 'deliver', title: '生成交付物', objective: '交付结果', instruction: '依据确认结论生成', rationale: '机械执行', mode: MODES.agent },
] };

test('a live task starts empty and accepts a model-published path', () => {
  const empty = createSessionState('session-a');
  assert.equal(empty.nodes.length, 0);
  const state = publishTaskPlan(empty, plan);
  assert.equal(state.nodes.length, 3);
  assert.equal(state.nodes[0].status, STATUS.inProgress);
});

test('substeps and nodes advance from progress updates', () => {
  let state = publishTaskPlan(createSessionState('progress'), plan);
  state = updateTaskSubstep(state, { nodeId: 'research', substepId: 'collect', status: STATUS.completed, result: '读取了三份输入' });
  assert.equal(state.nodes[0].substeps[1].status, STATUS.inProgress);
  state = updateTaskNode(state, { nodeId: 'research', status: STATUS.completed, activity: '证据整理完成' });
  assert.equal(state.nodes[1].status, STATUS.inProgress);
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
