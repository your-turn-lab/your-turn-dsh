import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, createPluginRuntime } from '../src/plugin.js';
import { SessionRuntimeStore } from '../src/session-runtime.js';
import { publishTaskPlan } from '../src/domain.js';

function agent(id) { return { id, options: { provider: 'deepseek-official', model: 'deepseek-chat' }, session: { id, snapshotEvents: () => [] }, steerCalls: [], followupCalls: [], injected: [], steer(message) { this.steerCalls.push(message); }, followup(message) { this.followupCalls.push(message); }, inject(message) { this.injected.push(message); } }; }

function preferenceAnswers() {
  return {
    answers: [
      { id: 'interruption_style', selected: ['重要判断问我'] },
      { id: 'preference_ownership', selected: ['重要选择问我'] },
      { id: 'learning_intent', selected: ['平衡参与'] },
      { id: 'recall_budget', selected: ['2 到 3 次'] },
    ],
  };
}

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

test('preference onboarding asks native questions and saves the profile', async () => {
  const sessions = new SessionRuntimeStore();
  const liveAgent = agent('onboarding'); sessions.attach(liveAgent);
  let asked;
  const runtime = createPluginRuntime(sessions, {
    userQuestions: {
      async ask(payload) {
        asked = payload.questions;
        return {
          answers: [
            { id: 'interruption_style', selected: ['多给我参与'] },
            { id: 'preference_ownership', selected: ['多数选择问我'] },
            { id: 'learning_intent', selected: ['练习判断'] },
            { id: 'recall_budget', selected: ['有价值就问'] },
          ],
        };
      },
    },
  });

  const result = await runtime.handle('dispatch', { sessionId: 'onboarding', type: 'START_PREFERENCE_ONBOARDING' });

  assert.equal(result.ok, true);
  assert.equal(asked.length, 4);
  assert.equal(result.value.preferenceProfile.preset, 'participatory');
  assert.equal(result.value.preferenceOnboarding.status, 'completed');
});

test('manual preference edit can rerun onboarding after a profile exists', async () => {
  const sessions = new SessionRuntimeStore();
  const liveAgent = agent('edit-onboarding'); sessions.attach(liveAgent);
  let askCount = 0;
  const runtime = createPluginRuntime(sessions, {
    userQuestions: {
      async ask() {
        askCount += 1;
        return preferenceAnswers();
      },
    },
  });
  await runtime.handle('dispatch', { sessionId: 'edit-onboarding', type: 'APPLY_PREFERENCE_PROFILE', source: 'migrated_local', profile: { profile: { preset: 'conservative', thresholdBias: 0.1, maxRecall: 1 } } });

  const result = await runtime.handle('dispatch', { sessionId: 'edit-onboarding', type: 'START_PREFERENCE_ONBOARDING' });

  assert.equal(result.ok, true);
  assert.equal(askCount, 1);
  assert.equal(result.value.preferenceProfile.preset, 'balanced');
  assert.equal(result.value.preferenceOnboarding.source, 'cold_start');
});

test('preference onboarding skip is kept session-local', async () => {
  const sessions = new SessionRuntimeStore();
  const liveAgent = agent('skip-onboarding'); sessions.attach(liveAgent);
  const runtime = createPluginRuntime(sessions, {
    userQuestions: {
      async ask() {
        return { answers: [{ id: 'interruption_style', skipped: true }] };
      },
    },
  });

  const result = await runtime.handle('dispatch', { sessionId: 'skip-onboarding', type: 'START_PREFERENCE_ONBOARDING' });

  assert.equal(result.ok, true);
  assert.equal(result.value.preferenceProfile, null);
  assert.equal(result.value.preferenceOnboarding.status, 'skipped');
});

