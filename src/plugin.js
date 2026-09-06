import { registerAgentTools, interventionMessage } from './agent-tools.js';
import { createSessionState, publicState, reduceTask } from './domain.js';
import { SessionRuntimeStore } from './session-runtime.js';

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
]);

function ok(value) { return { ok: true, value }; }
function fail(code, message) { return { ok: false, error: { code, message, details: {} } }; }

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
  ctx.on('agent/status', ({ agent, status }) => {
    const record = liveSessions.get(String(agent.id));
    if (record?.agent === agent) liveSessions.telemetry(String(agent.id), { agentStatus: status, lastEvent: `agent-${status}` });
  });
  ctx.on('session/event', (session, event) => {
    const exactAgent = ctx.agents.get(session.id);
    if (!exactAgent || exactAgent.session !== session || !liveSessions.get(String(session.id))) return;
    if (!['turn/start', 'turn/end', 'step/start', 'step/end', 'tool/call', 'tool/result'].includes(event.type)) return;
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
