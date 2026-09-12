import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createStore, learningDecision } from './state.mjs';
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
function Card({ eyebrow, title, children, footer, question = false }) {
  return <section className="Mbwy4a_card" {...(question ? { 'data-question-key': title } : {})} aria-label={title}>
    <header className="Mbwy4a_header"><div className="Mbwy4a_headingBlock"><div className="Mbwy4a_eyebrow">{eyebrow}</div><h2 className="Mbwy4a_title">{title}</h2></div></header>
    <div className="Mbwy4a_body">{children}</div>
    {footer && <footer className="Mbwy4a_footer">{footer}</footer>}
  </section>;
}
function Options({ items, value, onChange }) {
  return <div className="Mbwy4a_options" role="group" aria-label="可选答案">{items.map(([label,description],index) => <button key={label} type="button" className={`Mbwy4a_option ${value===index?'Mbwy4a_optionSelected':''}`} aria-pressed={value===index} onClick={()=>onChange(index)}><span className="Mbwy4a_number">{index+1}</span><span className="Mbwy4a_optionCopy"><span className="Mbwy4a_optionLine"><span className="Mbwy4a_optionLabel">{label}</span></span><span className="Mbwy4a_description">{description}</span></span></button>)}</div>;
}
function Field({ label, value, onChange, rows=2 }) {
  return <label className="field"><span>{label}</span><textarea rows={rows} value={value} onChange={e=>onChange(e.target.value)}/></label>;
}
function Onboarding({ s }) {
  const index=s.onboardingIndex, draft=s.profileDraft, q=scenario.questions[index];
  const patch=patch=>act('PROFILE_DRAFT',{patch});
  return <Card eyebrow={`Your Turn 偏好 · ${index+1} / 5`} title={q?.question || '哪些判断留给你，哪些工作交给 AI？'} footer={<><span className="muted">偏好保存在本次演示中</span><div className="actions">{s.editingPreference&&<Button onClick={()=>act('CANCEL_PROFILE')}>取消</Button>}{index>0&&<Button onClick={()=>act('ONBOARD_PAGE',{index:index-1})}>上一项</Button>}<Button primary onClick={()=>index<4?act('ONBOARD_PAGE',{index:index+1}):act('SAVE_PROFILE')}>{index<4?'下一项':'保存偏好'}</Button></div></>}>
    <div className="Mbwy4a_detail"><p>Dawn · {scenario.identity}</p></div>
    {q ? <Options items={q.options} value={draft.answers[index]} onChange={value=>{const answers=[...draft.answers];answers[index]=value;patch({answers});}}/> : <div className="card-content"><Field label="我的工作背景" value={draft.identity} onChange={identity=>patch({identity})}/><Field label="我想保留的判断" value={draft.retain} onChange={retain=>patch({retain})}/><Field label="尽量交给 Agent 的工作" value={draft.delegate} onChange={delegate=>patch({delegate})}/></div>}
  </Card>;
}
function Controls({ s }) {
  return <Card eyebrow="Task Controls" title="设置本次任务" footer={<><span className="muted">Dawn 场景：长任务 + 平衡模式</span><Button primary onClick={()=>act('CONFIRM_CONTROLS')}>按长任务 · 平衡模式继续</Button></>}><div className="card-content"><p>{s.preferenceProfile.summary}</p><div className="hil-card hil-profile hil-task-profile-controls">{[['taskSize',[['short','小任务'],['medium','中等任务'],['long','长任务']]],['participationGoal',[['fast_finish','快速完成'],['balanced','平衡模式'],['learning','练习判断']]]].map(([key,items])=><div key={key} className="hil-segment">{items.map(([value,label])=><button className={`hil-segment-btn ${s.taskProfile[key]===value?'active':''}`} key={value} aria-pressed={s.taskProfile[key]===value} onClick={()=>act('UPDATE_TASK_PROFILE',{taskProfile:{[key]:value}})}>{label}</button>)}</div>)}</div><p className="muted">控件可切换预览；本条代表性任务按「长任务 + 平衡模式」运行。更改个人偏好不会重写这条固定演示路径。</p><Button onClick={()=>act('START_PREFERENCE_ONBOARDING')}>编辑偏好</Button></div></Card>;
}
function Task({ s }) {
  const prompt=s.prompt, setPrompt=prompt=>act('TASK_DRAFT',{prompt});
  return <Card eyebrow="Dawn" title="准备银行客户的 AI 办公培训" footer={<><span className="muted">不需要 API key</span><Button primary disabled={!prompt.trim()} onClick={()=>act('SUBMIT_TASK',{prompt})}>提交任务并生成路径 ↑</Button></>}><div className="card-content"><Field rows={6} label="本次任务" value={prompt} onChange={setPrompt}/><p className="muted">本地情境演示。你可以补充任务备注；主体节点与示例素材围绕 Dawn 的这次培训固定配置。</p></div></Card>;
}
function Recall({ s, kind }) {
  const main=kind==='main', options=main?scenario.mainOptions:scenario.interactionOptions;
  const choice=main?s.mainChoice:s.interactionChoice, setChoice=choice=>act('ANSWER_DRAFT',{choice});
  const note=main?s.mainNote:s.interactionNote, setNote=note=>act('ANSWER_DRAFT',{note});
  return <Card question eyebrow={`需要你拿定方向 · Your Turn ${main?'①':'②'}`} title="请选择接下来采用的方向" footer={<><span className="muted">回答后原地继续</span><Button primary onClick={()=>act(main?'ANSWER_MAIN':'ANSWER_INTERACTION',{choice,note})}>确认并继续 →</Button></>}>
    <div className="Mbwy4a_detail"><h4>相关信息</h4><p>{main?'60 分钟；银行客户；你需要亲自讲授。资料已经整理，尚未决定课程的组织方式。':'主线与案例已经确定。你将亲自面对客户，互动既要适合现场，也要让你说得自然。'}</p><h4>为什么现在找你</h4><p>{main?'培训主线会影响后续案例、课件与时间安排，这个方向值得由你拿定。':'你最了解自己能自然说出的表达。把冷幽默写进稿子，未必适合你的现场呈现。'}</p><h4>需要你判断</h4><p>{main?'这 60 分钟培训按什么逻辑组织？':'什么互动方式既适合当前客户，也适合你本人表达？'}</p></div>
    <Options items={options} value={choice} onChange={setChoice}/><div className="card-content compact"><Field label="补充你的判断" value={note} onChange={setNote}/></div>
  </Card>;
}
function ProgressCard({ s }) {
  const items={
    path:['任务路径已生成','六个节点已出现在右侧任务路径。点击可固定节点详情，悬停可查看内部流程。','开始 Auto'],
    auto:['Auto · 可放心离开','资料核对、素材整理、术语检查已连续完成。普通执行不需要 Dawn 逐项确认。','继续到培训主线'],
    candidate:['高价值候选出现','文档、表格、知识库与团队归档之间的关系，可能影响培训理解。出现候选不代表立即召回。','查看评估'],
    assessed:['候选评估完成','这一步有价值，但现在不值得再打扰 Dawn。当前任务仍由 AI 推进。','继续 Auto，不召回 Dawn'],
    autoRelation:['AI 自动继续 · Skipped Your Turn','关系页已按既定主线生成。召回次数保持 1 次，没有出现需要 Dawn 作答的决策卡。','继续到现场互动'],
    clientChange:['My Turn · 你主动进入任务','客户变更了参会范围。打开右侧「3. 贯穿案例」，点击固定，在「确定授课对象与案例」上悬停或用 Tab 聚焦，修改做法并点击回转箭头。',null],
    rerunning:[`正在更新 · ${s.nodes[s.rerunIndex]?.title||''}`,'资料核对和培训主线保留。下游按依赖逐步更新，每次点击推进一个节点。',`完成「${s.nodes[s.rerunIndex]?.title||''}」并继续`],
  };
  const [title,copy,next]=items[s.phase];
  return <Card eyebrow={['candidate','assessed','autoRelation'].includes(s.phase)?'课件关系呈现':'Your Turn'} title={title} footer={<><Button onClick={openPath}>打开任务路径</Button>{next&&<Button primary onClick={()=>act('NEXT')}>{next} →</Button>}</>}><div className="card-content"><p>{copy}</p>
    {s.phase==='auto'&&<ol className="completed-list">{s.nodes[0].substeps.map(n=><li key={n.id}>✓ {n.title}<small>{n.result}</small></li>)}</ol>}
    {['candidate','assessed','autoRelation'].includes(s.phase)&&<><div className="evaluation-steps"><span className="done">候选出现</span><span className={s.phase!=='candidate'?'done':''}>经过判断</span><span className={s.phase==='autoRelation'?'done':''}>不打扰 · Auto</span></div>{s.phase!=='candidate'&&<><ul>{scenario.policy.candidateReasons.map(x=><li key={x}>{x}</li>)}</ul><div className="inline-result">Decision: AUTO · Recall Count: 1 / {scenario.policy.maxRecall}</div><details><summary>Recall Policy · 演示数值</summary><p>Recall Value {scenario.policy.relation.recallValue} / Threshold {scenario.policy.threshold}。这些是可替换的 fixture 数值，不代表最终算法或长期实测。</p></details></>}</>}
    {s.phase==='autoRelation'&&<p className="relation">文档 → 表格 → 知识库 → 团队归档</p>}
    {s.phase==='clientChange'&&<><blockquote>{scenario.clientMessage}</blockquote><details open><summary>可用于修改的 Dawn 新要求</summary><p className="selectable">{scenario.revision}</p><p className="muted">输入的新要求会进入 V2 成果；本演示预置科技部门案例，不会调用模型理解任意新任务。</p></details></>}
    {s.phase==='rerunning'&&<ul>{s.nodes.map(n=><li key={n.id}>{n.title} · {n.order<3?'保留 V1':`V${n.version} · ${n.status==='completed'?'已更新':n.status==='in_progress'?'进行中':'待更新'}`}</li>)}</ul>}
  </div></Card>;
}
function downloadArtifact(a) {
  const text=`# Dawn · 60 分钟 AI 办公培训 · V${a.version}\n\n${a.boundaries}\n\n## 授课对象\n${a.audience}\n\n## 任务\n${a.prompt}\n\n## 培训主线\n${a.main}\n\n${a.agenda.map(x=>`- ${x.minutes} 分钟：${x.title}`).join('\n')}\n\n## 贯穿案例\n${a.caseTitle}\n${a.caseSteps.join('\n')}\n\n## 关系呈现\n${a.relation}\n\n## 现场互动\n${a.interaction}\n${a.script}\n\n## 课件页序\n${a.slides.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\n## Dawn 的判断与新要求\n${a.notes}\n${a.requirements}\n`;
  const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`Dawn-training-v${a.version}.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Artifact({ s }) {
  const [version,setVersion]=useState(s.artifacts.length);
  const a=s.artifacts[version-1]||s.artifacts.at(-1);
  return <div className="artifact"><div className="artifact-top"><div><span className="eyebrow">最终输出 · V{a.version}</span><h2>60 分钟 AI 办公产品培训</h2></div><Button onClick={()=>downloadArtifact(a)}>下载备课方案 ↓</Button></div>
    {s.artifacts.length>1&&<div className="actions"><Button onClick={()=>setVersion(1)} aria-pressed={version===1}>V1 · 首轮</Button><Button onClick={()=>setVersion(s.artifacts.length)} aria-pressed={version===s.artifacts.length}>V{s.artifacts.length} · My Turn 后</Button></div>}
    <p><strong>{a.audience}</strong> · Dawn 亲自授课</p><h3>{a.main}</h3><div className="agenda">{a.agenda.map((x,i)=><div key={x.title}><span>{x.minutes}′</span><div><strong>{x.title}</strong><small>{i===0?'轻量开场，建立工作语境':i===4?'回顾三层能力，自愿提问':a.caseSteps[i-1]}</small></div></div>)}</div>
    <h3>贯穿案例 · {a.caseTitle}</h3><p>{a.requirements}</p><p className="relation">{a.relation}</p><h3>现场互动 · {a.interaction}</h3><blockquote>{a.script}</blockquote>
    <details><summary>查看课件页序与 Dawn 的判断</summary><ol>{a.slides.map(x=><li key={x}>{x}</li>)}</ol><p className="selectable">{a.notes}</p><p>{a.prompt}</p></details><p className="muted">{a.boundaries}</p>
  </div>;
}
function Completion({ s }) {
  const updated=s.phase==='updated';
  return <><Artifact key={s.version} s={s}/><div className="completion"><p>{s.finalAcceptedAt?'最终成果已验收':updated?'My Turn 后四个相关节点已更新。请查看新旧版本，再确认成果。':'首轮任务完成 · 两次 Your Turn 已改变主线与现场表达。'}</p><div className="actions">{!s.finalAcceptedAt&&<Button primary onClick={()=>act('ACCEPT_FINAL_RESULT')}>确认验收最终成果</Button>}{s.finalAcceptedAt&&!updated&&<Button primary onClick={()=>act('CLIENT_CHANGE')}>客户发来新消息 →</Button>}{updated&&s.finalAcceptedAt&&<Button primary onClick={()=>act('SHOW_LEARNING')}>查看长期变化示意 →</Button>}</div></div></>;
}
function Learning({ s, onReset }) {
  return <Card eyebrow="Your Turn 偏好 · 长期价值示意" title="哪些判断，逐渐更值得留给 Dawn？" footer={<><span className="muted">无长期实测数据；不改写本次历史</span><Button onClick={onReset}>从头重新开始</Button></>}><div className="card-content"><p>假设 Dawn 持续使用并提供反馈，她对专业判断、现场表达的重视程度可能变化。这里用可调权重演示未来分工，不表示系统已经完成长期学习。</p><div className="actions"><Button aria-pressed={s.learningStage==='initial'} onClick={()=>act('LEARNING_PRESET',{stage:'initial'})}>首次使用</Button><Button aria-pressed={s.learningStage==='evolved'} onClick={()=>act('LEARNING_PRESET',{stage:'evolved'})}>持续使用后（示意）</Button></div>
    {scenario.learning.labels.map((label,i)=><label className="weight" key={label}><span>{label}<b>{s.weights[i]}%</b></span><input aria-label={label} type="range" min="0" max="100" value={s.weights[i]} onChange={e=>act('LEARNING_WEIGHT',{index:i,value:Number(e.target.value)})}/></label>)}
    <table><caption>未来候选节点 · 随权重实时变化</caption><thead><tr><th>判断节点</th><th>首次使用</th><th>当前权重</th></tr></thead><tbody>{scenario.learning.candidates.map(n=><tr key={n.title}><td>{n.title}</td><td>{learningDecision(scenario.learning.initial,n.tags)==='AUTO'?'Auto':'Your Turn'}</td><td><span className={`route ${learningDecision(s.weights,n.tags)==='AUTO'?'auto':'recall'}`}>{learningDecision(s.weights,n.tags)==='AUTO'?'Auto':'Your Turn'}</span></td></tr>)}</tbody></table><details><summary>示意计算方法</summary><p>分数 = 各维度权重 × 节点相关度之和 ÷ 1.5。达到 {scenario.learning.threshold} 时显示 Your Turn。此简化公式仅说明权重如何影响分配，不是最终 Recall Policy。</p></details>
    </div></Card>;
}
const phaseLabels={onboarding:'用户建档',controls:'本次任务参数',task:'提交任务',path:'任务路径',auto:'Auto',main:'Your Turn ①',candidate:'候选出现',assessed:'候选评估',autoRelation:'继续 Auto',interaction:'Your Turn ②',complete:'首轮成果',clientChange:'My Turn',rerunning:'从节点继续',updated:'更新后的成果',learning:'长期变化示意'};
function App() {
  const s=useSyncExternalStore(store.subscribe,store.getSnapshot),anchor=useRef(null);
  // A fresh injected bridge triggers the original UI's load effect immediately.
  // Keep its private state and drawer intact instead of remounting or editing it.
  const localCall=useMemo(()=>(endpoint,payload)=>plugin.call(endpoint,payload),[s.revision]);
  const [resetKey,setResetKey]=useState(0),[showHistory,setShowHistory]=useState(false),[resetConfirm,setResetConfirm]=useState(false);
  useEffect(()=>{anchor.current?.scrollIntoView({block:'start',behavior:'instant'});if(s.phase==='path')openPath();},[s.phase]);
  function reset(){act('RESET');setResetKey(k=>k+1);setResetConfirm(false);setShowHistory(false);}
  return <div className={`app phase-${s.phase}`}>
    <header className="topbar"><div className="brand"><span className="brand-symbol">↗</span><strong>Your Turn</strong><span className="separator">/</span><span>Dawn 的培训任务</span></div><div className="actions"><span className="demo-badge">交互情境演示</span><button className="text-button" onClick={()=>setResetConfirm(true)}>重新开始</button><a href={`https://github.com/your-turn-lab/your-turn-dsh/tree/${scenario.sourceBranch}`} target="_blank" rel="noreferrer">真实插件源码 ↗</a></div></header>
    <aside className="session-sidebar"><div className="sidebar-title">Your Turn</div><div className="session active-session">银行客户 AI 办公培训<small>Dawn · 60 分钟</small></div><div className="sidebar-note">长任务<br/>平衡模式</div><div className="sidebar-bottom">D<span>Dawn<small>企业培训讲师</small></span></div></aside>
    <main className="workspace"><div className="disclosure">固定 Dawn 任务 · fixture / 本地状态 · 不调用真实 Agent。召回节点为演示配置，不承诺真实 Agent 每次作出相同选择。</div><div className="conversation"><div className="stage-label" ref={anchor}><span className="live-dot"/>{phaseLabels[s.phase]}{s.nodes.length>0&&<span className="recall-count">Your Turn {s.recallState.recallCount} 次 · My Turn {s.version-1} 次</span>}</div>
      {s.log.length>0&&<><button className="history-toggle" onClick={()=>setShowHistory(!showHistory)} aria-expanded={showHistory}>{showHistory?'收起':'查看'}对话记录 · {s.log.length} 条</button>{showHistory&&<div className="history">{s.log.map(m=><article key={m.id} className={`message ${m.role==='Dawn'?'user':''}`}><strong>{m.role}</strong><p>{m.text}</p></article>)}</div>}</>}
      {s.phase==='onboarding'?<Onboarding s={s}/>:s.phase==='controls'?<Controls s={s}/>:s.phase==='task'?<Task s={s}/>:s.phase==='main'||s.phase==='interaction'?<Recall key={s.phase} s={s} kind={s.phase}/>:s.phase==='complete'||s.phase==='updated'?<Completion s={s}/>:s.phase==='learning'?<Learning s={s} onReset={reset}/>:<ProgressCard s={s}/>}
      <div className="bottom-caption">Your Turn · 人机决策与注意力层</div>
    </div></main>
    <OriginalPlugin key={resetKey} call={localCall}/>
    {resetConfirm&&<div className="modal-scrim"><section className="reset-dialog" role="dialog" aria-modal="true" aria-label="重新开始演示"><h2>从头重新开始？</h2><p>本次输入、决策和成果会清空，回到 Dawn 用户建档。</p><div className="actions"><Button onClick={()=>setResetConfirm(false)}>继续当前任务</Button><Button primary onClick={reset}>确认重新开始</Button></div></section></div>}
  </div>;
}
createRoot(document.getElementById('app')).render(<App/>);
