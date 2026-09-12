import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {scenario} from '../../src/scenario.mjs';

const mainTitle='这 60 分钟，按什么逻辑讲？';
const interactionTitle='哪种互动，你在现场说得自然？';
const heading=(page,name)=>page.getByRole('heading',{name,exact:true});
const forward=async(page,phase)=>{await page.clock.runFor(scenario.playbackMs[phase]+100);};
async function activate(page){
  await page.goto('/');
  await expect(heading(page,'给你的 Agent，加上 YourTurn。')).toBeVisible();
  await page.getByRole('button',{name:'启用 YourTurn',exact:true}).click();
  await expect(page.getByText('正在加入',{exact:true})).toBeVisible();
  await forward(page,'installing');
  await expect(heading(page,'这次，陪 Dawn 备一堂课。')).toBeVisible();
}
async function start(page,mode='平衡模式'){
  await activate(page);
  await page.getByRole('button',{name:mode,exact:true}).click();
  await page.getByRole('button',{name:'开始备课 →',exact:true}).click();
}
async function toMain(page){await forward(page,'path');for(let i=0;i<3;i++)await forward(page,'auto');await expect(heading(page,mainTitle)).toBeVisible();}
async function answer(page){await page.getByRole('button',{name:'采用这个判断 →',exact:true}).click();}
async function toInteraction(page){for(const phase of ['candidate','assessed','autoRelation'])await forward(page,phase);await expect(heading(page,interactionTitle)).toBeVisible();}
async function fits(page,label){
  const metrics=await page.evaluate(()=>{
    const visible=el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(el).visibility!=='hidden';};
    const selectors=['html','body','main.workspace','.screen-content','.screen-content>.screen-card','.screen-content>.screen-card>.Mbwy4a_body','.screen-modal .screen-card','.screen-modal .Mbwy4a_body'];
    return selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(visible).map(el=>{const r=el.getBoundingClientRect();return {selector,top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};}));
  });
  const {width,height}=page.viewportSize();
  for(const box of metrics){
    expect(box.scrollHeight,`${label}: ${box.selector} vertical overflow ${JSON.stringify(box)}`).toBeLessThanOrEqual(box.clientHeight+2);
    expect(box.scrollWidth,`${label}: ${box.selector} horizontal overflow`).toBeLessThanOrEqual(box.clientWidth+2);
    expect(box.top,`${label}: ${box.selector} top`).toBeGreaterThanOrEqual(-1);
    expect(box.bottom,`${label}: ${box.selector} bottom`).toBeLessThanOrEqual(height+1);
    expect(box.right,`${label}: ${box.selector} right`).toBeLessThanOrEqual(width+1);
  }
  const buttons=page.locator(await page.locator('.screen-modal').count() ? '.screen-modal .Mbwy4a_footer button:visible' : '.screen-content .Mbwy4a_footer button:visible');
  for(let i=0;i<await buttons.count();i++){
    const button=buttons.nth(i),box=await button.boundingBox();
    expect(box.height,`${label}: usable footer tap target`).toBeGreaterThanOrEqual(40);
    expect(box.y+box.height,`${label}: footer inside screen`).toBeLessThanOrEqual(height);
    if(await button.isEnabled())await button.click({trial:true});
  }
}
async function artifactPages(page,label){
  await page.getByRole('button',{name:'查看培训方案',exact:true}).click();
  for(let i=0;i<4;i++){
    await expect(page.locator('.pager')).toContainText(`${i+1} / 4`);
    await fits(page,`${label}-artifact-${i+1}`);
    if(i<3)await page.locator('.pager button').last().click();
  }
  await page.getByRole('button',{name:'回到任务',exact:true}).click();
}

