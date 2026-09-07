import test from 'node:test';
import assert from 'node:assert/strict';
import { publishTaskPlan, requestHumanDecision } from '../src/domain.js';
import { SessionRuntimeStore } from '../src/session-runtime.js';

function agent(id, events = []) { return { id, session: { id, snapshotEvents: () => events }, options: { provider: 'deepseek-official', model: 'deepseek-chat' }, steer() {} }; }
const plan = { title: '任务', goal: '完成交付', nodes: [
  { id: 'prepare', title: '准备', objective: '准备输入', instruction: '读取材料', rationale: '先建立上下文', mode: 'agent' },
  { id: 'decide', title: '判断', objective: '确定方向', instruction: '结合证据判断', rationale: '需要人参与', mode: 'agent_coaches' },
] };

test('runtime isolates DSH sessions', () => {
  const store = new SessionRuntimeStore(); store.attach(agent('a')); store.attach(agent('b'));
  store.update('a', (state) => publishTaskPlan(state, plan));
  assert.equal(store.state('a').nodes.length, 2);
  assert.equal(store.state('b').nodes.length, 0);
});

test('pending decisions remain scoped to their session', () => {
  const store = new SessionRuntimeStore(); store.attach(agent('a')); store.attach(agent('b'));
  store.update('a', (state) => requestHumanDecision(publishTaskPlan(state, plan), { nodeId: 'decide', question: '如何选择？', decisionKind: 'growth', materials: ['事实'], reasons: ['值得练习'] }));
  assert.equal(store.state('a').pendingDecision.nodeId, 'decide');
  assert.equal(store.state('b').pendingDecision, null);
});

test('successful tool history rebuilds the visible path', () => {
  const calls = [
    ['plan', 'publish_task_plan', plan, 'Published a 2-node task path.'],
    ['done', 'update_task_node', { node_id: 'prepare', status: 'completed', activity: '材料准备完成' }, 'Updated task node prepare to completed.'],
  ];
  const events = calls.flatMap(([callId, name, args, text]) => [
    { type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args), turn: 1, step: 1 } },
    { type: 'tool/result', data: { message: { source: { kind: 'tool', callId }, content: [{ type: 'tool-result', content: [{ type: 'text', text }] }] } } },
  ]);
  const store = new SessionRuntimeStore(); store.attach(agent('history', events));
  assert.equal(store.state('history').nodes.length, 2);
  assert.equal(store.state('history').nodes[0].status, 'completed');
});

test('recreated agents do not inherit stale memory', () => {
  const store = new SessionRuntimeStore(); const first = agent('same');
  store.attach(first); store.update('same', (state) => publishTaskPlan(state, plan)); store.detach(first); store.attach(agent('same'));
  assert.equal(store.state('same').nodes.length, 0);
});

test('replay restores path revisions, finish, and turn-end sync state', () => {
  const calls = [
    ['plan', 'publish_task_plan', plan, 'Published.'],
    ['revise', 'revise_task_node', { node_id: 'decide', reason: '用户改变交付方式', title: '对话交付' }, 'Revised.'],
    ['finish', 'finish_task_run', { summary: '完成', node_results: [
      { node_id: 'prepare', status: 'completed', result: '准备完成' },
      { node_id: 'decide', status: 'completed', result: '对话交付完成' },
    ] }, 'Finished.'],
  ];
  const events = calls.flatMap(([callId, name, args, text]) => [
    { type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args), turn: 1, step: 1 } },
    { type: 'tool/result', data: { message: { source: { kind: 'tool', callId }, content: [{ type: 'tool-result', content: [{ type: 'text', text }] }] } } },
  ]);
  events.push({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  const store = new SessionRuntimeStore(); store.attach(agent('replayed-finish', events));
  assert.equal(store.state('replayed-finish').nodes[1].title, '对话交付');
  assert.equal(store.state('replayed-finish').runCompletion.summary, '完成');
  assert.equal(store.state('replayed-finish').pathSync, null);
});

test('replay identifies a completed user turn that never published a path', () => {
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '完成一个简单任务' }] } },
    { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '结果' }] } } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  const store = new SessionRuntimeStore(); store.attach(agent('missing-path-history', events));
  assert.equal(store.state('missing-path-history').pathSync.status, 'needs_plan');
  assert.equal(store.state('missing-path-history').nodes.length, 0);
});

test('replay preserves a pending native question and clears it after the answer', () => {
  const planCall = { type: 'tool/call', data: { callId: 'plan', name: 'publish_task_plan', arguments: JSON.stringify(plan), turn: 1, step: 1 } };
  const planResult = { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'plan' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: 'Published.' }] }] } } };
  const askCall = { type: 'tool/call', data: { callId: 'ask', name: 'ask_user_question', arguments: JSON.stringify({ questions: [] }), turn: 1, step: 2 } };
  let store = new SessionRuntimeStore(); store.attach(agent('pending-native', [planCall, planResult, askCall]));
  assert.equal(store.state('pending-native').nodes[0].status, 'waiting_for_user');
  assert.equal(store.state('pending-native').pendingDecision, null);
  const askResult = { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'ask' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: '{\"answers\":[]}' }] }] } } };
  store = new SessionRuntimeStore(); store.attach(agent('answered-native', [planCall, planResult, askCall, askResult]));
  assert.equal(store.state('answered-native').nodes[0].status, 'in_progress');
  assert.equal(store.state('answered-native').externalQuestion, null);
});

test('replay restores a task-shaping native choice into decision effects', () => {
  const planCall = { type: 'tool/call', data: { callId: 'plan', name: 'publish_task_plan', arguments: JSON.stringify(plan), turn: 1, step: 1 } };
  const planResult = { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'plan' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: 'Published.' }] }] } } };
  const askCall = { type: 'tool/call', data: { callId: 'scope', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ id: 'scope', header: '交付形式', question: '使用哪种交付形式？', options: [{ label: '对话交付' }, { label: 'Markdown' }] }] }), turn: 1, step: 2 } };
  const askResult = { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'scope' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'scope', selected: ['对话交付'] }] }) }] }] } } };
  const store = new SessionRuntimeStore();
  store.attach(agent('native-decision-history', [planCall, planResult, askCall, askResult]));
  const state = store.state('native-decision-history');
  assert.equal(state.interventions.at(-1).kind, 'native_task_decision');
  assert.match(state.interventions.at(-1).after, /对话交付/);
  assert.ok(state.impacts.length >= 1);
});
