window.__ModuleLoader__.load({
  id: "your-turn-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "connection", "sessions"];
var MODE_LABEL = { agent: "AI\u5B8C\u6210", human_leads: "\u4E3B\u52A8\u4ECB\u5165", agent_coaches: "\u6210\u957F\u578B\u53EC\u56DE" };
var STATUS_LABEL = { pending: "\u672A\u5F00\u59CB", in_progress: "\u8FDB\u884C\u4E2D", waiting_for_user: "\u5DF2\u6682\u505C \xB7 \u7B49\u4F60\u53C2\u4E0E", awaiting_feedback: "\u8FDB\u884C\u4E2D \xB7 AI \u6B63\u5728\u53CD\u9988", feedback_ready: "\u5DF2\u6682\u505C \xB7 \u7B49\u4F60\u786E\u8BA4", completed: "\u5DF2\u5B8C\u6210", skipped: "\u5DF2\u8DF3\u8FC7" };
var PAUSED_STATUSES = /* @__PURE__ */ new Set(["waiting_for_user", "feedback_ready"]);
var INLINE_PROCESS_STATUSES = /* @__PURE__ */ new Set(["in_progress", "awaiting_feedback", "waiting_for_user", "feedback_ready"]);
function nodeModeLabel(node) {
  if (node.mode === "agent") return "AI\u5B8C\u6210";
  if (node.recallKind === "growth") return "\u6210\u957F\u578B\u53EC\u56DE";
  if (node.recallKind === "direction") return "\u7ED3\u679C\u578B\u53EC\u56DE";
  return MODE_LABEL[node.mode] ?? node.mode;
}
function substepVisualStatus(node, substep, nativeQuestionVisible = false) {
  const pausedSubstep = node.substeps.find((item) => item.status === "in_progress") ?? node.substeps.find((item) => item.status !== "completed");
  if ((nativeQuestionVisible || PAUSED_STATUSES.has(node.status)) && substep.id === pausedSubstep?.id) return "paused";
  return substep.status;
}
function taskLifecycle(state, nativeQuestionVisible = false) {
  if (!state || state.nodes.length === 0 && state.telemetry?.lastEvent === "session-attached") return { key: "not-started", label: "\u672A\u5F00\u59CB" };
  if (state.telemetry?.pathRequiredTurn && state.telemetry?.pathPublishedTurn !== state.telemetry.pathRequiredTurn && state.telemetry?.lastEvent !== "turn/end") return { key: "planning", label: "\u6B63\u5728\u89C4\u5212" };
  if (state.nodes.length === 0 && (state.pathSync?.status === "needs_plan" || state.telemetry?.lastEvent === "turn/end")) return { key: "sync", label: "\u672C\u8F6E\u672A\u751F\u6210\u8DEF\u5F84" };
  if (state.nodes.length === 0) return { key: "planning", label: "\u6B63\u5728\u89C4\u5212" };
  if (nativeQuestionVisible || state.pendingDecision || state.nodes.some((node) => PAUSED_STATUSES.has(node.status))) return { key: "attention", label: "\u9700\u8981\u4F60\u56DE\u6765" };
  if (state.pathSync?.status === "needs_sync") return { key: "sync", label: "\u8DEF\u5F84\u5F85\u540C\u6B65" };
  if (state.nodes.every((node) => ["completed", "skipped"].includes(node.status))) {
    return state.finalAcceptedAt ? { key: "accepted", label: "\u6700\u7EC8\u6210\u679C\u5DF2\u9A8C\u6536" } : { key: "review", label: "\u8BF7\u9A8C\u6536\u6700\u7EC8\u6210\u679C" };
  }
  return { key: "safe", label: "\u53EF\u653E\u5FC3\u79BB\u5F00" };
}
var DECISION_CARD_HEADERS = /* @__PURE__ */ new Set(["Your Turn", "\u503C\u5F97\u4F60\u4EB2\u81EA\u5224\u65AD", "\u9700\u8981\u4F60\u62FF\u5B9A\u65B9\u5411", "\u9700\u8981\u4F60\u56DE\u6765"]);
var POSITION_KEYS = { launcher: "human-loop-launcher-position", rail: "human-loop-rail-position", railHeight: "human-loop-rail-height" };
var VIEWPORT_GAP = 8;
var MIN_RAIL_HEIGHT = 280;
function readPosition(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Number.isFinite(value?.x) && Number.isFinite(value?.y) ? value : null;
  } catch {
    return null;
  }
}
function savePosition(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}
function readHeight() {
  try {
    const value = Number(localStorage.getItem(POSITION_KEYS.railHeight));
    return Number.isFinite(value) && value >= MIN_RAIL_HEIGHT ? value : null;
  } catch {
    return null;
  }
}
function saveHeight(value) {
  try {
    localStorage.setItem(POSITION_KEYS.railHeight, String(Math.round(value)));
  } catch {
  }
}
function clampPosition(value, element, fallbackWidth, fallbackHeight) {
  const width = element?.offsetWidth || fallbackWidth;
  const height = element?.offsetHeight || fallbackHeight;
  return {
    x: Math.max(VIEWPORT_GAP, Math.min(value.x, window.innerWidth - width - VIEWPORT_GAP)),
    y: Math.max(VIEWPORT_GAP, Math.min(value.y, window.innerHeight - height - VIEWPORT_GAP))
  };
}
function draggableStyle(position) {
  return position ? { left: `${position.x}px`, top: `${position.y}px`, right: "auto", bottom: "auto" } : void 0;
}
function railStyle(position, height) {
  return { ...draggableStyle(position), ...height ? { height: `${height}px` } : {} };
}
function drawerStyle(railPosition, top, viewport, drawerHeight) {
  if (viewport.width <= 650) return { "--hil-drawer-top": `${top}px` };
  const railLeft = railPosition?.x ?? viewport.width - 222;
  const drawerWidth = 360;
  const railWidth = 204;
  const gap = 10;
  const preferredLeft = railLeft - drawerWidth - gap;
  const left = preferredLeft >= VIEWPORT_GAP ? preferredLeft : Math.min(viewport.width - drawerWidth - VIEWPORT_GAP, railLeft + railWidth + gap);
  const visibleHeight = Math.min(drawerHeight || 360, viewport.height - VIEWPORT_GAP * 2);
  const y = Math.max(VIEWPORT_GAP, Math.min(top, viewport.height - visibleHeight - VIEWPORT_GAP));
  return { "--hil-drawer-top": `${y}px`, top: `${y}px`, left: `${Math.max(VIEWPORT_GAP, left)}px`, right: "auto" };
}
function relabelDecisionCardDelegateAction() {
  for (const card of document.querySelectorAll("[data-question-key]")) {
    const eyebrow = card.querySelector(".Mbwy4a_eyebrow");
    if (!DECISION_CARD_HEADERS.has(eyebrow?.textContent?.trim())) continue;
    card.classList.add("hil-decision-card");
    const button = [...card.querySelectorAll("button")].find((item) => ["\u8DF3\u8FC7\u672C\u9898", "Skip this question"].includes(item.textContent?.trim()));
    if (!button) continue;
    const english = button.textContent?.trim() === "Skip this question";
    button.textContent = english ? "Give to AI" : "\u4EA4\u7ED9 AI";
    button.setAttribute("aria-label", english ? "Let AI decide and continue" : "\u4EA4\u7ED9 AI \u81EA\u884C\u5224\u65AD\u5E76\u7EE7\u7EED");
    button.setAttribute("title", english ? "Let AI decide from the available evidence and continue" : "\u7531 AI \u6839\u636E\u73B0\u6709\u6750\u6599\u81EA\u884C\u5224\u65AD\u5E76\u7EE7\u7EED");
  }
}
function visibleQuestionCard() {
  return [...document.querySelectorAll("[data-question-key]")].some((card) => {
    const style = window.getComputedStyle(card);
    const rect = card.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  });
}
var styles = `
.hil-root{--hil-stage:#f4f4f5;--hil-shell:#f8f8f9;--hil-surface:#fff;--hil-muted:#f3f3f4;--hil-border:#e4e4e7;--hil-ink:#18181b;--hil-copy:#52525b;--hil-caption:#a1a1aa;--hil-success:#7cb518;--hil-success-soft:#f1f7e4;--hil-success-border:#d5e5b3;--hil-success-text:#567d11;--hil-active:#ffba08;--hil-active-soft:#fff5d6;--hil-active-border:#f4d984;--hil-active-text:#7a5800;--hil-paused:#e85d04;--hil-paused-soft:#fdece5;--hil-paused-border:#f5c0a8;--hil-paused-text:#a53c03;position:fixed;inset:0;z-index:80;pointer-events:none;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--hil-ink);color-scheme:light}
.hil-root *{box-sizing:border-box}.hil-launcher,.hil-rail,.hil-drawer{pointer-events:auto}
[class~='hil-state-dot'],[class~='hil-status'],[class~='hil-inline-step-dot'],[class~='hil-substep-mark']{corner-shape:round!important}
[data-question-key] .Mbwy4a_detail{margin:8px 24px 12px}.hil-decision-card .Mbwy4a_detail h4{display:table;margin:14px 0 7px;padding:3px 9px;border:0;border-radius:999px;corner-shape:round!important;background:#f3f4f6;color:#52525b;font-size:12px;font-weight:600;line-height:18px}.hil-decision-card .Mbwy4a_detail h4:first-child{margin-top:0}.hil-decision-card .Mbwy4a_detail p,.hil-decision-card .Mbwy4a_detail ul{margin-top:0;margin-bottom:10px}
.hil-launcher{position:absolute;right:22px;bottom:92px;border:1px solid var(--hil-border);background:var(--hil-surface);color:var(--hil-ink);border-radius:999px;padding:9px 13px;display:flex;align-items:center;gap:8px;box-shadow:0 14px 34px -12px rgba(0,0,0,.24);cursor:pointer;font-size:12px;font-weight:600;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.hil-launcher:hover{transform:translateY(-2px);border-color:#a1a1aa;box-shadow:0 18px 42px -14px rgba(0,0,0,.3)}.hil-launcher.not-started{background:var(--hil-muted);border-color:var(--hil-border);color:var(--hil-copy)}.hil-launcher.attention{background:#fff7f7;border-color:#fecaca;color:#b91c1c}.hil-launcher.planning{background:#fffbeb;border-color:#fde68a;color:#92400e}.hil-launcher.review,.hil-launcher.accepted{background:#f0fdf4;border-color:#bbf7d0;color:#047857}.hil-state-dot{box-sizing:border-box!important;inline-size:8px!important;block-size:8px!important;min-inline-size:8px!important;min-block-size:8px!important;max-inline-size:8px!important;max-block-size:8px!important;padding:0!important;border:0!important;border-radius:50%!important;background:var(--hil-success);flex:0 0 8px!important;display:block;overflow:hidden}.hil-launcher.not-started .hil-state-dot{background:var(--hil-caption)}.hil-launcher.attention .hil-state-dot{background:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-launcher.planning .hil-state-dot{background:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}
.hil-rail{position:absolute;right:18px;top:76px;bottom:auto;width:204px;height:min(610px,calc(100vh - 130px));background:var(--hil-shell);border:1px solid rgba(228,228,231,.9);border-radius:28px;box-shadow:0 20px 50px -15px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;animation:hil-rail-in .18s cubic-bezier(.2,.8,.2,1)}
.hil-rail-header{padding:10px 11px 4px;display:flex;justify-content:flex-end;align-items:center}.hil-attention-state{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;font-weight:650;line-height:1.3}.hil-attention-state .hil-state-dot{inline-size:8px!important;block-size:8px!important;min-inline-size:8px!important;min-block-size:8px!important;max-inline-size:8px!important;max-block-size:8px!important;flex-basis:8px!important}.hil-attention-state.not-started{color:var(--hil-copy)}.hil-attention-state.not-started .hil-state-dot{background:var(--hil-caption)}.hil-attention-state.attention{color:#b91c1c}.hil-attention-state.attention .hil-state-dot{background:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-attention-state.planning{color:#92400e}.hil-attention-state.planning .hil-state-dot{background:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-attention-state.review,.hil-attention-state.accepted{color:#047857}.hil-close{width:26px;height:26px;border:0;background:transparent;border-radius:999px;font-size:17px;line-height:1;color:var(--hil-caption);cursor:pointer}.hil-close:hover{background:#eaeaeb;color:var(--hil-ink)}
.hil-path{overflow:auto;padding:5px 9px 9px;flex:1}.hil-node-group{margin-bottom:4px}.hil-node{width:100%;border:1px solid transparent;border-bottom-color:var(--hil-border);background:rgba(255,255,255,.62);text-align:left;padding:10px 9px;border-radius:13px;cursor:pointer;color:inherit;transition:background .14s ease,border-color .14s ease,transform .14s ease}.hil-node:hover{background:var(--hil-surface);border-color:var(--hil-border);transform:translateX(-2px)}.hil-node.running{background:var(--hil-active-soft);border-color:transparent}.hil-node.pinned{background:var(--hil-surface);border-color:#d4d4d8;box-shadow:none}.hil-node.running.pinned{background:var(--hil-active-soft);border-color:transparent;box-shadow:none}.hil-node.waiting_for_user,.hil-node.feedback_ready{background:var(--hil-paused-soft);border-color:transparent;box-shadow:none}.hil-node-top{display:flex;align-items:center;gap:8px}.hil-status{box-sizing:border-box!important;inline-size:13px!important;block-size:13px!important;min-inline-size:13px!important;min-block-size:13px!important;max-inline-size:13px!important;max-block-size:13px!important;padding:0!important;border:1.5px solid #b8bbc2;border-radius:50%!important;display:block;flex:0 0 13px!important;overflow:hidden}.hil-node.completed .hil-status{background:var(--hil-success);border-color:var(--hil-success)}.hil-node.in_progress .hil-status,.hil-node.awaiting_feedback .hil-status{background:var(--hil-active);border-color:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-node.waiting_for_user .hil-status,.hil-node.feedback_ready .hil-status{background:var(--hil-paused);border-color:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-node-title{font-size:12px;font-weight:600;line-height:1.35}.hil-node-meta{font:9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption);margin:5px 0 0 21px}.hil-node.waiting_for_user .hil-node-meta,.hil-node.feedback_ready .hil-node-meta{color:#dc2626;font-weight:600}.hil-inline-process{margin:3px 8px 7px 15px;padding:5px 0 3px 12px;border-left:1px dashed #d4d4d8;display:grid;gap:2px;animation:hil-inline-in .2s ease-out}.hil-inline-step{display:grid;grid-template-columns:9px minmax(0,1fr);align-items:center;gap:7px;min-height:22px;color:var(--hil-caption);font-size:10px;line-height:1.35}.hil-inline-step-dot{box-sizing:border-box!important;inline-size:7px!important;block-size:7px!important;min-inline-size:7px!important;min-block-size:7px!important;max-inline-size:7px!important;max-block-size:7px!important;padding:0!important;border:1.3px solid #b8bbc2;border-radius:50%!important;background:var(--hil-shell);display:block;overflow:hidden}.hil-inline-step.completed{color:#047857}.hil-inline-step.completed .hil-inline-step-dot{border-color:var(--hil-success);background:var(--hil-success)}.hil-inline-step.in_progress{color:#92400e;font-weight:600}.hil-inline-step.in_progress .hil-inline-step-dot{border-color:var(--hil-active);background:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-inline-step.paused{color:#b91c1c;font-weight:600}.hil-inline-step.paused .hil-inline-step-dot{border-color:var(--hil-paused);background:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-inline-step-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hil-rail-footer{border-top:1px dashed var(--hil-border);padding:10px 12px;display:grid;gap:8px}.hil-footer-actions{display:flex;align-items:center;justify-content:space-between;gap:7px;font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption)}.hil-summary-link{width:100%;border:0;background:var(--hil-success-soft);color:#047857;border-radius:999px;padding:8px 10px;font-size:10px;font-weight:600;cursor:pointer;text-align:center}
.hil-drawer{position:absolute;right:232px;top:var(--hil-drawer-top,18px);width:360px;min-width:360px;max-width:360px;height:auto;max-height:calc(100vh - var(--hil-drawer-top,18px) - 18px);background:var(--hil-shell);border:1px solid rgba(228,228,231,.9);border-radius:28px;box-shadow:0 20px 50px -15px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;animation:hil-drawer-in .18s cubic-bezier(.2,.8,.2,1)}.hil-drawer-header{min-height:42px;padding:10px 14px;border-bottom:1px dashed var(--hil-border);display:flex;align-items:center;justify-content:space-between;font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption);letter-spacing:.04em;text-transform:uppercase}.hil-drawer-close{position:absolute;right:11px;top:11px;z-index:2;background:var(--hil-shell)}.hil-detail{overflow:auto;padding:18px;flex:0 1 auto;min-width:0}.hil-preview{display:flex;flex-direction:column;justify-content:flex-start}.hil-preview-state{display:flex;align-items:center;gap:7px;font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption);margin-bottom:12px}.hil-preview-activity{padding:13px 14px;border:1px solid var(--hil-border);border-radius:16px;background:var(--hil-surface);font-size:13px;line-height:1.55;margin:9px 0}.hil-preview-action{padding:10px 12px;border-radius:999px;background:var(--hil-paused-soft);color:#b91c1c;font-size:11px;font-weight:600;line-height:1.4;margin-top:5px}.hil-preview-hint{font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--hil-caption);margin-top:15px}.hil-preview .hil-status{display:inline-grid}.hil-preview .hil-status.completed{background:var(--hil-success);border-color:var(--hil-success)}.hil-preview .hil-status.in_progress,.hil-preview .hil-status.awaiting_feedback{border-color:var(--hil-active);box-shadow:inset 0 0 0 3px var(--hil-active)}.hil-preview .hil-status.waiting_for_user,.hil-preview .hil-status.feedback_ready{background:var(--hil-paused);border-color:var(--hil-paused);animation:hil-pause-pulse 1.5s ease-in-out infinite}
.hil-mode{display:inline-flex;border:1px solid var(--hil-border);border-radius:999px;padding:4px 9px;background:var(--hil-surface);color:var(--hil-copy);font:10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:10px}.hil-h2{font-size:18px;font-weight:650;letter-spacing:-.02em;margin:0 0 7px}.hil-copy{font-size:13px;line-height:1.6;color:var(--hil-copy);margin:0 0 13px}.hil-card{border:1px solid var(--hil-border);border-radius:16px;padding:14px;margin:13px 0;background:var(--hil-surface);box-shadow:inset 0 1px 0 rgba(255,255,255,.9)}.hil-suggest{background:#fffbeb;border-color:#f7d98a}.hil-label{font-size:10px;font-weight:650;text-transform:uppercase;letter-spacing:.08em;color:var(--hil-caption);margin:14px 0 6px}.hil-list{margin:7px 0;padding-left:18px;font-size:12px;line-height:1.55;color:var(--hil-copy)}.hil-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.hil-btn{border:1px solid var(--hil-border);background:var(--hil-surface);color:var(--hil-ink);border-radius:999px;padding:7px 11px;font-size:11px;font-weight:550;cursor:pointer;transition:background .14s ease,transform .14s ease}.hil-btn:hover{background:var(--hil-muted);transform:translateY(-1px)}.hil-btn.primary{background:#3f3f46;border-color:#3f3f46;color:#fff}.hil-btn.primary:hover{background:#52525b;border-color:#52525b}.hil-btn:disabled{opacity:.42;cursor:not-allowed;transform:none}.hil-textarea{width:100%;min-height:88px;resize:vertical;border:1px solid var(--hil-border);border-radius:16px;padding:11px 12px;background:var(--hil-surface);color:var(--hil-ink);font:12px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline:none}.hil-textarea:focus{border-color:#a1a1aa;box-shadow:0 0 0 3px rgba(24,24,27,.06)}.hil-feedback{display:grid;gap:8px;margin-top:11px}.hil-feedback>div{padding:10px 11px;border:1px dashed var(--hil-border);border-radius:14px;background:var(--hil-muted);font-size:11px;line-height:1.5}.hil-feedback p,.hil-feedback ul{margin:5px 0}.hil-error{color:#dc2626;font-size:11px;margin-top:9px}.hil-summary{display:grid;gap:10px}.hil-summary-item{padding:12px 13px;border:1px solid #a7f3d0;border-radius:16px;background:var(--hil-surface);box-shadow:inset 3px 0 var(--hil-success);font-size:12px;line-height:1.5}.hil-loading{padding:24px;font-size:12px}
.hil-goal{font-size:13px;line-height:1.6;color:var(--hil-copy);padding:0;background:transparent;border:0;border-radius:0;margin:10px 0 18px}.hil-process{display:grid;background:var(--hil-surface);border:1px solid var(--hil-border);border-radius:16px;padding:0;overflow:hidden}.hil-substep{position:relative;width:100%;border:0;background:transparent;color:inherit;border-radius:0;padding:11px 14px;display:grid;grid-template-columns:20px 1fr;gap:8px;text-align:left;cursor:default}.hil-substep:first-child{padding-top:15px}.hil-substep:last-child{padding-bottom:15px}.hil-substep:not(:last-child):after{content:'';position:absolute;left:10px;right:10px;bottom:0;border-bottom:1px dashed var(--hil-border)}.hil-substep:hover,.hil-substep.open{background:var(--hil-muted)}.hil-substep-mark{box-sizing:border-box!important;inline-size:17px!important;block-size:17px!important;min-inline-size:17px!important;min-block-size:17px!important;max-inline-size:17px!important;max-block-size:17px!important;padding:0!important;border:1.5px solid #b8bbc2;border-radius:50%!important;display:block;color:transparent;margin-top:1px;overflow:hidden}.hil-substep.completed .hil-substep-mark{background:var(--hil-success);border-color:var(--hil-success)}.hil-substep.in_progress .hil-substep-mark{background:var(--hil-active);border-color:var(--hil-active);animation:hil-active-breathe 2.6s ease-in-out infinite}.hil-substep.paused .hil-substep-mark{background:var(--hil-paused);border-color:var(--hil-paused);animation:hil-pause-pulse 2.2s ease-in-out infinite}.hil-substep.paused .hil-substep-title,.hil-substep.paused .hil-substep-result{color:#b91c1c}.hil-substep-title{font-size:13px;font-weight:600;line-height:1.4}.hil-substep-result{font-size:11px;line-height:1.45;color:var(--hil-caption);margin-top:3px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;text-overflow:ellipsis;white-space:normal}.hil-substep:hover .hil-substep-result,.hil-substep.open .hil-substep-result{display:block;-webkit-line-clamp:unset;overflow:visible;text-overflow:clip}.hil-substep-instruction{grid-column:1/-1;margin:8px 0 2px 20px;font-size:12px;line-height:1.55;color:var(--hil-copy)}.hil-substep-editor{grid-column:1/-1;margin:8px 0 2px 21px;padding:0;border:0;background:transparent;border-radius:0}.hil-substep-editor .hil-buttons{margin-top:9px}.hil-more{margin-top:14px;border-top:1px dashed var(--hil-border);padding-top:10px}.hil-more summary{font-size:11px;color:var(--hil-copy);cursor:pointer;list-style:none}.hil-more summary:after{content:'  \u25BE';color:var(--hil-caption)}.hil-more[open] summary:after{content:'  \u25B4'}
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
  if (!response?.ok) throw new Error(response?.error?.message || "DSH connection failed.");
  return response.value;
}
function Outcome({ state, busy, onAccept }) {
  const decisions = state.outcome?.decisions ?? [];
  const effects = state.outcome?.effects ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hil-summary", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "hil-h2", children: "\u672C\u6B21\u4EFB\u52A1\u7684\u51B3\u7B56\u5F71\u54CD" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "hil-copy", children: "\u53EA\u8BB0\u5F55\u5F53\u524D\u4EFB\u52A1\u4E2D\u771F\u5B9E\u53D1\u751F\u7684\u51B3\u5B9A\u4E0E\u7ED3\u679C\u53D8\u5316\u3002" }),
    decisions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-label", children: "\u4F60\u7684\u51B3\u5B9A" }),
      decisions.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-summary-item", children: item.detail }, item.id))
    ] }),
    effects.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-label", children: "\u7ED3\u679C\u56E0\u6B64\u53D1\u751F\u7684\u53D8\u5316" }),
      effects.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hil-summary-item", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: item.before }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
        "\u2192 ",
        item.after
      ] }, `${item.decisionId}-${index}`))
    ] }),
    state.finalAcceptedAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-summary-item", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u6700\u7EC8\u6210\u679C\u5DF2\u9A8C\u6536" }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-btn primary", disabled: busy, onClick: onAccept, children: "\u786E\u8BA4\u9A8C\u6536\u6700\u7EC8\u6210\u679C" })
  ] });
}
function substepResultLabel(node, substep, visualStatus) {
  if (visualStatus === "paused") return "\u5DF2\u6682\u505C\uFF0C\u7B49\u5F85\u4F60\u4ECB\u5165";
  if (substep.result) {
    return String(substep.result).replace(/\s+/gu, " ").trim();
  }
  if (visualStatus === "in_progress") return "\u6B63\u5728\u8FDB\u884C";
  if (visualStatus === "completed") return "\u5DF2\u5B8C\u6210";
  if (visualStatus === "skipped") return "\u5DF2\u56E0\u4EFB\u52A1\u8303\u56F4\u53D8\u5316\u8DF3\u8FC7";
  return "\u5C1A\u672A\u5F00\u59CB";
}
function HumanLoopOverlay({ call }) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const [state, setState] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)("");
  const [draft, setDraft] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [nativeQuestionVisible, setNativeQuestionVisible] = (0, import_react.useState)(() => visibleQuestionCard());
  const [hoveredNodeId, setHoveredNodeId] = (0, import_react.useState)(null);
  const [pinnedNodeId, setPinnedNodeId] = (0, import_react.useState)(null);
  const [summaryOpen, setSummaryOpen] = (0, import_react.useState)(false);
  const [openSubstepId, setOpenSubstepId] = (0, import_react.useState)(null);
  const [substepDraft, setSubstepDraft] = (0, import_react.useState)("");
  const hoverTimer = (0, import_react.useRef)(null);
  const dragRef = (0, import_react.useRef)(null);
  const resizeRef = (0, import_react.useRef)(null);
  const launcherRef = (0, import_react.useRef)(null);
  const railRef = (0, import_react.useRef)(null);
  const drawerRef = (0, import_react.useRef)(null);
  const suppressClickRef = (0, import_react.useRef)(false);
  const nodeRefs = (0, import_react.useRef)(/* @__PURE__ */ new Map());
  const [drawerTop, setDrawerTop] = (0, import_react.useState)(18);
  const [launcherPosition, setLauncherPosition] = (0, import_react.useState)(() => readPosition(POSITION_KEYS.launcher));
  const [railPosition, setRailPosition] = (0, import_react.useState)(() => readPosition(POSITION_KEYS.rail));
  const [railHeight, setRailHeight] = (0, import_react.useState)(() => readHeight());
  const [dragging, setDragging] = (0, import_react.useState)(null);
  const [resizing, setResizing] = (0, import_react.useState)(false);
  const [viewport, setViewport] = (0, import_react.useState)(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [drawerHeight, setDrawerHeight] = (0, import_react.useState)(360);
  const selected = (0, import_react.useMemo)(() => state?.nodes.find((node) => node.id === state.selectedNodeId), [state]);
  const hovered = (0, import_react.useMemo)(() => state?.nodes.find((node) => node.id === hoveredNodeId), [state, hoveredNodeId]);
  const pinned = (0, import_react.useMemo)(() => state?.nodes.find((node) => node.id === pinnedNodeId), [state, pinnedNodeId]);
  const detailNode = hovered ?? pinned ?? selected;
  const suggestion = state?.suggestions.find((item) => item.nodeId === detailNode?.id && item.status === "open");
  const drawerOpen = Boolean(hovered || pinned || summaryOpen);
  (0, import_react.useEffect)(() => {
    let alive = true;
    const load = () => unwrap(call, "state").then((next) => {
      if (alive) setState(next);
    }).catch((err) => {
      if (alive) setError(err.message);
    });
    load();
    const timer = setInterval(load, 1200);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [call]);
  (0, import_react.useEffect)(() => {
    if (detailNode) setDraft(detailNode.instruction);
  }, [detailNode?.id]);
  (0, import_react.useEffect)(() => {
    const update = () => setNativeQuestionVisible(visibleQuestionCard());
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
    update();
    return () => observer.disconnect();
  }, []);
  (0, import_react.useEffect)(() => {
    setOpenSubstepId(null);
    setSubstepDraft("");
  }, [detailNode?.id]);
  (0, import_react.useEffect)(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setHoveredNodeId(null);
        setPinnedNodeId(null);
        setSummaryOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(hoverTimer.current);
    };
  }, []);
  (0, import_react.useEffect)(() => {
    const realign = () => alignDrawer(nodeRefs.current.get(hoveredNodeId || pinnedNodeId));
    window.addEventListener("resize", realign);
    return () => window.removeEventListener("resize", realign);
  }, [hoveredNodeId, pinnedNodeId]);
  (0, import_react.useLayoutEffect)(() => {
    if (!drawerOpen || window.innerWidth <= 650) return;
    const frame = requestAnimationFrame(() => {
      const anchor = nodeRefs.current.get(hoveredNodeId || pinnedNodeId);
      if (anchor) alignDrawer(anchor);
      else if (summaryOpen && railRef.current) setDrawerTop(Math.round(railRef.current.getBoundingClientRect().top));
    });
    return () => cancelAnimationFrame(frame);
  }, [drawerOpen, hoveredNodeId, pinnedNodeId, summaryOpen, railPosition?.x, railPosition?.y]);
  (0, import_react.useEffect)(() => {
    const clampSavedPositions = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      if (window.innerWidth <= 650) return;
      setLauncherPosition((position) => {
        const next = position ? clampPosition(position, launcherRef.current, 150, 40) : null;
        if (next) savePosition(POSITION_KEYS.launcher, next);
        return next;
      });
      setRailHeight((height) => {
        const next = height ? Math.min(Math.max(MIN_RAIL_HEIGHT, height), window.innerHeight - VIEWPORT_GAP * 2) : null;
        if (next) saveHeight(next);
        return next;
      });
      setRailPosition((position) => {
        const next = position ? clampPosition(position, railRef.current, 204, railHeight || Math.min(610, window.innerHeight - 130)) : null;
        if (next) savePosition(POSITION_KEYS.rail, next);
        return next;
      });
    };
    window.addEventListener("resize", clampSavedPositions);
    clampSavedPositions();
    return () => window.removeEventListener("resize", clampSavedPositions);
  }, [railHeight]);
  (0, import_react.useLayoutEffect)(() => {
    if (!drawerOpen || !drawerRef.current) return;
    setDrawerHeight(drawerRef.current.getBoundingClientRect().height);
  }, [drawerOpen, detailNode?.id, openSubstepId, summaryOpen]);
  (0, import_react.useLayoutEffect)(() => {
    const element = launcherRef.current;
    if (!element || !launcherPosition || window.innerWidth <= 650) return;
    const next = clampPosition(launcherPosition, element, 150, 40);
    if (next.x !== launcherPosition.x || next.y !== launcherPosition.y) {
      setLauncherPosition(next);
      savePosition(POSITION_KEYS.launcher, next);
    }
  }, [open, state?.revision, taskLifecycle(state).label]);
  (0, import_react.useEffect)(() => {
    const element = drawerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setDrawerHeight(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [drawerOpen]);
  (0, import_react.useEffect)(() => {
    const cancelDrag2 = () => {
      dragRef.current = null;
      resizeRef.current = null;
      setDragging(null);
      setResizing(false);
    };
    window.addEventListener("blur", cancelDrag2);
    return () => window.removeEventListener("blur", cancelDrag2);
  }, []);
  async function dispatch(action) {
    setBusy(true);
    setError("");
    try {
      const next = await unwrap(call, "dispatch", action);
      setState(next);
      return next;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function alignDrawer(element) {
    if (element) setDrawerTop(Math.round(element.getBoundingClientRect().top));
  }
  function startDrag(kind, event) {
    if (window.innerWidth <= 650 || !event.isPrimary || event.button !== 0 || event.target.closest?.("[data-no-drag]")) return;
    const element = kind === "launcher" ? launcherRef.current : railRef.current;
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
    if (!drag.moved) {
      drag.moved = true;
      setDragging(drag.kind);
    }
    event.preventDefault();
    const element = drag.kind === "launcher" ? launcherRef.current : railRef.current;
    const next = clampPosition({ x: drag.originX + dx, y: drag.originY + dy }, element, drag.kind === "launcher" ? 150 : 204, drag.kind === "launcher" ? 40 : 600);
    drag.current = next;
    if (drag.kind === "launcher") setLauncherPosition(next);
    else {
      setRailPosition(next);
      setHoveredNodeId(null);
    }
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
    if (resize.edge === "bottom") {
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
    if (resize.edge === "top") {
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
  function openFromLauncher(event) {
    if (event.detail === 0 || performance.now() >= suppressClickRef.current) setOpen(true);
  }
  function preview(nodeId, element) {
    clearTimeout(hoverTimer.current);
    if (nodeId === pinnedNodeId) {
      setHoveredNodeId(null);
      alignDrawer(element);
      return;
    }
    alignDrawer(element);
    setHoveredNodeId(nodeId);
  }
  function keepPreview() {
    clearTimeout(hoverTimer.current);
  }
  function leavePreview() {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoveredNodeId(null), 140);
  }
  function showSubstep(node, substep) {
    setOpenSubstepId(`${node.id}:${substep.id}`);
    setSubstepDraft(substep.instruction);
  }
  function hideSubstep(event) {
    if (event?.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    if (event?.type === "mouseleave" && event.currentTarget.contains(document.activeElement)) return;
    setOpenSubstepId(null);
    setSubstepDraft("");
  }
  async function reviseSubstep(node, substep) {
    const next = await dispatch({ type: "REVISE_SUBSTEP", nodeId: node.id, substepId: substep.id, instruction: substepDraft });
    if (next) setOpenSubstepId(null);
  }
  if (!state) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hil-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { className: "hil-launcher", onClick: () => setOpen(!open), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-state-dot" }),
      "\u6B63\u5728\u8FDE\u63A5"
    ] }),
    open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hil-rail hil-loading", children: [
      "\u6B63\u5728\u8FDE\u63A5 DSH \u63D2\u4EF6\u2026 ",
      error
    ] })
  ] });
  const lifecycle = taskLifecycle(state, nativeQuestionVisible);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `hil-root ${nativeQuestionVisible ? "native-question" : ""}`, children: [
    !open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { ref: launcherRef, style: draggableStyle(launcherPosition), className: `hil-launcher ${lifecycle.key} ${dragging === "launcher" ? "hil-dragging" : ""}`, "aria-label": `${lifecycle.label}\uFF0C\u62D6\u52A8\u53EF\u79FB\u52A8\uFF0C\u70B9\u51FB\u6253\u5F00\u4EFB\u52A1\u8DEF\u5F84`, onPointerDown: (event) => startDrag("launcher", event), onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: cancelDrag, onLostPointerCapture: cancelDrag, onClick: openFromLauncher, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-state-dot" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: lifecycle.label })
    ] }),
    open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { ref: railRef, style: railStyle(railPosition, railHeight), className: `hil-rail ${dragging === "rail" ? "hil-dragging" : ""} ${resizing ? "hil-resizing" : ""}`, "aria-label": "\u4EBA\u673A\u51B3\u7B56\u8DEF\u5F84", onClick: (event) => {
        if (event.target === event.currentTarget) {
          setPinnedNodeId(null);
          setSummaryOpen(false);
        }
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-resize-handle top", "data-no-drag": true, role: "separator", "aria-label": "\u8C03\u6574\u4FA7\u8FB9\u680F\u9876\u90E8", "aria-orientation": "horizontal", onPointerDown: (event) => startResize("top", event), onPointerMove: moveResize, onPointerUp: endResize, onPointerCancel: cancelResize, onLostPointerCapture: cancelResize }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "hil-rail-header", onPointerDown: (event) => startDrag("rail", event), onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: cancelDrag, onLostPointerCapture: cancelDrag, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-drag-handle", "aria-hidden": "true", title: "\u62D6\u52A8\u4FA7\u8FB9\u680F", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-drag-grip", children: "\u283F" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-close", "data-no-drag": true, "aria-label": "\u6536\u8D77\u8DEF\u5F84", onClick: () => {
            setOpen(false);
            setPinnedNodeId(null);
            setHoveredNodeId(null);
          }, children: "\xD7" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", { className: "hil-path", onScroll: () => alignDrawer(nodeRefs.current.get(hoveredNodeId || pinnedNodeId)), onMouseLeave: leavePreview, onClick: (event) => {
          if (event.target === event.currentTarget) {
            setPinnedNodeId(null);
            setSummaryOpen(false);
          }
        }, children: state.nodes.map((node) => {
          const inlineSubsteps = node.substeps ?? [];
          const showInlineProcess = INLINE_PROCESS_STATUSES.has(node.status) && inlineSubsteps.length > 0;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hil-node-group", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { ref: (element) => {
              if (element) nodeRefs.current.set(node.id, element);
              else nodeRefs.current.delete(node.id);
            }, className: `hil-node ${node.status} ${["in_progress", "awaiting_feedback"].includes(node.status) ? "running" : ""} ${node.id === pinnedNodeId ? "pinned" : ""}`, title: "\u60AC\u505C\u9884\u89C8\uFF0C\u70B9\u51FB\u56FA\u5B9A", onMouseEnter: (event) => preview(node.id, event.currentTarget), onFocus: (event) => preview(node.id, event.currentTarget), onBlur: leavePreview, onClick: (event) => {
              clearTimeout(hoverTimer.current);
              alignDrawer(event.currentTarget);
              setHoveredNodeId(null);
              setSummaryOpen(false);
              setPinnedNodeId(node.id);
            }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "hil-node-top", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-status" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "hil-node-title", children: [
                  node.order,
                  ". ",
                  node.title
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hil-node-meta", children: [
                STATUS_LABEL[node.status],
                " \xB7 ",
                nodeModeLabel(node)
              ] })
            ] }),
            showInlineProcess && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-inline-process", role: "list", "aria-label": `${node.title}\u7684\u5185\u90E8\u6D41\u7A0B`, children: inlineSubsteps.map((substep) => {
              const visualStatus = substepVisualStatus(node, substep);
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `hil-inline-step ${visualStatus}`, role: "listitem", "aria-current": visualStatus === "in_progress" || visualStatus === "paused" ? "step" : void 0, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-inline-step-dot" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-inline-step-title", children: substep.title })
              ] }, substep.id);
            }) })
          ] }, node.id);
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: "hil-rail-footer", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `hil-attention-state ${lifecycle.key}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-state-dot" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: lifecycle.label })
          ] }),
          state.pathSync && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-summary-link", disabled: busy, onClick: () => dispatch({ type: "REQUEST_PATH_SYNC" }), children: state.pathSync.status === "needs_plan" ? "\u8BA9 Agent \u8865\u5145\u8DEF\u5F84 \u2192" : "\u8BA9 Agent \u6838\u5BF9\u8DEF\u5F84 \u2192" }),
          state.outcome && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-summary-link", onClick: () => {
            setDrawerTop(76);
            setPinnedNodeId(null);
            setSummaryOpen(true);
          }, children: "\u67E5\u770B\u51B3\u7B56\u6548\u679C \u2192" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-resize-handle bottom", "data-no-drag": true, role: "separator", "aria-label": "\u8C03\u6574\u4FA7\u8FB9\u680F\u5E95\u90E8", "aria-orientation": "horizontal", onPointerDown: (event) => startResize("bottom", event), onPointerMove: moveResize, onPointerUp: endResize, onPointerCancel: cancelResize, onLostPointerCapture: cancelResize })
      ] }),
      drawerOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", { ref: drawerRef, className: "hil-drawer", style: drawerStyle(railPosition, drawerTop, viewport, drawerHeight), "aria-label": "\u8282\u70B9\u8BE6\u60C5", onMouseEnter: keepPreview, onMouseLeave: () => {
        if (hovered) leavePreview();
      }, children: [
        !hovered && summaryOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "hil-drawer-header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u4EFB\u52A1\u603B\u7ED3" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-close", "aria-label": "\u5173\u95ED\u8BE6\u60C5", onClick: () => {
            setPinnedNodeId(null);
            setSummaryOpen(false);
          }, children: "\xD7" })
        ] }),
        !hovered && !summaryOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-close hil-drawer-close", "aria-label": "\u5173\u95ED\u8BE6\u60C5", onClick: () => setPinnedNodeId(null), children: "\xD7" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", { className: "hil-detail", children: [
          !hovered && summaryOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outcome, { state, busy, onAccept: () => dispatch({ type: "ACCEPT_FINAL_RESULT" }) }) : !detailNode ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-card", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u7B49\u5F85 Agent \u53D1\u5E03\u8DEF\u5F84" }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-mode", children: STATUS_LABEL[detailNode.status] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "hil-h2", children: detailNode.title }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-goal", children: detailNode.objective }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-process", children: detailNode.substeps.map((substep) => {
              const visualStatus = substepVisualStatus(detailNode, substep);
              const key = `${detailNode.id}:${substep.id}`;
              const expanded = openSubstepId === key;
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `hil-substep ${visualStatus} ${expanded ? "open" : ""}`, tabIndex: 0, onMouseEnter: () => showSubstep(detailNode, substep), onMouseLeave: hideSubstep, onFocus: (event) => {
                if (event.target === event.currentTarget) showSubstep(detailNode, substep);
              }, onBlur: hideSubstep, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hil-substep-mark" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-substep-title", children: substep.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-substep-result", title: substep.result || void 0, children: substepResultLabel(detailNode, substep, visualStatus) })
                ] }),
                expanded && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hil-substep-editor", onClick: (event) => event.stopPropagation(), onKeyDown: (event) => event.stopPropagation(), children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { className: "hil-textarea", "aria-label": "\u4FEE\u6539\u8FD9\u4E00\u6B65\u7684\u505A\u6CD5", value: substepDraft, onChange: (event) => setSubstepDraft(event.target.value) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-rerun-button", type: "button", "aria-label": "\u4FDD\u5B58\u5E76\u4ECE\u8FD9\u91CC\u91CD\u505A", disabled: busy || !substepDraft.trim(), onClick: () => reviseSubstep(detailNode, substep), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 4v6h6" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5.5 15a8 8 0 1 0 1.7-8.4L4 10" })
                  ] }) })
                ] })
              ] }, substep.id);
            }) }),
            suggestion && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hil-card hil-suggest", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u5EFA\u8BAE\u4F60\u53C2\u4E0E\u8FD9\u4E00\u6B65" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "hil-list", children: suggestion.reasons.map((reason) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: reason.label }, reason.code)) }),
              hovered ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "hil-preview-hint", children: "\u70B9\u51FB\u8282\u70B9\u56FA\u5B9A\u540E\u53EF\u9009\u62E9\u53C2\u4E0E\u65B9\u5F0F" }) : state.runMode === "agent" && state.pendingDecision ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "hil-copy", children: "\u5F53\u524D Agent \u5DF2\u6253\u5F00\u539F\u751F\u51B3\u7B56\u5361\uFF0C\u56DE\u7B54\u540E\u4F1A\u539F\u5730\u7EE7\u7EED\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hil-buttons", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-btn", onClick: () => dispatch({ type: "ACCEPT_SUGGESTION", suggestionId: suggestion.id, mode: "agent" }), children: "AI\u5B8C\u6210" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-btn", onClick: () => dispatch({ type: "ACCEPT_SUGGESTION", suggestionId: suggestion.id, mode: "human_leads" }), children: "\u4E3B\u52A8\u4ECB\u5165" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-btn primary", onClick: () => dispatch({ type: "ACCEPT_SUGGESTION", suggestionId: suggestion.id, mode: suggestion.recallKind === "direction" ? "human_leads" : "agent_coaches", recallKind: suggestion.recallKind || "growth" }), children: suggestion.recallKind === "direction" ? "\u7ED3\u679C\u578B\u53EC\u56DE" : "\u6210\u957F\u578B\u53EC\u56DE" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "hil-more", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "\u66F4\u591A\u4FE1\u606F" }),
              !hovered && !suggestion && detailNode.status !== "completed" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-label", children: "\u8C01\u6765\u5B8C\u6210" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-buttons", children: Object.entries(MODE_LABEL).map(([mode, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: `hil-btn ${detailNode.mode === mode ? "primary" : ""}`, onClick: () => dispatch({ type: "CHANGE_MODE", nodeId: detailNode.id, mode }), children: label }, mode)) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-label", children: "\u9009\u62E9\u8FD9\u79CD\u65B9\u5F0F\u7684\u539F\u56E0" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "hil-copy", children: detailNode.rationale }),
              !!detailNode.evidence.length && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-label", children: "\u6750\u6599\u4E0E\u8BC1\u636E" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "hil-list", children: detailNode.evidence.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: item }, item)) })
              ] }),
              !hovered && detailNode.status !== "completed" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-label", children: "\u8C03\u6574\u6574\u4E2A\u5927\u6B65\u9AA4" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { className: "hil-textarea", value: draft, onChange: (event) => setDraft(event.target.value) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hil-btn", onClick: () => dispatch({ type: "EDIT_INSTRUCTION", nodeId: detailNode.id, instruction: draft }), children: "\u4FDD\u5B58\u6574\u4F53\u8981\u6C42" })
              ] })
            ] })
          ] }),
          error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hil-error", children: error })
        ] })
      ] })
    ] })
  ] });
}
function apply(ctx) {
  const style = document.createElement("style");
  style.dataset.plugin = "your-turn-dsh";
  style.textContent = styles;
  document.head.appendChild(style);
  ctx.effect(() => () => style.remove());
  ctx.effect(() => {
    const observer = new MutationObserver(relabelDecisionCardDelegateAction);
    observer.observe(document.body, { childList: true, subtree: true });
    relabelDecisionCardDelegateAction();
    return () => observer.disconnect();
  });
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "your-turn",
    order: 50,
    inject: () => ({ call: (endpoint, payload = {}) => {
      const sessionId = ctx.sessions.list.getSnapshot().current;
      return ctx.connection.rpc.call("/your-turn", endpoint, { ...payload, ...sessionId ? { sessionId } : {} });
    } })
  }, HumanLoopOverlay));
}

    return module.exports;
  }
});
