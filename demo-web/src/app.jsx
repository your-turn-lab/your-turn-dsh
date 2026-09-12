import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createStore, learningDecision, playbackKey } from './state.mjs';
import { scenario } from './scenario.mjs';
import { mountPlugin, openPath } from './plugin-adapter.jsx';
import './vendor/question-card.css';
import './styles.css';

const store = createStore();
const plugin = mountPlugin(store);
const OriginalPlugin = plugin.Component;
const act = (type, values = {}) => store.dispatch({ type, ...values });

function Button({ children, onClick, disabled, primary = false, ...rest }) {
  return <button className={`action ${primary ? 'primary' : ''}`} disabled={disabled} onClick={onClick} {...rest}>{children}</button>;
}
function Card({ eyebrow, title, children, footer, question = false, className = '' }) {
  return <section className={`Mbwy4a_card ${className}`} {...(question ? { 'data-question-key': title } : {})} aria-label={title}>
    <header className="Mbwy4a_header"><div className="Mbwy4a_headingBlock"><div className="Mbwy4a_eyebrow">{eyebrow}</div><h2 className="Mbwy4a_title">{title}</h2></div></header>
    <div className="Mbwy4a_body">{children}</div>
    {footer && <footer className="Mbwy4a_footer">{footer}</footer>}
  </section>;
}
function Options({ items, value, onChange }) {
  return <div className="Mbwy4a_options" role="group" aria-label="可选答案">{items.map(([label, description], index) =>
    <button key={label} type="button" className={`Mbwy4a_option ${value === index ? 'Mbwy4a_optionSelected' : ''}`} aria-pressed={value === index} onClick={() => onChange(index)}>
      <span className="Mbwy4a_number">{index + 1}</span><span className="Mbwy4a_optionCopy"><span className="Mbwy4a_optionLabel">{label}</span>{value === index && <span className="Mbwy4a_description">{description}</span>}</span>
    </button>)}</div>;
}
function Field({ label, value, onChange, rows = 2 }) {
  return <label className="field"><span>{label}</span><textarea rows={rows} value={value} onChange={e => onChange(e.target.value)} /></label>;
}
function PreferenceEditor({ s }) {
  const p = s.profileDraft;
  const patch = patch => act('PROFILE_DRAFT', { patch });
  return <div className="preference-editor">
    <div className="preference-grid">{scenario.questions.map((q, i) => <label key={q.header}><span>{q.header}</span><select aria-label={q.question} value={p.answers[i]} onChange={e => { const answers = [...p.answers]; answers[i] = Number(e.target.value); patch({ answers }); }}>{q.options.map(([label], j) => <option key={label} value={j}>{label}</option>)}</select></label>)}</div>
    <Field label="留给我的判断" value={p.retain} onChange={retain => patch({ retain })} />
    <Field label="交给 AI 的工作" value={p.delegate} onChange={delegate => patch({ delegate })} />
    <p className="muted">偏好会保存。本次演示仍使用 Dawn 的固定任务路径。</p>
  </div>;
}
function Onboarding({ s }) {
  if (s.editingPreference) return <Card eyebrow="Dawn" title="你的参与偏好" footer={<><Button onClick={() => act('CANCEL_PROFILE')}>取消</Button><Button primary onClick={() => act('SAVE_PROFILE')}>保存偏好</Button></>}><div className="card-content"><PreferenceEditor s={s} /></div></Card>;
  return <>
    <div className="intro-context"><span className="avatar">D</span><div><strong>Dawn</strong><span>毕业一年 · 企业培训讲师</span></div></div>
    <Card eyebrow="本次任务" title="为银行客户准备一场 AI 办公培训" className="intro-card" footer={<><span className="muted">普通工作自动推进，关键处等你判断</span><Button primary disabled={!s.prompt.trim()} onClick={() => act('START_DEMO')}>开始任务 <span aria-hidden="true">→</span></Button></>}>
      <div className="card-content">
        <div className="task-tags"><span>60 分钟</span><span>长任务</span><span>平衡模式</span></div>
        <blockquote className="dawn-quote">{scenario.opening}</blockquote>
        <div className="ownership"><div><span className="ownership-dot human" /><div><small>留给我</small><p>{s.profileDraft.retain}</p></div></div><div><span className="ownership-dot auto" /><div><small>交给 AI</small><p>{s.profileDraft.delegate}</p></div></div></div>
        <div className="intro-response"><span className="your-turn-mark">↗</span><p>{scenario.promise}</p></div>
        <div className="intro-edit"><details><summary>编辑偏好</summary><PreferenceEditor s={s} /></details><details><summary>查看任务要求</summary><Field label="任务要求" value={s.prompt} onChange={prompt => act('TASK_DRAFT', { prompt })} rows={4} /></details></div>
      </div>
    </Card>
  </>;
}
function Recall({ s, kind }) {
  const main = kind === 'main';
  const choice = main ? s.mainChoice : s.interactionChoice;
  const note = main ? s.mainNote : s.interactionNote;
  return <Card question eyebrow={`Your Turn ${main ? '①' : '②'} · ${main ? '培训主线' : '现场互动'}`} title={main ? '这 60 分钟，按什么逻辑讲？' : '哪种互动，你在现场说得自然？'} footer={<><span className="turn-note"><span className="ownership-dot human" />这一步，等你拿定方向</span><Button primary onClick={() => act(main ? 'ANSWER_MAIN' : 'ANSWER_INTERACTION', { choice, note })}>采用这个判断 →</Button></>}>
    <div className="Mbwy4a_detail"><p>{main ? '资料已准备好。你的主线选择，会决定后续案例和课件怎么组织。' : '客户需要轻松参与，你也需要说得自然。互动不必依靠说不出口的冷幽默。'}</p></div>
    <Options items={main ? scenario.mainOptions : scenario.interactionOptions} value={choice} onChange={choice => act('ANSWER_DRAFT', { choice })} />
    <div className="card-content compact"><Field label="补充你的判断" value={note} onChange={note => act('ANSWER_DRAFT', { note })} /></div>
  </Card>;
}
function PlaybackControls({ s }) {
  return <div className="playback-controls"><span className={`playback-dot ${s.playbackPaused ? 'paused' : ''}`} /><span>{s.playbackPaused ? '演示已暂停' : 'Auto · 自动推进中'}</span><button onClick={() => act('TOGGLE_PLAYBACK')}>{s.playbackPaused ? '继续演示' : '暂停演示'}</button></div>;
}
function locateCase() {
  openPath();
  requestAnimationFrame(() => {
    const button = [...document.querySelectorAll('.hil-node')].find(el => el.querySelector('.hil-node-title')?.textContent === '3. 贯穿案例');
    button?.click();
  });
}
function Execution({ s }) {
  const candidate = ['candidate', 'assessed', 'autoRelation'].includes(s.phase);
  const titles = { path: '任务路径已准备', auto: '先把资料整理好', candidate: '这一步，要请 Dawn 回来吗？', assessed: '评估后，继续 Auto', autoRelation: '关系页已完成，没有打扰 Dawn', clientChange: '参会对象变了，你来接手', rerunning: `正在更新「${s.nodes[s.rerunIndex]?.title}」` };
  return <Card eyebrow={candidate ? '课件关系呈现' : s.phase === 'clientChange' ? 'My Turn' : 'Your Turn'} title={titles[s.phase]} className="execution-card" footer={s.phase === 'clientChange' ? <><span className="muted">前两步保留，从案例开始更新</span><Button primary onClick={locateCase}>定位贯穿案例 →</Button></> : <PlaybackControls s={s} />}>
    <div className="card-content">
      {s.phase === 'path' && <><p>资料、主线、案例、课件、互动和最终输出，都会留在任务路径里。</p><div className="path-preview">{s.nodes.map(n => <span key={n.id}>{n.title}</span>)}</div><p className="muted">你可以随时从右侧节点查看进展或接手。</p></>}
      {s.phase === 'auto' && <><p>普通执行交给 AI，你暂时不用逐项确认。</p><ol className="work-list">{s.nodes[0].substeps.map(n => <li key={n.id} className={n.status}><span className="step-mark">{n.status === 'completed' ? '✓' : ''}</span><div><strong>{n.title}</strong>{n.status === 'completed' && <small>{n.result}</small>}{n.status === 'in_progress' && <small>正在进行</small>}</div></li>)}</ol></>}
      {candidate && <>
        <div className="evaluation-steps" aria-label="候选判断进度"><span className="done">候选出现</span><span className={s.phase !== 'candidate' ? 'done' : ''}>经过判断</span><span className={s.phase === 'autoRelation' ? 'done' : ''}>不打扰 · Auto</span></div>
        {s.phase === 'candidate' ? <p>文档、表格、知识库和团队归档怎样连接，会影响客户理解。先判断这次参与是否值得。</p> : <><ul className="reason-list">{scenario.policy.candidateReasons.map(x => <li key={x}>{x}</li>)}</ul><div className="quiet-result"><span>✓</span>沿用你的主线，召回次数不增加</div></>}
        {s.phase === 'autoRelation' && <p className="relation">文档 → 表格 → 知识库 → 团队归档</p>}
      </>}
      {s.phase === 'clientChange' && <><blockquote className="client-message"><small>客户的新消息</small>{scenario.clientMessage}</blockquote><p>打开「贯穿案例」，点击子步骤修改要求。</p><p className="muted">已准备好科技部门的修改草稿，你可以直接编辑。</p></>}
      {s.phase === 'rerunning' && <><p>沿用已确定的主线，只更新受影响的内容。</p><ol className="work-list revised-nodes">{s.nodes.map(n => <li key={n.id} className={n.status}><span className="step-mark">{n.status === 'completed' ? '✓' : ''}</span><strong>{n.title}</strong><small>{n.order < 3 ? '保留' : n.status === 'completed' ? '已更新' : n.status === 'in_progress' ? '更新中' : '待更新'}</small></li>)}</ol></>}
    </div>
  </Card>;
}
function downloadArtifact(a) {
  const text = `# Dawn · 60 分钟 AI 办公培训 · V${a.version}\n\n${a.boundaries}\n\n## 授课对象\n${a.audience}\n\n## 任务\n${a.prompt}\n\n## 培训主线\n${a.main}\n\n${a.agenda.map(x => `- ${x.minutes} 分钟：${x.title}`).join('\n')}\n\n## 贯穿案例\n${a.caseTitle}\n${a.caseSteps.join('\n')}\n\n## 关系呈现\n${a.relation}\n\n## 现场互动\n${a.interaction}\n${a.script}\n\n## 课件页序\n${a.slides.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n## Dawn 的判断与新要求\n${a.notes}\n${a.requirements}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `Dawn-training-v${a.version}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Artifact({ s }) {
  const [version, setVersion] = useState(s.artifacts.length);
  const a = s.artifacts[version - 1] || s.artifacts.at(-1);
  return <div className="artifact"><div className="artifact-top"><span>备课方案 · V{a.version}</span><Button onClick={() => downloadArtifact(a)}>下载备课方案 ↓</Button></div>
    {s.artifacts.length > 1 && <div className="actions"><Button onClick={() => setVersion(1)} aria-pressed={version === 1}>V1 · 首轮</Button><Button onClick={() => setVersion(s.artifacts.length)} aria-pressed={version === s.artifacts.length}>V{s.artifacts.length} · My Turn 后</Button></div>}
    <h3>{a.audience} · 60 分钟</h3><p>{a.main}</p>
    <div className="agenda">{a.agenda.map((x, i) => <div key={x.title}><span>{x.minutes}′</span><div><strong>{x.title}</strong><small>{i === 0 ? '轻量开场，建立工作语境' : i === 4 ? '回顾三层能力，自愿提问' : a.caseSteps[i - 1]}</small></div></div>)}</div>
    <h3>贯穿案例 · {a.caseTitle}</h3><p>{a.requirements}</p><p className="relation">{a.relation}</p><h3>现场互动 · {a.interaction}</h3><blockquote>{a.script}</blockquote>
    <details><summary>课件页序与补充要求</summary><ol>{a.slides.map(x => <li key={x}>{x}</li>)}</ol><p className="selectable">{a.notes}</p><p>{a.prompt}</p></details><p className="muted">{a.boundaries}</p>
  </div>;
}
function DecisionRecap({ s }) {
  const a = s.artifacts.at(-1);
  return <div className="decision-recap">
    <div className="impact-row"><span>01</span><div><small>你拿定主线</small><strong>{a.main}</strong><p>课程后半段进入团队协作与知识复用。</p></div></div>
    <div className="impact-row"><span>02</span><div><small>你选择表达</small><strong>{a.interaction}</strong><p>{s.interactionChoice === 0 ? '话术采用举手或默选，给客户留出参与空间。' : s.interactionChoice === 1 ? '先匿名收集问题，围绕共性痛点演示。' : '先同伴交流，再自愿分享。'}</p></div></div>
    {s.version > 1 && <div className="impact-row"><span>03</span><div><small>你主动接手</small><strong>{a.caseTitle}</strong><p>案例、课件关系、互动与最终方案同步更新。</p></div></div>}
    <div className="quiet-result"><span>✓</span>课件关系呈现：评估后继续 Auto，没有额外打扰你。</div>
  </div>;
}
function Learning({ s }) {
  return <div className="learning"><p>随着使用和反馈，Dawn 更重视的判断，可能更常留给她。以下是可调示意，尚非长期实测。</p>
    <div className="actions"><Button aria-pressed={s.learningStage === 'initial'} onClick={() => act('LEARNING_PRESET', { stage: 'initial' })}>首次使用</Button><Button aria-pressed={s.learningStage === 'evolved'} onClick={() => act('LEARNING_PRESET', { stage: 'evolved' })}>持续使用后（示意）</Button></div>
    {scenario.learning.labels.map((label, i) => <label className="weight" key={label}><span>{label}<b>{s.weights[i]}%</b></span><input aria-label={label} type="range" min="0" max="100" value={s.weights[i]} onChange={e => act('LEARNING_WEIGHT', { index: i, value: Number(e.target.value) })} /></label>)}
    <table><caption>未来节点 · 随权重变化</caption><thead><tr><th>判断节点</th><th>首次使用</th><th>当前权重</th></tr></thead><tbody>{scenario.learning.candidates.map(n => <tr key={n.title}><td>{n.title}</td><td>{learningDecision(scenario.learning.initial, n.tags) === 'AUTO' ? 'Auto' : 'Your Turn'}</td><td><span className={`route ${learningDecision(s.weights, n.tags) === 'AUTO' ? 'auto' : 'recall'}`}>{learningDecision(s.weights, n.tags) === 'AUTO' ? 'Auto' : 'Your Turn'}</span></td></tr>)}</tbody></table>
  </div>;
}
function Completion({ s }) {
  const updated = s.version > 1;
  return <Card eyebrow={updated ? '本次回顾' : '首轮任务完成'} title={updated ? '任务推进了，你的判断也留下来了。' : '方案准备好了，里面有你的判断。'} className="result-card" footer={<><span className="muted">{s.finalAcceptedAt ? '最终成果已验收' : '查看成果后，确认这一版'}</span>{updated ? <Button primary disabled={Boolean(s.finalAcceptedAt)} onClick={() => act('ACCEPT_FINAL_RESULT')}>{s.finalAcceptedAt ? '已验收 ✓' : '确认验收最终成果'}</Button> : <Button primary onClick={() => act('ACCEPT_AND_CONTINUE')}>确认成果，查看客户消息 →</Button>}</>}>
    <div className="card-content"><DecisionRecap s={s} /><details className="artifact-disclosure"><summary>查看培训方案 · 60 分钟{updated ? ' · V1 / V2 对比' : ''}</summary><Artifact key={s.version} s={s} /></details>
      {updated && <details className="learning-disclosure"><summary>继续使用，会有什么变化？<span>长期价值示意</span></summary><Learning s={s} /></details>}
    </div>
  </Card>;
}
const phaseLabels = { onboarding: 'Dawn 的这次任务', controls: '任务准备', task: '任务准备', path: '正在准备', auto: '资料核对', main: '培训主线', candidate: '候选出现', assessed: '评估完成', autoRelation: '继续 Auto', interaction: '现场互动', complete: '首轮成果', clientChange: 'My Turn', rerunning: '更新相关节点', updated: '任务回顾', learning: '长期变化示意' };
function currentStage(s) {
  if (['onboarding', 'controls', 'task'].includes(s.phase)) return 0;
  if (['clientChange', 'rerunning'].includes(s.phase)) return 2;
  return ['updated', 'learning'].includes(s.phase) ? 3 : 1;
}
function DemoProgress({ s }) {
  const current = currentStage(s);
  return <nav className="demo-progress" aria-label="演示进度"><ol>{['建档', '首轮任务', '客户变更', '结果回顾'].map((label, i) => <li key={label} className={i < current ? 'complete' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}><span>{i < current ? '✓' : `0${i + 1}`}</span>{label}</li>)}</ol></nav>;
}
function usePlayback(s, suspended) {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => { const onVisibility = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', onVisibility); return () => document.removeEventListener('visibilitychange', onVisibility); }, []);
  const key = playbackKey(s), delay = scenario.playbackMs[s.phase];
  useEffect(() => {
    if (!delay || s.playbackPaused || !visible || suspended) return;
    const timer = setTimeout(() => act('AUTO_TICK', { key }), delay);
    return () => clearTimeout(timer);
  }, [key, delay, s.playbackPaused, visible, suspended]);
}
function App() {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot), anchor = useRef(null);
  const localCall = useMemo(() => (endpoint, payload) => plugin.call(endpoint, payload), [s.revision]);
  const [resetKey, setResetKey] = useState(0), [showHistory, setShowHistory] = useState(false), [resetConfirm, setResetConfirm] = useState(false), [infoOpen, setInfoOpen] = useState(false);
  usePlayback(s, showHistory || resetConfirm || infoOpen);
  useEffect(() => {
    if (['onboarding', 'main', 'interaction', 'complete', 'clientChange', 'updated'].includes(s.phase)) anchor.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (s.phase === 'path' && window.innerWidth > 650) openPath();
    const frame = requestAnimationFrame(() => document.querySelector('.hil-node.waiting_for_user, .hil-node.running')?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [s.phase, s.rerunIndex]);
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') { setResetConfirm(false); setInfoOpen(false); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  function reset() { act('RESET'); setResetKey(k => k + 1); setResetConfirm(false); setShowHistory(false); }
  return <div className={`app phase-${s.phase}`}>
    <header className="topbar"><div className="brand"><span className="brand-symbol">↗</span><strong>Your Turn</strong><span className="brand-context">Dawn 的任务</span></div><div className="actions"><button className="demo-badge" onClick={() => setInfoOpen(true)}>情境演示 <span>ⓘ</span></button><button className="text-button" onClick={() => setResetConfirm(true)}>重新开始</button><a href={`https://github.com/your-turn-lab/your-turn-dsh/tree/${scenario.sourceBranch}`} target="_blank" rel="noreferrer">源码 ↗</a></div></header>
    <aside className="session-sidebar"><span className="sidebar-caption">任务</span><div className="session active-session">银行客户 AI 办公培训<small>60 分钟 · 平衡参与</small></div><div className="sidebar-bottom"><span className="avatar">D</span><span><strong>Dawn</strong><small>企业培训讲师</small></span>{s.preferenceProfile && <button aria-label="编辑 Dawn 的偏好" onClick={() => act('START_PREFERENCE_ONBOARDING')}>···</button>}</div></aside>
    <main className="workspace"><DemoProgress s={s} /><div className="conversation" ref={anchor}>
      {s.phase !== 'onboarding' && <div className="stage-label"><span className={`live-dot ${s.pendingDecision ? 'human' : ''}`} />{phaseLabels[s.phase]}{s.nodes.length > 0 && <button className="text-button" onClick={openPath}>任务路径 · {s.nodes.filter(n => n.status === 'completed').length}/6</button>}</div>}
      {s.phase === 'onboarding' ? <Onboarding s={s} /> : ['complete', 'updated', 'learning'].includes(s.phase) ? <Completion s={s} /> : ['main', 'interaction'].includes(s.phase) ? <Recall s={s} kind={s.phase} /> : <Execution s={s} />}
      <div className="conversation-footer"><span>固定情境演示 · 非实时 Agent</span>{s.log.length > 0 && <button onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>{showHistory ? '收起记录' : '回看过程'}</button>}</div>
      {showHistory && <div className="history">{s.log.map(m => <article key={m.id} className={`message ${m.role === 'Dawn' ? 'user' : ''}`}><strong>{m.role}</strong><p>{m.text}</p></article>)}<Button onClick={() => setShowHistory(false)}>收起记录</Button></div>}
    </div></main>
    <OriginalPlugin key={resetKey} call={localCall} />
    {resetConfirm && <div className="modal-scrim"><section className="dialog" role="dialog" aria-modal="true" aria-label="重新开始演示"><h2>从头重新开始？</h2><p>本次判断和成果会清空。</p><div className="actions"><Button onClick={() => setResetConfirm(false)}>继续当前任务</Button><Button primary onClick={reset}>确认重新开始</Button></div></section></div>}
    {infoOpen && <div className="modal-scrim"><section className="dialog" role="dialog" aria-modal="true" aria-label="演示说明"><h2>关于这次演示</h2><p>本地状态驱动的 Dawn 固定任务，不调用真实 Agent；召回节点不代表真实 Agent 每次都会作出相同选择。</p><p>长期权重变化仅作示意，尚非实测。完整实现见真实 DSH 插件源码。</p><Button primary onClick={() => setInfoOpen(false)}>知道了</Button></section></div>}
  </div>;
}
createRoot(document.getElementById('app')).render(<App />);
