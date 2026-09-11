import { MODES, addSystemSuggestion, applyTelemetry, applyTurnEnd, beginNativeQuestion, createSessionState, endNativeQuestion, evaluateRecallForNode, finishTaskRun, publishTaskPlan, requestHumanDecision, resolveHumanDecision, reviseTaskNode, updateTaskNode, updateTaskSubstep } from './domain.js';

const OWN_TOOLS = new Set(['publish_task_plan', 'update_task_node', 'update_task_substep', 'revise_task_node', 'finish_task_run', 'suggest_human_involvement', 'request_human_decision']);

function argsOf(raw) { try { return JSON.parse(raw); } catch { return null; } }
function contentText(event) {
  const block = event.data?.message?.content?.[0];
  const nested = block?.type === 'tool-result' ? block.content : [];
  return nested.filter((item) => item.type === 'text').map((item) => item.text).join(' ');
}
function blocksText(blocks = []) {
  return blocks.flatMap((block) => block.type === 'text'
    ? [block.text]
    : block.type === 'tool-result'
      ? block.content?.filter((item) => item.type === 'text').map((item) => item.text) ?? []
      : []).join(' ');
}

function replayOwnTool(state, name, args, text) {
  if (name === 'publish_task_plan') state = publishTaskPlan(state, args);
  if (name === 'update_task_node') state = updateTaskNode(state, { nodeId: args.node_id, status: args.status, activity: args.activity, evidence: args.evidence ?? [] });
  if (name === 'update_task_substep') state = updateTaskSubstep(state, { nodeId: args.node_id, substepId: args.substep_id, status: args.status, result: args.result ?? '' });
  if (name === 'revise_task_node') state = reviseTaskNode(state, { nodeId: args.node_id, reason: args.reason, title: args.title, objective: args.objective, instruction: args.instruction, rationale: args.rationale, substeps: args.substeps });
  if (name === 'finish_task_run') state = finishTaskRun(state, { summary: args.summary, nodeResults: (args.node_results ?? []).map((item) => ({ nodeId: item.node_id, status: item.status, result: item.result })) });
  if (name === 'suggest_human_involvement') state = addSystemSuggestion(state, { nodeId: args.node_id, recommendedMode: args.recommended_mode, recallKind: args.decision_kind, reasons: args.reasons, tags: args.tags, whyAsk: args.whyAsk, isCritical: args.isCritical });
  if (name === 'request_human_decision') {
    const evaluated = evaluateRecallForNode(state, args.node_id, {
      source: 'agent_requested',
      question: args.question,
      options: args.options ?? [],
      reason: args.reasons?.join('；') ?? '',
      tags: args.tags,
      isCritical: Boolean(args.isCritical),
      decisionKind: args.decision_kind,
      recommendedMode: args.recommended_mode,
    });
    state = evaluated.state;
    const recallDecision = evaluated.recallDecision;
    if (/Recall suppressed by recall policy/i.test(text)) return state;
    state = requestHumanDecision(state, { nodeId: args.node_id, question: args.question, recommendedMode: args.recommended_mode, decisionKind: args.decision_kind, materials: args.materials, reasons: args.reasons, whyAsk: args.whyAsk, tags: args.tags, isCritical: args.isCritical, recallDecision });
    const match = text.match(/Mode: ([a-z_]+)\. Response: ([\s\S]*)$/);
    if (match) state = resolveHumanDecision(state, { nodeId: args.node_id, mode: Object.values(MODES).includes(match[1]) ? match[1] : MODES.agent, response: match[2] });
  }
  return state;
}

export function replaySessionState(session) {
  let state = createSessionState(String(session.id));
  const calls = new Map();
  for (const event of session.snapshotEvents()) {
    if (event.type === 'user/message' && event.data?.source?.kind === 'user') {
      state = applyTelemetry(state, { pathRequiredTurn: state.telemetry.turn });
    }
    if (event.type === 'tool/call') {
      calls.set(String(event.data.callId), { name: event.data.name, args: argsOf(event.data.arguments) });
      if (event.data.name === 'ask_user_question') state = beginNativeQuestion(state, { callId: event.data.callId, questions: argsOf(event.data.arguments)?.questions });
    }
    if (event.type === 'tool/result') {
      const call = calls.get(String(event.data.message?.source?.callId));
      if (call?.name === 'ask_user_question') {
        let answer;
        try { answer = JSON.parse(contentText(event)); } catch { answer = undefined; }
        state = endNativeQuestion(state, { callId: event.data.message?.source?.callId, answer, isError: Boolean(event.data.error) });
      }
      if (!call?.args || event.data.error || /Error:/i.test(contentText(event)) || !OWN_TOOLS.has(call.name)) continue;
      try { state = replayOwnTool(state, call.name, call.args, contentText(event)); } catch { /* Ignore incomplete historical calls. */ }
    }
    if (event.type === 'tool/code-dispatch' && OWN_TOOLS.has(event.data.name) && !event.data.isError) {
      try { state = replayOwnTool(state, event.data.name, event.data.arguments, blocksText(event.data.content)); } catch { /* Ignore incomplete historical calls. */ }
    }
    if (event.type === 'turn/start') state = applyTelemetry(state, { turn: event.data.turn, lastEvent: event.type });
    if (event.type === 'step/start') state = applyTelemetry(state, { turn: event.data.turn, step: event.data.step, lastEvent: event.type });
    if (event.type === 'turn/end') state = applyTurnEnd(state, event.data.turn, event.data.reason);
  }
  return state;
}

export class SessionRuntimeStore {
  constructor() { this.records = new Map(); }
  attach(agent) {
    const id = String(agent.id);
    const current = this.records.get(id);
    if (current?.agent === agent && current.session === agent.session) return current;
    const state = replaySessionState(agent.session);
    state.agent = { provider: agent.options?.provider, model: agent.options?.model };
    const record = { agent, session: agent.session, state };
    this.records.set(id, record);
    return record;
  }
  detach(agent) {
    const id = String(agent.id);
    const record = this.records.get(id);
    if (record?.agent === agent) this.records.delete(id);
  }
  get(sessionId) { return this.records.get(String(sessionId)); }
  require(sessionId) {
    const record = this.get(sessionId);
    if (!record?.agent) throw new Error('No live DSH Agent is attached to this session.');
    return record;
  }
  state(sessionId) { return this.require(sessionId).state; }
  replace(sessionId, next) { this.require(sessionId).state = next; return next; }
  update(sessionId, updater) { const record = this.require(sessionId); record.state = updater(record.state); return record.state; }
  telemetry(sessionId, patch) { return this.update(sessionId, (state) => applyTelemetry(state, patch)); }
}
