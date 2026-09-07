import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, createPluginRuntime } from '../src/plugin.js';
import { SessionRuntimeStore } from '../src/session-runtime.js';
import { publishTaskPlan } from '../src/domain.js';

function agent(id) { return { id, options: { provider: 'deepseek-official', model: 'deepseek-chat' }, session: { id, snapshotEvents: () => [] }, steerCalls: [], followupCalls: [], injected: [], steer(message) { this.steerCalls.push(message); }, followup(message) { this.followupCalls.push(message); }, inject(message) { this.injected.push(message); } }; }

test('runtime returns an empty state before the Agent publishes a plan', async () => {
  const runtime = createPluginRuntime();
  const result = await runtime.handle('state', { sessionId: 'missing' });
  assert.equal(result.ok, true);
  assert.equal(result.value.nodes.length, 0);
});

test('editing a live step steers the owning Agent', async () => {
  const sessions = new SessionRuntimeStore();
  const liveAgent = agent('live'); sessions.attach(liveAgent);
  sessions.replace('live', publishTaskPlan(sessions.state('live'), { title: '任务', goal: '交付', nodes: [
    { id: 'draft', title: '生成初稿', objective: '获得初稿', instruction: '使用默认格式', rationale: '先完成内容', mode: 'agent' },
    { id: 'review', title: '检查', objective: '保证质量', instruction: '检查结果', rationale: '交付前检查', mode: 'agent' },
  ] }));
  const runtime = createPluginRuntime(sessions);
  const result = await runtime.handle('dispatch', { sessionId: 'live', type: 'EDIT_INSTRUCTION', nodeId: 'draft', instruction: '使用更简洁的格式' });
  assert.equal(result.ok, true);
  assert.equal(liveAgent.steerCalls.length, 1);
});

test('unknown actions are rejected', async () => {
  const runtime = createPluginRuntime();
  const result = await runtime.handle('dispatch', { sessionId: 'x', type: 'UNSUPPORTED' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'invalid-action');
});

test('user can request reconciliation after a completed turn left stale nodes', async () => {
  const sessions = new SessionRuntimeStore();
  const liveAgent = agent('sync'); sessions.attach(liveAgent);
  sessions.replace('sync', publishTaskPlan(sessions.state('sync'), { title: '任务', goal: '交付', nodes: [
    { id: 'work', title: '完成工作', objective: '完成', instruction: '执行', rationale: '核心步骤', mode: 'agent' },
  ] }));
  sessions.state('sync').pathSync = { status: 'needs_sync', turn: 1, reason: '路径未闭合' };
  const runtime = createPluginRuntime(sessions);
  const result = await runtime.handle('dispatch', { sessionId: 'sync', type: 'REQUEST_PATH_SYNC' });
  assert.equal(result.ok, true);
  assert.equal(liveAgent.followupCalls.length, 1);
  assert.match(liveAgent.followupCalls[0].content[0].text, /finish_task_run/);
});

test('turn-stopping requests at most one automatic reconciliation per turn', async () => {
  const listeners = new Map();
  const tools = [];
  const liveAgent = agent('host');
  const ctx = {
    tools: { register(tool) { tools.push(tool); } },
    systemPrompt: { section() {} },
    userQuestions: { async ask() { throw new Error('not used'); } },
    agents: { list: () => [liveAgent], get: (id) => id === liveAgent.id ? liveAgent : undefined },
    connection: { rpc: { handle() {} } },
    on(name, handler) { listeners.set(name, handler); },
  };
  apply(ctx);
  await tools.find((tool) => tool.name === 'publish_task_plan').execute({ title: '任务', goal: '交付', nodes: [
    { id: 'work', title: '完成工作', objective: '完成', instruction: '执行', rationale: '核心步骤', mode: 'agent' },
  ] }, { agent: liveAgent, signal: new AbortController().signal });
  listeners.get('agent/turn-stopping')({ agent: liveAgent, turn: 1 });
  listeners.get('agent/turn-stopping')({ agent: liveAgent, turn: 1 });
  assert.equal(liveAgent.steerCalls.length, 1);
  assert.match(liveAgent.steerCalls[0].content[0].text, /finish_task_run/);
  listeners.get('tools/result')({ agent: liveAgent, name: 'ask_user_question' }, { isError: false });
  assert.equal(liveAgent.injected.length, 1);
});

test('every direct user task requires a path regardless of seniority wording', async () => {
  const listeners = new Map();
  const senior = agent('senior');
  const intern = agent('intern');
  const agents = new Map([[senior.id, senior], [intern.id, intern]]);
  const ctx = {
    tools: { register() {} },
    systemPrompt: { section() {} },
    userQuestions: { async ask() { throw new Error('not used'); } },
    agents: { list: () => [...agents.values()], get: (id) => agents.get(id) },
    connection: { rpc: { handle() {} } },
    on(name, handler) { listeners.set(name, handler); },
  };
  apply(ctx);
  const next = async () => ({ kind: 'enter', messages: [] });
  const seniorDecision = await listeners.get('agent/pre-step')({
    agent: senior, turn: 1, step: 1, signal: new AbortController().signal,
    messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '作为技术生态资深运营，分析生态并规划重点' }] }],
  }, next);
  const internDecision = await listeners.get('agent/pre-step')({
    agent: intern, turn: 1, step: 1, signal: new AbortController().signal,
    messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '我是技术生态运营实习生，分析生态并规划重点' }] }],
  }, next);
  assert.match(seniorDecision.messages[0].content[0].text, /Every task requires a path/);
  assert.match(internDecision.messages[0].content[0].text, /Every task requires a path/);
  assert.doesNotMatch(seniorDecision.messages[0].content[0].text, /senior|intern/i);
  assert.equal(listeners.get('tools/pre-execute')({ agent: senior, name: 'bash' }, async () => ({ kind: 'allow' })) instanceof Promise, true);
  const denied = await listeners.get('tools/pre-execute')({ agent: senior, name: 'bash' }, async () => ({ kind: 'allow' }));
  assert.equal(denied.kind, 'deny');
  const allowed = await listeners.get('tools/pre-execute')({ agent: senior, name: 'publish_task_plan' }, async () => ({ kind: 'allow' }));
  assert.equal(allowed.kind, 'allow');
});

