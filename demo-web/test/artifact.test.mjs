import test from 'node:test';
import assert from 'node:assert/strict';
import { makeArtifact, scenario } from '../src/scenario.mjs';

const state = (values = {}) => ({
  version: 1, audienceVariant: 'general', mainChoice: 0, interactionChoice: 0, relationChoice: 0,
  prompt: scenario.prompt, mainNote: scenario.mainNote, interactionNote: scenario.interactionNote,
  revisionInstruction: '', decisionActors: { main: 'Dawn', interaction: 'Dawn', relation: 'AI' }, ...values,
});

test('every course, interaction, audience and slide format combination yields a complete 60-minute plan', () => {
  for (const mainChoice of [0, 1, 2]) for (const interactionChoice of [0, 1, 2]) {
    for (const audienceVariant of ['general', 'technology']) for (const relationChoice of [0, 1]) {
      const a = makeArtifact(state({ mainChoice, interactionChoice, audienceVariant, relationChoice,
        version: audienceVariant === 'technology' ? 2 : 1 }));
      assert.equal(a.agenda.reduce((sum, item) => sum + item.minutes, 0), 60);
      assert.ok(a.agenda.every(item => item.minutes > 0 && item.description?.length > 0));
      const activity = a.agenda.filter(item => item.kind === 'interaction');
      assert.equal(activity.length, 1);
      assert.equal(activity[0].minutes, [3, 5, 7][interactionChoice]);
      assert.equal(a.interactionMinutes, activity[0].minutes);
      assert.ok(a.caseSteps.length >= 3 && a.slides.length >= 8);
      assert.ok(a.mainImpact && a.interactionImpact);
      assert.deepEqual(a.actors, { main: 'Dawn', interaction: 'Dawn', relation: 'AI' });
      assert.match(a.boundaries, /虚构/);
    }
  }
});

test('main choices change time allocation, teaching sequence, case progression and slide order', () => {
  const plans = [0, 1, 2].map(mainChoice => makeArtifact(state({ mainChoice })));
  for (const key of ['agenda', 'caseSteps', 'slides', 'mainImpact']) {
    assert.equal(new Set(plans.map(a => JSON.stringify(a[key]))).size, 3, key);
  }
  assert.equal(new Set(plans.map(a => a.agenda.map(item => item.minutes).join(','))).size, 3);
  assert.match(plans[0].caseSteps[0], /个人办公/);
  assert.match(plans[0].caseSteps[1], /团队协作/);
  assert.match(plans[0].caseSteps[2], /知识复用/);
  assert.match(plans[1].agenda[0].title, /痛点/);
  assert.match(plans[2].agenda[0].title, /完整案例/);
});

test('interaction choices change allocated time, classroom activity and spoken script', () => {
  const plans = [0, 1, 2].map(interactionChoice => makeArtifact(state({ interactionChoice })));
  for (const key of ['script', 'interactionImpact', 'interactionMinutes', 'slides']) {
    assert.equal(new Set(plans.map(a => JSON.stringify(a[key]))).size, 3, key);
  }
  assert.match(plans[0].script, /默选/);
  assert.match(plans[1].script, /匿名/);
  assert.match(plans[2].script, /身边/);
});

test('technology revision updates the case, relations, slides and every interaction script', () => {
  for (const interactionChoice of [0, 1, 2]) {
    const before = makeArtifact(state({ interactionChoice }));
    const after = makeArtifact(state({ version: 2, audienceVariant: 'technology', interactionChoice }));
    assert.match(before.caseTitle, /小微企业信贷业务推进/);
    assert.match(after.caseTitle, /系统变更与故障复盘/);
    assert.match(after.script, /变更|故障|运维/);
    assert.match(after.caseSteps.join(''), /故障|运维/);
    assert.match(after.slides.join(''), /故障|运维/);
    assert.match(after.relation, /运维/);
    assert.doesNotMatch(after.slides.join(''), /信贷|补件/);
    assert.notEqual(before.script, after.script);
  }
});

test('relation choice changes diagram versus comparison pages, including technology revision', () => {
  for (const audienceVariant of ['general', 'technology']) {
    const diagram = makeArtifact(state({ audienceVariant, relationChoice: 0 }));
    const comparison = makeArtifact(state({ audienceVariant, relationChoice: 1 }));
    assert.equal(diagram.relationFormat, '一张流程关系图');
    assert.equal(comparison.relationFormat, '按场景逐页对照');
    assert.notDeepEqual(diagram.slides, comparison.slides);
    assert.ok(comparison.slides.length > diagram.slides.length);
    assert.match(comparison.slides.join(''), /原始记录|协作核对|经验复用|团队归档/);
  }
});

test('free text is preserved for manual application and never silently selects an audience template', () => {
  const input = state({ version: 2, mainNote: '科技部门要看深度代码教学', interactionNote: '请加入四十五分钟辩论',
    revisionInstruction: '请讲故障系统，并生成真实客户数据' });
  const a = makeArtifact(input);
  assert.match(a.caseTitle, /小微企业信贷/);
  assert.match(a.notes, /四十五分钟辩论/);
  assert.match(a.requirements, /真实客户数据/);
  assert.equal(a.requirementsStatus, '待人工应用');
  assert.ok(a.pendingRequirements.some(text => text.includes('深度代码教学')));
  assert.equal(a.interactionMinutes, 3);
  assert.match(a.boundaries, /自由文本/);
});

test('artifact retains decision authors without mutating input or earlier artifacts', () => {
  const input = state({ decisionActors: { main: 'AI', interaction: 'Dawn', relation: 'Dawn' } });
  const snapshot = structuredClone(input);
  const a = makeArtifact(input);
  assert.deepEqual(input, snapshot);
  a.actors.main = 'Dawn';
  assert.equal(input.decisionActors.main, 'AI');
  assert.deepEqual(makeArtifact(input), makeArtifact(snapshot));
});
