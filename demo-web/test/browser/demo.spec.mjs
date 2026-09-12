import { test, expect } from '@playwright/test';
import { scenario } from '../../src/scenario.mjs';

async function begin(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '开始任务' }).click();
  await expect(page.getByRole('navigation', { name: '演示进度' })).toBeVisible();
  await expect(page.getByRole('region', { name: '人机决策路径' })).toBeVisible();
}
test('judge completes the streamlined run, automatic work, original My Turn, and value recap', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4173')) external.push(r.url()); });
  await page.goto('/');
  await page.screenshot({ path: 'verification/00-onboarding.png', fullPage: true });
  await begin(page);
  await expect(page.getByRole('heading', { name: '这 60 分钟，按什么逻辑讲？' })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.hil-node.waiting_for_user').filter({ hasText: '培训主线' })).toBeVisible({ timeout: 500 });
  await page.getByRole('button', { name: /个人办公 → 团队协作 → 知识复用/ }).click();
  await page.getByRole('textbox', { name: '补充你的判断' }).fill(scenario.mainNote);
  await page.screenshot({ path: 'verification/01-your-turn.png', fullPage: true });
  await page.getByRole('button', { name: '采用这个判断' }).click();
  await expect(page.getByRole('heading', { name: '这一步，要请 Dawn 回来吗？' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '评估后，继续 Auto' })).toBeVisible({ timeout: 6000 });
  await expect(page.locator('[data-question-key]')).toHaveCount(0);
  await expect(page.getByText('沿用你的主线，召回次数不增加')).toBeVisible();
  await page.screenshot({ path: 'verification/02-no-interruption.png', fullPage: true });
  await expect(page.getByRole('heading', { name: '哪种互动，你在现场说得自然？' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /自然、低压力的痛点投票/ }).click();
  await page.getByRole('button', { name: '采用这个判断' }).click();
  await expect(page.getByRole('heading', { name: '方案准备好了，里面有你的判断。' })).toBeVisible();
  await page.getByText('查看培训方案 · 60 分钟', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载备课方案' }).click();
  expect((await download).suggestedFilename()).toBe('Dawn-training-v1.md');
  await page.getByRole('button', { name: '确认成果，查看客户消息' }).click();
  await expect(page.locator('.hil-node.completed')).toHaveCount(6, { timeout: 500 });
  await page.getByRole('button', { name: '定位贯穿案例' }).click();
  await page.locator('.hil-substep').filter({ hasText: '确定授课对象与案例' }).click();
  const editor = page.getByRole('textbox', { name: '修改这一步的做法' });
  await expect(editor).toHaveValue(scenario.revision);
  await editor.fill(`${scenario.revision}\n请补充跨组核对的环节。`);
  await page.screenshot({ path: 'verification/03-my-turn.png', fullPage: true });
  await page.getByRole('button', { name: '保存并从这里重做' }).click();
  await page.getByRole('button', { name: '关闭详情' }).click();
  await expect(page.getByRole('heading', { name: '任务推进了，你的判断也留下来了。' })).toBeVisible({ timeout: 12000 });
  await expect(page.getByText('系统变更与故障复盘', { exact: true })).toBeVisible();
  await expect(page.locator('.hil-node.completed')).toHaveCount(6);
  await page.screenshot({ path: 'verification/04-value-recap.png', fullPage: true });
  await page.getByText('查看培训方案 · 60 分钟 · V1 / V2 对比', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '贯穿案例 · 系统变更与故障复盘' })).toBeVisible();
  await expect(page.getByText(/请补充跨组核对的环节/).first()).toBeVisible();
  await page.getByRole('button', { name: 'V1 · 首轮' }).click();
  await expect(page.getByRole('heading', { name: '贯穿案例 · 会议记录到团队行动清单' })).toBeVisible();
  await page.getByRole('button', { name: 'V2 · My Turn 后' }).click();
  await page.getByText('查看培训方案 · 60 分钟 · V1 / V2 对比', { exact: true }).click();
  await page.getByRole('button', { name: '确认验收最终成果', exact: true }).click();
  await page.getByText('继续使用，会有什么变化？', { exact: false }).click();
  const expressionRow = page.getByRole('row').filter({ hasText: '现场互动表达' });
  await expect(expressionRow.getByText('Auto', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '持续使用后（示意）' }).click();
  await expect(expressionRow.getByText('Your Turn', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'verification/05-learning.png', fullPage: true });
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '确认重新开始' }).click();
  await expect(page.getByRole('button', { name: '开始任务' })).toBeVisible();
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('pause and process history suspend playback; reset cancels scheduled progress', async ({ page }) => {
  await page.clock.install();
  await begin(page);
  await page.getByRole('button', { name: '暂停演示' }).click();
  await page.clock.runFor(10000);
  await expect(page.getByRole('heading', { name: '任务路径已准备' })).toBeVisible();
  await page.getByRole('button', { name: '继续演示' }).click();
  await page.getByRole('button', { name: '回看过程' }).click();
  await page.clock.runFor(10000);
  await expect(page.getByRole('heading', { name: '任务路径已准备' })).toBeVisible();
  await page.getByRole('button', { name: '收起记录', exact: true }).first().click();
  await page.clock.runFor(1500);
  await expect(page.getByRole('heading', { name: '先把资料整理好' })).toBeVisible();
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '确认重新开始' }).click();
  await page.clock.runFor(30000);
  await expect(page.getByRole('button', { name: '开始任务' })).toBeVisible();
});

test('projector and narrow layouts remain readable with editable preferences', async ({ page }) => {
  for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size); await page.goto('/');
    await expect(page.getByRole('button', { name: '开始任务' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByText('编辑偏好', { exact: true }).click();
    await page.getByRole('textbox', { name: '留给我的判断' }).fill('客户表达和课程主线');
    await page.getByLabel('你希望我什么时候暂停下来问你？').selectOption('0');
    await page.getByText('编辑偏好', { exact: true }).click();
    await page.screenshot({ path: `verification/06-onboarding-${size.width}.png`, fullPage: true });
    await page.getByRole('button', { name: '开始任务' }).click();
    await expect(page.getByRole('heading', { name: '这 60 分钟，按什么逻辑讲？' })).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (size.width === 1280) {
      const button = await page.getByRole('button', { name: '采用这个判断' }).boundingBox();
      expect(button.y + button.height).toBeLessThanOrEqual(size.height - 8);
    }
    await page.screenshot({ path: `verification/07-recall-${size.width}.png`, fullPage: true });
  }
});
