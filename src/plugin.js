import { registerAgentTools, interventionMessage } from './agent-tools.js';
import { applyTurnEnd, beginNativeQuestion, createSessionState, endNativeQuestion, publicState, reduceTask } from './domain.js';
import { SessionRuntimeStore } from './session-runtime.js';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

export const name = 'your-turn-dsh';
export const inject = ['connection', 'agents', 'tools', 'systemPrompt', 'userQuestions'];

const allowedActions = new Set([
  'SELECT_NODE',
  'ACCEPT_SUGGESTION',
  'DISMISS_SUGGESTION',
  'CHANGE_MODE',
  'EDIT_INSTRUCTION',
  'REVISE_SUBSTEP',
  'ACCEPT_FINAL_RESULT',
  'REQUEST_PATH_SYNC',
]);

function ok(value) { return { ok: true, value }; }
function fail(code, message) { return { ok: false, error: { code, message, details: {} } }; }
function questionAnswerFromEvent(event) {
  const block = event.data?.message?.content?.[0];
  const nested = block?.type === 'tool-result' ? block.content : [];
  const text = nested.filter((item) => item.type === 'text').map((item) => item.text).join(' ');
  try { return JSON.parse(text); } catch { return undefined; }
}

export function createPluginRuntime(liveSessions = new SessionRuntimeStore()) {
  async function snapshot(sessionId) {
    const live = sessionId ? liveSessions.get(sessionId) : undefined;
    const state = live?.state ?? createSessionState(sessionId || 'no-session');
    return publicState(state, {
      mode: 'agent',
      label: live ? `LIVE AGENT · ${state.agent.provider ?? 'DSH'}/${state.agent.model ?? 'current model'}` : '等待选择 DSH 会话',
      ready: Boolean(live?.agent),
    });
  }

  async function handle(endpoint, payload) {
    try {
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : undefined;
      if (endpoint === 'state') return ok(await snapshot(sessionId));
      if (endpoint !== 'dispatch') return fail('not-found', `Unknown endpoint: ${endpoint}`);
      if (!payload || typeof payload !== 'object' || !allowedActions.has(payload.type)) {
        return fail('invalid-action', 'Unsupported task action.');
      }
      if (!sessionId || !liveSessions.get(sessionId)) return fail('session-not-found', 'No live DSH Agent is attached to this session.');
      const record = liveSessions.require(sessionId);
      if (payload.type === 'REQUEST_PATH_SYNC') {
        const unfinished = record.state.nodes.filter((node) => !['completed', 'skipped'].includes(node.status));
        if (unfinished.length === 0 && record.state.nodes.length > 0) return ok(await snapshot(sessionId));
        const unresolved = unfinished.length > 0 ? unfinished.map((node) => `${node.id} (${node.title})`).join(', ') : 'no path was published';
        record.agent.followup(createUserMessage({
          content: [{ type: 'text', text: `[Path synchronization requested by user]\nThe previous turn ended with this path state: ${unresolved}. If no path exists, call publish_task_plan first, reconstructing concise nodes from the work already performed. Reconcile the path against the work actually delivered and any answers from DSH question cards. Call revise_task_node for changed scope or deliverables, then finish_task_run. Do not repeat the prior final answer.` }],
          source: { kind: 'plugin', plugin: name, form: 'notice', summary: 'User requested path synchronization' },
        }));
        return ok(await snapshot(sessionId));
      }
      const beforeNode = record.state.nodes.find((node) => node.id === payload.nodeId);
      const beforeInstruction = beforeNode?.instruction;
      record.state = reduceTask(record.state, payload);
      if (payload.type === 'EDIT_INSTRUCTION' && beforeNode && beforeInstruction !== payload.instruction) {
        record.agent.steer(interventionMessage(beforeNode, beforeInstruction, payload.instruction));
      }
      if (payload.type === 'CHANGE_MODE' && beforeNode) {
        record.agent.steer(interventionMessage(beforeNode, `collaboration mode: ${beforeNode.mode}`, `collaboration mode: ${payload.mode}`));
      }
      if (payload.type === 'ACCEPT_SUGGESTION' && beforeNode) {
        record.agent.steer(interventionMessage(beforeNode, `collaboration mode: ${beforeNode.mode}`, `collaboration mode: ${payload.mode}`));
      }
      if (payload.type === 'REVISE_SUBSTEP' && beforeNode) {
        const substep = beforeNode.substeps.find((item) => item.id === payload.substepId);
        record.agent.steer(interventionMessage(
          beforeNode,
          `substep ${substep?.title ?? payload.substepId}: ${substep?.instruction ?? ''}`,
          `substep ${substep?.title ?? payload.substepId}: ${payload.instruction}. Restart from this substep and revise affected downstream work.`,
        ));
      }
      return ok(await snapshot(sessionId));
    } catch (error) {
      return fail('operation-failed', error instanceof Error ? error.message : String(error));
    }
  }

  return { handle, liveSessions };
}

