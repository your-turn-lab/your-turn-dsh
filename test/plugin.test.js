import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginRuntime } from '../src/plugin.js';
import { SessionRuntimeStore } from '../src/session-runtime.js';
import { publishTaskPlan } from '../src/domain.js';

function agent(id) { return { id, options: { provider: 'deepseek-official', model: 'deepseek-chat' }, session: { id, snapshotEvents: () => [] }, steerCalls: [], steer(message) { this.steerCalls.push(message); } }; }

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
