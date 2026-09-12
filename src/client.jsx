import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export const inject = ['slots', 'connection', 'sessions'];

const MODE_LABEL = { agent: 'AI完成', human_leads: '主动介入', agent_coaches: '成长型召回' };
const STATUS_LABEL = { pending: '未开始', in_progress: '进行中', waiting_for_user: '已暂停 · 等你参与', awaiting_feedback: '进行中 · AI 正在反馈', feedback_ready: '已暂停 · 等你确认', completed: '已完成', skipped: '已跳过' };
const TASK_SIZE_LABEL = { short: '小任务', medium: '中等任务', long: '长任务' };
const PARTICIPATION_GOAL_LABEL = { fast_finish: '快速完成', balanced: '平衡模式', learning: '练习判断' };
const PAUSED_STATUSES = new Set(['waiting_for_user', 'feedback_ready']);
const INLINE_PROCESS_STATUSES = new Set(['in_progress', 'awaiting_feedback', 'waiting_for_user', 'feedback_ready']);

function nodeModeLabel(node) {
  if (node.mode === 'agent') return 'AI完成';
  if (node.recallKind === 'growth') return '成长型召回';
  if (node.recallKind === 'direction') return '结果型召回';
  return MODE_LABEL[node.mode] ?? node.mode;
}

function substepVisualStatus(node, substep, nativeQuestionVisible = false) {
  const pausedSubstep = node.substeps.find((item) => item.status === 'in_progress') ?? node.substeps.find((item) => item.status !== 'completed');
  if ((nativeQuestionVisible || PAUSED_STATUSES.has(node.status)) && substep.id === pausedSubstep?.id) return 'paused';
  return substep.status;
}

function taskLifecycle(state, nativeQuestionVisible = false) {
  if (!state || (state.nodes.length === 0 && state.telemetry?.lastEvent === 'session-attached')) return { key: 'not-started', label: '未开始' };
  if (state.telemetry?.pathRequiredTurn && state.telemetry?.pathPublishedTurn !== state.telemetry.pathRequiredTurn && state.telemetry?.lastEvent !== 'turn/end') return { key: 'planning', label: '正在规划' };
  if (state.nodes.length === 0 && (state.pathSync?.status === 'needs_plan' || state.telemetry?.lastEvent === 'turn/end')) return { key: 'sync', label: '本轮未生成路径' };
  if (state.nodes.length === 0) return { key: 'planning', label: '正在规划' };
  if (nativeQuestionVisible || state.pendingDecision || state.nodes.some((node) => PAUSED_STATUSES.has(node.status))) return { key: 'attention', label: '需要你回来' };
  if (state.pathSync?.status === 'needs_sync') return { key: 'sync', label: '路径待同步' };
  if (state.nodes.every((node) => ['completed', 'skipped'].includes(node.status))) {
    return state.finalAcceptedAt
      ? { key: 'accepted', label: '最终成果已验收' }
      : { key: 'review', label: '请验收最终成果' };
  }
  return { key: 'safe', label: '可放心离开' };
}

const DECISION_CARD_HEADERS = new Set(['Your Turn', '值得你亲自判断', '需要你拿定方向', '需要你回来']);
const POSITION_KEYS = { launcher: 'human-loop-launcher-position', rail: 'human-loop-rail-position', railHeight: 'human-loop-rail-height' };
const PREFERENCE_KEY = 'your-turn-dsh:preference-profile:v1';
const VIEWPORT_GAP = 8;
const MIN_RAIL_HEIGHT = 280;

function readPreferenceProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCE_KEY));
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

function savePreferenceProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const value = profile.profile ? profile : {
    version: 1,
    updatedAt: new Date().toISOString(),
    summary: profile.summary || '平衡参与：重要方向会问你，普通执行自动推进',
    answers: profile.answers,
    profile,
  };
  try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify(value)); } catch { /* Preference memory is optional. */ }
  return value;
}

function readPosition(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Number.isFinite(value?.x) && Number.isFinite(value?.y) ? value : null;
  } catch { return null; }
}

function savePosition(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Position memory is optional. */ }
}

function readHeight() {
  try {
    const value = Number(localStorage.getItem(POSITION_KEYS.railHeight));
    return Number.isFinite(value) && value >= MIN_RAIL_HEIGHT ? value : null;
  } catch { return null; }
}

function saveHeight(value) {
  try { localStorage.setItem(POSITION_KEYS.railHeight, String(Math.round(value))); } catch { /* Size memory is optional. */ }
}

function clampPosition(value, element, fallbackWidth, fallbackHeight) {
  const width = element?.offsetWidth || fallbackWidth;
  const height = element?.offsetHeight || fallbackHeight;
  return {
    x: Math.max(VIEWPORT_GAP, Math.min(value.x, window.innerWidth - width - VIEWPORT_GAP)),
    y: Math.max(VIEWPORT_GAP, Math.min(value.y, window.innerHeight - height - VIEWPORT_GAP)),
  };
}

function draggableStyle(position) {
  return position ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' } : undefined;
}

function railStyle(position, height) {
  return { ...draggableStyle(position), ...(height ? { height: `${height}px` } : {}) };
}

function drawerStyle(railPosition, top, viewport, drawerHeight) {
  if (viewport.width <= 650) return { '--hil-drawer-top': `${top}px` };
  const railLeft = railPosition?.x ?? viewport.width - 222;
  const drawerWidth = 360;
  const railWidth = 204;
  const gap = 10;
  const preferredLeft = railLeft - drawerWidth - gap;
  const left = preferredLeft >= VIEWPORT_GAP
    ? preferredLeft
    : Math.min(viewport.width - drawerWidth - VIEWPORT_GAP, railLeft + railWidth + gap);
  const visibleHeight = Math.min(drawerHeight || 360, viewport.height - VIEWPORT_GAP * 2);
  const y = Math.max(VIEWPORT_GAP, Math.min(top, viewport.height - visibleHeight - VIEWPORT_GAP));
  return { '--hil-drawer-top': `${y}px`, top: `${y}px`, left: `${Math.max(VIEWPORT_GAP, left)}px`, right: 'auto' };
}

function relabelDecisionCardDelegateAction() {
  for (const card of document.querySelectorAll('[data-question-key]')) {
    const eyebrow = card.querySelector('.Mbwy4a_eyebrow');
    if (!DECISION_CARD_HEADERS.has(eyebrow?.textContent?.trim())) continue;
    card.classList.add('hil-decision-card');
    const button = [...card.querySelectorAll('button')].find((item) => ['跳过本题', 'Skip this question'].includes(item.textContent?.trim()));
    if (!button) continue;
    const english = button.textContent?.trim() === 'Skip this question';
    button.textContent = english ? 'Give to AI' : '交给 AI';
    button.setAttribute('aria-label', english ? 'Let AI decide and continue' : '交给 AI 自行判断并继续');
    button.setAttribute('title', english ? 'Let AI decide from the available evidence and continue' : '由 AI 根据现有材料自行判断并继续');
  }
}

function visibleQuestionCard() {
  return [...document.querySelectorAll('[data-question-key]')].some((card) => {
    const style = window.getComputedStyle(card);
    const rect = card.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  });
}