export function apply(ctx) {
  const liveSessions = new SessionRuntimeStore();
  const runtime = createPluginRuntime(liveSessions);
  registerAgentTools(ctx, liveSessions);

  for (const agent of ctx.agents.list()) liveSessions.attach(agent);
  ctx.on('agent/created', ({ agent }) => liveSessions.attach(agent));
  ctx.on('agent/disposed', ({ agent }) => liveSessions.detach(agent));
  ctx.on('agent/pre-step', async ({ agent, messages, turn }, next) => {
    const decision = await next();
    if (decision.kind === 'reject') return decision;
    const record = liveSessions.get(String(agent.id)) ?? liveSessions.attach(agent);
    const directPrompt = messages.some((message) => message.source?.kind === 'user');
    const priorPathComplete = record.state.nodes.length > 0 && record.state.nodes.every((node) => ['completed', 'skipped'].includes(node.status));
    if (!directPrompt || (record.state.nodes.length > 0 && !priorPathComplete)) return decision;
    const planningNotice = createUserMessage({
      content: [{ type: 'text', text: '[Visible path required] Before any research, execution, or final answer for this user request, your first tool action must be publish_task_plan. Every task requires a path; a simple task may use one concise node. User identity affects growth recall only, never whether the path exists.' }],
      source: { kind: 'plugin', plugin: name, form: 'notice', summary: 'Publish the visible path first' },
    });
    record.state = { ...record.state, pathSync: null, telemetry: { ...record.state.telemetry, pathRequiredTurn: turn }, revision: record.state.revision + 1 };
    return { ...decision, messages: [...decision.messages, planningNotice] };
  });
  ctx.on('agent/status', ({ agent, status }) => {
    const record = liveSessions.get(String(agent.id));
    if (record?.agent === agent) liveSessions.telemetry(String(agent.id), { agentStatus: status, lastEvent: `agent-${status}` });
  });
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (!exec.agent) return next();
    const record = liveSessions.get(String(exec.agent.id)) ?? liveSessions.attach(exec.agent);
    const requiredTurn = record.state.telemetry?.pathRequiredTurn;
    if (requiredTurn && record.state.telemetry?.pathPublishedTurn !== requiredTurn && exec.name !== 'publish_task_plan') {
      return { kind: 'deny', reason: 'Publish the visible task path first with publish_task_plan. Every task requires a path; use one concise node for a simple task.' };
    }
    const decision = await next();
    if (decision.kind === 'allow' && exec.name === 'ask_user_question' && !record.state.pendingDecision) {
      record.state = beginNativeQuestion(record.state, { callId: exec.callId, questions: exec.arguments?.questions });
    }
    return decision;
  });
  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    const record = liveSessions.get(String(agent.id));
    if (!record || record.state.pendingDecision) return;
    if (record.state.telemetry?.pathRequiredTurn === turn && record.state.telemetry?.pathPublishedTurn !== turn) {
      const attempts = record.state.telemetry?.planAttemptsByTurn ?? {};
      if ((attempts[turn] ?? 0) >= 1) return;
      record.state = { ...record.state, telemetry: { ...record.state.telemetry, planAttemptsByTurn: { ...attempts, [turn]: 1 } }, revision: record.state.revision + 1 };
      agent.steer(createUserMessage({
        content: [{ type: 'text', text: '[Visible path missing] This turn cannot close without a visible path. Call publish_task_plan now, using one node if the task is simple, then reconcile completed work with finish_task_run. Do not repeat the user-facing answer.' }],
        source: { kind: 'plugin', plugin: name, form: 'notice', summary: 'Publish the missing task path' },
      }));
      return;
    }
    if (record.state.nodes.length === 0) return;
    const unfinished = record.state.nodes.filter((node) => !['completed', 'skipped'].includes(node.status));
    if (unfinished.length === 0) return;
    const attempts = record.state.telemetry?.syncAttemptsByTurn ?? {};
    if ((attempts[turn] ?? 0) >= 1) return;
    record.state = {
      ...record.state,
      telemetry: { ...record.state.telemetry, syncAttemptsByTurn: { ...attempts, [turn]: 1 } },
      revision: record.state.revision + 1,
    };
    const unresolved = unfinished.map((node) => `${node.id} (${node.title})`).join(', ');
    const text = `[Path synchronization required]\nBefore ending this turn, reconcile the visible task path. The unresolved nodes are: ${unresolved}. If a user answer from any DSH question changed the scope or deliverable, call revise_task_node first. Then call finish_task_run with a completed or skipped resolution for every unresolved node. Do not repeat the final user-facing answer before the path is synchronized.`;
    agent.steer(createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: name, form: 'notice', summary: 'Reconcile the visible task path before ending' },
    }));
  });
  ctx.on('tools/result', (exec, result) => {
    if (!exec.agent || exec.name !== 'ask_user_question') return;
    const record = liveSessions.get(String(exec.agent.id));
    if (!record || record.state.nodes.length === 0) return;
    record.state = endNativeQuestion(record.state, { callId: exec.callId, answer: result.value, isError: result.isError });
    if (result.isError) return;
    exec.agent.inject(createUserMessage({
      content: [{ type: 'text', text: '[Path input notice] The answer returned by ask_user_question is authoritative task input. If it changes scope, deliverable, method, or acceptance criteria, update the affected visible node with revise_task_node before continuing.' }],
      source: { kind: 'plugin', plugin: name, form: 'notice', summary: 'Apply the question answer to the visible path' },
    }));
  });
  ctx.on('session/event', (session, event) => {
    const exactAgent = ctx.agents.get(session.id);
    if (!exactAgent || exactAgent.session !== session || !liveSessions.get(String(session.id))) return;
    if (!['turn/start', 'turn/end', 'step/start', 'step/end', 'tool/call', 'tool/result'].includes(event.type)) return;
    if (event.type === 'turn/end') {
      liveSessions.update(String(session.id), (state) => applyTurnEnd(state, event.data.turn, event.data.reason));
      return;
    }
    if (event.type === 'tool/call' && event.data.name === 'ask_user_question') {
      let args = {};
      try { args = JSON.parse(event.data.arguments || '{}'); } catch { /* Keep an empty question list. */ }
      liveSessions.update(String(session.id), (state) => beginNativeQuestion(state, { callId: event.data.callId, questions: args.questions }));
    }
    if (event.type === 'tool/result') {
      liveSessions.update(String(session.id), (state) => endNativeQuestion(state, {
        callId: event.data.message?.source?.callId,
        answer: questionAnswerFromEvent(event),
        isError: Boolean(event.data.error),
      }));
    }
    const patch = { lastEvent: event.type };
    if (event.type === 'turn/start') patch.turn = event.data.turn;
    if (event.type === 'step/start') { patch.turn = event.data.turn; patch.step = event.data.step; }
    if (event.type === 'tool/call') patch.currentTool = event.data.name;
    if (event.type === 'tool/result' || event.type === 'step/end') patch.currentTool = null;
    liveSessions.telemetry(String(session.id), patch);
  });
  ctx.connection.rpc.handle('/your-turn', (endpoint, payload) => runtime.handle(endpoint, payload));
  console.log('[your-turn-dsh] human decision layer loaded');
}