test('local preference migration action writes current session state', async () => {
  const sessions = new SessionRuntimeStore();
  const liveAgent = agent('migrate-preference'); sessions.attach(liveAgent);
  const runtime = createPluginRuntime(sessions);

  const result = await runtime.handle('dispatch', {
    sessionId: 'migrate-preference',
    type: 'APPLY_PREFERENCE_PROFILE',
    source: 'migrated_local',
    profile: {
      summary: '继续使用本地偏好',
      profile: {
        preset: 'conservative',
        thresholdBias: 0.1,
        maxRecall: 1,
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.preferenceProfile.preset, 'conservative');
  assert.equal(result.value.preferenceOnboarding.source, 'migrated_local');
});

test('local preference migration asks for native confirmation before applying', async () => {
  const sessions = new SessionRuntimeStore();
  const liveAgent = agent('confirm-migration'); sessions.attach(liveAgent);
  let question;
  const runtime = createPluginRuntime(sessions, {
    userQuestions: {
      async ask(payload) {
        question = payload.questions[0];
        return { answers: [{ id: 'preference_migration', selected: ['沿用上次偏好'] }] };
      },
    },
  });

  const result = await runtime.handle('dispatch', {
    sessionId: 'confirm-migration',
    type: 'CONFIRM_PREFERENCE_MIGRATION',
    profile: {
      summary: '平衡参与，重要方向会问你，普通执行自动推进。',
      profile: {
        preset: 'balanced',
        thresholdBias: 0,
        maxRecall: 3,
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(question.id, 'preference_migration');
  assert.match(question.detail, /平衡参与/);
  assert.deepEqual(question.options.map((option) => option.label), ['沿用上次偏好', '重新选择', '本次跳过']);
  assert.equal(result.value.preferenceProfile.preset, 'balanced');
  assert.equal(result.value.preferenceOnboarding.source, 'migrated_local');
});

test('local preference migration can switch into full onboarding', async () => {
  const sessions = new SessionRuntimeStore();
  const liveAgent = agent('reselect-migration'); sessions.attach(liveAgent);
  const asked = [];
  const runtime = createPluginRuntime(sessions, {
    userQuestions: {
      async ask(payload) {
        asked.push(payload.questions);
        if (payload.questions[0].id === 'preference_migration') return { answers: [{ id: 'preference_migration', selected: ['重新选择'] }] };
        return preferenceAnswers();
      },
    },
  });

  const result = await runtime.handle('dispatch', {
    sessionId: 'reselect-migration',
    type: 'CONFIRM_PREFERENCE_MIGRATION',
    profile: { profile: { preset: 'conservative', thresholdBias: 0.1, maxRecall: 1 } },
  });

  assert.equal(result.ok, true);
  assert.equal(asked.length, 2);
  assert.equal(asked[1].length, 4);
  assert.equal(result.value.preferenceProfile.preset, 'balanced');
  assert.equal(result.value.preferenceOnboarding.source, 'cold_start');
});

test('direct task waits while local preference migration confirmation is open', async () => {
  const listeners = new Map();
  let rpcHandler;
  let resolveAsk;
  const liveAgent = agent('blocked-migration');
  const ctx = {
    tools: { register() {} },
    systemPrompt: { section() {} },
    userQuestions: {
      async ask() {
        return new Promise((resolve) => { resolveAsk = resolve; });
      },
    },
    agents: { list: () => [liveAgent], get: (id) => id === liveAgent.id ? liveAgent : undefined },
    connection: { rpc: { handle(_path, handler) { rpcHandler = handler; } } },
    on(name, handler) { listeners.set(name, handler); },
  };
  apply(ctx);
  const migration = rpcHandler('dispatch', {
    sessionId: liveAgent.id,
    type: 'CONFIRM_PREFERENCE_MIGRATION',
    profile: { summary: '平衡参与，重要方向会问你，普通执行自动推进。', profile: { preset: 'balanced', thresholdBias: 0, maxRecall: 3 } },
  });
  await new Promise((resolve) => setImmediate(resolve));
  let settled = false;
  const preStep = listeners.get('agent/pre-step')({
    agent: liveAgent, turn: 1, step: 1, signal: new AbortController().signal,
    messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '开始任务' }] }],
  }, async () => ({ kind: 'enter', messages: [] })).then((value) => { settled = true; return value; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  resolveAsk({ answers: [{ id: 'preference_migration', selected: ['沿用上次偏好'] }] });
  const decision = await preStep;
  const migrated = await migration;

  assert.equal(migrated.ok, true);
  assert.equal(settled, true);
  assert.match(decision.messages[0].content[0].text, /Every task requires a path/);
});

test('local preference registered before an agent exists is confirmed on the first task', async () => {
  const listeners = new Map();
  let rpcHandler;
  let askedQuestion;
  const liveAgent = agent('pending-local-preference');
  const agents = new Map();
  const ctx = {
    tools: { register() {} },
    systemPrompt: { section() {} },
    userQuestions: {
      async ask(payload) {
        askedQuestion = payload.questions[0];
        return { answers: [{ id: 'preference_migration', selected: ['沿用上次偏好'] }] };
      },
    },
    agents: { list: () => [], get: (id) => agents.get(id) },
    connection: { rpc: { handle(_path, handler) { rpcHandler = handler; } } },
    on(name, handler) { listeners.set(name, handler); },
  };
  apply(ctx);
  const stored = await rpcHandler('state', {
    sessionId: liveAgent.id,
    localPreference: { summary: '平衡参与，重要方向会问你，普通执行自动推进。', profile: { preset: 'balanced', thresholdBias: 0, maxRecall: 3 } },
  });
  agents.set(liveAgent.id, liveAgent);
  listeners.get('agent/created')({ agent: liveAgent });

  const decision = await listeners.get('agent/pre-step')({
    agent: liveAgent, turn: 1, step: 1, signal: new AbortController().signal,
    messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '开始任务' }] }],
  }, async () => ({ kind: 'enter', messages: [] }));
  const snapshot = await rpcHandler('state', { sessionId: liveAgent.id });

  assert.equal(stored.ok, true);
  assert.equal(askedQuestion.id, 'preference_migration');
  assert.equal(snapshot.value.preferenceProfile.preset, 'balanced');
  assert.match(decision.messages[0].content[0].text, /Every task requires a path/);
});

test('local preference from state polling is confirmed after the live agent appears', async () => {
  const listeners = new Map();
  let rpcHandler;
  let askedQuestion;
  const liveAgent = agent('state-poll-preference');
  const ctx = {
    tools: { register() {} },
    systemPrompt: { section() {} },
    userQuestions: {
      async ask(payload) {
        askedQuestion = payload.questions[0];
        return { answers: [{ id: 'preference_migration', selected: ['沿用上次偏好'] }] };
      },
    },
    agents: { list: () => [liveAgent], get: (id) => id === liveAgent.id ? liveAgent : undefined },
    connection: { rpc: { handle(_path, handler) { rpcHandler = handler; } } },
    on(name, handler) { listeners.set(name, handler); },
  };
  apply(ctx);
  await rpcHandler('state', {
    sessionId: liveAgent.id,
    localPreference: { summary: '平衡参与，重要方向会问你，普通执行自动推进。', profile: { preset: 'balanced', thresholdBias: 0, maxRecall: 3 } },
  });

  await listeners.get('agent/pre-step')({
    agent: liveAgent, turn: 1, step: 1, signal: new AbortController().signal,
    messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '开始任务' }] }],
  }, async () => ({ kind: 'enter', messages: [] }));
  const snapshot = await rpcHandler('state', { sessionId: liveAgent.id });

  assert.equal(askedQuestion.id, 'preference_migration');
  assert.equal(snapshot.value.preferenceProfile.preset, 'balanced');
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

