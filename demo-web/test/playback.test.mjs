import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, reduce } from '../src/state.mjs';
const send=(s,type,values={})=>reduce(s,{type,...values});
const tick=s=>send(s,'AUTO_TICK',{key:`${s.phase}:${s.autoIndex}:${s.rerunIndex}`});

test('one start saves preferences, submits the task, and starts the visible path',()=>{
  const s=send(createState(),'START_DEMO');
  assert.equal(s.phase,'path');
  assert.ok(s.preferenceProfile);
  assert.equal(s.nodes.length,6);
  assert.equal(s.taskProfile.taskSize,'long');
});
test('auto advances research substeps, then waits indefinitely for a real judgment',()=>{
  let s=send(createState(),'START_DEMO');
  s=tick(s);
  assert.equal(s.phase,'auto');
  assert.equal(s.nodes[0].substeps.filter(x=>x.status==='completed').length,0);
  s=tick(s);
  assert.equal(s.nodes[0].substeps.filter(x=>x.status==='completed').length,1);
  s=tick(s);s=tick(s);
  assert.equal(s.phase,'main');
  assert.equal(s.recallState.recallCount,1);
  assert.deepEqual(tick(s),s);
});
test('pausing blocks queued ticks and resuming continues the same node',()=>{
  let s=tick(send(createState(),'START_DEMO'));
  s=send(s,'TOGGLE_PLAYBACK');
  assert.equal(s.playbackPaused,true);
  assert.deepEqual(tick(s),s);
  s=send(s,'TOGGLE_PLAYBACK');s=tick(s);
  assert.equal(s.autoIndex,1);
});
test('ticks from an earlier screen cannot advance a later screen',()=>{
  let s=send(createState(),'START_DEMO');
  const key=`${s.phase}:${s.autoIndex}:${s.rerunIndex}`;
  s=tick(s);
  assert.deepEqual(send(s,'AUTO_TICK',{key}),s);
  s=send(s,'RESET');
  assert.deepEqual(send(s,'AUTO_TICK',{key}),s);
});