test('balanced story uses original My Turn, produces versions and downloads the changed choices',async({page,baseURL})=>{
  test.setTimeout(90000);await page.clock.install();
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(baseURL)&&!r.url().startsWith('blob:'))external.push(r.url());});
  await start(page);await toMain(page);
  await expect(page.locator('.retained-line')).toContainText('每次都问你');
  await page.getByRole('button',{name:/业务痛点 → 场景演练 → 团队复盘/}).click();await answer(page);
  await expect(heading(page,'这一步，也要问你吗？')).toBeVisible();await forward(page,'candidate');
  await expect(heading(page,'判断过了，这次不打扰')).toBeVisible();await expect(page.locator('[data-question-key]')).toHaveCount(0);
  await page.screenshot({path:'verification/10-no-interruption.png'});
  await forward(page,'assessed');await forward(page,'autoRelation');
  await page.getByRole('button',{name:/两人交流一个工作痛点/}).click();await answer(page);
  await expect(heading(page,'这次，你参与了 2 次判断。')).toBeVisible();
  await expect(page.locator('.recap-impact')).toContainText('业务痛点 → 场景演练 → 团队复盘');
  await expect(page.locator('.recap-impact')).toContainText('两人交流一个工作痛点');
  await artifactPages(page,'desktop');
  await page.getByRole('button',{name:'查看培训方案',exact:true}).click();
  await expect(page.locator('.agenda')).toContainText('业务痛点');await expect(page.locator('.agenda')).toContainText('7′');
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'下载方案 ↓',exact:true}).click();
  const file=await downloading,text=await readFile(await file.path(),'utf8');
  expect(file.suggestedFilename()).toBe('Dawn-training-v1.md');expect(text).toContain('业务痛点');expect(text).toContain('两人交流');
  await page.getByRole('button',{name:'回到任务',exact:true}).click();
  await page.getByRole('button',{name:'它会怎样更懂 Dawn →',exact:true}).click();
  await expect(heading(page,'用久了，它会怎样更懂 Dawn？')).toBeVisible();
  await page.getByRole('button',{name:'更熟悉 Dawn 以后',exact:true}).click();
  await expect(page.locator('.future-routes>div').filter({hasText:'现场互动表达'})).toContainText('YourTurn');
  await page.getByRole('button',{name:'这版可以去备课了',exact:true}).click();
  await expect(heading(page,'这次，你参与了 2 次判断。')).toBeVisible();
  await page.clock.runFor(3600);await expect(heading(page,'刚以为备完课，客户发来了消息。')).toBeVisible();
  await page.getByRole('button',{name:'检查哪里要改 →',exact:true}).click();
  await page.getByRole('button',{name:'找到「课堂用什么例子」 →',exact:true}).click();
  await page.locator('.hil-substep').filter({hasText:'换成适合听众的例子'}).click();
  const editor=page.getByRole('textbox',{name:'修改这一步的做法'});await expect(editor).toHaveValue(scenario.revision);
  await editor.fill(`${scenario.revision}\n请补充跨组核对环节。`);
  await page.screenshot({path:'verification/11-original-my-turn.png'});
  await page.getByRole('button',{name:'保存并从这里重做'}).click();await page.getByRole('button',{name:'关闭详情'}).click();
  for(let i=0;i<4;i++)await forward(page,'rerunning');
  await expect(heading(page,'换了例子，保留你的讲法。')).toBeVisible();
  await page.getByRole('button',{name:'查看培训方案',exact:true}).click();await page.locator('.pager button').last().click();
  await expect(heading(page,'系统变更与故障复盘')).toBeVisible();
  await page.getByLabel('成果版本').selectOption('1');await expect(page.locator('.pager')).toContainText('1 / 4');await page.locator('.pager button').last().click();
  await expect(heading(page,'小微企业信贷业务推进')).toBeVisible();
  await page.getByLabel('成果版本').selectOption('2');await page.locator('.pager button').last().click();await expect(heading(page,'系统变更与故障复盘')).toBeVisible();
  expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('pause, paged history and reset stop automatic progress',async({page})=>{
  await page.clock.install();await start(page);
  await page.getByRole('button',{name:'暂停',exact:true}).click();await page.clock.runFor(60000);
  await expect(heading(page,'Agent 已排好准备工作的顺序')).toBeVisible();
  await page.getByRole('button',{name:'继续',exact:true}).click();
  const history=page.getByRole('button',{name:'回看过程',exact:true});expect((await history.boundingBox()).height).toBeGreaterThanOrEqual(40);await history.click();
  await page.clock.runFor(60000);await expect(heading(page,'回看这次过程')).toBeVisible();await page.locator('.pager button').last().click();await fits(page,'history');
  await page.getByRole('button',{name:'回到任务',exact:true}).click();await expect(heading(page,'Agent 已排好准备工作的顺序')).toBeVisible();await forward(page,'path');await expect(heading(page,'先把资料核对清楚')).toBeVisible();
  await page.getByRole('button',{name:'重新开始',exact:true}).click();await page.getByRole('button',{name:'确认重新开始',exact:true}).click();
  await page.clock.runFor(60000);await expect(heading(page,'给你的 Agent，加上 YourTurn。')).toBeVisible();
});

