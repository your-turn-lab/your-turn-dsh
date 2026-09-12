import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createState, reduce } from '../src/state.mjs';
import { candidates, evaluateCandidate, preferenceFromAnswers } from '../src/policy.mjs';
import { decideRecall } from '../src/vendor/recall/recallPolicy.js';

const send=(s,type,values={})=>reduce(s,{type,...values});
function start(goal='balanced',answers=[1,1,1,1],size='long') {
  let s=send(send(createState(),'INSTALL_PLUGIN'),'NEXT');
  s=send(s,'UPDATE_TASK_PROFILE',{taskProfile:{participationGoal:goal,taskSize:size}});
  s=send(s,'PROFILE_DRAFT',{patch:{answers}});
  return send(s,'START_DEMO');
}
function finish(s) {
  for(let i=0;i<25&&s.phase!=='complete';i++) {
    if(['main','interaction','relation'].includes(s.phase))s=send(s,`ANSWER_${s.phase.toUpperCase()}`,{choice:0,note:'测试确认'});
    else s=send(s,'NEXT');
  }
  assert.equal(s.phase,'complete','every tested policy route must produce an artifact');
  return s;
}

test('real policy produces different interruptions for three modes, with the same candidates',()=>{
  const fast=finish(start('fast_finish')),balanced=finish(start()),learning=finish(start('learning'));
  assert.deepEqual([fast,balanced,learning].map(s=>s.recallState.recallCount),[1,2,3]);
  assert.deepEqual(fast.decisionActors,{main:'Dawn',interaction:'AI',relation:'AI'});
  assert.deepEqual(balanced.decisionActors,{main:'Dawn',interaction:'Dawn',relation:'AI'});
  assert.deepEqual(learning.decisionActors,{main:'Dawn',interaction:'Dawn',relation:'Dawn'});
  assert.deepEqual([fast,balanced,learning].map(s=>s.recallDecisions.map(d=>d.nodeId)),Array.from({length:3},()=>['main','relation','interaction']));
  assert.equal(fast.recallDecisions[2].reason,'recall_value_below_threshold');
  assert.ok(fast.recallDecisions[2].budget.recentPenalty>0);
  assert.equal(balanced.nodes[1].recallKind,null);
  assert.equal(balanced.nodes[1].mode,'Your Turn');
  assert.equal(balanced.nodes[4].mode,'Your Turn');
  assert.deepEqual(fast.outcome.decisions.map(d=>d.id),['main']);
  assert.deepEqual(fast.outcome.effects.map(d=>d.decisionId),['main']);
  assert.ok(learning.outcome.decisions.every(d=>d.actor==='Dawn'));
});

test('saved preference budget and task size affect actual routing',()=>{
  const minimal=finish(start('learning',[1,1,1,0]));
  assert.equal(minimal.preferenceProfile.maxRecall,1);
  assert.equal(minimal.recallState.recallCount,1);
  assert.equal(minimal.recallDecisions[1].reason,'recall_budget_exhausted');
  assert.equal(finish(start('balanced',[1,1,1,1],'short')).recallState.recallCount,1);
});

test('changing mode during a judgment preserves that invitation and changes future routing',()=>{
  let s=start();
  for(let i=0;i<4;i++)s=send(s,'NEXT');
  assert.equal(s.phase,'main');
  const pending=structuredClone(s.pendingDecision);
  s=send(s,'UPDATE_TASK_PROFILE',{taskProfile:{participationGoal:'fast_finish'}});
  assert.deepEqual(s.pendingDecision,pending);
  s=finish(s);
  assert.equal(s.recallState.recallCount,1);
  assert.equal(s.decisionActors.interaction,'AI');
});

test('changing preferences during a judgment uses the saved budget at future candidates',()=>{
  let s=start();for(let i=0;i<4;i++)s=send(s,'NEXT');
  const pending=structuredClone(s.pendingDecision);
  s=send(s,'PROFILE_DRAFT',{patch:{answers:[1,1,1,0]}});
  s=send(s,'START_PREFERENCE_ONBOARDING');
  s=send(s,'SAVE_PROFILE');
  assert.equal(s.phase,'main');assert.deepEqual(s.pendingDecision,pending);
  assert.equal(finish(s).recallState.recallCount,1);
});

