import { test, expect } from '@playwright/test';
import { scenario } from '../../src/scenario.mjs';

async function begin(page) {
  await page.goto('/');
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'下一项',exact:true}).click();
  await page.getByRole('button',{name:'保存偏好',exact:true}).click();
  await page.getByRole('button',{name:'按长任务 · 平衡模式继续'}).click();
  await page.getByRole('button',{name:'提交任务并生成路径'}).click();
  await expect(page.getByRole('region',{name:'人机决策路径'})).toBeVisible();
}
test('judge completes Dawn, sees a suppressed candidate, revises via the original plugin, and resets',async({page})=>{
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173'))external.push(r.url());});
  await begin(page);
  await page.getByRole('button',{name:'开始 Auto'}).click();
  await expect(page.getByText('✓ 检查产品术语')).toBeVisible();
  await page.getByRole('button',{name:'继续到培训主线'}).click();
  await expect(page.locator('[data-question-key]')).toBeVisible();
  await expect(page.locator('.hil-node.waiting_for_user').filter({hasText:'培训主线'})).toBeVisible({timeout:500});
  await page.getByRole('button',{name:/个人办公 → 团队协作 → 知识复用/}).click();
  await page.getByRole('textbox',{name:'补充你的判断'}).fill(scenario.mainNote);
  await page.screenshot({path:'verification/01-your-turn.png',fullPage:true});
  await page.getByRole('button',{name:'确认并继续'}).click();
  await expect(page.getByRole('heading',{name:'高价值候选出现'})).toBeVisible();
  await page.getByRole('button',{name:'查看评估'}).click();
  await expect(page.getByText('Decision: AUTO · Recall Count: 1 / 3')).toBeVisible();
  await expect(page.locator('[data-question-key]')).toHaveCount(0);
  await page.screenshot({path:'verification/02-no-interruption.png',fullPage:true});
  await page.getByRole('button',{name:'继续 Auto，不召回 Dawn'}).click();
  await page.getByRole('button',{name:'继续到现场互动'}).click();
  await page.getByRole('button',{name:/自然、低压力的痛点投票/}).click();
  await page.getByRole('button',{name:'确认并继续'}).click();
  await expect(page.getByRole('heading',{name:'60 分钟 AI 办公产品培训'})).toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'下载备课方案'}).click();
  expect((await download).suggestedFilename()).toBe('Dawn-training-v1.md');
  await page.getByRole('button',{name:'确认验收最终成果',exact:true}).click();
  await page.getByRole('button',{name:'客户发来新消息'}).click();
  await expect(page.locator('.hil-node.completed')).toHaveCount(6,{timeout:500});
  await page.getByRole('button',{name:/3\. 贯穿案例/}).click();
  const step=page.locator('.hil-substep').filter({hasText:'确定授课对象与案例'});
  await step.focus();
  await page.getByRole('textbox',{name:'修改这一步的做法'}).fill(scenario.revision);
  await page.screenshot({path:'verification/03-my-turn.png',fullPage:true});
  await page.getByRole('button',{name:'保存并从这里重做'}).click();
  await page.getByRole('button',{name:'关闭详情'}).click();
  for(const title of ['贯穿案例','课件关系呈现','现场互动','最终输出'])await page.getByRole('button',{name:`完成「${title}」并继续`}).click();
  await expect(page.getByRole('heading',{name:'贯穿案例 · 系统变更与故障复盘'})).toBeVisible();
  await page.getByRole('button',{name:'V1 · 首轮'}).click();
  await expect(page.getByRole('heading',{name:'贯穿案例 · 会议记录到团队行动清单'})).toBeVisible();
  await page.getByRole('button',{name:'V2 · My Turn 后'}).click();
  await page.getByRole('button',{name:'确认验收最终成果',exact:true}).click();
  await page.getByRole('button',{name:'查看长期变化示意'}).click();
  const expressionRow=page.getByRole('row').filter({hasText:'现场互动表达'});
  await expect(expressionRow.getByText('Auto',{exact:true})).toHaveCount(2);
  await page.getByRole('button',{name:'持续使用后（示意）'}).click();
  await expect(expressionRow.getByText('Your Turn',{exact:true})).toBeVisible();
  await page.screenshot({path:'verification/04-learning.png',fullPage:true});
  await page.getByRole('button',{name:'重新开始',exact:true}).click();
  await page.getByRole('button',{name:'确认重新开始'}).click();
  await expect(page.getByRole('heading',{name:'你希望我什么时候暂停下来问你？'})).toBeVisible();
  expect(errors).toEqual([]);expect(external).toEqual([]);
});
test('projector viewport and a narrow viewport have no horizontal overflow',async({page})=>{
  for(const size of [{width:1280,height:720},{width:390,height:844}]) {
    await page.setViewportSize(size);await page.goto('/');
    await expect(page.getByRole('button',{name:'下一项'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
});