test('modes and saved settings really change invitations and distinguish AI choices',async({page})=>{
  await page.clock.install();await start(page,'快速完成');await toMain(page);await answer(page);
  for(const phase of ['candidate','assessed','autoRelation','autoInteraction'])await forward(page,phase);
  await expect(heading(page,'这次，你参与了 1 次判断。')).toBeVisible();await expect(heading(page,'Agent 沿用低压力的表达')).toBeVisible();
  await start(page,'练习判断');await toMain(page);await answer(page);await forward(page,'candidate');await forward(page,'assessed');
  await expect(heading(page,'工具之间的关系，怎么讲更清楚？')).toBeVisible();await page.clock.runFor(60000);await expect(heading(page,'工具之间的关系，怎么讲更清楚？')).toBeVisible();
  await page.getByRole('button',{name:/按场景逐页对照/}).click();await answer(page);await forward(page,'autoRelation');await page.getByRole('button',{name:/匿名问题收集/}).click();await answer(page);
  await expect(heading(page,'这次，你参与了 3 次判断。')).toBeVisible();await expect(page.locator('.recap-impact')).toContainText('按场景逐页对照');
  await start(page);await toMain(page);await page.getByRole('button',{name:'参与设置',exact:true}).click();
  await page.getByLabel('单个任务中，你通常最多接受几次 Your Turn？').selectOption('0');await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await answer(page);for(const phase of ['candidate','assessed','autoRelation','autoInteraction'])await forward(page,phase);
  await expect(heading(page,'这次，你参与了 1 次判断。')).toBeVisible();
});

for(const size of [{width:1280,height:720},{width:390,height:844},{width:360,height:800}]){
  test(`all primary screens fit ${size.width}x${size.height} without vertical scrolling`,async({browser,baseURL})=>{
    test.setTimeout(90000);
    const context=await browser.newContext({baseURL,viewport:size,isMobile:size.width<600,hasTouch:size.width<600});
    const page=await context.newPage();await page.clock.install();
    try{
      await page.goto('/');await fits(page,'install');await page.screenshot({path:`verification/12-install-${size.width}.png`});
      await activate(page);await fits(page,'profile');await expect.poll(()=>page.locator('.intro-person img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
      await page.screenshot({path:`verification/13-profile-${size.width}.png`});
      await page.getByRole('button',{name:'参与设置',exact:true}).click();await fits(page,'settings');await page.getByRole('button',{name:'保存设置',exact:true}).click();
      await page.getByRole('button',{name:'开始备课 →',exact:true}).click();await fits(page,'path');await forward(page,'path');await fits(page,'research');for(let i=0;i<3;i++)await forward(page,'auto');
      await fits(page,'main');await page.screenshot({path:`verification/14-main-${size.width}.png`});await page.getByRole('button',{name:'补充想法',exact:true}).click();await fits(page,'note');await page.getByRole('button',{name:'保留这条备注',exact:true}).click();
      await answer(page);await fits(page,'candidate');await forward(page,'candidate');await fits(page,'assessed');await forward(page,'assessed');await fits(page,'autoRelation');await forward(page,'autoRelation');
      await fits(page,'interaction');await page.screenshot({path:`verification/15-interaction-${size.width}.png`});await answer(page);await fits(page,'recap');await artifactPages(page,`${size.width}`);
      await page.getByRole('button',{name:'它会怎样更懂 Dawn →',exact:true}).click();await fits(page,'learning');await page.screenshot({path:`verification/16-learning-${size.width}.png`});
      await page.getByRole('button',{name:'这版可以去备课了',exact:true}).click();await page.clock.runFor(3600);await fits(page,'customer-message');await page.getByRole('button',{name:'先保留这一版',exact:true}).click();await fits(page,'accepted');
    }finally{await context.close();}
  });
}