test('learning recall remains a real pause and relation alternatives change output',()=>{
  let s=start('learning');for(let i=0;i<4;i++)s=send(s,'NEXT');
  s=send(s,'ANSWER_MAIN',{choice:0});s=send(s,'NEXT');s=send(s,'NEXT');
  assert.equal(s.phase,'relation');
  assert.deepEqual(send(s,'AUTO_TICK',{key:`${s.phase}:${s.autoIndex}:${s.rerunIndex}`}),s);
  const first=finish(send(s,'ANSWER_RELATION',{choice:0}));
  const second=finish(send(s,'ANSWER_RELATION',{choice:1}));
  assert.notEqual(first.artifacts[0].relationFormat,second.artifacts[0].relationFormat);
  assert.notDeepEqual(first.artifacts[0].slides,second.artifacts[0].slides);
  assert.notEqual(first.nodes[3].substeps[1].result,second.nodes[3].substeps[1].result);
  assert.equal(second.decisionActors.relation,'Dawn');
});

test('explicitly retained judgments stay with Dawn across strict budgets and modes',()=>{
  const preferenceProfile=preferenceFromAnswers([0,0,0,0]);
  for(const participationGoal of ['fast_finish','balanced','learning']) {
    const s={...createState(),preferenceProfile,taskProfile:{taskSize:'short',participationGoal},recallState:{recallCount:1}};
    const result=evaluateCandidate(s,'main');
    assert.equal(result.action,'RECALL');
    assert.equal(result.reason,'explicit_user_retention');
    assert.equal(result.budget.maxRecall,1);
    assert.notEqual(result.reason,'critical_override');
    assert.equal(evaluateCandidate(s,'relation').action,'AUTO');
    const cancelled={...s,retainedJudgments:{main:false}};
    assert.deepEqual(evaluateCandidate(cancelled,'main'),decideRecall({candidate:candidates.main,taskProfile:cancelled.taskProfile,preferenceProfile,sessionRecallState:cancelled.recallState,now:cancelled.policyNow}));
  }
  const strict=finish(start('fast_finish',[0,0,0,0],'short'));
  assert.equal(strict.recallState.recallCount,1);
  assert.deepEqual(strict.decisionActors,{main:'Dawn',interaction:'AI',relation:'AI'});
});

test('retention can be cancelled before a candidate and the original policy resumes',()=>{
  let s=send(send(createState(),'INSTALL_PLUGIN'),'NEXT');
  assert.equal(s.retainedJudgments.main,true);
  s=send(s,'SET_RETAIN_MAIN',{value:false});
  assert.equal(s.retainedJudgments.main,false);
  assert.deepEqual(send(s,'SET_RETAIN_MAIN',{value:'false'}),s);
  s=send(s,'PROFILE_DRAFT',{patch:{answers:[0,0,0,0]}});
  s=send(s,'UPDATE_TASK_PROFILE',{taskProfile:{taskSize:'short',participationGoal:'fast_finish'}});
  s=finish(send(s,'START_DEMO'));
  assert.equal(s.recallState.recallCount,0);
  assert.equal(s.decisionActors.main,'AI');
  assert.deepEqual(s.outcome.decisions,[]);
});

test('critical override remains distinct from retained judgments when ordinary budget is exhausted',()=>{
  const preferenceProfile=preferenceFromAnswers([1,1,1,0]);
  const s={...createState(),retainedJudgments:{main:false},preferenceProfile,recallState:{recallCount:1}};
  assert.equal(evaluateCandidate(s,'main').action,'AUTO');
  const result=decideRecall({candidate:{...candidates.main,isCritical:true},preferenceProfile,sessionRecallState:s.recallState});
  assert.equal(result.action,'RECALL');assert.equal(result.reason,'critical_override');
});

test('acceptance finishes the primary story and customer change remains optional',()=>{
  let s=send(finish(start()),'ACCEPT_FINAL_RESULT');
  assert.equal(s.phase,'complete');assert.equal(s.clientMessageVisible,false);
  assert.deepEqual(send(s,'SHOW_LEARNING'),s);
  assert.deepEqual(send(s,'CLIENT_MESSAGE',{version:99}),s);
  s=send(s,'CLIENT_MESSAGE',{version:s.version,revision:s.revision});
  assert.equal(s.clientMessageVisible,true);
  s=send(s,'DISMISS_CLIENT_MESSAGE');
  assert.equal(s.clientMessageVisible,false);
  assert.deepEqual(send(s,'CLIENT_MESSAGE'),s);
  assert.equal(send(s,'RESET').clientMessageDismissed,false);
});

test('vendored policy keeps the original source hashes',async()=>{
  const metadata=JSON.parse(await readFile(new URL('../src/vendor/recall/provenance.json',import.meta.url),'utf8'));
  for(const [name,expected] of Object.entries(metadata.sha256)) {
    const source=await readFile(new URL(`../src/vendor/recall/${name}`,import.meta.url),'utf8');
    assert.equal(createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex'),expected,name);
  }
});
