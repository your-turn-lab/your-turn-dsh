import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionCard, registerAgentTools } from '../src/agent-tools.js';
import { SessionRuntimeStore } from '../src/session-runtime.js';

function setup(questionAnswers = []) {
  const definitions = [];
  const sections = [];
  const ctx = {
    tools: { register(tool) { definitions.push(tool); } },
    systemPrompt: { section(value) { sections.push(value); } },
    userQuestions: { async ask() { return { answers: [questionAnswers.shift() ?? { skipped: true }] }; } },
  };
  const sessions = new SessionRuntimeStore();
  registerAgentTools(ctx, sessions);
  return { definitions, sections, sessions };
}
function agent(id = 'agent') { return { id, options: {}, session: { id, snapshotEvents: () => [] }, steer() {} }; }

test('decision cards separate context, reason, and question', () => {
  const card = buildDecisionCard({
    question: '你认为当前最重要的用户问题是什么？',
    recommended_mode: 'agent_coaches',
    decision_kind: 'growth',
    materials: ['[事实] 访谈多次提到重复劳动', '[约束] 样本仍然有限'],
    reasons: ['这是用户研究中的核心判断'],
  });
  assert.equal(card.header, 'Your Turn');
  assert.match(card.detail, /#### 相关信息/);
  assert.match(card.detail, /#### 为什么现在找你/);
  assert.match(card.detail, /#### 需要你判断/);
  assert.deepEqual(card.options, []);
});

test('direction cards require concrete task choices', () => {
  const card = buildDecisionCard({
    question: '优先采用哪个方向？',
    recommended_mode: 'human_leads',
    decision_kind: 'direction',
    options: [{ label: '方向 A', description: '速度优先' }, { label: '方向 B', description: '质量优先' }],
    materials: ['两种方向均可行'], reasons: ['选择会影响后续结果'],
  });
  assert.deepEqual(card.options.map((item) => item.label), ['方向 A', '方向 B']);
});

test('tools publish a model-generated path and pause for a decision', async () => {
  const { definitions, sessions, sections } = setup([{ selected: ['方向 B'] }]);
  const liveAgent = agent(); sessions.attach(liveAgent);
  const publish = definitions.find((tool) => tool.name === 'publish_task_plan');
  await publish.execute({ title: '任务', goal: '完成结果', nodes: [
    { id: 'decide', title: '确定方向', objective: '选择方向', instruction: '比较方案', rationale: '影响结果', mode: 'human_leads' },
    { id: 'deliver', title: '生成结果', objective: '交付', instruction: '执行', rationale: '机械工作', mode: 'agent' },
  ] }, { agent: liveAgent, signal: new AbortController().signal });
  const decision = definitions.find((tool) => tool.name === 'request_human_decision');
  const result = await decision.execute({ node_id: 'decide', question: '采用哪个方向？', recommended_mode: 'human_leads', decision_kind: 'direction', options: [{ label: '方向 A' }, { label: '方向 B' }], materials: ['事实'], reasons: ['影响最终结果'] }, { agent: liveAgent, signal: new AbortController().signal });
  assert.match(result.message, /方向 B/);
  assert.equal(sessions.state(liveAgent.id).interventions.at(-1).kind, 'direction_answer');
  assert.equal(sections.length, 1);
});

test('tools revise a changed deliverable and require explicit final reconciliation', async () => {
  const { definitions, sessions } = setup();
  const liveAgent = agent('reconcile'); sessions.attach(liveAgent);
  await definitions.find((tool) => tool.name === 'publish_task_plan').execute({ title: '任务', goal: '完成交付', nodes: [
    { id: 'work', title: '完成分析', objective: '得到结论', instruction: '分析材料', rationale: '核心工作', mode: 'agent' },
    { id: 'deliver', title: '生成 Markdown', objective: '写入文件', instruction: '创建 Markdown', rationale: '默认交付方式', mode: 'agent' },
  ] }, { agent: liveAgent, signal: new AbortController().signal });
  await definitions.find((tool) => tool.name === 'revise_task_node').execute({
    node_id: 'deliver', reason: '用户选择对话内交付', title: '在对话中交付', objective: '直接返回结果', instruction: '不创建文件，直接回答',
  }, { agent: liveAgent, signal: new AbortController().signal });
  const finish = definitions.find((tool) => tool.name === 'finish_task_run');
  await assert.rejects(() => finish.execute({ summary: '已交付', node_results: [] }, { agent: liveAgent, signal: new AbortController().signal }), /Reconcile every unfinished/);
  await finish.execute({ summary: '已在对话中交付', node_results: [
    { node_id: 'work', status: 'completed', result: '分析完成' },
    { node_id: 'deliver', status: 'completed', result: '对话交付完成' },
  ] }, { agent: liveAgent, signal: new AbortController().signal });
  assert.equal(sessions.state(liveAgent.id).nodes.every((node) => node.status === 'completed'), true);
});
