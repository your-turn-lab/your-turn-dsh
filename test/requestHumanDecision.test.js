import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAgentTools } from '../src/agent-tools.js';
import { SessionRuntimeStore } from '../src/session-runtime.js';

function agent(id = 'agent') {
  return { id, options: {}, session: { id, snapshotEvents: () => [] }, steer() {} };
}

function setup(questionAnswers = []) {
  const definitions = [];
  const askedQuestions = [];
  let askCount = 0;
  const ctx = {
    tools: { register(tool) { definitions.push(tool); } },
    systemPrompt: { section() {} },
    userQuestions: {
      async ask(payload) {
        askCount += 1;
        askedQuestions.push(payload?.questions?.[0]);
        return { answers: [questionAnswers.shift() ?? { skipped: true }] };
      },
    },
  };
  const sessions = new SessionRuntimeStore();
  registerAgentTools(ctx, sessions);
  return { definitions, sessions, askCount: () => askCount, askedQuestions };
}

async function publishSingleNode(definitions, liveAgent, nodePatch = {}) {
  await definitions.find((tool) => tool.name === 'publish_task_plan').execute({
    title: '任务',
    goal: '完成交付',
    nodes: [
      { id: 'decide', title: '确定方向', objective: '选择方向', instruction: '比较方案', rationale: '影响结果', mode: 'human_leads', ...nodePatch },
    ],
  }, { agent: liveAgent, signal: new AbortController().signal });
}

test('does not call DSH question service when recall is suppressed', async () => {
  const { definitions, sessions, askCount } = setup();
  const liveAgent = agent('suppressed');
  sessions.attach(liveAgent);
  await publishSingleNode(definitions, liveAgent);

  const result = await definitions.find((tool) => tool.name === 'request_human_decision').execute({
    node_id: 'decide',
    question: '标题用 A 还是 B？',
    recommended_mode: 'human_leads',
    decision_kind: 'direction',
    materials: ['已有标题都可用'],
    reasons: ['低影响偏好'],
    tags: [],
  }, { agent: liveAgent, signal: new AbortController().signal });

  assert.equal(result.status, 'suppressed');
  assert.equal(askCount(), 0);
  assert.equal(sessions.state(liveAgent.id).pendingDecision, null);
  assert.equal(sessions.state(liveAgent.id).recallDecisions.at(-1).action, 'AUTO');
  assert.equal(sessions.state(liveAgent.id).recallState.recallCount, 0);
  assert.equal(sessions.state(liveAgent.id).nodes[0].lastRecallDecision.action, 'AUTO');
});

test('calls DSH question service when recall passes', async () => {
  const { definitions, sessions, askCount, askedQuestions } = setup([{ selected: ['学术型'] }]);
  const liveAgent = agent('recall');
  sessions.attach(liveAgent);
  await publishSingleNode(definitions, liveAgent);

  const result = await definitions.find((tool) => tool.name === 'request_human_decision').execute({
    node_id: 'decide',
    question: '你希望报告采用哪种整体方向？',
    recommended_mode: 'human_leads',
    decision_kind: 'direction',
    options: [{ label: '学术型' }, { label: '展示型' }, { label: '简洁型' }],
    materials: ['三种方向都会影响后续内容组织'],
    reasons: ['影响最终结构'],
    whyAsk: '这个选择会影响后续内容组织和表达风格。',
    tags: [
      'preference_dependent',
      'downstream_impact',
      'core_judgment',
      'ownership_value',
    ],
  }, { agent: liveAgent, signal: new AbortController().signal });

  assert.equal(result.status, 'awaiting_human');
  assert.equal(askCount(), 1);
  assert.match(askedQuestions[0].detail, /#### Recall Policy/);
  assert.match(askedQuestions[0].detail, /Recall Value: 0\./);
  assert.match(askedQuestions[0].detail, /Recall Count: 1 \/ 3/);
  assert.equal(sessions.state(liveAgent.id).recallState.recallCount, 1);
  assert.equal(sessions.state(liveAgent.id).nodes[0].lastRecallDecision.budget.recallCount, 1);
  assert.equal(sessions.state(liveAgent.id).recallState.lastRecallNodeId, 'decide');
  assert.equal(sessions.state(liveAgent.id).interventions.at(-1).kind, 'direction_answer');
});

test('request recall falls back to node-specific tags when call tags are omitted', async () => {
  const { definitions, sessions, askCount } = setup([{ selected: ['方向 B'] }]);
  const liveAgent = agent('node-tags');
  sessions.attach(liveAgent);
  await publishSingleNode(definitions, liveAgent, {
    recall_tags: [
      'preference_dependent',
      'downstream_impact',
      'core_judgment',
      'ownership_value',
    ],
  });

  const result = await definitions.find((tool) => tool.name === 'request_human_decision').execute({
    node_id: 'decide',
    question: '采用哪个方向？',
    recommended_mode: 'human_leads',
    decision_kind: 'direction',
    options: [{ label: '方向 A' }, { label: '方向 B' }],
    materials: ['两个方向都可行'],
    reasons: ['影响后续结果'],
  }, { agent: liveAgent, signal: new AbortController().signal });

  assert.equal(result.status, 'awaiting_human');
  assert.equal(askCount(), 1);
  assert.deepEqual(sessions.state(liveAgent.id).recallDecisions.at(-1).tags, [
    'preference_dependent',
    'downstream_impact',
    'core_judgment',
    'ownership_value',
  ]);
});
