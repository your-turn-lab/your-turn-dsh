import { test, expect } from '@playwright/test';
import { scenario } from '../../src/scenario.mjs';

const mainTitle = '这 60 分钟，按什么逻辑讲？';
const interactionTitle = '哪种互动，你在现场说得自然？';
const resultTitle = '方案准备好了，里面有你的判断。';

async function withinWidth(page, label) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), label).toBe(true);
}

async function reachable(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }]) {
  test(`touch-only complete story and original My Turn at ${viewport.width}px`, async ({ browser, baseURL }) => {
    test.setTimeout(60000);
    // Dedicated browser context: never attaches to the user's browser or its login state.
    const context = await browser.newContext({ baseURL, viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [], external = [];
    let stage = 'profile';
    const snapshot = async name => page.screenshot({ path: `verification/mobile-${viewport.width}-${name}.png`, fullPage: true });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(baseURL)) external.push(request.url()); });
    try {
      await page.clock.install();
      await page.goto('/');
      await page.evaluate(() => {
        window.__observedTouchCount = 0;
        document.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') window.__observedTouchCount++; });
      });
      await expect(page.locator('.dawn-profile img')).toBeVisible();
      expect(await page.locator('.dawn-profile img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await withinWidth(page, 'profile fits viewport');
      await snapshot('01-profile');
      await page.getByRole('button', { name: '平衡模式', exact: true }).tap();
      await page.getByRole('button', { name: '陪 Dawn 备课' }).tap();
      await page.clock.runFor(5000);

      stage = 'main';
      await expect(page.getByRole('heading', { name: mainTitle })).toBeVisible();
      // The path stays folded while reading on a phone; it remains available by touch.
      await page.getByRole('button', { name: /点击打开任务路径/ }).tap();
      await expect(page.getByRole('region', { name: '人机决策路径' })).toBeVisible();
      await expect(page.locator('.hil-node.waiting_for_user').filter({ hasText: '这堂课怎么讲' })).toBeVisible();
      await page.getByRole('button', { name: '收起路径', exact: true }).tap();
      await page.getByRole('button', { name: /业务痛点 → 场景演练 → 团队复盘/ }).tap();
      await page.getByRole('button', { name: /个人办公 → 团队协作 → 知识复用/ }).tap();
      const acceptJudgment = page.getByRole('button', { name: '采用这个判断' });
      await reachable(page, acceptJudgment);
      await withinWidth(page, 'main choice fits viewport');
      await snapshot('02-main');
      await acceptJudgment.tap();

      stage = 'candidate';
      await page.clock.runFor(3000);
      await expect(page.getByRole('heading', { name: '评估后，继续 Auto' })).toBeVisible();
      await expect(page.locator('[data-question-key]')).toHaveCount(0);
      await withinWidth(page, 'candidate explanation fits viewport');
      await snapshot('03-candidate');
      await page.clock.runFor(6500);

      stage = 'interaction';
      await expect(page.getByRole('heading', { name: interactionTitle })).toBeVisible();
      await page.getByRole('button', { name: /匿名问题收集/ }).tap();
      await page.getByRole('button', { name: /自然、低压力的痛点投票/ }).tap();
      await reachable(page, acceptJudgment);
      await withinWidth(page, 'interaction choice fits viewport');
      await snapshot('04-interaction');
      await acceptJudgment.tap();

      stage = 'first-result';
      await expect(page.getByRole('heading', { name: resultTitle })).toBeVisible();
      await expect(page.getByText('2 次邀请', { exact: true })).toBeVisible();
      await page.getByText('查看培训方案 · 60 分钟', { exact: true }).tap();
      await expect(page.getByRole('heading', { name: '课堂里的例子 · 小微企业信贷业务推进' })).toBeVisible();
      await withinWidth(page, 'expanded result fits viewport');
      await page.getByText('查看培训方案 · 60 分钟', { exact: true }).tap();
      await page.getByRole('button', { name: '这版可以去备课了' }).tap();
      await page.clock.runFor(2000);
      await expect(page.getByRole('status', { name: '客户临时消息' })).toBeVisible();
      await snapshot('05-client-message');

      stage = 'native-editor';
      await page.getByRole('button', { name: '检查哪里要改' }).tap();
      await page.getByRole('button', { name: '找到「课堂用什么例子」' }).tap();
      const substep = page.locator('.hil-substep').filter({ hasText: '换成适合听众的例子' });
      await substep.tap();
      const editor = page.getByRole('textbox', { name: '修改这一步的做法' });
      await expect(editor).toHaveValue(scenario.revision);
      await editor.tap();
      await editor.fill(`${scenario.revision}\n请保留一轮跨组核对。`);
      const rerun = page.getByRole('button', { name: '保存并从这里重做' });
      await reachable(page, rerun);
      expect((await rerun.boundingBox()).width).toBeGreaterThanOrEqual(40);
      await withinWidth(page, 'native editor fits viewport');
      await page.screenshot({ path: `verification/mobile-${viewport.width}-06-native-editor.png` });
      await rerun.tap();
      await page.getByRole('button', { name: '关闭详情', exact: true }).tap();
      await page.getByRole('button', { name: '收起路径', exact: true }).tap();
      await page.clock.runFor(8500);

      stage = 'updated-result';
      await expect(page.getByRole('heading', { name: '换了例子，保留你的讲法。' })).toBeVisible();
      await page.getByText('查看培训方案 · 60 分钟 · V1 / V2 对比', { exact: true }).tap();
      await expect(page.getByRole('heading', { name: '课堂里的例子 · 系统变更与故障复盘' })).toBeVisible();
      await page.getByRole('button', { name: 'V1 · 首轮', exact: true }).tap();
      await expect(page.getByRole('heading', { name: '课堂里的例子 · 小微企业信贷业务推进' })).toBeVisible();
      await page.getByRole('button', { name: 'V2 · My Turn 后', exact: true }).tap();
      await page.getByText('你补充的备注 · 待人工应用', { exact: true }).tap();
      await expect(page.getByText(/修改要求：/).first()).toContainText('跨组核对');
      await page.getByText('查看培训方案 · 60 分钟 · V1 / V2 对比', { exact: true }).tap();
      await page.getByText('用久了，它会怎样更懂 Dawn？', { exact: false }).tap();
      await page.getByRole('button', { name: '持续使用后（示意）', exact: true }).tap();
      await expect(page.getByRole('row').filter({ hasText: '现场互动表达' }).getByText('Your Turn', { exact: true })).toBeVisible();
      await withinWidth(page, 'long-term visualization fits viewport');
      await snapshot('07-recap');
      await page.getByRole('button', { name: '重新开始', exact: true }).tap();
      await page.getByRole('button', { name: '确认重新开始', exact: true }).tap();
      await expect(page.getByRole('button', { name: '陪 Dawn 备课' })).toBeVisible();
      expect(await page.evaluate(() => window.__observedTouchCount)).toBeGreaterThan(25);
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
    } catch (error) {
      await page.screenshot({ path: `verification/mobile-${viewport.width}-FAIL-${stage}.png`, fullPage: true });
      throw error;
    } finally {
      await context.close();
    }
  });
}
