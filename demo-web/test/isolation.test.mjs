import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { scenario } from '../src/scenario.mjs';
import { learningDecision } from '../src/state.mjs';

test('learning presets demonstrate a changed decision without recalling mechanical layout', () => {
  const {initial,evolved,candidates}=scenario.learning;
  assert.equal(learningDecision(initial,candidates[1].tags),'AUTO');
  assert.equal(learningDecision(evolved,candidates[1].tags),'YOUR_TURN');
  assert.equal(learningDecision(evolved,candidates[2].tags),'AUTO');
});
test('vendored plugin UI retains the pinned source bytes', async () => {
  const metadata=JSON.parse(await readFile(new URL('../src/vendor/provenance.json',import.meta.url),'utf8'));
  const source=await readFile(new URL('../src/vendor/plugin-client.jsx',import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),metadata.pluginSha256);
});
test('demo dependencies contain no DSH runtime or parent workspace reference', async () => {
  const p=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const deps={...p.dependencies,...p.devDependencies};
  for(const [name,version] of Object.entries(deps)) {
    assert.doesNotMatch(name, /deepseek|dsh/);
    assert.doesNotMatch(version,/file:|workspace:|\.\.\//);
  }
});