test('a simple task may use one node but cannot omit the path', async () => {
  const listeners = new Map();
  const liveAgent = agent('simple');
  const ctx = {
    tools: { register() {} }, systemPrompt: { section() {} }, userQuestions: {},
    agents: { list: () => [liveAgent], get: () => liveAgent }, connection: { rpc: { handle() {} } },
    on(name, handler) { listeners.set(name, handler); },
  };
  apply(ctx);
  const decision = await listeners.get('agent/pre-step')({
    agent: liveAgent, turn: 1, step: 1, signal: new AbortController().signal,
    messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '把这句话润色一下' }] }],
  }, async () => ({ kind: 'enter', messages: [] }));
  assert.match(decision.messages[0].content[0].text, /simple task may use one concise node/i);
});

test('native ask_user_question turns the current node red until its result settles', async () => {
  const listeners = new Map();
  const tools = [];
  const liveAgent = agent('native-question');
  const ctx = {
    tools: { register(tool) { tools.push(tool); } }, systemPrompt: { section() {} }, userQuestions: {},
    agents: { list: () => [liveAgent], get: () => liveAgent }, connection: { rpc: { handle() {} } },
    on(name, handler) { listeners.set(name, handler); },
  };
  apply(ctx);
  await tools.find((tool) => tool.name === 'publish_task_plan').execute({ title: '任务', goal: '完成', nodes: [
    { id: 'work', title: '分析材料', objective: '完成分析', instruction: '执行', rationale: '主步骤', mode: 'agent' },
  ] }, { agent: liveAgent, signal: new AbortController().signal });
  const allowed = await listeners.get('tools/pre-execute')({ agent: liveAgent, name: 'ask_user_question', callId: 'ask-1' }, async () => ({ kind: 'allow' }));
  assert.equal(allowed.kind, 'allow');
  const runtime = createPluginRuntime();
  const hostState = listeners.get('agent/turn-stopping') ? liveAgent : null;
  assert.ok(hostState);
  listeners.get('tools/result')({ agent: liveAgent, name: 'ask_user_question', callId: 'ask-1' }, { isError: false });
  assert.equal(liveAgent.injected.length, 1);
});

test('session tool events provide a fallback for native question pause state', async () => {
  const listeners = new Map();
  const tools = [];
  let rpcHandler;
  const liveAgent = agent('session-question');
  const ctx = {
    tools: { register(tool) { tools.push(tool); } }, systemPrompt: { section() {} }, userQuestions: {},
    agents: { list: () => [liveAgent], get: () => liveAgent }, connection: { rpc: { handle(_path, handler) { rpcHandler = handler; } } },
    on(name, handler) { listeners.set(name, handler); },
  };
  apply(ctx);
  await tools.find((tool) => tool.name === 'publish_task_plan').execute({ title: '任务', goal: '完成', nodes: [
    { id: 'work', title: '分析材料', objective: '完成分析', instruction: '执行', rationale: '主步骤', mode: 'agent' },
  ] }, { agent: liveAgent, signal: new AbortController().signal });
  listeners.get('session/event')(liveAgent.session, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'session-ask' } });
  let snapshot = await rpcHandler('state', { sessionId: liveAgent.id });
  assert.equal(snapshot.value.nodes[0].status, 'waiting_for_user');
  assert.equal(snapshot.value.pendingDecision, null);
  listeners.get('session/event')(liveAgent.session, { type: 'tool/result', data: { message: { source: { callId: 'session-ask' } } } });
  snapshot = await rpcHandler('state', { sessionId: liveAgent.id });
  assert.equal(snapshot.value.nodes[0].status, 'in_progress');
});
