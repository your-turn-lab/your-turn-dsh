import { apply } from './vendor/plugin-client.jsx';

// Invoke the untouched plugin's public registration interface against a local host.
// No session controller, WebSocket, DSH module loader, or runtime is imported.
export function mountPlugin(store) {
  let Component;
  const cleanups = [];
  const call = async (endpoint, action = {}) => {
    if (endpoint === 'state') return { ok: true, value: store.getSnapshot() };
    if (endpoint !== 'dispatch') return { ok: false, error: { message: '此演示只提供本地任务状态。' } };
    const s = store.getSnapshot();
    if (action.type === 'REVISE_SUBSTEP' && (s.phase !== 'clientChange' || action.nodeId !== 'case')) {
      return { ok: false, error: { message: '此固定情境在首轮验收、客户变更后，演示从「贯穿案例」进入 My Turn。其他节点可查看，尚未配置重做分支。' } };
    }
    return { ok: true, value: store.dispatch(action) };
  };
  apply({
    effect: fn => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); },
    slots: { inject: (_name, fn) => fn(), register: (_definition, component) => { Component = component; } },
  });
  return { Component, call, dispose: () => cleanups.reverse().forEach(fn => fn()) };
}

export function openPath() {
  // Use the plugin's own launcher behavior; do not fork its private component code.
  document.querySelector('.hil-launcher')?.click();
}