const styles = `
.hil-root{--hil-stage:#f4f4f5;--hil-shell:#f8f8f9;--hil-surface:#fff;--hil-muted:#f3f3f4;--hil-border:#e4e4e7;--hil-ink:#18181b;--hil-copy:#52525b;--hil-caption:#a1a1aa;--hil-success:#7cb518;--hil-success-soft:#f1f7e4;--hil-success-border:#d5e5b3;--hil-success-text:#567d11;--hil-active:#ffba08;--hil-active-soft:#fff5d6;--hil-active-border:#f4d984;--hil-active-text:#7a5800;--hil-paused:#e85d04;--hil-paused-soft:#fdece5;--hil-paused-border:#f5c0a8;--hil-paused-text:#a53c03;position:fixed;inset:0;z-index:80;pointer-events:none;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--hil-ink);color-scheme:light}
.hil-root *{box-sizing:border-box}.hil-launcher,.hil-rail,.hil-drawer{pointer-events:auto}
[class~='hil-state-dot'],[class~='hil-status'],[class~='hil-inline-step-dot'],[class~='hil-substep-mark']{corner-shape:round!important}
[data-question-key] .Mbwy4a_detail{margin:8px 24px 12px}.hil-decision-card .Mbwy4a_detail h4{display:table;margin:14px 0 7px;padding:3px 9px;border:0;border-radius:999px;corner-shape:round!important;background:#f3f4f6;color:#52525b;font-size:12px;font-weight:600;line-height:18px}.hil-decision-card .Mbwy4a_detail h4:first-child{margin-top:0}.hil-decision-card .Mbwy4a_detail p,.hil-decision-card .Mbwy4a_detail ul{margin-top:0;margin-bottom:10px}
.hil-launcher{position:absolute;right:22px;bottom:92px;border:1px solid var(--hil-border);background:var(--hil-surface);color:var(--hil-ink);border-radius:999px;padding:9px 13px;display:flex;align-items:center;gap:8px;box-shadow:0 14px 34px -12px rgba(0,0,0,.24);cursor:pointer;font-size:12px;font-weight:600;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.hil-launcher:hover{transform:translateY(-2px);border-color:#a1a1aa;box-shadow:0 18px 42px -14px rgba(0,0,0,.3)}.hil-launcher.not-started{background:var(--hil-muted);border-color:var(--hil-border);color:var(--hil-copy)}.hil-launcher.attention{background:#fff7f7;border-color:#fecaca;color:#b91c1c}.hil-launcher.planning{background:#fffbeb;border-color:#fde68a;color:#92400e}.hil-launcher.review,.hil-launcher.accepted{background:#f0fdf4;border-color:#bbf7d0;color:#047857}.hil-state-dot{box-sizing:border-box!important;inline-size:8px!important;block-size:8px!important;min-inline-size:8px!important;min-block-size:8px!important;max-inline-size:8px!important;max-block-size:8px!important;padding:0!important;border:0!important;border-radius:50%!important;background:var(--hil-success);flex:0 0 8px!important;display:block;overflow:hidden}.hil-launcher.not-started .hil-state-dot{background:var(--hil-caption)}.hil-launcher.attention .hil-state-dot{background:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-launcher.planning .hil-state-dot{background:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}
.hil-rail{position:absolute;right:18px;top:76px;bottom:auto;width:204px;height:min(610px,calc(100vh - 130px));background:var(--hil-shell);border:1px solid rgba(228,228,231,.9);border-radius:28px;box-shadow:0 20px 50px -15px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;animation:hil-rail-in .18s cubic-bezier(.2,.8,.2,1)}
.hil-rail-header{padding:10px 11px 4px;display:flex;justify-content:flex-end;align-items:center}.hil-attention-state{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;font-weight:650;line-height:1.3}.hil-attention-state .hil-state-dot{inline-size:8px!important;block-size:8px!important;min-inline-size:8px!important;min-block-size:8px!important;max-inline-size:8px!important;max-block-size:8px!important;flex-basis:8px!important}.hil-attention-state.not-started{color:var(--hil-copy)}.hil-attention-state.not-started .hil-state-dot{background:var(--hil-caption)}.hil-attention-state.attention{color:#b91c1c}.hil-attention-state.attention .hil-state-dot{background:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-attention-state.planning{color:#92400e}.hil-attention-state.planning .hil-state-dot{background:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-attention-state.review,.hil-attention-state.accepted{color:#047857}.hil-close{width:26px;height:26px;border:0;background:transparent;border-radius:999px;font-size:17px;line-height:1;color:var(--hil-caption);cursor:pointer}.hil-close:hover{background:#eaeaeb;color:var(--hil-ink)}
.hil-path{overflow:auto;padding:5px 9px 9px;flex:1}.hil-node-group{margin-bottom:4px}.hil-node{width:100%;border:1px solid transparent;border-bottom-color:var(--hil-border);background:rgba(255,255,255,.62);text-align:left;padding:10px 9px;border-radius:13px;cursor:pointer;color:inherit;transition:background .14s ease,border-color .14s ease,transform .14s ease}.hil-node:hover{background:var(--hil-surface);border-color:var(--hil-border);transform:translateX(-2px)}.hil-node.running{background:var(--hil-active-soft);border-color:transparent}.hil-node.pinned{background:var(--hil-surface);border-color:#d4d4d8;box-shadow:none}.hil-node.running.pinned{background:var(--hil-active-soft);border-color:transparent;box-shadow:none}.hil-node.waiting_for_user,.hil-node.feedback_ready{background:var(--hil-paused-soft);border-color:transparent;box-shadow:none}.hil-node-top{display:flex;align-items:center;gap:8px}.hil-status{box-sizing:border-box!important;inline-size:13px!important;block-size:13px!important;min-inline-size:13px!important;min-block-size:13px!important;max-inline-size:13px!important;max-block-size:13px!important;padding:0!important;border:1.5px solid #b8bbc2;border-radius:50%!important;display:block;flex:0 0 13px!important;overflow:hidden}.hil-node.completed .hil-status{background:var(--hil-success);border-color:var(--hil-success)}.hil-node.in_progress .hil-status,.hil-node.awaiting_feedback .hil-status{background:var(--hil-active);border-color:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-node.waiting_for_user .hil-status,.hil-node.feedback_ready .hil-status{background:var(--hil-paused);border-color:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-node-title{font-size:12px;font-weight:600;line-height:1.35}.hil-node-meta{font:9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption);margin:5px 0 0 21px}.hil-node.waiting_for_user .hil-node-meta,.hil-node.feedback_ready .hil-node-meta{color:#dc2626;font-weight:600}.hil-inline-process{margin:3px 8px 7px 15px;padding:5px 0 3px 12px;border-left:1px dashed #d4d4d8;display:grid;gap:2px;animation:hil-inline-in .2s ease-out}.hil-inline-step{display:grid;grid-template-columns:9px minmax(0,1fr);align-items:center;gap:7px;min-height:22px;color:var(--hil-caption);font-size:10px;line-height:1.35}.hil-inline-step-dot{box-sizing:border-box!important;inline-size:7px!important;block-size:7px!important;min-inline-size:7px!important;min-block-size:7px!important;max-inline-size:7px!important;max-block-size:7px!important;padding:0!important;border:1.3px solid #b8bbc2;border-radius:50%!important;background:var(--hil-shell);display:block;overflow:hidden}.hil-inline-step.completed{color:#047857}.hil-inline-step.completed .hil-inline-step-dot{border-color:var(--hil-success);background:var(--hil-success)}.hil-inline-step.in_progress{color:#92400e;font-weight:600}.hil-inline-step.in_progress .hil-inline-step-dot{border-color:var(--hil-active);background:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-inline-step.paused{color:#b91c1c;font-weight:600}.hil-inline-step.paused .hil-inline-step-dot{border-color:var(--hil-paused);background:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-inline-step-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hil-rail-footer{border-top:1px dashed var(--hil-border);padding:10px 12px;display:grid;gap:8px}.hil-footer-actions{display:flex;align-items:center;justify-content:space-between;gap:7px;font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption)}.hil-summary-link{width:100%;border:0;background:var(--hil-success-soft);color:#047857;border-radius:999px;padding:8px 10px;font-size:10px;font-weight:600;cursor:pointer;text-align:center}
.hil-drawer{position:absolute;right:232px;top:var(--hil-drawer-top,18px);width:360px;min-width:360px;max-width:360px;height:auto;max-height:calc(100vh - var(--hil-drawer-top,18px) - 18px);background:var(--hil-shell);border:1px solid rgba(228,228,231,.9);border-radius:28px;box-shadow:0 20px 50px -15px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;animation:hil-drawer-in .18s cubic-bezier(.2,.8,.2,1)}.hil-drawer-header{min-height:42px;padding:10px 14px;border-bottom:1px dashed var(--hil-border);display:flex;align-items:center;justify-content:space-between;font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption);letter-spacing:.04em;text-transform:uppercase}.hil-drawer-close{position:absolute;right:11px;top:11px;z-index:2;background:var(--hil-shell)}.hil-detail{overflow:auto;padding:18px;flex:0 1 auto;min-width:0}.hil-preview{display:flex;flex-direction:column;justify-content:flex-start}.hil-preview-state{display:flex;align-items:center;gap:7px;font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption);margin-bottom:12px}.hil-preview-activity{padding:13px 14px;border:1px solid var(--hil-border);border-radius:16px;background:var(--hil-surface);font-size:13px;line-height:1.55;margin:9px 0}.hil-preview-action{padding:10px 12px;border-radius:999px;background:var(--hil-paused-soft);color:#b91c1c;font-size:11px;font-weight:600;line-height:1.4;margin-top:5px}.hil-preview-hint{font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption);margin-top:15px}.hil-preview .hil-status{display:inline-grid}.hil-preview .hil-status.completed{background:var(--hil-success);border-color:var(--hil-success)}.hil-preview .hil-status.in_progress,.hil-preview .hil-status.awaiting_feedback{border-color:var(--hil-active);box-shadow:inset 0 0 0 3px var(--hil-active)}.hil-preview .hil-status.waiting_for_user,.hil-preview .hil-status.feedback_ready{background:var(--hil-paused);border-color:var(--hil-paused);animation:hil-pause-pulse 1.5s ease-in-out infinite}
.hil-mode{display:inline-flex;border:1px solid var(--hil-border);border-radius:999px;padding:4px 9px;background:var(--hil-surface);color:var(--hil-copy);font:10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:10px}.hil-status-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px}.hil-status-row .hil-mode{margin-bottom:0}.hil-status-tags{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}.hil-task-profile-controls{display:grid;gap:8px}.hil-h2{font-size:18px;font-weight:650;letter-spacing:-.02em;margin:0 0 7px}.hil-copy{font-size:13px;line-height:1.6;color:var(--hil-copy);margin:0 0 13px}.hil-card{border:1px solid var(--hil-border);border-radius:16px;padding:14px;margin:13px 0;background:var(--hil-surface);box-shadow:inset 0 1px 0 rgba(255,255,255,.9)}.hil-suggest{background:#fffbeb;border-color:#f7d98a}.hil-label{font-size:10px;font-weight:650;text-transform:uppercase;letter-spacing:.08em;color:var(--hil-caption);margin:14px 0 6px}.hil-profile .hil-label:first-child{margin-top:0}.hil-segment{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.hil-segment-btn{min-width:0;border:1px solid var(--hil-border);background:var(--hil-muted);color:var(--hil-copy);border-radius:999px;padding:7px 6px;font-size:10px;font-weight:600;line-height:1.2;cursor:pointer}.hil-segment-btn.active{background:#3f3f46;border-color:#3f3f46;color:#fff}.hil-segment-btn:disabled{opacity:.45;cursor:not-allowed}.hil-debug strong{display:block;margin-bottom:10px;font-size:12px}.hil-debug.auto{background:#fafafa;border-color:#e4e4e7}.hil-debug.auto strong,.hil-debug.auto .hil-debug-grid b{color:#52525b}.hil-debug.auto .hil-copy{font-size:12px;margin-bottom:11px}.hil-debug-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 12px;align-items:center;font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption)}.hil-debug-grid b{color:var(--hil-ink);font-weight:650;text-align:right}.hil-list{margin:7px 0;padding-left:18px;font-size:12px;line-height:1.55;color:var(--hil-copy)}.hil-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.hil-btn{border:1px solid var(--hil-border);background:var(--hil-surface);color:var(--hil-ink);border-radius:999px;padding:7px 11px;font-size:11px;font-weight:550;cursor:pointer;transition:background .14s ease,transform .14s ease}.hil-btn:hover{background:var(--hil-muted);transform:translateY(-1px)}.hil-btn.primary{background:#3f3f46;border-color:#3f3f46;color:#fff}.hil-btn.primary:hover{background:#52525b;border-color:#52525b}.hil-btn:disabled{opacity:.42;cursor:not-allowed;transform:none}.hil-textarea{width:100%;min-height:88px;resize:vertical;border:1px solid var(--hil-border);border-radius:16px;padding:11px 12px;background:var(--hil-surface);color:var(--hil-ink);font:12px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline:none}.hil-textarea:focus{border-color:#a1a1aa;box-shadow:0 0 0 3px rgba(24,24,27,.06)}.hil-feedback{display:grid;gap:8px;margin-top:11px}.hil-feedback>div{padding:10px 11px;border:1px dashed var(--hil-border);border-radius:14px;background:var(--hil-muted);font-size:11px;line-height:1.5}.hil-feedback p,.hil-feedback ul{margin:5px 0}.hil-error{color:#dc2626;font-size:11px;margin-top:9px}.hil-summary{display:grid;gap:10px}.hil-summary-item{padding:12px 13px;border:1px solid #a7f3d0;border-radius:16px;background:var(--hil-surface);box-shadow:inset 3px 0 var(--hil-success);font-size:12px;line-height:1.5}.hil-loading{padding:24px;font-size:12px}
.hil-goal{font-size:13px;line-height:1.6;color:var(--hil-copy);padding:0;background:transparent;border:0;border-radius:0;margin:10px 0 18px}.hil-process{display:grid;background:var(--hil-surface);border:1px solid var(--hil-border);border-radius:16px;padding:0;overflow:hidden}.hil-substep{position:relative;width:100%;border:0;background:transparent;color:inherit;border-radius:0;padding:11px 14px;display:grid;grid-template-columns:20px 1fr;gap:8px;text-align:left;cursor:default}.hil-substep:first-child{padding-top:15px}.hil-substep:last-child{padding-bottom:15px}.hil-substep:not(:last-child):after{content:'';position:absolute;left:10px;right:10px;bottom:0;border-bottom:1px dashed var(--hil-border)}.hil-substep:hover,.hil-substep.open{background:var(--hil-muted)}.hil-substep-mark{box-sizing:border-box!important;inline-size:17px!important;block-size:17px!important;min-inline-size:17px!important;min-block-size:17px!important;max-inline-size:17px!important;max-block-size:17px!important;padding:0!important;border:1.5px solid #b8bbc2;border-radius:50%!important;display:block;color:transparent;margin-top:1px;overflow:hidden}.hil-substep.completed .hil-substep-mark{background:var(--hil-success);border-color:var(--hil-success)}.hil-substep.in_progress .hil-substep-mark{background:var(--hil-active);border-color:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-substep.paused .hil-substep-mark{background:var(--hil-paused);border-color:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-substep.paused .hil-substep-title,.hil-substep.paused .hil-substep-result{color:#b91c1c}.hil-substep-title{font-size:13px;font-weight:600;line-height:1.4}.hil-substep-result{font-size:11px;line-height:1.45;color:var(--hil-caption);margin-top:3px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;text-overflow:ellipsis;white-space:normal}.hil-substep:hover .hil-substep-result,.hil-substep.open .hil-substep-result{display:block;-webkit-line-clamp:unset;overflow:visible;text-overflow:clip}.hil-substep-instruction{grid-column:1/-1;margin:8px 0 2px 20px;font-size:12px;line-height:1.55;color:var(--hil-copy)}.hil-substep-editor{grid-column:1/-1;margin:8px 0 2px 21px;padding:0;border:0;background:transparent;border-radius:0}.hil-substep-editor .hil-buttons{margin-top:9px}.hil-more{margin-top:14px;border-top:1px dashed var(--hil-border);padding-top:10px}.hil-more summary{font-size:11px;color:var(--hil-copy);cursor:pointer;list-style:none}.hil-more summary:after{content:'  ▾';color:var(--hil-caption)}.hil-more[open] summary:after{content:'  ▴'}
.hil-readonly-value{display:inline-flex;align-items:center;border:1px solid var(--hil-border);background:var(--hil-muted);color:var(--hil-copy);border-radius:999px;padding:6px 10px;font-size:11px;font-weight:600;line-height:1.2}
.hil-status{inline-size:10px!important;block-size:10px!important;min-inline-size:10px!important;min-block-size:10px!important;max-inline-size:10px!important;max-block-size:10px!important;flex-basis:10px!important;border-width:1.25px}.hil-node-top{gap:7px}.hil-node-meta{margin-left:17px}.hil-inline-step{grid-template-columns:7px minmax(0,1fr);gap:6px}.hil-inline-step-dot{inline-size:5px!important;block-size:5px!important;min-inline-size:5px!important;min-block-size:5px!important;max-inline-size:5px!important;max-block-size:5px!important;border-width:1px}.hil-substep{grid-template-columns:16px 1fr;gap:7px}.hil-substep-mark{inline-size:13px!important;block-size:13px!important;min-inline-size:13px!important;min-block-size:13px!important;max-inline-size:13px!important;max-block-size:13px!important;border-width:1.25px}.hil-substep-editor{margin-left:20px}
.hil-path{min-height:0}
.hil-attention-state{width:100%;padding:8px 10px;border-radius:999px;background:#ecfdf5;color:#047857}.hil-attention-state.not-started{background:var(--hil-muted);color:var(--hil-copy)}.hil-attention-state.attention{background:#fff1f2;color:#b91c1c}.hil-attention-state.planning{background:#fffbeb;color:#92400e}.hil-attention-state.review,.hil-attention-state.accepted,.hil-attention-state.safe{background:#ecfdf5;color:#047857}
.hil-drag-handle{gap:0}.hil-drag-grip{font-size:14px}
.hil-launcher{cursor:grab;touch-action:none;user-select:none}.hil-rail-header{justify-content:space-between;cursor:grab;touch-action:none;user-select:none}.hil-drag-handle{display:flex;align-items:center;gap:6px;color:var(--hil-caption);font:9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em}.hil-drag-grip{font-size:14px;letter-spacing:-2px}.hil-dragging{cursor:grabbing!important;transition:none!important;transform:none!important}
.hil-drawer{max-height:calc(100vh - 16px)}
.hil-btn.primary{background:#71717a;border-color:#71717a}.hil-btn.primary:hover{background:#60606a;border-color:#60606a}.hil-summary-link{background:#e4e4e7;color:#52525b}.hil-summary-link:hover{background:#d4d4d8;color:#3f3f46}
[data-question-key] .Mbwy4a_detail h4{corner-shape:round!important}
.hil-launcher{border:0!important;border-radius:13px;padding:10px 13px;box-shadow:0 2px 4px rgba(24,24,27,.08),0 1px 0 rgba(255,255,255,.85) inset}.hil-launcher:hover{border:0!important;transform:translateY(-1px);box-shadow:0 4px 9px rgba(24,24,27,.11),0 1px 0 rgba(255,255,255,.85) inset}
.hil-node.running{background:var(--hil-active-soft);border-color:transparent;border-bottom-color:var(--hil-active-border);box-shadow:0 2px 4px rgba(24,24,27,.06)}.hil-node.running.pinned{background:var(--hil-active-soft);border-color:var(--hil-active);box-shadow:0 2px 4px rgba(24,24,27,.06)}
.hil-btn,.hil-btn.primary{background:#e4e4e7;border-color:transparent;color:#52525b}.hil-btn:hover,.hil-btn.primary:hover{background:#d4d4d8;border-color:transparent;color:#3f3f46}.hil-node.running.pinned{background:var(--hil-active-soft);border-color:var(--hil-active);box-shadow:none}.hil-process{background:var(--hil-surface);border:0;border-radius:16px;overflow:hidden}.hil-substep:not(:last-child):after{display:block}.hil-substep-editor{position:relative}.hil-substep-editor .hil-textarea{padding:11px 46px 38px 12px}.hil-rerun-button{box-sizing:border-box!important;position:absolute;right:9px;bottom:9px;inline-size:28px!important;block-size:28px!important;min-inline-size:28px!important;min-block-size:28px!important;max-inline-size:28px!important;max-block-size:28px!important;aspect-ratio:1/1;flex:0 0 28px;padding:0!important;border:0!important;border-radius:999px!important;corner-shape:round!important;display:inline-flex;align-items:center;justify-content:center;background:#e4e4e7;color:#52525b;cursor:pointer;line-height:0;transition:background .14s ease,transform .14s ease}.hil-rerun-button svg{display:block;width:14px;height:14px;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;fill:none}.hil-rerun-button:hover{background:#d4d4d8;color:#3f3f46;transform:rotate(-18deg)}.hil-rerun-button:disabled{opacity:.42;cursor:not-allowed;transform:none}
.hil-resize-handle{position:absolute;left:30px;right:30px;height:8px;z-index:4;cursor:ns-resize;touch-action:none}.hil-resize-handle.top{top:0}.hil-resize-handle.bottom{bottom:0}.hil-resize-handle:after{content:'';position:absolute;left:50%;width:32px;height:2px;border-radius:999px;background:#d4d4d8;transform:translateX(-50%)}.hil-resize-handle.top:after{top:3px}.hil-resize-handle.bottom:after{bottom:3px}.hil-resizing{transition:none!important}.hil-launcher.sync{background:#fff7ed;border-color:#fed7aa;color:#9a3412}.hil-launcher.sync .hil-state-dot{background:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-attention-state.sync{background:#fff7ed;color:#9a3412}.hil-attention-state.sync .hil-state-dot{background:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-node.skipped .hil-status{background:#d4d4d8;border-color:#a1a1aa}.hil-inline-step.skipped .hil-inline-step-dot,.hil-substep.skipped .hil-substep-mark{background:#d4d4d8;border-color:#a1a1aa}
.hil-rerun-button{right:9px;bottom:9px;background:transparent!important;color:#a1a1aa}.hil-rerun-button svg{width:18px;height:18px;stroke-width:2.8}.hil-rerun-button:hover{background:transparent!important;color:#71717a;transform:rotate(-18deg)}
.hil-root.native-question .hil-node.in_progress,.hil-root.native-question .hil-node.awaiting_feedback{background:var(--hil-paused-soft);border-color:transparent;box-shadow:none}.hil-root.native-question .hil-node.in_progress .hil-status,.hil-root.native-question .hil-node.awaiting_feedback .hil-status{background:var(--hil-paused);border-color:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-root.native-question .hil-node.in_progress .hil-node-meta,.hil-root.native-question .hil-node.awaiting_feedback .hil-node-meta{color:var(--hil-paused-text);font-weight:600}.hil-root.native-question .hil-inline-step.in_progress{color:var(--hil-paused-text)}.hil-root.native-question .hil-inline-step.in_progress .hil-inline-step-dot{background:var(--hil-paused);border-color:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-root.native-question .hil-substep.in_progress .hil-substep-mark{background:var(--hil-paused);border-color:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-root.native-question .hil-substep.in_progress .hil-substep-title,.hil-root.native-question .hil-substep.in_progress .hil-substep-result{color:var(--hil-paused-text)}
.hil-launcher.attention{background:var(--hil-paused-soft);border-color:var(--hil-paused-border);color:var(--hil-paused-text)}.hil-launcher.planning,.hil-launcher.sync{background:var(--hil-active-soft);border-color:var(--hil-active-border);color:var(--hil-active-text)}.hil-launcher.review,.hil-launcher.accepted{background:var(--hil-success-soft);border-color:var(--hil-success-border);color:var(--hil-success-text)}.hil-attention-state.attention{background:var(--hil-paused-soft);color:var(--hil-paused-text)}.hil-attention-state.planning,.hil-attention-state.sync{background:var(--hil-active-soft);color:var(--hil-active-text)}.hil-attention-state.review,.hil-attention-state.accepted,.hil-attention-state.safe{background:var(--hil-success-soft);color:var(--hil-success-text)}.hil-node.waiting_for_user,.hil-node.feedback_ready{background:var(--hil-paused-soft)}.hil-inline-step.completed{color:var(--hil-success-text)}.hil-inline-step.in_progress{color:var(--hil-active-text)}.hil-inline-step.paused,.hil-node.waiting_for_user .hil-node-meta,.hil-node.feedback_ready .hil-node-meta,.hil-substep.paused .hil-substep-title,.hil-substep.paused .hil-substep-result{color:var(--hil-paused-text)}.hil-preview-action{background:var(--hil-paused-soft);color:var(--hil-paused-text)}.hil-suggest{background:var(--hil-active-soft);border-color:var(--hil-active-border)}.hil-summary-link{background:#e4e4e7;color:#52525b}.hil-summary-link:hover{background:#d4d4d8;color:#3f3f46}.hil-summary-item{border-color:var(--hil-success-border)}
@keyframes hil-active-breathe{0%,100%{box-shadow:inset 0 0 0 3px var(--hil-active),0 0 0 0 rgba(255,215,0,.08);opacity:.72}50%{box-shadow:inset 0 0 0 3px var(--hil-active),0 0 0 4px rgba(255,215,0,.18);opacity:1}}@keyframes hil-pause-pulse{0%,100%{box-shadow:0 0 0 0 rgba(225,44,44,.1);opacity:.78}50%{box-shadow:0 0 0 4px rgba(225,44,44,.16);opacity:1}}@keyframes hil-inline-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}@keyframes hil-drawer-in{from{opacity:0;transform:translateX(7px) scale(.99)}to{opacity:1;transform:translateX(0) scale(1)}}@keyframes hil-rail-in{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}
@media(prefers-reduced-motion:reduce){.hil-launcher,.hil-node,.hil-btn,.hil-drawer,.hil-rail,.hil-status,.hil-state-dot,.hil-substep-mark,.hil-inline-process,.hil-inline-step-dot{transition:none!important;animation:none!important}}
@media(max-width:650px){[data-question-key] .Mbwy4a_detail{margin:6px 18px 10px}.hil-launcher{right:12px!important;bottom:82px!important;left:auto!important;top:auto!important;cursor:pointer}.hil-rail{right:8px!important;top:56px!important;bottom:24px!important;left:auto!important;width:calc(100vw - 16px);height:auto!important;border-radius:24px}.hil-rail-header{cursor:default}.hil-drag-handle,.hil-resize-handle{display:none}.hil-drawer,.hil-drawer.preview{right:8px;top:8px;width:calc(100vw - 16px);min-width:0;max-width:none;max-height:calc(100vh - 16px);z-index:2;border-radius:24px}.hil-node-meta{font-size:10px}.hil-rail-footer{font-size:10px}}
`;

