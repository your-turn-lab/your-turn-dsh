import { scenario, nodeFixtures, makeArtifact } from './scenario.mjs';
export function createState() {
  return {
    phase: 'onboarding', revision: 0, version: 1, nodes: [], suggestions: [], runMode: 'agent', telemetry: { lastEvent: 'session-attached' },
    taskProfile: { taskSize: 'long', participationGoal: 'balanced' }, preferenceProfile: null,
    profileDraft: { answers: [1,1,1,1], retain: scenario.retained, delegate: scenario.delegated, identity: scenario.identity },
    onboardingIndex: 0, editingPreference: false, returnPhase: null,
    prompt: scenario.prompt, mainChoice: 0, interactionChoice: 0, mainNote: scenario.mainNote, interactionNote: scenario.interactionNote,
    pendingDecision: null, recallState: { recallCount: 0 }, recallDecisions: [], outcome: null,
    finalAcceptedAt: null, selectedNodeId: null, artifacts: [], revisionInstruction: '', rerunIndex: 2,
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
function decision(s,index,key,action) {
  const d={ nodeId:s.nodes[index].id, ...scenario.policy[key], threshold:scenario.policy.threshold, action,
    reason:action==='AUTO'?'recall_value_below_threshold':'recall_value_passed',
    budget:{ ...s.taskProfile, threshold:scenario.policy.threshold, recallCount:s.recallState.recallCount, maxRecall:scenario.policy.maxRecall } };
  s.recallDecisions.push(d); s.nodes[index].lastRecallDecision=d;
}
function recall(s,index,key) {
  s.recallState.recallCount++; s.pendingDecision={nodeId:s.nodes[index].id}; s.nodes[index].mode='human_leads'; s.nodes[index].recallKind='direction';
  nodeStatus(s,index,'waiting_for_user'); decision(s,index,key,'YOUR_TURN');
}
function outcome(s) {
  const decisions=[{id:'main',detail:`培训主线：${scenario.mainOptions[s.mainChoice][0]}。${s.mainNote}`},{id:'interaction',detail:`现场互动：${scenario.interactionOptions[s.interactionChoice][0]}。${s.interactionNote}`}];
  const effects=[{decisionId:'main',before:'仅围绕个人提效介绍工具',after:'后半段进入团队协作与知识复用'},{decisionId:'interaction',before:'尚未确定开场表达',after:scenario.interactionOptions[s.interactionChoice][0]}];
  if(s.version>1) { decisions.push({id:'my-turn',detail:`My Turn：${s.revisionInstruction}`}); effects.push({decisionId:'my-turn',before:'银行跨部门通用办公案例',after:s.artifacts.at(-1).caseTitle}); }
  s.outcome={decisions,effects};
}
export function reduce(state,action) {
  if(action.type==='RESET') return createState();
  const s=structuredClone(state);
  switch(action.type) {
    case 'TASK_DRAFT': if(s.phase!=='task')return state; s.prompt=action.prompt; break;
    case 'ANSWER_DRAFT':
      if(s.phase==='main'){s.mainChoice=action.choice??s.mainChoice;s.mainNote=action.note??s.mainNote;}
      else if(s.phase==='interaction'){s.interactionChoice=action.choice??s.interactionChoice;s.interactionNote=action.note??s.interactionNote;}
      else return state;
      break;
    case 'PROFILE_DRAFT': s.profileDraft={...s.profileDraft,...action.patch}; break;
    case 'ONBOARD_PAGE': s.onboardingIndex=Math.max(0,Math.min(4,action.index)); break;
    case 'SAVE_PROFILE': {
      const p={...s.profileDraft,...action}; delete p.type;
      if(!Array.isArray(p.answers)||p.answers.length!==4||p.answers.some(x=>!Number.isInteger(x)||x<0||x>2)) return state;
      s.profileDraft=p; s.preferenceProfile={version:1,answers:p.answers,summary:`${scenario.questions[0].options[p.answers[0]][0]} · 保留：${p.retain||scenario.retained} · 交给 AI：${p.delegate||scenario.delegated}`,profile:{preset:'demo'}};
      s.phase=s.editingPreference?s.returnPhase:'controls'; s.editingPreference=false; break;
    }
    case 'START_PREFERENCE_ONBOARDING': s.returnPhase=s.phase; s.editingPreference=true; s.phase='onboarding'; s.onboardingIndex=0; break;
    case 'CANCEL_PROFILE': if(!s.editingPreference)return state; s.phase=s.returnPhase; s.editingPreference=false; break;
    case 'UPDATE_TASK_PROFILE': if(!['controls','task','path'].includes(s.phase))return state; s.taskProfile={...s.taskProfile,...action.taskProfile}; break;
    case 'CONFIRM_CONTROLS': if(s.phase!=='controls')return state; s.taskProfile={taskSize:'long',participationGoal:'balanced'}; s.phase='task'; break;
    case 'SUBMIT_TASK':
      if(s.phase!=='task'||!action.prompt?.trim())return state;
      s.prompt=action.prompt.trim(); s.nodes=createNodes(); s.phase='path'; s.telemetry.lastEvent='fixture-path';
      log(s,'Dawn',s.prompt); log(s,'Your Turn','任务路径已准备。你可以随时查看各节点；普通执行交给 AI，关键判断再回来。'); break;
    case 'ANSWER_MAIN':
      if(s.phase!=='main'||!scenario.mainOptions[action.choice])return state;
      s.mainChoice=action.choice; s.mainNote=action.note?.trim()||''; s.pendingDecision=null; nodeStatus(s,1,'completed');
      s.nodes[1].substeps[0].result=`${scenario.mainOptions[s.mainChoice][0]}。${s.mainNote}`;
      nodeStatus(s,2,'completed'); nodeStatus(s,3,'in_progress'); s.phase='candidate';
      log(s,'Dawn',`培训主线：${scenario.mainOptions[s.mainChoice][0]}。${s.mainNote}`);
      log(s,'Your Turn','已据此安排后半段的团队协作与知识复用，并串联贯穿案例。课件关系呈现出现一个高价值候选，先评估是否值得打扰。'); break;
    case 'ANSWER_INTERACTION':
      if(s.phase!=='interaction'||!scenario.interactionOptions[action.choice])return state;
      s.interactionChoice=action.choice; s.interactionNote=action.note?.trim()||''; s.pendingDecision=null;
      nodeStatus(s,4,'completed'); nodeStatus(s,5,'completed'); s.nodes[4].substeps[0].result=scenario.interactionOptions[s.interactionChoice][0];
      s.artifacts.push(makeArtifact(s)); s.nodes[4].substeps[1].result=s.artifacts[0].script; outcome(s); s.phase='complete';
      log(s,'Dawn',`${scenario.interactionOptions[s.interactionChoice][0]}。${s.interactionNote}`); log(s,'Your Turn','首轮任务完成。培训方案已包含你的两次判断，请验收最终成果。'); break;
    case 'ACCEPT_FINAL_RESULT': if(!['complete','updated','learning'].includes(s.phase))return state; s.finalAcceptedAt=`demo-revision-${s.version}`; break;
    case 'CLIENT_CHANGE': if(s.phase!=='complete'||!s.finalAcceptedAt)return state; s.phase='clientChange'; log(s,'客户',scenario.clientMessage); break;
    case 'EDIT_INSTRUCTION': {
      const n=s.nodes.find(n=>n.id===action.nodeId); if(!n||!action.instruction?.trim())return state;
      n.instruction=action.instruction.trim(); log(s,'Dawn',`已保存「${n.title}」补充要求：${n.instruction}`); break;
    }
    case 'REVISE_SUBSTEP': {
      if(s.phase!=='clientChange'||action.nodeId!=='case'||!action.instruction?.trim())return state;
      if(!s.nodes[2].substeps.some(x=>x.id===action.substepId))return state;
      s.revisionInstruction=action.instruction.trim(); s.version++; s.finalAcceptedAt=null; s.outcome=null; s.phase='rerunning'; s.rerunIndex=2; s.selectedNodeId='case';
      s.nodes.slice(2).forEach((n,j)=>{n.version=s.version;n.mode='agent';n.recallKind=null;n.lastRecallDecision=null;n.evidence=['My Turn 新要求：'+s.revisionInstruction];n.substeps.forEach(x=>{x.result='';});nodeStatus(s,j+2,j===0?'in_progress':'pending');});
      s.nodes[2].substeps.find(x=>x.id===action.substepId).instruction=s.revisionInstruction;
      log(s,'Dawn',`My Turn · 从贯穿案例继续：${s.revisionInstruction}`); log(s,'Your Turn','保留资料核对和培训主线；重新生成贯穿案例，并更新课件关系、现场互动和最终输出。'); break;
    }
    case 'SHOW_LEARNING': if(s.phase!=='updated')return state; s.phase='learning'; break;
    case 'LEARNING_PRESET': s.learningStage=action.stage; s.weights=[...scenario.learning[action.stage==='evolved'?'evolved':'initial']]; break;
    case 'LEARNING_WEIGHT': if(action.index<0||action.index>2||!Number.isFinite(action.value))return state; s.weights[action.index]=Math.min(100,Math.max(0,action.value));s.learningStage='custom';break;
    case 'NEXT':
      if(s.phase==='path'){s.taskProfile={taskSize:'long',participationGoal:'balanced'};s.phase='auto';nodeStatus(s,0,'completed');log(s,'Your Turn','Auto · 资料核对、素材整理、术语检查已连续完成（演示素材）。');}
      else if(s.phase==='auto'){s.phase='main';recall(s,1,'main');}
      else if(s.phase==='candidate'){s.phase='assessed';decision(s,3,'relation','AUTO');s.nodes[3].recallReason=scenario.policy.candidateReasons.join(' ');}
      else if(s.phase==='assessed'){s.phase='autoRelation';nodeStatus(s,3,'completed');log(s,'Your Turn','课件关系呈现评估完成：Skipped Your Turn。已有上下文充分、可逆，把参与机会留给现场互动。');}
      else if(s.phase==='autoRelation'){s.phase='interaction';recall(s,4,'interaction');}
      else if(s.phase==='rerunning'){
        const a=makeArtifact(s),i=s.rerunIndex;
        s.nodes[i].results=i===2?[a.audience+' · '+a.caseTitle,a.caseSteps.join(' ')]:i===3?['沿用已确定主线，不新增召回。',a.relation]:i===4?[a.interaction,a.script]:['已汇总 V'+s.version+' 培训方案。','60 分钟；新授课对象和 My Turn 要求已写入。'];
        nodeStatus(s,i,'completed');log(s,'Your Turn',`V${s.version} · ${s.nodes[i].title}已更新：${s.nodes[i].results[1]}`);
        if(i===5){s.artifacts.push(a);outcome(s);s.phase='updated';}else{s.rerunIndex++;nodeStatus(s,s.rerunIndex,'in_progress');}
      }else return state;
      break;
    default:return state;
  }
  s.revision++;return s;
}
export function learningDecision(weights,tags) {
  // Absolute weighted relevance: mechanical nodes stay low even when ownership grows.
  const score=weights.reduce((sum,w,i)=>sum+w/100*tags[i],0)/1.5;
  return score>=scenario.learning.threshold?'YOUR_TURN':'AUTO';
}
export function createStore() {
  let state=createState();const listeners=new Set();
  return {getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},dispatch:action=>{state=reduce(state,action);listeners.forEach(fn=>fn());return state;}};
}
