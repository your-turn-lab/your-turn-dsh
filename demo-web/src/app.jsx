import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createStore, learningDecision, playbackKey } from './state.mjs';
import { scenario } from './scenario.mjs';
import { copy } from './copy.mjs';
import { artifactMarkdown } from './artifact-export.mjs';
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
function Icon({ kind }) {
  const paths = { settings: 'M4 7h16M4 17h16M8 4v6M16 14v6', history: 'M4 4v6h6M5 15a8 8 0 1 0 2-8M12 8v5l3 2' };
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]} /></svg>;
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
    <div className="preference-grid">{[0, 3].map(i => { const q = scenario.questions[i]; return <label key={q.header}><span>{i === 0 ? '什么时候问我' : '最多问几次'}</span><select aria-label={q.question} value={p.answers[i]} onChange={e => { const answers = [...p.answers]; answers[i] = Number(e.target.value); patch({ answers }); }}>{q.options.map(([label], j) => <option key={label} value={j}>{label}</option>)}</select></label>; })}</div>
  </div>;
}
function Onboarding({ s }) {
  if (s.editingPreference) return <Card eyebrow="Dawn" title="你的参与偏好" footer={<><Button onClick={() => act('CANCEL_PROFILE')}>取消</Button><Button primary onClick={() => act('SAVE_PROFILE')}>保存偏好</Button></>}><div className="card-content"><PreferenceEditor s={s} /></div></Card>;
  return <>
    <div className="dawn-profile"><img src={copy.portrait} alt="Dawn 的黑色简笔画：抱着电脑准备上台的年轻讲师" /><div><p className="profile-name">{copy.bio}</p><h1>{copy.headline}</h1><p>{copy.situation}</p></div></div>
    <Card eyebrow="Dawn 的这次任务" title={copy.task} className="intro-card" footer={<Button primary disabled={!s.prompt.trim()} onClick={() => act('START_DEMO')}>陪 Dawn 备课 <span aria-hidden="true">→</span></Button>}>
      <div className="card-content">
        <p className="intro-promise">{copy.promise}</p>
        <TaskControls s={s} />
      </div>
    </Card>
  </>;
}
function TaskControls({ s }) {
  return <div className="task-controls"><div className="hil-segment" role="group" aria-label="本次参与模式">{Object.entries(copy.modes).map(([value, [label, hint]]) => <button key={value} title={hint} className={`hil-segment-btn ${s.taskProfile.participationGoal === value ? 'active' : ''}`} aria-pressed={s.taskProfile.participationGoal === value} onClick={() => act('UPDATE_TASK_PROFILE', { taskProfile: { participationGoal: value } })}>{label}</button>)}</div></div>;
}
function Recall({ s, kind }) {
  const main = kind === 'main';
  const relation = kind === 'relation';
  const choice = main ? s.mainChoice : relation ? s.relationChoice : s.interactionChoice;
  const note = main ? s.mainNote : relation ? s.relationNote || '' : s.interactionNote;
  return <Card question eyebrow={`Your Turn · 第 ${s.recallState.recallCount} 次邀请`} title={main ? '这 60 分钟，按什么逻辑讲？' : relation ? '工具之间的关系，怎么讲更清楚？' : '哪种互动，你在现场说得自然？'} footer={<><span className="turn-note"><span className="ownership-dot human" />这一步，等你拿定方向</span><Button primary onClick={() => act(main ? 'ANSWER_MAIN' : relation ? 'ANSWER_RELATION' : 'ANSWER_INTERACTION', { choice, note })}>采用这个判断 →</Button></>}>
    <div className="Mbwy4a_detail"><span className="value-label">{main ? '留给你的练习' : relation ? '多练一步' : '适合你，也适合现场'}</span><p>{main ? copy.growth : relation ? '你希望多练习判断，这一页的讲法也交给你拿定。' : copy.expression}</p>{!main && !relation && <div className="ai-opening"><span>AI 起草的开场</span><q>{copy.aiOpening}</q></div>}</div>
    <Options items={main ? scenario.mainOptions : relation ? scenario.relationOptions : scenario.interactionOptions} value={choice} onChange={choice => act('ANSWER_DRAFT', { choice })} />
    <div className="card-content compact"><Field label="补充你的判断（保留为备注）" value={note} onChange={note => act('ANSWER_DRAFT', { note })} rows={1} /></div>
  </Card>;
}
function PlaybackControls({ s }) {
  return <div className="playback-controls"><span className={`playback-dot ${s.playbackPaused ? 'paused' : ''}`} /><span>{s.playbackPaused ? '演示已暂停' : 'Auto · 自动推进中'}</span><button onClick={() => act('TOGGLE_PLAYBACK')}>{s.playbackPaused ? '继续演示' : '暂停演示'}</button></div>;
}
function locateCase() {
  openPath();
  requestAnimationFrame(() => {
    const button = [...document.querySelectorAll('.hil-node')].find(el => el.querySelector('.hil-node-title')?.textContent?.startsWith('3. '));
    button?.click();
  });
}
function Execution({ s }) {
  const candidate = ['candidate', 'assessed', 'autoRelation'].includes(s.phase);
  const titles = { path: '任务路径已准备', auto: '先把资料整理好', autoMain: '按已有偏好，先把主线安排好', candidate: '这一步，要请 Dawn 回来吗？', assessed: s.recallDecisions.at(-1)?.action === 'RECALL' ? '这次值得你参与' : '评估后，继续 Auto', autoRelation: '工具关系已经串好了', autoInteraction: '沿用 Dawn 的习惯，准备轻松的开场', clientChange: '先别从头改，看看哪里受影响', rerunning: `正在更新「${s.nodes[s.rerunIndex]?.title}」` };
  return <Card eyebrow={candidate ? '把工具关系讲清楚' : s.phase === 'clientChange' ? '交付后的小插曲' : 'Your Turn'} title={titles[s.phase]} className="execution-card" footer={s.phase === 'clientChange' ? <><span className="muted">主线能用，换例子就从这里开始</span><Button primary onClick={locateCase}>找到「课堂用什么例子」 →</Button></> : <PlaybackControls s={s} />}>
    <div className="card-content">
      {s.phase === 'path' && <><p>资料、主线、案例、课件、互动和最终输出，都会留在任务路径里。</p><div className="path-preview">{s.nodes.map(n => <span key={n.id}>{n.title}</span>)}</div><p className="muted">你可以随时从右侧节点查看进展或接手。</p></>}
      {s.phase === 'auto' && <><p>普通执行交给 AI，你暂时不用逐项确认。</p><ol className="work-list">{s.nodes[0].substeps.map(n => <li key={n.id} className={n.status}><span className="step-mark">{n.status === 'completed' ? '✓' : ''}</span><div><strong>{n.title}</strong>{n.status === 'completed' && <small>{n.result}</small>}{n.status === 'in_progress' && <small>正在进行</small>}</div></li>)}</ol></>}
      {candidate && <>
        <div className="evaluation-steps" aria-label="候选判断进度"><span className="done">候选出现</span><span className={s.phase !== 'candidate' ? 'done' : ''}>经过判断</span><span className={s.phase === 'autoRelation' ? 'done' : ''}>{s.decisionActors.relation === 'Dawn' ? '交给你判断' : '不打扰 · Auto'}</span></div>
        {s.phase === 'candidate' ? <p>文档、表格、知识库怎样连起来，会影响听众理解。但这一次，值得把你叫回来吗？</p> : s.recallDecisions.findLast(d => d.nodeId === 'relation')?.action === 'RECALL' ? <p>你选择了多练习判断。结合当前偏好和参与额度，这一步也留给你试。</p> : <><ul className="reason-list">{scenario.policy.candidateReasons.map(x => <li key={x}>{x}</li>)}</ul><div className="quiet-result"><span>✓</span>沿用已定主线，召回次数不增加</div></>}
        {s.phase === 'autoRelation' && <p className="relation">文档 → 表格 → 知识库 → 团队归档</p>}
      </>}
      {s.phase === 'clientChange' && <><blockquote className="client-message"><small>客户 · 临时调整</small>{copy.message}</blockquote><p>{copy.review}</p><p className="muted">点开案例子步骤，检查修改要求，再从这里重做。</p></>}
      {s.phase === 'autoMain' && <p>根据 Dawn 已保存的偏好，先用个人办公 → 团队协作 → 知识复用组织。此处由 AI 代选，会在成果里标明。</p>}
      {s.phase === 'autoInteraction' && <><p>结合本次参与设置，沿用她不点名、低压力的表达习惯，用痛点投票开场。</p><div className="quiet-result"><span>✓</span>这一步由 AI 代选，没有新增邀请</div></>}
      {s.phase === 'rerunning' && <><p>沿用已确定的主线，只更新受影响的内容。</p><ol className="work-list revised-nodes">{s.nodes.map(n => <li key={n.id} className={n.status}><span className="step-mark">{n.status === 'completed' ? '✓' : ''}</span><strong>{n.title}</strong><small>{n.order < 3 ? '保留' : n.status === 'completed' ? '已更新' : n.status === 'in_progress' ? '更新中' : '待更新'}</small></li>)}</ol></>}
    </div>
  </Card>;
}
function downloadArtifact(a) {
  const text = artifactMarkdown(a);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `Dawn-training-v${a.version}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Artifact({ s }) {
  const [version, setVersion] = useState(s.artifacts.length);
  const a = s.artifacts[version - 1] || s.artifacts.at(-1);
  return <div className="artifact"><div className="artifact-top"><span>备课方案 · V{a.version}</span><Button onClick={() => downloadArtifact(a)}>下载备课方案 ↓</Button></div>
    {s.artifacts.length > 1 && <div className="actions"><Button onClick={() => setVersion(1)} aria-pressed={version === 1}>V1 · 首轮</Button><Button onClick={() => setVersion(s.artifacts.length)} aria-pressed={version === s.artifacts.length}>V{s.artifacts.length} · My Turn 后</Button></div>}
    <h3>{a.audience} · 60 分钟</h3><p>{a.main}</p>
    <div className="agenda">{a.agenda.map(x => <div key={x.title}><span>{x.minutes}′</span><div><strong>{x.title}</strong><small>{x.description}</small></div></div>)}</div>
    <h3>课堂里的例子 · {a.caseTitle}</h3><p>{a.requirements}</p><p className="relation">{a.relationFormat} · {a.relation}</p><h3>现场互动 · {a.interaction}</h3><blockquote>{a.script}</blockquote>
    {a.pendingRequirements?.length > 0 && <details className="pending-notes"><summary>你补充的备注 · 待人工应用</summary>{a.pendingRequirements.map((text, i) => <p key={i}>{text}</p>)}<p>此演示不会自动理解自由文字；这部分需要继续人工调整。</p></details>}
    <details><summary>课件页序与补充要求</summary><ol>{a.slides.map(x => <li key={x}>{x}</li>)}</ol><p className="selectable">{a.notes}</p><p>{a.prompt}</p></details><p className="muted">{a.boundaries}</p>
  </div>;
}
function DecisionRecap({ s }) {
  const a = s.artifacts.at(-1);
  return <div className="decision-recap">
    <div className="recall-summary"><strong>{s.recallState.recallCount} 次邀请</strong><span>{copy.modes[s.taskProfile.participationGoal]?.[0]} · 其余准备由 AI 推进</span></div>
    <div className="impact-row"><span>01</span><div><small>{a.actors.main === 'Dawn' ? '你练了一次讲课逻辑的判断' : 'AI 沿用偏好代选'}</small><strong>{a.main}</strong><p>{a.mainImpact}</p></div></div>
    <div className="impact-row"><span>02</span><div><small>{a.actors.interaction === 'Dawn' ? '你选择表达' : 'AI 沿用偏好代选'}</small><strong>{a.interaction}</strong><p>{a.interactionImpact}</p></div></div>
    {a.actors.relation === 'Dawn' && <div className="impact-row"><span>↗</span><div><small>你决定怎么呈现</small><strong>{a.relationFormat}</strong><p>课件页序按这个讲法展开。</p></div></div>}
    {s.version > 1 && <div className="impact-row"><span>03</span><div><small>你主动接手</small><strong>{a.caseTitle}</strong><p>案例、课件关系、互动与最终方案同步更新。</p></div></div>}
    {a.actors.relation !== 'Dawn' && <div className="quiet-result"><span>✓</span>工具关系页评估后自动完成，把注意力留给更值得的判断。</div>}
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
  return <><Card eyebrow={updated ? '修改后 · V2' : '备课方案已完成'} title={updated ? '换了例子，保留你的讲法。' : '方案准备好了，里面有你的判断。'} className="result-card" footer={<><span className="muted">{s.finalAcceptedAt ? '这一版已确认' : '打开方案，看一眼再确认'}</span><Button primary disabled={Boolean(s.finalAcceptedAt)} onClick={() => act('ACCEPT_FINAL_RESULT')}>{s.finalAcceptedAt ? '这一版已确认 ✓' : '这版可以去备课了'}</Button></>}>
    <div className="card-content"><DecisionRecap s={s} /><details className="artifact-disclosure"><summary>查看培训方案 · 60 分钟{updated ? ' · V1 / V2 对比' : ''}</summary><Artifact key={s.version} s={s} /></details>
      <details className="learning-disclosure"><summary>用久了，它会怎样更懂 Dawn？<span>长期变化示意</span></summary><Learning s={s} /></details>
    </div>
  </Card>{s.clientMessageVisible && !updated && <aside className="late-message" aria-label="客户临时消息" role="status"><div className="message-sender"><span className="message-dot" />客户发来一条消息<span>刚刚 · 情境改编</span></div><p>{copy.message}</p><p className="dawn-reaction">{copy.reaction}</p><div className="actions"><Button onClick={() => act('CLIENT_CHANGE')}>检查哪里要改</Button><button className="text-button" onClick={() => act('DISMISS_CLIENT_MESSAGE')}>先保留这一版</button></div></aside>}</>;
}
const phaseLabels = { onboarding: 'Dawn 的这次任务', controls: '任务准备', task: '任务准备', path: '正在准备', auto: '先核对资料', main: '这堂课怎么讲', autoMain: 'AI 代选主线', candidate: '候选出现', assessed: '评估完成', autoRelation: '继续 Auto', relation: '把工具关系讲清楚', interaction: '现场怎么互动', autoInteraction: 'AI 准备互动', complete: '备课完成', clientChange: '回看任务路径', rerunning: '更新相关节点', updated: '任务回顾', learning: '长期变化示意' };
function currentStage(s) {
  if (['onboarding', 'controls', 'task'].includes(s.phase)) return 0;
  return ['complete', 'clientChange', 'rerunning', 'updated', 'learning'].includes(s.phase) ? 2 : 1;
}
function DemoProgress({ s }) {
  const current = currentStage(s);
  return <nav className="demo-progress" aria-label="演示进度"><ol>{['认识 Dawn', '一起备课', '带走方案'].map((label, i) => <li key={label} className={i < current ? 'complete' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}><span>{i < current ? '✓' : `0${i + 1}`}</span>{label}</li>)}</ol></nav>;
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
  useEffect(() => {
    if (s.phase !== 'complete' || !s.finalAcceptedAt || s.clientMessageVisible || s.clientMessageDismissed || !visible || suspended || s.playbackPaused) return;
    const timer = setTimeout(() => act('CLIENT_MESSAGE'), 1800);
    return () => clearTimeout(timer);
  }, [s.phase, s.finalAcceptedAt, s.clientMessageVisible, s.clientMessageDismissed, visible, suspended, s.playbackPaused]);
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
    <header className="topbar"><div className="brand"><span className="brand-symbol">↗</span><strong>Your Turn</strong><span className="brand-context">Dawn 的任务</span></div><div className="actions"><button className="preference-trigger" aria-label="参与设置" title="参与设置" onClick={() => act('START_PREFERENCE_ONBOARDING')}><Icon kind="settings" /></button><button className="demo-badge" onClick={() => setInfoOpen(true)}>情境演示 <span>ⓘ</span></button><button className="text-button" onClick={() => setResetConfirm(true)}>重新开始</button><a href={`https://github.com/your-turn-lab/your-turn-dsh/tree/${scenario.sourceBranch}`} target="_blank" rel="noreferrer">源码 ↗</a></div></header>
    <aside className="session-sidebar"><span className="sidebar-caption">Dawn 的工作台</span><div className="session active-session">{copy.sidebar}<small>{s.artifacts.length ? '方案在这里，随时回来改' : '课要讲清楚，也要讲得自然'}</small></div><p className="sidebar-note">要亲自讲的课，<br />想保留自己的讲法。</p><div className="sidebar-bottom"><span className="avatar">D</span><span><strong>Dawn</strong><small>正在练习从容一点</small></span>{s.preferenceProfile && <button aria-label="编辑 Dawn 的偏好" onClick={() => act('START_PREFERENCE_ONBOARDING')} title="参与偏好"><Icon kind="settings" /></button>}</div></aside>
    <main className="workspace"><DemoProgress s={s} /><div className="conversation" ref={anchor}>
      {s.phase !== 'onboarding' && <div className="stage-label"><span className={`live-dot ${s.pendingDecision ? 'human' : ''}`} />{phaseLabels[s.phase]}{s.nodes.length > 0 && <button className="text-button" onClick={openPath}>任务路径 · {s.nodes.filter(n => n.status === 'completed').length}/6</button>}</div>}
      {s.nodes.length > 0 && !s.editingPreference && <details className="run-settings"><summary>{copy.modes[s.taskProfile.participationGoal]?.[0]} · 已邀请 {s.recallState.recallCount} 次</summary><TaskControls s={s} /><span className="muted">调整影响后面的判断；当前邀请和已完成的结果会保留。</span></details>}
      {s.phase === 'onboarding' ? <Onboarding s={s} /> : ['complete', 'updated', 'learning'].includes(s.phase) ? <Completion s={s} /> : ['main', 'relation', 'interaction'].includes(s.phase) ? <Recall s={s} kind={s.phase} /> : <Execution s={s} />}
      <div className="conversation-footer">{s.log.length > 0 && <button onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}><Icon kind="history" />{showHistory ? '收起记录' : '回看过程'}</button>}</div>
      {showHistory && <div className="history">{s.log.map(m => <article key={m.id} className={`message ${m.role === 'Dawn' ? 'user' : ''}`}><strong>{m.role}</strong><p>{m.text}</p></article>)}<Button onClick={() => setShowHistory(false)}>收起记录</Button></div>}
    </div></main>
    <OriginalPlugin key={resetKey} call={localCall} />
    {resetConfirm && <div className="modal-scrim"><section className="dialog" role="dialog" aria-modal="true" aria-label="重新开始演示"><h2>从头重新开始？</h2><p>本次判断和成果会清空。</p><div className="actions"><Button onClick={() => setResetConfirm(false)}>继续当前任务</Button><Button primary onClick={reset}>确认重新开始</Button></div></section></div>}
    {infoOpen && <div className="modal-scrim"><section className="dialog" role="dialog" aria-modal="true" aria-label="演示说明"><h2>关于这次演示</h2><p>人物与对话据访谈改编。选项会改变方案，模式和偏好会影响后续召回；策略函数复用真实插件，候选与材料由本地情境提供。</p><p>未连接实时 Agent；自由文字只作备注，长期变化仅作示意。真实 Agent 不保证每次选择相同节点。</p><Button primary onClick={() => setInfoOpen(false)}>知道了</Button></section></div>}
  </div>;
}
createRoot(document.getElementById('app')).render(<App />);
