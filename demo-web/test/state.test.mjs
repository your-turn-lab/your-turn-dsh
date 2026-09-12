import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, reduce, learningDecision } from '../src/state.mjs';

const send = (s, type, values = {}) => reduce(s, { type, ...values });
function firstRun() {
  let s = createState();
  s = send(s, 'SAVE_PROFILE', { answers: [1, 1, 1, 1], retain: '教学主线和表达方式', delegate: '素材整理', identity: '企业培训讲师' });
  s = send(s, 'CONFIRM_CONTROLS');
  s = send(s, 'SUBMIT_TASK', { prompt: '为银行客户准备 60 分钟 AI 办公培训' });
  s = send(s, 'NEXT'); // path -> auto
  s = send(s, 'NEXT'); // auto -> main
  s = send(s, 'ANSWER_MAIN', { choice: 0, note: '后半段一定要进入团队协作和知识复用' });
  return s;
}
function completeRun() {
  let s = firstRun();
  s = send(s, 'NEXT'); // candidate -> assessed
  s = send(s, 'NEXT'); // assessed -> autoRelation
  s = send(s, 'NEXT'); // -> interaction
  return send(s, 'ANSWER_INTERACTION', { choice: 0, note: '自然、低压力，不讲说不出口的冷幽默' });
}
test('starts with onboarding and rejects skipping decisions', () => {
  const s = createState();
  assert.equal(s.phase, 'onboarding');
  assert.equal(send(s, 'NEXT').phase, 'onboarding');
  assert.equal(send(s, 'ANSWER_MAIN', { choice: 0 }).phase, 'onboarding');
});
test('candidate is visible before evaluation and does not consume a recall', () => {
  let s = firstRun();
  assert.equal(s.phase, 'candidate');
  assert.equal(s.recallState.recallCount, 1);
  s = send(s, 'NEXT');
  assert.equal(s.phase, 'assessed');
  assert.equal(s.recallDecisions.at(-1).action, 'AUTO');
  assert.equal(s.recallState.recallCount, 1);
  s = send(s, 'NEXT');
  assert.equal(s.phase, 'autoRelation');
  assert.equal(s.nodes[3].status, 'completed');
});
test('full first run has two recalls and a complete 60-minute artifact', () => {
  const s = completeRun();
  assert.equal(s.phase, 'complete');
  assert.equal(s.recallState.recallCount, 2);
  assert.ok(s.nodes.every(n => n.status === 'completed'));
  assert.equal(s.artifacts[0].agenda.reduce((sum, x) => sum + x.minutes, 0), 60);
  assert.match(s.artifacts[0].main, /个人办公 → 团队协作 → 知识复用/);
  assert.match(s.artifacts[0].interaction, /痛点投票/);
});
test('My Turn preserves upstream work and updates every dependent node step by step', () => {
  let s = send(completeRun(), 'ACCEPT_FINAL_RESULT');
  s = send(s, 'CLIENT_CHANGE');
  const upstream = structuredClone(s.nodes.slice(0, 2));
  s = send(s, 'REVISE_SUBSTEP', { nodeId: 'case', substepId: 'case-1', instruction: '仅科技部门参加；用系统变更与故障复盘贯穿全课。' });
  assert.equal(s.phase, 'rerunning');
  assert.deepEqual(s.nodes.slice(0, 2), upstream);
  assert.deepEqual(s.nodes.slice(2).map(n => n.status), ['in_progress', 'pending', 'pending', 'pending']);
  assert.equal(s.finalAcceptedAt, null);
  for (let i = 0; i < 4; i++) s = send(s, 'NEXT');
  assert.equal(s.phase, 'updated');
  assert.equal(s.artifacts.length, 2);
  assert.equal(s.artifacts[0].audience, '银行客户 · 跨部门办公用户');
  assert.match(s.artifacts[1].audience, /科技部门/);
  assert.match(s.artifacts[1].requirements, /系统变更/);
  assert.ok(s.nodes.slice(2).every(n => n.version === 2));
  assert.equal(s.recallState.recallCount, 2);
});
test('double submissions do not duplicate decisions; reset clears all run state', () => {
  const s = completeRun();
  assert.deepEqual(send(s, 'ANSWER_INTERACTION', { choice: 0 }), s);
  assert.deepEqual(send(s, 'RESET'), createState());
});
test('chosen alternatives and notes appear in output instead of a canned preferred answer', () => {
  let s = createState();
  for (const a of [{ type: 'SAVE_PROFILE', answers: [0,0,0,0] }, { type: 'CONFIRM_CONTROLS' }, { type: 'SUBMIT_TASK', prompt: '测试任务' }, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'ANSWER_MAIN', choice: 1, note: '先讲痛点' }, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'ANSWER_INTERACTION', choice: 1, note: '不要求公开发言' }]) s = reduce(s, a);
  assert.match(s.artifacts[0].main, /痛点/);
  assert.match(s.artifacts[0].interaction, /匿名/);
  assert.match(s.artifacts[0].notes, /不要求公开发言/);
});
test('illustrative weighting changes the future routing, independently of the fixed run', () => {
  assert.equal(learningDecision([10, 10, 10], [0.2, 0.9, 0.8]), 'AUTO');
  assert.equal(learningDecision([90, 90, 90], [0.2, 0.9, 0.8]), 'YOUR_TURN');
});
