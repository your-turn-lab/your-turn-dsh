import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { MODES, STATUS, addSystemSuggestion, publishTaskPlan, requestHumanDecision, resolveHumanDecision, updateTaskNode, updateTaskSubstep } from './domain.js';

const textOutput = {
  schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, message: { type: 'string', required: true } } },
  render: (_args, value) => [{ type: 'text', text: value.message }],
};

function sessionId(exec) {
  if (!exec.agent) throw new Error('This tool requires a live DSH Agent session.');
  return String(exec.agent.id);
}

const modeForLabel = new Map([
  ['交给 AI', MODES.agent],
  ['AI 来做', MODES.agent],
  ['我定方向', MODES.humanLeads],
  ['我带 AI 做', MODES.humanLeads],
  ['我先判断', MODES.agentCoaches],
  ['AI 带我做', MODES.agentCoaches],
  ['确认并继续', MODES.agentCoaches],
  ['我要修改', MODES.agentCoaches],
]);

function withoutTag(value) { return String(value).replace(/^\s*\[[^\]]+\]\s*/, '').trim(); }

const CIRCLED_NUMBER = new Map([
  ['①', '1'], ['②', '2'], ['③', '3'], ['④', '4'], ['⑤', '5'],
  ['⑥', '6'], ['⑦', '7'], ['⑧', '8'], ['⑨', '9'], ['⑩', '10'],
]);

function normalizeQuestionMarkers(value) {
  return value.replace(/[①②③④⑤⑥⑦⑧⑨⑩]/gu, (marker) => ` ${CIRCLED_NUMBER.get(marker)}) `)
    .replace(/\s+/gu, ' ')
    .trim();
}

function materialKind(value) {
  if (/^\s*(?:\[(?:约束|边界|注意|限制)\]|(?:背景)?(?:约束|边界|注意|限制)\s*[：:])/u.test(value)) return 'boundary';
  if (!/[：:]/u.test(value) && /(?:来自|来源|source|文件)/iu.test(value)) return 'provenance';
  return 'fact';
}

function cleanMaterial(value) {
  return withoutTag(value)
    .replace(/^\s*(?:已整理)?(?:关键)?(?:相关)?材料\s*[：:]\s*/u, '')
    .replace(/^\s*(?:(?:背景)?(?:事实|证据|材料|约束|边界|注意|限制|反馈))\s*[：:]\s*/u, '')
    .trim();
}

function splitNumberedQuestions(value) {
  const matches = [...value.matchAll(/(?:^|\s)[（(]?(\d+)\s*[)）.、]\s*([\s\S]*?)(?=(?:\s+[（(]?\d+\s*[)）.、])|$)/gu)];
  if (matches.length < 2) return [];
  return matches.map((match) => match[2].trim());
}

