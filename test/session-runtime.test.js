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
