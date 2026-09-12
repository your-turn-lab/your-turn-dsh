import { scenario, nodeFixtures, makeArtifact } from './scenario.mjs';
import { evaluateCandidate, normalizeTaskProfile, preferenceFromAnswers, policyClock } from './policy.mjs';
export function createState() {
  return {
    phase: 'onboarding', revision: 0, version: 1, autoIndex: 0, playbackPaused: false, nodes: [], suggestions: [], runMode: 'agent', telemetry: { lastEvent: 'session-attached' },
    taskProfile: { taskSize: 'long', participationGoal: 'balanced' }, preferenceProfile: null,
    profileDraft: { answers: [1,1,1,1], retain: scenario.retained, delegate: scenario.delegated, identity: scenario.identity },
    onboardingIndex: 0, editingPreference: false, returnPhase: null,
    prompt: scenario.prompt, mainChoice: 0, interactionChoice: 0, relationChoice: 0, relationNote: '', mainNote: scenario.mainNote, interactionNote: scenario.interactionNote,
    decisionActors: { main: 'AI', interaction: 'AI', relation: 'AI' }, audienceVariant: 'general',
    pendingDecision: null, recallState: { recallCount: 0, lastRecallAt: null }, policyNow: policyClock.initial, recallDecisions: [], outcome: null,
    finalAcceptedAt: null, clientMessageVisible: false, clientMessageDismissed: false, selectedNodeId: null, artifacts: [], revisionInstruction: '', rerunIndex: 2,
    log: [], weights: [...scenario.learning.initial], learningStage: 'initial',
  };
}
function log(s, role, text) { s.log.push({ id: s.log.length+1, role, text }); }
function createNodes() {
  return nodeFixtures.map((n,i) => ({ ...n, order: i+1, status: 'pending', mode: 'agent', version: 1, instruction: n.objective,
    rationale: 'Dawn 固定情境演示；依据当前任务上下文分配判断。', evidence: ['本地演示素材，不代表真实检索记录'],
    substeps: n.steps.map((title,j) => ({ id: `${n.id}-${j+1}`, title, instruction: title, status: 'pending', result: '' })),
  }));
}
function nodeStatus(s,index,status) {
  const n=s.nodes[index]; n.status=status;
  n.substeps.forEach((step,j) => { step.status=status==='waiting_for_user' ? (j===0?'in_progress':'pending') : status; if(status==='completed') step.result ||= n.results[j]; });
}
function decision(s,index,key) {
  s.policyNow += policyClock.candidateInterval;
  const computed=evaluateCandidate(s,key);
  const d={ nodeId:s.nodes[index].id, ...computed, threshold:computed.budget.threshold };
  s.recallDecisions.push(d); s.nodes[index].lastRecallDecision=d;
  return d;
}
function recall(s,index) {
  s.recallState.lastRecallAt=s.policyNow; s.recallState.recallCount++;
  const d=s.nodes[index].lastRecallDecision;
  d.budget.recallCountBefore=d.budget.recallCount; d.budget.recallCount=s.recallState.recallCount;
  // Current product uses one invitation label; the reason belongs to the task context.
  s.pendingDecision={nodeId:s.nodes[index].id}; s.nodes[index].mode='Your Turn'; s.nodes[index].recallKind=null;
  nodeStatus(s,index,'waiting_for_user');
}
function finishMain(s,actor) {
  s.decisionActors.main=actor; s.pendingDecision=null; nodeStatus(s,1,'completed'); nodeStatus(s,2,'completed');
  const a=makeArtifact(s);
  s.nodes[1].substeps[0].result=`${a.main}。${s.mainNote}`;
  s.nodes[1].substeps[1].result=a.agenda.map(x=>`${x.title} ${x.minutes} 分钟`).join('；');
  s.nodes[2].substeps[0].result=a.caseTitle; s.nodes[2].substeps[1].result=a.caseSteps.join(' ');
  nodeStatus(s,3,'in_progress'); s.phase='candidate';
  log(s,actor==='Dawn'?'Dawn':'Your Turn',`${actor==='AI'?'根据已有要求安排：':''}${a.main}。${s.mainNote}`);
  log(s,'Your Turn','授课顺序和例子已安排好。接着看看，课件里这些工具的关系要不要一起拿主意。');
}
function finishRelation(s,actor) {
  s.decisionActors.relation=actor; s.pendingDecision=null; nodeStatus(s,3,'completed');
  s.nodes[3].substeps[0].result=actor==='Dawn'?'Dawn 参与了关系页的表达选择。':'按当前参与设置评估后，继续 Auto。';
  const a=makeArtifact(s);
  s.nodes[3].substeps[1].result=`${a.relationFormat}：${a.relation}`; s.phase='autoRelation';
  log(s,actor==='Dawn'?'Dawn':'Your Turn',`${actor==='AI'?'这一步继续自动完成':'关系页按这个方式讲'}：${s.nodes[3].substeps[1].result}`);
}
function finishInteraction(s,actor) {
  s.decisionActors.interaction=actor; s.pendingDecision=null; nodeStatus(s,4,'completed'); nodeStatus(s,5,'completed');
  const a=makeArtifact(s); s.artifacts.push(a);
  s.nodes[4].substeps[0].result=a.interaction; s.nodes[4].substeps[1].result=a.script;
  s.nodes[5].substeps[1].result=`合计 ${a.agenda.reduce((sum,x)=>sum+x.minutes,0)} 分钟；${a.main}。`;
  outcome(s); s.phase='complete';
  log(s,actor==='Dawn'?'Dawn':'Your Turn',`${actor==='AI'?'沿用适合 Dawn 的默认表达：':''}${a.interaction}。${s.interactionNote}`);
  log(s,'Your Turn',`备课方案准备好了。这一轮邀请你判断了 ${s.recallState.recallCount} 次。`);
}
function outcome(s) {
  const a=s.artifacts.at(-1);
  const decisions=[{id:'main',actor:s.decisionActors.main,detail:`${s.decisionActors.main} 确定授课顺序：${a.main}。${s.mainNote}`},{id:'interaction',actor:s.decisionActors.interaction,detail:`${s.decisionActors.interaction} 确定现场互动：${a.interaction}。${s.interactionNote}`}];
  const effects=[{decisionId:'main',before:'尚未确定授课组织方式',after:a.agenda.map(x=>`${x.title} ${x.minutes} 分钟`).join('；')},{decisionId:'interaction',before:'尚未确定现场说法',after:a.script}];
  if(s.decisionActors.relation==='Dawn'){decisions.push({id:'relation',actor:'Dawn',detail:`Dawn 确定关系页：${a.relationFormat}。${a.relation}`});effects.push({decisionId:'relation',before:'尚未确定如何解释工具关系',after:`${a.relationFormat}：${a.relation}`});}
  if(s.version>1) { decisions.push({id:'my-turn',actor:'Dawn',detail:`My Turn：${s.revisionInstruction}`}); effects.push({decisionId:'my-turn',before:s.artifacts[0].caseTitle,after:a.caseTitle}); }
  const humanDecisions=decisions.filter(d=>d.actor==='Dawn');
  const humanIds=new Set(humanDecisions.map(d=>d.id));
  s.outcome={decisions:humanDecisions,effects:effects.filter(e=>humanIds.has(e.decisionId))};
}
export function reduce(state,action) {
  if(action.type==='RESET') return createState();
  if(action.type==='START_DEMO') {
    if(state.phase!=='onboarding'||state.editingPreference||!state.prompt.trim())return state;
    const saved=reduce(state,{type:'SAVE_PROFILE'});
    if(saved.phase!=='controls')return state;
    return reduce(reduce(saved,{type:'CONFIRM_CONTROLS'}),{type:'SUBMIT_TASK',prompt:state.prompt});
  }
  if(action.type==='AUTO_TICK') {
    if(state.playbackPaused||!scenario.playbackMs[state.phase]||action.key!==playbackKey(state))return state;
    return reduce(state,{type:'NEXT'});
  }
  const s=structuredClone(state);
  switch(action.type) {
    case 'TASK_DRAFT': if(!['task','onboarding'].includes(s.phase))return state; s.prompt=action.prompt; break;
    case 'TOGGLE_PLAYBACK': s.playbackPaused=!s.playbackPaused; break;
    case 'ANSWER_DRAFT':
      if(s.phase==='main'){s.mainChoice=action.choice??s.mainChoice;s.mainNote=action.note??s.mainNote;}
      else if(s.phase==='interaction'){s.interactionChoice=action.choice??s.interactionChoice;s.interactionNote=action.note??s.interactionNote;}
      else if(s.phase==='relation'){s.relationChoice=action.choice??s.relationChoice;s.relationNote=action.note??s.relationNote;}
      else return state;
      break;
    case 'PROFILE_DRAFT': s.profileDraft={...s.profileDraft,...action.patch}; break;
    case 'ONBOARD_PAGE': s.onboardingIndex=Math.max(0,Math.min(4,action.index)); break;
    case 'SAVE_PROFILE': {
      const p={...s.profileDraft,...action}; delete p.type;
      if(!Array.isArray(p.answers)||p.answers.length!==4||p.answers.some(x=>!Number.isInteger(x)||x<0||x>2)) return state;
      s.profileDraft=p; s.preferenceProfile=preferenceFromAnswers(p.answers);
      s.phase=s.editingPreference?s.returnPhase:'controls'; s.editingPreference=false; break;
    }
    case 'START_PREFERENCE_ONBOARDING': if(s.editingPreference)return state; s.returnPhase=s.phase; s.editingPreference=true; s.phase='onboarding'; s.onboardingIndex=0; break;
    case 'CANCEL_PROFILE': if(!s.editingPreference)return state; s.phase=s.returnPhase; s.editingPreference=false; break;
    case 'UPDATE_TASK_PROFILE': s.taskProfile=normalizeTaskProfile({...s.taskProfile,...action.taskProfile}); break;
    case 'CONFIRM_CONTROLS': if(s.phase!=='controls')return state; s.phase='task'; break;
    case 'SUBMIT_TASK':
      if(s.phase!=='task'||!action.prompt?.trim())return state;
      s.prompt=action.prompt.trim(); s.nodes=createNodes(); s.phase='path'; s.telemetry.lastEvent='fixture-path';
      log(s,'Dawn',s.prompt); log(s,'Your Turn','任务路径已准备。你可以随时查看各节点；普通执行交给 AI，关键判断再回来。'); break;
    case 'ANSWER_MAIN':
      if(s.phase!=='main'||!scenario.mainOptions[action.choice])return state;
      s.mainChoice=action.choice; s.mainNote=action.note?.trim()||''; finishMain(s,'Dawn'); break;
    case 'ANSWER_RELATION':
      if(s.phase!=='relation'||![0,1].includes(action.choice))return state;
      s.relationChoice=action.choice; s.relationNote=action.note?.trim()||''; finishRelation(s,'Dawn'); break;
    case 'ANSWER_INTERACTION':
      if(s.phase!=='interaction'||!scenario.interactionOptions[action.choice])return state;
      s.interactionChoice=action.choice; s.interactionNote=action.note?.trim()||''; finishInteraction(s,'Dawn'); break;
    case 'ACCEPT_FINAL_RESULT': if(!['complete','updated','learning'].includes(s.phase))return state; s.finalAcceptedAt=`demo-revision-${s.version}`; break;
    case 'CLIENT_MESSAGE':
      if(s.phase!=='complete'||!s.finalAcceptedAt||s.clientMessageDismissed||s.clientMessageVisible)return state;
      if((action.version!==undefined&&action.version!==s.version)||(action.revision!==undefined&&action.revision!==s.revision))return state;
      s.clientMessageVisible=true; log(s,'客户',scenario.clientMessage); break;
    case 'DISMISS_CLIENT_MESSAGE': s.clientMessageVisible=false; s.clientMessageDismissed=true; break;
    case 'CLIENT_CHANGE': if(s.phase!=='complete'||!s.finalAcceptedAt)return state; s.phase='clientChange'; s.clientMessageVisible=false; s.nodes[2].substeps[0].instruction=scenario.revision; break;
    case 'ACCEPT_AND_CONTINUE':
      if(s.phase!=='complete')return state;
      return reduce(s,{type:'ACCEPT_FINAL_RESULT'});
    case 'EDIT_INSTRUCTION': {
      const n=s.nodes.find(n=>n.id===action.nodeId); if(!n||!action.instruction?.trim())return state;
      n.instruction=action.instruction.trim(); log(s,'Dawn',`已保存「${n.title}」补充要求：${n.instruction}`); break;
    }
    case 'REVISE_SUBSTEP': {
      if(s.phase!=='clientChange'||action.nodeId!=='case'||!action.instruction?.trim())return state;
      if(!s.nodes[2].substeps.some(x=>x.id===action.substepId))return state;
      s.revisionInstruction=action.instruction.trim(); s.audienceVariant='technology'; s.version++; s.finalAcceptedAt=null; s.outcome=null; s.phase='rerunning'; s.rerunIndex=2; s.selectedNodeId='case';
      s.nodes.slice(2).forEach((n,j)=>{n.version=s.version;n.mode='agent';n.recallKind=null;n.lastRecallDecision=null;n.evidence=['My Turn 新要求：'+s.revisionInstruction];n.substeps.forEach(x=>{x.result='';});nodeStatus(s,j+2,j===0?'in_progress':'pending');});
      s.nodes[2].substeps.find(x=>x.id===action.substepId).instruction=s.revisionInstruction;
      log(s,'Dawn',`My Turn · 从这堂课的例子继续：${s.revisionInstruction}`); log(s,'Your Turn','资料和授课顺序保留；换成科技部门的例子，更新相关课件、互动和备课方案。'); break;
    }
    case 'SHOW_LEARNING': if(!['complete','updated'].includes(s.phase))return state; s.phase='learning'; break;
    case 'LEARNING_PRESET': s.learningStage=action.stage; s.weights=[...scenario.learning[action.stage==='evolved'?'evolved':'initial']]; break;
    case 'LEARNING_WEIGHT': if(action.index<0||action.index>2||!Number.isFinite(action.value))return state; s.weights[action.index]=Math.min(100,Math.max(0,action.value));s.learningStage='custom';break;
    case 'NEXT':
      if(s.phase==='path'){
        s.phase='auto';s.autoIndex=0;
        s.nodes[0].status='in_progress';s.nodes[0].substeps[0].status='in_progress';
      }
      else if(s.phase==='auto'){
        const n=s.nodes[0],i=s.autoIndex;
        n.substeps[i].status='completed';n.substeps[i].result=n.results[i];s.autoIndex++;
        if(s.autoIndex===n.substeps.length){
          nodeStatus(s,0,'completed');log(s,'Your Turn','资料核对、素材整理、术语检查已完成。');
          if(decision(s,1,'main').action==='RECALL'){s.phase='main';recall(s,1);}else {s.phase='autoMain';nodeStatus(s,1,'in_progress');}
        }
        else n.substeps[s.autoIndex].status='in_progress';
      }
      else if(s.phase==='autoMain')finishMain(s,'AI');
      else if(s.phase==='candidate'){s.phase='assessed';decision(s,3,'relation');s.nodes[3].recallReason=s.nodes[3].lastRecallDecision.action==='AUTO'?scenario.policy.candidateReasons.join(' '):'按你的参与设置，这次解释工具关系也值得一起判断。';}
      else if(s.phase==='assessed'){
        if(s.nodes[3].lastRecallDecision.action==='RECALL'){s.phase='relation';recall(s,3);}else finishRelation(s,'AI');
      }
      else if(s.phase==='autoRelation'){
        if(decision(s,4,'interaction').action==='RECALL'){s.phase='interaction';recall(s,4);}else {s.phase='autoInteraction';nodeStatus(s,4,'in_progress');}
      }
      else if(s.phase==='autoInteraction')finishInteraction(s,'AI');
      else if(s.phase==='rerunning'){
        const a=makeArtifact(s),i=s.rerunIndex;
        s.nodes[i].results=i===2?[a.audience+' · '+a.caseTitle,a.caseSteps.join(' ')]:i===3?['沿用已确定主线，不新增召回。',`${a.relationFormat}：${a.relation}`]:i===4?[a.interaction,a.script]:['已汇总 V'+s.version+' 培训方案。','60 分钟；已采用科技部门预设，补充文字保留在修改要求中。'];
        nodeStatus(s,i,'completed');log(s,'Your Turn',`V${s.version} · ${s.nodes[i].title}已更新：${s.nodes[i].results[1]}`);
        if(i===5){s.artifacts.push(a);outcome(s);s.phase='updated';}else{s.rerunIndex++;nodeStatus(s,s.rerunIndex,'in_progress');}
      }else return state;
      break;
    default:return state;
  }
  s.revision++;return s;
}
export function playbackKey(s) { return `${s.phase}:${s.autoIndex}:${s.rerunIndex}`; }
export function learningDecision(weights,tags) {
  // Absolute weighted relevance: mechanical nodes stay low even when ownership grows.
  const score=weights.reduce((sum,w,i)=>sum+w/100*tags[i],0)/1.5;
  return score>=scenario.learning.threshold?'YOUR_TURN':'AUTO';
}
export function createStore() {
  let state=createState();const listeners=new Set();
  return {getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},dispatch:action=>{state=reduce(state,action);listeners.forEach(fn=>fn());return state;}};
}