function compactText(value, limit = 88) {
  const text = String(value).replace(/\s+/gu, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function section(label, body) {
  return `#### ${label}\n\n${body}`;
}

function decisionOptions(args) {
  if (args.decision_kind === 'growth') return [];
  if (!Array.isArray(args.options)) return [];
  const seen = new Set();
  return args.options.flatMap((option) => {
    const source = typeof option === 'string' ? { label: option } : option;
    const label = String(source?.label ?? '').replace(/\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/iu, '').trim();
    if (!label || seen.has(label)) return [];
    seen.add(label);
    const description = compactText(source?.description ?? '', 72);
    return [{ label, ...(description ? { description } : {}) }];
  }).slice(0, 3);
}

export function buildDecisionCard(args, reviewRound = false) {
  let question = String(args.question).trim()
    .replace(/^(?:核心判断|关键判断|用户判断)\s*(?:暂停)?\s*[—–\-:：]*\s*/u, '')
    .replace(/^请(?:你)?(?:先)?(?:基于[^：:]{0,40})?(?:独立)?分析并回答[：:]\s*/u, '');
  let note = '';
  const noteMatch = question.match(/(?:问题\s*\d+\s*)?备注[：:]\s*(.+)$/su);
  if (noteMatch) { note = noteMatch[1].trim(); question = question.slice(0, noteMatch.index).trim(); }
  question = normalizeQuestionMarkers(question);

  const boundaries = [];
  const facts = [];
  for (const material of args.materials) {
    const raw = String(material).trim();
    const kind = materialKind(raw);
    if (kind === 'provenance') continue;
    if (kind === 'boundary') boundaries.push(cleanMaterial(raw));
    else facts.push(cleanMaterial(raw));
  }
  if (note) boundaries.push(note);
  const numberedQuestions = splitNumberedQuestions(question);
  const decisions = numberedQuestions.length ? numberedQuestions : [question];
  const decisionText = decisions.map((item, index) => decisions.length > 1 ? `${index + 1}. ${compactText(item, 100)}` : compactText(item, 140)).join('\n');
  const materialText = facts.length
    ? facts.map((item) => `- ${item.replace(/\s+/gu, ' ').trim()}`).join('\n')
    : '当前判断所需的前序信息已准备完成。';
  const reasonText = args.reasons?.length
    ? args.reasons.slice(0, 2).map((item) => compactText(item, 72)).join('；')
    : '这个判断会影响后续执行方向。';
  const boundaryText = boundaries.length ? `\n\n注意：${boundaries.join('；')}` : '';
  const detail = [
    section('相关信息', reviewRound ? materialText : materialText),
    section('为什么现在找你', reasonText),
    section('需要你判断', `${decisionText}${boundaryText}`),
  ].join('\n\n');

  if (reviewRound) {
    return {
      header: '需要你回来', question: '确认后，Agent 将继续执行', detail,
      options: [
        { label: '确认并继续 (Recommended)' },
        { label: '我要修改' },
      ],
    };
  }
  const decisionKind = args.decision_kind || (args.recommended_mode === MODES.agentCoaches ? 'growth' : 'direction');
  const options = decisionOptions(args);
  return {
    header: decisionKind === 'growth' ? 'Your Turn' : '需要你拿定方向',
    question: decisionKind === 'growth' ? '先写下你的判断，AI 再补充' : '请选择接下来采用的方向',
    detail,
    options,
  };
}

function resolveDecisionAnswer(answer, recommendedMode, reviewRound, decisionKind) {
  const selected = answer?.selected?.[0]?.replace(' (Recommended)', '');
  const response = (answer?.custom?.trim() || selected || '交给 AI').replace(/[\r\n]+/gu, ' ').trim();
  if (answer?.custom?.trim()) return { mode: reviewRound || decisionKind === 'growth' ? MODES.agentCoaches : MODES.humanLeads, response };
  if (answer?.skipped || !selected) return { mode: MODES.agent, response };
  if (decisionKind === 'growth') return { mode: MODES.agentCoaches, response };
  if (decisionKind === 'direction') return { mode: MODES.humanLeads, response };
  return { mode: modeForLabel.get(selected) ?? recommendedMode, response };
}

export function registerAgentTools(ctx, sessions) {
  ctx.tools.register(defineTool({
    name: 'publish_task_plan',
    description: 'Publish the explicit task path before doing substantial work. Use 3–10 user-understandable outcome steps, not hidden reasoning or low-level command logs. Call this once at the start of any non-trivial task.',
    parameters: { title: { type: 'string', required: true }, goal: { type: 'string', required: true }, nodes: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', required: true }, title: { type: 'string', required: true }, objective: { type: 'string', required: true }, instruction: { type: 'string', required: true }, rationale: { type: 'string', required: true }, mode: { type: 'string', enum: Object.values(MODES), required: true }, substeps: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', required: true }, title: { type: 'string', required: true }, instruction: { type: 'string', required: true } } } } } } } },
    output: textOutput,
    async execute(args, exec) {
      const id = sessionId(exec);
      sessions.attach(exec.agent);
      const before = sessions.state(id);
      sessions.replace(id, publishTaskPlan(before, args));
      return { ok: true, message: `Published a ${args.nodes.length}-node task path. Keep it updated as work progresses.` };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'update_task_substep',
    description: 'Update one observable substep inside a published task node. Use 2–5 meaningful substeps, not hidden reasoning or raw tool logs. On completion, record one concise sentence (preferably 24–40 Chinese characters) containing only the action and key result; preserve essential numbers, evidence ids, and file paths.',
    parameters: { node_id: { type: 'string', required: true }, substep_id: { type: 'string', required: true }, status: { type: 'string', required: true, enum: [STATUS.pending, STATUS.inProgress, STATUS.completed] }, result: { type: 'string' } },
    output: textOutput,
    async execute(args, exec) {
      const id = sessionId(exec);
      sessions.update(id, (state) => updateTaskSubstep(state, { nodeId: args.node_id, substepId: args.substep_id, status: args.status, result: args.result ?? '' }));
      return { ok: true, message: `Updated substep ${args.node_id}/${args.substep_id} to ${args.status}.` };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'update_task_node',
    description: 'Update one published task node when you start it, finish it, or obtain meaningful evidence. Keep activity concise and user-readable. Do not expose chain-of-thought.',
    parameters: { node_id: { type: 'string', required: true }, status: { type: 'string', required: true, enum: [STATUS.pending, STATUS.inProgress, STATUS.completed] }, activity: { type: 'string', required: true }, evidence: { type: 'array', items: { type: 'string' } } },
    output: textOutput,
    async execute(args, exec) {
      const id = sessionId(exec); sessions.update(id, (state) => updateTaskNode(state, { nodeId: args.node_id, status: args.status, activity: args.activity, evidence: args.evidence ?? [] }));
      return { ok: true, message: `Updated task node ${args.node_id} to ${args.status}.` };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'suggest_human_involvement',
    description: 'Suggest, without forcing, that the user participate in a decision node because it is ambiguous, high-impact, preference-dependent, evidence-sensitive, or worth attempting personally. The user keeps final control.',
    parameters: { node_id: { type: 'string', required: true }, recommended_mode: { type: 'string', enum: Object.values(MODES), required: true }, decision_kind: { type: 'string', enum: ['growth', 'direction'], required: true, description: 'Whether this is a growth-practice recall or a result-direction recall.' }, reasons: { type: 'array', required: true, items: { type: 'string' } } },
    output: textOutput,
    async execute(args, exec) {
      const id = sessionId(exec); sessions.update(id, (state) => addSystemSuggestion(state, { nodeId: args.node_id, recommendedMode: args.recommended_mode, recallKind: args.decision_kind, reasons: args.reasons }));
      return { ok: true, message: `Suggested human participation for ${args.node_id}; continue unless a decision is actually required now.` };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'request_human_decision',
    description: 'Pause at a decision that genuinely requires the user. Publish materials and a concrete question. The same tool call waits for the answer, then returns it so this same Agent turn can continue.',
    parameters: { node_id: { type: 'string', required: true }, question: { type: 'string', required: true }, recommended_mode: { type: 'string', enum: Object.values(MODES), required: true }, decision_kind: { type: 'string', enum: ['growth', 'direction'], required: true, description: 'Use growth when doing the judgment helps the user practice a useful skill; use direction when an important result depends on the user’s preference or context.' }, options: { type: 'array', description: 'Zero to three concrete task-level answers. Use no options when an independent written judgment is more appropriate. Never put collaboration modes here.', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string', required: true }, description: { type: 'string' } } } }, materials: { type: 'array', required: true, items: { type: 'string' } }, reasons: { type: 'array', required: true, items: { type: 'string' } }, fallback_action: { type: 'string', description: 'One concise sentence describing what the Agent will do if the user delegates this decision.' } },
    output: textOutput,
    async execute(args, exec) {
      const id = sessionId(exec);
      const before = sessions.state(id);
      const reviewRound = before.interventions.some((item) => item.nodeId === args.node_id && (item.kind === 'coach_answer' || item.kind === 'coach_revision'));
      const effectiveArgs = args;
      if (!reviewRound && effectiveArgs.decision_kind === 'direction' && (!Array.isArray(effectiveArgs.options) || effectiveArgs.options.length < 2 || effectiveArgs.options.length > 3)) throw new Error('Direction recalls require 2–3 concrete task-level options.');
      sessions.update(id, (state) => requestHumanDecision(state, { nodeId: effectiveArgs.node_id, question: effectiveArgs.question, recommendedMode: effectiveArgs.recommended_mode, decisionKind: effectiveArgs.decision_kind, materials: effectiveArgs.materials, reasons: effectiveArgs.reasons }));
      const card = buildDecisionCard(effectiveArgs, reviewRound);
      try {
        const result = await ctx.userQuestions.ask({
          agent: exec.agent, signal: exec.signal,
          questions: [{ id: `human-loop-${effectiveArgs.node_id}`, ...card }],
        });
        const answer = result.answers[0];
        const { mode, response } = resolveDecisionAnswer(answer, effectiveArgs.recommended_mode, reviewRound, effectiveArgs.decision_kind);
        sessions.update(id, (state) => resolveHumanDecision(state, { nodeId: effectiveArgs.node_id, mode, response }));
        return { ok: true, message: `Human decision received. Mode: ${mode}. Response: ${response}` };
      } catch (error) {
        sessions.replace(id, before);
        throw error;
      }
    },
  }));

  ctx.systemPrompt.section({
    name: 'tool:human-decision-loop',
    order: 4950,
    text: 'For every non-trivial user task, call publish_task_plan before substantial work. Create 3–10 user-understandable outcome steps from the actual task; do not expose hidden reasoning or raw command logs. Update observable substeps only after the work happens, using one concise sentence with the action and key result. Recall the user only for either (1) a core professional judgment the user benefits from practicing, or (2) a high-impact direction choice that genuinely depends on user preference or context. Routine search, formatting, checking, and reversible execution should continue autonomously. If the user is an intern, student, junior, or explicitly wants to learn, consider one growth judgment before the final conclusion, but do not interrupt merely to ask for approval. Ask one direct question and provide at most three decision-essential materials. Direction recalls require 2–3 concrete task options; growth recalls omit options so the user answers independently. The same tool call waits for the answer. For a growth recall, review the answer against evidence, then call request_human_decision again for revision or confirmation. When a [Human path intervention] arrives, revise the named step and affected downstream work, acknowledge it through the progress tools, then continue. Simple tasks may skip these tools.',
  });
}

export function interventionMessage(node, before, after) {
  const text = `[Human path intervention]\nNode: ${node.id} — ${node.title}\nPrevious instruction: ${before}\nNew instruction: ${after}\nRevise the current approach and all affected downstream work. Acknowledge this intervention through update_task_node, then continue.`;
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'your-turn-dsh', form: 'notice', summary: `Human changed ${node.title}` } });
}