test('first direct task waits for preference onboarding before planning can continue', async () => {
  const listeners = new Map();
  let rpcHandler;
  let asked = false;
  const liveAgent = agent('first-task-preference');
  const ctx = {
    tools: { register() {} },
    systemPrompt: { section() {} },
    userQuestions: {
      async ask() {
        asked = true;
        return preferenceAnswers();
      },
    },
    agents: { list: () => [liveAgent], get: (id) => id === liveAgent.id ? liveAgent : undefined },
    connection: { rpc: { handle(_path, handler) { rpcHandler = handler; } } },
    on(name, handler) { listeners.set(name, handler); },
  };
  apply(ctx);

  const decision = await listeners.get('agent/pre-step')({
    agent: liveAgent, turn: 1, step: 1, signal: new AbortController().signal,
    messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '开始一个新任务' }] }],
  }, async () => ({ kind: 'enter', messages: [] }));
  const snapshot = await rpcHandler('state', { sessionId: liveAgent.id });

  assert.equal(asked, true);
  assert.equal(snapshot.value.preferenceOnboarding.status, 'completed');
  assert.match(decision.messages[0].content[0].text, /Every task requires a path/);
});

test('every direct user task requires a path regardless of seniority wording', async () => {
  const listeners = new Map();
  const senior = agent('senior');
  const intern = agent('intern');
  const agents = new Map([[senior.id, senior], [intern.id, intern]]);
  const ctx = {
    tools: { register() {} },
    systemPrompt: { section() {} },
    userQuestions: { async ask() { return preferenceAnswers(); } },
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
    tools: { register() {} }, systemPrompt: { section() {} }, userQuestions: { async ask() { return preferenceAnswers(); } },
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