async function unwrap(call, endpoint, payload = {}) {
  const response = await call(endpoint, payload);
  if (!response?.ok) throw new Error(response?.error?.message || 'DSH connection failed.');
  return response.value;
}

function Outcome({ state, busy, onAccept }) {
  const decisions = state.outcome?.decisions ?? [];
  const effects = state.outcome?.effects ?? [];
  return <div className="hil-summary"><h2 className="hil-h2">本次任务的决策影响</h2><p className="hil-copy">只记录当前任务中真实发生的决定与结果变化。</p>{decisions.length > 0 && <><div className="hil-label">你的决定</div>{decisions.map((item) => <div className="hil-summary-item" key={item.id}>{item.detail}</div>)}</>}{effects.length > 0 && <><div className="hil-label">结果因此发生的变化</div>{effects.map((item, index) => <div className="hil-summary-item" key={`${item.decisionId}-${index}`}><strong>{item.before}</strong><br/>→ {item.after}</div>)}</>}{state.finalAcceptedAt ? <div className="hil-summary-item"><strong>最终成果已验收</strong></div> : <button className="hil-btn primary" disabled={busy} onClick={onAccept}>确认验收最终成果</button>}</div>;
}

function formatScore(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

function TaskProfileControls({ profile = {}, busy, disabled, onChange }) {
  const taskSize = profile.taskSize ?? 'medium';
  const participationGoal = profile.participationGoal ?? 'balanced';
  return <div className="hil-card hil-profile hil-task-profile-controls"><div className="hil-segment">{Object.entries(TASK_SIZE_LABEL).map(([value, label]) => <button key={value} className={`hil-segment-btn ${taskSize === value ? 'active' : ''}`} disabled={busy || disabled} onClick={() => onChange({ taskSize: value })}>{label}</button>)}</div><div className="hil-segment">{Object.entries(PARTICIPATION_GOAL_LABEL).map(([value, label]) => <button key={value} className={`hil-segment-btn ${participationGoal === value ? 'active' : ''}`} disabled={busy || disabled} onClick={() => onChange({ participationGoal: value })}>{label}</button>)}</div></div>;
}

function TaskProfileTags({ profile = {} }) {
  const taskSize = profile.taskSize ?? 'medium';
  const participationGoal = profile.participationGoal ?? 'balanced';
  return <span className="hil-status-tags"><span className="hil-mode">{TASK_SIZE_LABEL[taskSize] ?? TASK_SIZE_LABEL.medium}</span><span className="hil-mode">{PARTICIPATION_GOAL_LABEL[participationGoal] ?? PARTICIPATION_GOAL_LABEL.balanced}</span></span>;
}

function RecallPolicyDebug({ state, node }) {
  const latest = state.recallDecisions?.at(-1);
  const decision = node ? (node.lastRecallDecision ?? (latest?.nodeId === node.id ? latest : null)) : latest;
  const budget = decision?.budget;
  const profile = state.taskProfile ?? {};
  if (!decision) return null;
  const auto = decision.action === 'AUTO';
  const reason = {
    recall_value_below_threshold: 'value below gate',
    recall_budget_exhausted: 'recall budget exhausted',
    recall_value_passed: 'value passed gate',
    critical_override: 'critical override',
    user_initiated: 'user initiated',
  }[decision.reason] ?? decision.reason ?? '—';
  return <div className={`hil-card hil-debug ${auto ? 'auto' : 'recall'}`}><strong>{auto ? 'AI 自动继续' : 'Recall Policy'}</strong>{auto && <p className="hil-copy">这一步评估过是否需要 Your Turn，但当前打扰价值不够高，所以没有暂停。</p>}<div className="hil-debug-grid"><span>Recall Value</span><b>{formatScore(decision.recallValue)}</b><span>Threshold</span><b>{formatScore(decision.threshold ?? budget?.threshold)}</b><span>Decision</span><b>{auto ? 'Skipped Your Turn' : decision.action ?? '—'}</b><span>Reason</span><b>{reason}</b><span>Auto Risk</span><b>{formatScore(decision.autoRisk)}</b><span>Human Value</span><b>{formatScore(decision.humanValue)}</b><span>Task Size</span><b>{TASK_SIZE_LABEL[budget?.taskSize ?? profile.taskSize] ?? '中等任务'}</b><span>Goal</span><b>{PARTICIPATION_GOAL_LABEL[budget?.participationGoal ?? profile.participationGoal] ?? '平衡模式'}</b>{budget?.preferencePreset && <><span>Preference</span><b>{budget.preferencePreset}</b></>}<span>Recall Count</span><b>{budget ? `${budget.recallCount} / ${budget.maxRecall}` : `${state.recallState?.recallCount ?? 0} / —`}</b></div></div>;
}

function PreferenceProfileControls({ profile, busy, onEdit }) {
  const summary = profile?.summary || '默认 Your Turn 偏好';
  return <div className="hil-card hil-profile"><div className="hil-label">Your Turn 偏好</div><p className="hil-copy">{summary}</p><button className="hil-btn" disabled={busy} onClick={onEdit}>编辑偏好</button></div>;
}

function MoreInfo({ state, node, hovered, suggestion, draft, setDraft, onEdit }) {
  const completed = node.status === 'completed';
  const basis = node.recallReason || node.rationale;
  return <details className="hil-more"><summary>更多信息</summary>{!hovered && <RecallPolicyDebug state={state} node={node}/>} {!hovered && !suggestion && !completed && <><div className="hil-label">当前分工</div><div className="hil-readonly-value">{nodeModeLabel(node)}</div></>}<div className="hil-label">决策依据</div><p className="hil-copy">{basis}</p>{!!node.evidence.length && <><div className="hil-label">材料与证据</div><ul className="hil-list">{node.evidence.map((item) => <li key={item}>{item}</li>)}</ul></>}{!hovered && !completed && <><div className="hil-label">调整当前步提示词</div><textarea className="hil-textarea" value={draft} onChange={(event) => setDraft(event.target.value)}/><button className="hil-btn" disabled={!draft.trim() || draft === node.instruction} onClick={() => onEdit(node, draft)}>保存提示词</button></>}</details>;
}

function substepResultLabel(node, substep, visualStatus) {
  if (visualStatus === 'paused') return '已暂停，等待你介入';
  if (substep.result) {
    return String(substep.result).replace(/\s+/gu, ' ').trim();
  }
  if (visualStatus === 'in_progress') return '正在进行';
  if (visualStatus === 'completed') return '已完成';
  if (visualStatus === 'skipped') return '已因任务范围变化跳过';
  return '尚未开始';
}

function HumanLoopOverlay({ call }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [localPreference, setLocalPreference] = useState(() => readPreferenceProfile());
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [nativeQuestionVisible, setNativeQuestionVisible] = useState(() => visibleQuestionCard());
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [pinnedNodeId, setPinnedNodeId] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [openSubstepId, setOpenSubstepId] = useState(null);
  const [substepDraft, setSubstepDraft] = useState('');
  const hoverTimer = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const launcherRef = useRef(null);
  const railRef = useRef(null);
  const drawerRef = useRef(null);
  const suppressClickRef = useRef(false);
  const migratingPreferenceRef = useRef(false);
  const savedPreferenceRef = useRef('');
  const nodeRefs = useRef(new Map());
  const [drawerTop, setDrawerTop] = useState(18);
  const [launcherPosition, setLauncherPosition] = useState(() => readPosition(POSITION_KEYS.launcher));
  const [railPosition, setRailPosition] = useState(() => readPosition(POSITION_KEYS.rail));
  const [railHeight, setRailHeight] = useState(() => readHeight());
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(false);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [drawerHeight, setDrawerHeight] = useState(360);
  const selected = useMemo(() => state?.nodes.find((node) => node.id === state.selectedNodeId), [state]);
  const hovered = useMemo(() => state?.nodes.find((node) => node.id === hoveredNodeId), [state, hoveredNodeId]);
  const pinned = useMemo(() => state?.nodes.find((node) => node.id === pinnedNodeId), [state, pinnedNodeId]);
  const detailNode = hovered ?? pinned ?? selected;
  const suggestion = state?.suggestions.find((item) => item.nodeId === detailNode?.id && item.status === 'open');
  const drawerOpen = Boolean(hovered || pinned || summaryOpen);

  useEffect(() => {
    let alive = true;
    const load = () => unwrap(call, 'state').then((next) => { if (alive) setState(next); }).catch((err) => { if (alive) setError(err.message); });
    load();
    const timer = setInterval(load, 1200);
    return () => { alive = false; clearInterval(timer); };
  }, [call]);
  useEffect(() => { if (open) setLocalPreference(readPreferenceProfile()); }, [open]);
  useEffect(() => {
    if (!state?.preferenceProfile) return;
    const key = JSON.stringify(state.preferenceProfile);
    if (savedPreferenceRef.current === key) return;
    savedPreferenceRef.current = key;
    setLocalPreference(savePreferenceProfile(state.preferenceProfile));
  }, [state?.preferenceProfile]);
  useEffect(() => {
    if (!state || state.preferenceProfile || state.preferenceOnboarding?.status !== 'needed' || !localPreference || migratingPreferenceRef.current) return;
    migratingPreferenceRef.current = true;
    dispatch({ type: 'CONFIRM_PREFERENCE_MIGRATION', profile: localPreference }).finally(() => { migratingPreferenceRef.current = false; });
  }, [state?.id, state?.preferenceProfile, state?.preferenceOnboarding?.status, localPreference]);
  useEffect(() => { if (detailNode) setDraft(detailNode.instruction); }, [detailNode?.id]);
  useEffect(() => {
    const update = () => setNativeQuestionVisible(visibleQuestionCard());
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setOpenSubstepId(null); setSubstepDraft(''); }, [detailNode?.id]);
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') { setHoveredNodeId(null); setPinnedNodeId(null); setSummaryOpen(false); } };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); clearTimeout(hoverTimer.current); };
  }, []);
  useEffect(() => {
    const realign = () => alignDrawer(nodeRefs.current.get(hoveredNodeId || pinnedNodeId));
    window.addEventListener('resize', realign);
    return () => window.removeEventListener('resize', realign);
  }, [hoveredNodeId, pinnedNodeId]);
  useLayoutEffect(() => {
    if (!drawerOpen || window.innerWidth <= 650) return;
    const frame = requestAnimationFrame(() => {
      const anchor = nodeRefs.current.get(hoveredNodeId || pinnedNodeId);
      if (anchor) alignDrawer(anchor);
      else if (summaryOpen && railRef.current) setDrawerTop(Math.round(railRef.current.getBoundingClientRect().top));
    });
    return () => cancelAnimationFrame(frame);
  }, [drawerOpen, hoveredNodeId, pinnedNodeId, summaryOpen, railPosition?.x, railPosition?.y]);
  useEffect(() => {
    const clampSavedPositions = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      if (window.innerWidth <= 650) return;
      setLauncherPosition((position) => { const next = position ? clampPosition(position, launcherRef.current, 150, 40) : null; if (next) savePosition(POSITION_KEYS.launcher, next); return next; });
      setRailHeight((height) => { const next = height ? Math.min(Math.max(MIN_RAIL_HEIGHT, height), window.innerHeight - VIEWPORT_GAP * 2) : null; if (next) saveHeight(next); return next; });
      setRailPosition((position) => { const next = position ? clampPosition(position, railRef.current, 204, railHeight || Math.min(610, window.innerHeight - 130)) : null; if (next) savePosition(POSITION_KEYS.rail, next); return next; });
    };
    window.addEventListener('resize', clampSavedPositions);
    clampSavedPositions();
    return () => window.removeEventListener('resize', clampSavedPositions);
  }, [railHeight]);
  useLayoutEffect(() => {
    if (!drawerOpen || !drawerRef.current) return;
    setDrawerHeight(drawerRef.current.getBoundingClientRect().height);
  }, [drawerOpen, detailNode?.id, openSubstepId, summaryOpen]);
  useLayoutEffect(() => {
    const element = launcherRef.current;
    if (!element || !launcherPosition || window.innerWidth <= 650) return;
    const next = clampPosition(launcherPosition, element, 150, 40);
    if (next.x !== launcherPosition.x || next.y !== launcherPosition.y) { setLauncherPosition(next); savePosition(POSITION_KEYS.launcher, next); }
  }, [open, state?.revision, taskLifecycle(state).label]);
  useEffect(() => {
    const element = drawerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setDrawerHeight(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [drawerOpen]);
  useEffect(() => {
    const cancelDrag = () => { dragRef.current = null; resizeRef.current = null; setDragging(null); setResizing(false); };
    window.addEventListener('blur', cancelDrag);
    return () => window.removeEventListener('blur', cancelDrag);
  }, []);

  async function dispatch(action) {
    setBusy(true); setError('');
    try {
      const next = await unwrap(call, 'dispatch', action);
      setState(next);
      if (['START_PREFERENCE_ONBOARDING', 'CONFIRM_PREFERENCE_MIGRATION', 'COMPLETE_PREFERENCE_ONBOARDING', 'APPLY_PREFERENCE_PROFILE'].includes(action.type) && next?.preferenceProfile) {
        setLocalPreference(savePreferenceProfile(next.preferenceProfile));
      }
      return next;
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function alignDrawer(element) { if (element) setDrawerTop(Math.round(element.getBoundingClientRect().top)); }
  function startDrag(kind, event) {
    if (window.innerWidth <= 650 || !event.isPrimary || event.button !== 0 || event.target.closest?.('[data-no-drag]')) return;
    const element = kind === 'launcher' ? launcherRef.current : railRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    dragRef.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: rect.left, originY: rect.top, current: { x: rect.left, y: rect.top }, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; setDragging(drag.kind); }
    event.preventDefault();
    const element = drag.kind === 'launcher' ? launcherRef.current : railRef.current;
    const next = clampPosition({ x: drag.originX + dx, y: drag.originY + dy }, element, drag.kind === 'launcher' ? 150 : 204, drag.kind === 'launcher' ? 40 : 600);
    drag.current = next;
    if (drag.kind === 'launcher') setLauncherPosition(next); else { setRailPosition(next); setHoveredNodeId(null); }
  }
  function endDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const position = drag.current;
    if (drag.moved && position) {
      savePosition(POSITION_KEYS[drag.kind], position);
      suppressClickRef.current = performance.now() + 350;
    }
    dragRef.current = null;
    setDragging(null);
  }
  function cancelDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(null);
  }
  function startResize(edge, event) {
    if (window.innerWidth <= 650 || !event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return;
    clearTimeout(hoverTimer.current);
    setHoveredNodeId(null);
    resizeRef.current = { edge, pointerId: event.pointerId, startY: event.clientY, originX: rect.left, originTop: rect.top, originHeight: rect.height, currentTop: rect.top, currentHeight: rect.height };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setResizing(true);
  }
  function moveResize(event) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = event.clientY - resize.startY;
    const maxHeight = Math.max(MIN_RAIL_HEIGHT, window.innerHeight - VIEWPORT_GAP * 2);
    if (resize.edge === 'bottom') {
      resize.currentHeight = Math.min(Math.max(MIN_RAIL_HEIGHT, resize.originHeight + delta), window.innerHeight - resize.originTop - VIEWPORT_GAP);
    } else {
      const bottom = resize.originTop + resize.originHeight;
      resize.currentTop = Math.max(VIEWPORT_GAP, Math.min(resize.originTop + delta, bottom - MIN_RAIL_HEIGHT));
      resize.currentHeight = Math.min(maxHeight, bottom - resize.currentTop);
      setRailPosition((position) => ({ x: position?.x ?? resize.originX, y: resize.currentTop }));
    }
    setRailHeight(resize.currentHeight);
  }
  function endResize(event) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    saveHeight(resize.currentHeight);
    if (resize.edge === 'top') {
      const next = { x: railPosition?.x ?? resize.originX, y: resize.currentTop };
      setRailPosition(next);
      savePosition(POSITION_KEYS.rail, next);
    }
    resizeRef.current = null;
    setResizing(false);
  }
  function cancelResize(event) {
    if (!resizeRef.current || resizeRef.current.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    setResizing(false);
  }
  function openFromLauncher(event) { if (event.detail === 0 || performance.now() >= suppressClickRef.current) setOpen(true); }
  function preview(nodeId, element) {
    clearTimeout(hoverTimer.current);
    if (nodeId === pinnedNodeId) { setHoveredNodeId(null); alignDrawer(element); return; }
    alignDrawer(element);
    setHoveredNodeId(nodeId);
  }
  function keepPreview() { clearTimeout(hoverTimer.current); }
  function leavePreview() { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setHoveredNodeId(null), 140); }
  function showSubstep(node, substep) {
    setOpenSubstepId(`${node.id}:${substep.id}`);
    setSubstepDraft(substep.instruction);
  }
  function hideSubstep(event) {
    if (event?.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    if (event?.type === 'mouseleave' && event.currentTarget.contains(document.activeElement)) return;
    setOpenSubstepId(null);
    setSubstepDraft('');
  }
  async function reviseSubstep(node, substep) {
    const next = await dispatch({ type: 'REVISE_SUBSTEP', nodeId: node.id, substepId: substep.id, instruction: substepDraft });
    if (next) setOpenSubstepId(null);
  }
  function updateTaskProfile(taskProfile) {
    return dispatch({ type: 'UPDATE_TASK_PROFILE', taskProfile });
  }
  function startPreferenceOnboarding() {
    return dispatch({ type: 'START_PREFERENCE_ONBOARDING' });
  }
  if (!state) return <div className="hil-root"><button className="hil-launcher" onClick={() => setOpen(!open)}><span className="hil-state-dot"/>正在连接</button>{open && <div className="hil-rail hil-loading">正在连接 DSH 插件… {error}</div>}</div>;
  const lifecycle = taskLifecycle(state, nativeQuestionVisible);
  return <div className={`hil-root ${nativeQuestionVisible ? 'native-question' : ''}`}>
    {!open && <button ref={launcherRef} style={draggableStyle(launcherPosition)} className={`hil-launcher ${lifecycle.key} ${dragging === 'launcher' ? 'hil-dragging' : ''}`} aria-label={`${lifecycle.label}，拖动可移动，点击打开任务路径`} onPointerDown={(event) => startDrag('launcher', event)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onClick={openFromLauncher}><span className="hil-state-dot"/><span>{lifecycle.label}</span></button>}
    {open && <>
      <section ref={railRef} style={railStyle(railPosition, railHeight)} className={`hil-rail ${dragging === 'rail' ? 'hil-dragging' : ''} ${resizing ? 'hil-resizing' : ''}`} aria-label="人机决策路径" onClick={(event) => { if (event.target === event.currentTarget) { setPinnedNodeId(null); setSummaryOpen(false); } }}>
        <div className="hil-resize-handle top" data-no-drag role="separator" aria-label="调整侧边栏顶部" aria-orientation="horizontal" onPointerDown={(event) => startResize('top', event)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onLostPointerCapture={cancelResize}/>
        <header className="hil-rail-header" onPointerDown={(event) => startDrag('rail', event)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}><span className="hil-drag-handle" aria-hidden="true" title="拖动侧边栏"><span className="hil-drag-grip">⠿</span></span><button className="hil-close" data-no-drag aria-label="收起路径" onClick={() => { setOpen(false); setPinnedNodeId(null); setHoveredNodeId(null); }}>×</button></header>
        <nav className="hil-path" onScroll={() => alignDrawer(nodeRefs.current.get(hoveredNodeId || pinnedNodeId))} onMouseLeave={leavePreview} onClick={(event) => { if (event.target === event.currentTarget) { setPinnedNodeId(null); setSummaryOpen(false); } }}>{state.nodes.map((node) => {
          const inlineSubsteps = node.substeps ?? [];
          const showInlineProcess = INLINE_PROCESS_STATUSES.has(node.status) && inlineSubsteps.length > 0;
          return <div className="hil-node-group" key={node.id}>
            <button ref={(element) => { if (element) nodeRefs.current.set(node.id, element); else nodeRefs.current.delete(node.id); }} className={`hil-node ${node.status} ${['in_progress', 'awaiting_feedback'].includes(node.status) ? 'running' : ''} ${node.id === pinnedNodeId ? 'pinned' : ''}`} title="悬停预览，点击固定" onMouseEnter={(event) => preview(node.id, event.currentTarget)} onFocus={(event) => preview(node.id, event.currentTarget)} onBlur={leavePreview} onClick={(event) => { clearTimeout(hoverTimer.current); alignDrawer(event.currentTarget); setHoveredNodeId(null); setSummaryOpen(false); setPinnedNodeId(node.id); }}>{<span className="hil-node-top"><span className="hil-status"/><span className="hil-node-title">{node.order}. {node.title}</span></span>}<div className="hil-node-meta">{STATUS_LABEL[node.status]} · {nodeModeLabel(node)}</div></button>
            {showInlineProcess && <div className="hil-inline-process" role="list" aria-label={`${node.title}的内部流程`}>{inlineSubsteps.map((substep) => { const visualStatus = substepVisualStatus(node, substep); return <div className={`hil-inline-step ${visualStatus}`} role="listitem" aria-current={visualStatus === 'in_progress' || visualStatus === 'paused' ? 'step' : undefined} key={substep.id}><span className="hil-inline-step-dot"/><span className="hil-inline-step-title">{substep.title}</span></div>; })}</div>}
          </div>;
        })}</nav>
        <footer className="hil-rail-footer"><div className={`hil-attention-state ${lifecycle.key}`}><span className="hil-state-dot"/><span>{lifecycle.label}</span></div>{state.pathSync && <button className="hil-summary-link" disabled={busy} onClick={() => dispatch({ type: 'REQUEST_PATH_SYNC' })}>{state.pathSync.status === 'needs_plan' ? '让 Agent 补充路径 →' : '让 Agent 核对路径 →'}</button>}{state.outcome && <button className="hil-summary-link" onClick={() => { setDrawerTop(76); setPinnedNodeId(null); setSummaryOpen(true); }}>查看决策效果 →</button>}</footer>
        <div className="hil-resize-handle bottom" data-no-drag role="separator" aria-label="调整侧边栏底部" aria-orientation="horizontal" onPointerDown={(event) => startResize('bottom', event)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onLostPointerCapture={cancelResize}/>
      </section>
      {drawerOpen && <aside ref={drawerRef} className="hil-drawer" style={drawerStyle(railPosition, drawerTop, viewport, drawerHeight)} aria-label="节点详情" onMouseEnter={keepPreview} onMouseLeave={() => { if (hovered) leavePreview(); }}>
        {!hovered && summaryOpen && <header className="hil-drawer-header"><span>任务总结</span><button className="hil-close" aria-label="关闭详情" onClick={() => { setPinnedNodeId(null); setSummaryOpen(false); }}>×</button></header>}
        {!hovered && !summaryOpen && <button className="hil-close hil-drawer-close" aria-label="关闭详情" onClick={() => setPinnedNodeId(null)}>×</button>}
        <main className="hil-detail">
          {!hovered && summaryOpen ? <Outcome state={state} busy={busy} onAccept={() => dispatch({ type: 'ACCEPT_FINAL_RESULT' })}/> : !detailNode ? <div className="hil-card"><strong>等待 Agent 发布路径</strong></div> : <>
            <div className="hil-status-row"><span className="hil-mode">{STATUS_LABEL[detailNode.status]}</span>{detailNode.status !== 'pending' && <TaskProfileTags profile={state.taskProfile}/>}</div><h2 className="hil-h2">{detailNode.title}</h2><div className="hil-goal">{detailNode.objective}</div>
            {!hovered && detailNode.status === 'pending' && <TaskProfileControls profile={state.taskProfile} busy={busy} disabled={detailNode.status !== 'pending'} onChange={updateTaskProfile}/>}
            {!hovered && <PreferenceProfileControls profile={state.preferenceProfile} busy={busy} onEdit={startPreferenceOnboarding}/>}
            <div className="hil-process">{detailNode.substeps.map((substep) => { const visualStatus = substepVisualStatus(detailNode, substep); const key = `${detailNode.id}:${substep.id}`; const expanded = openSubstepId === key; return <div key={substep.id} className={`hil-substep ${visualStatus} ${expanded ? 'open' : ''}`} tabIndex={0} onMouseEnter={() => showSubstep(detailNode, substep)} onMouseLeave={hideSubstep} onFocus={(event) => { if (event.target === event.currentTarget) showSubstep(detailNode, substep); }} onBlur={hideSubstep}><span className="hil-substep-mark"/><span><div className="hil-substep-title">{substep.title}</div><div className="hil-substep-result" title={substep.result || undefined}>{substepResultLabel(detailNode, substep, visualStatus)}</div></span>{expanded && <div className="hil-substep-editor" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><textarea className="hil-textarea" aria-label="修改这一步的做法" value={substepDraft} onChange={(event) => setSubstepDraft(event.target.value)}/><button className="hil-rerun-button" type="button" aria-label="保存并从这里重做" disabled={busy || !substepDraft.trim()} onClick={() => reviseSubstep(detailNode, substep)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6"/><path d="M5.5 15a8 8 0 1 0 1.7-8.4L4 10"/></svg></button></div>}</div>; })}</div>
            {suggestion && <div className="hil-card hil-suggest"><strong>建议你参与这一步</strong><ul className="hil-list">{suggestion.reasons.map((reason) => <li key={reason.code}>{reason.label}</li>)}</ul>{hovered ? <p className="hil-preview-hint">点击节点固定后可选择参与方式</p> : state.runMode === 'agent' && state.pendingDecision ? <p className="hil-copy">当前 Agent 已打开原生决策卡，回答后会原地继续。</p> : <div className="hil-buttons"><button className="hil-btn" onClick={() => dispatch({ type: 'ACCEPT_SUGGESTION', suggestionId: suggestion.id, mode: 'agent' })}>AI完成</button><button className="hil-btn" onClick={() => dispatch({ type: 'ACCEPT_SUGGESTION', suggestionId: suggestion.id, mode: 'human_leads' })}>主动介入</button><button className="hil-btn primary" onClick={() => dispatch({ type: 'ACCEPT_SUGGESTION', suggestionId: suggestion.id, mode: suggestion.recallKind === 'direction' ? 'human_leads' : 'agent_coaches', recallKind: suggestion.recallKind || 'growth' })}>{suggestion.recallKind === 'direction' ? '结果型召回' : '成长型召回'}</button></div>}</div>}
            <MoreInfo state={state} node={detailNode} hovered={hovered} suggestion={suggestion} draft={draft} setDraft={setDraft} onEdit={(node, instruction) => dispatch({ type: 'EDIT_INSTRUCTION', nodeId: node.id, instruction })}/>
          </>}
          {error && <div className="hil-error">{error}</div>}
        </main>
      </aside>}
    </>}
  </div>;
}

export function apply(ctx) {
  const style = document.createElement('style');
  style.dataset.plugin = 'your-turn-dsh';
  style.textContent = styles;
  document.head.appendChild(style);
  ctx.effect(() => () => style.remove());
  ctx.effect(() => {
    const observer = new MutationObserver(relabelDecisionCardDelegateAction);
    observer.observe(document.body, { childList: true, subtree: true });
    relabelDecisionCardDelegateAction();
    return () => observer.disconnect();
  });
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'your-turn', order: 50,
    inject: () => ({ call: (endpoint, payload = {}) => {
      const sessionId = ctx.sessions.list.getSnapshot().current;
      return ctx.connection.rpc.call('/your-turn', endpoint, { ...payload, ...(sessionId ? { sessionId } : {}) });
    } }),
  }, HumanLoopOverlay));
}
