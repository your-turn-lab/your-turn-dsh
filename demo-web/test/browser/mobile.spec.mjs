import {test,expect} from '@playwright/test';
import {scenario} from '../../src/scenario.mjs';
for(const viewport of [{width:360,height:800},{width:390,height:844}]) {
 test(`touch-only choices and original case editor at ${viewport.width}px`,async({browser,baseURL})=>{
  test.setTimeout(60000);
  const context=await browser.newContext({baseURL,viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const tick=async phase=>page.clock.runFor(scenario.playbackMs[phase]+100);
  const tap=async name=>page.getByRole('button',{name,exact:true}).tap();
  const fits=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  try {
   await page.clock.install();await page.goto('/');await tap('启用 YourTurn');await tick('installing');
   await expect.poll(()=>page.locator('.intro-person img').evaluate(x=>x.complete&&x.naturalWidth>0)).toBe(true);
   await tap('开始备课 →');await tick('path');for(let i=0;i<3;i++)await tick('auto');
   await page.getByRole('button',{name:/任务路径 ·/}).tap();await expect(page.getByRole('region',{name:'人机决策路径'})).toBeVisible();
   await tap('收起路径');await page.getByRole('button',{name:/业务痛点 → 场景演练 → 团队复盘/}).tap();await tap('采用这个判断 →');
   for(const phase of ['candidate','assessed','autoRelation'])await tick(phase);
   await page.getByRole('button',{name:/匿名问题收集/}).tap();await tap('采用这个判断 →');await fits();
   await tap('它会怎样更懂 Dawn →');await tap('这版可以去备课了');await page.clock.runFor(3600);
   await tap('检查哪里要改 →');await tap('找到「课堂用什么例子」 →');
   await page.locator('.hil-substep').filter({hasText:'换成适合听众的例子'}).tap();
   const editor=page.getByRole('textbox',{name:'修改这一步的做法'});await expect(editor).toHaveValue(scenario.revision);
   await editor.fill(`${scenario.revision}\n保留我的互动选择。`);
   const button=page.getByRole('button',{name:'保存并从这里重做'}),box=await button.boundingBox();
   expect(box.height).toBeGreaterThanOrEqual(40);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);await fits();
   await page.screenshot({path:`verification/17-native-editor-${viewport.width}.png`});
   await button.tap();await tap('关闭详情');await tap('收起路径');for(let i=0;i<4;i++)await tick('rerunning');
   await expect(page.getByRole('heading',{name:'换了例子，保留你的讲法。'})).toBeVisible();
   await tap('查看培训方案');await page.locator('.pager button').last().tap();await expect(page.getByRole('heading',{name:'系统变更与故障复盘',exact:true})).toBeVisible();
   await page.getByLabel('成果版本').selectOption('1');await page.locator('.pager button').last().tap();await expect(page.getByRole('heading',{name:'小微企业信贷业务推进',exact:true})).toBeVisible();
   await fits();expect(errors).toEqual([]);
  } finally { await context.close(); }
 });
}
