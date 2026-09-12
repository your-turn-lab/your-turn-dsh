// Replaceable scenario copy and illustrative values; never a live agent policy.
export const scenario = {
  sourceCommit: '919f335e847eb2358379947b3571da8cf74fc884', sourceBranch: 'zhongkesong-p0-1-2', name: 'Dawn',
  identity: '毕业约一年 · 企业培训讲师 · 需要亲自面对客户授课',
  opening: '这场培训要由我亲自讲。主线和现场表达，我想自己拿定；资料和课件，尽量交给你。',
  promise: '我来推进任务，值得你判断时叫你回来。你也可以随时接手。',
  playbackMs: { installing: 2600, path: 4000, auto: 3800, autoMain: 4000, autoInteraction: 4000, candidate: 5000, assessed: 5500, autoRelation: 3800, rerunning: 3500 },
  prompt: '请帮我为银行客户准备一场 60 分钟的 AI 办公产品培训。我需要亲自讲授，希望有一条清楚的培训主线、一个贯穿案例、文档／表格／知识库之间的关系，以及适合现场的互动。先核对材料与术语，再产出可以用于备课的培训方案。',
  retained: '培训主线、客户语境和我在现场说得出口的表达', delegated: '资料核对、素材整理、术语检查、可逆的课件编排',
  mainNote: '后半段一定要进入团队协作和知识复用，不能停留在个人提效。', interactionNote: '自然、低压力。我不采用自己说不出口的冷幽默。',
  clientMessage: 'Dawn，参会范围临时调整了，这次只有科技部门参加。请把案例改得更贴近我们的日常工作。',
  revision: '本次只有科技部门参加。请改用“系统变更与故障复盘”作为贯穿案例：个人整理记录 → 团队协同核对 → 知识库沉淀。不要再以全行通用办公为主要场景。',
  mainOptions: [['个人办公 → 团队协作 → 知识复用','从个人提效进入团队共同工作，再形成可复用的知识。'],['业务痛点 → 场景演练 → 团队复盘','先建立痛点共识，再用演练串起协作和知识复用。'],['完整案例 → 工具拆解 → 迁移应用','从完整工作过程入手，最后迁移到团队场景。']],
  interactionOptions: [['自然、低压力的痛点投票','举手或默选都可以，不点名，不要求讲笑话。'],['匿名问题收集','先写下困扰，再选择共性问题现场演示。'],['两人交流一个工作痛点','给短暂的同伴交流时间，再自愿分享。']],
  // These are local, editable course branches, not generated model responses.
  audiences: {
    general: {
      audience: '银行客户 · 跨部门办公用户', caseTitle: '小微企业信贷业务推进',
      record: '虚构客户资料摘要', table: '补件与协作清单', knowledge: '资料准备经验库', archive: '团队项目归档',
      source: '虚构的客户来件与沟通记录', problem: '资料反复补齐、跨部门核对与经验查找',
      transfer: '把同一套资料整理方法迁移到另一份虚构客户来件',
    },
    technology: {
      audience: '银行科技部门', caseTitle: '系统变更与故障复盘',
      record: '虚构故障复盘文档', table: '整改跟踪表', knowledge: '运维知识库', archive: '团队变更归档',
      source: '虚构的变更记录与故障日志', problem: '变更信息整理、跨组核对与故障经验查找',
      transfer: '把同一套复盘方法迁移到另一份虚构变更记录',
    },
  },
  mainPlans: [
    {
      impact: '先演示个人整理，再把重点放到团队核对；再用 15 分钟沉淀可复用经验。',
      agenda: [
        { title: '开场与工作痛点', minutes: 5, description: '用{caseTitle}介绍今天要完成的一份工作。' },
        { title: '个人办公：整理原始资料', minutes: 15, description: '把{source}整理成{record}，现场核对遗漏。' },
        { title: '团队协作：分工与共同核对', minutes: 20, reserveInteraction: true, description: '将摘要变成{table}，明确责任人与核对状态。' },
        { kind: 'interaction' },
        { title: '知识复用：让下次少做一遍', minutes: 15, description: '把已核对的方法放进{knowledge}，关联原始记录并归档。' },
        { title: '回顾与问答', minutes: 5, description: '回看个人、团队、知识三个层次，各留一条可带走的做法。' },
      ],
      caseSteps: ['个人办公：从{source}中提炼{record}。', '团队协作：共编{table}，逐项确认责任人与缺失信息。', '知识复用：将已核对的方法写入{knowledge}，在{archive}保留来源。'],
      slides: ['今天一起完成：{caseTitle}', '原始素材：{source}', '个人办公：整理{record}', '从个人摘要到共同任务', '团队协作：{table}', '{relation}', '{interaction}', '知识复用：{knowledge}', '回顾：下次从哪里开始'],
    },
    {
      impact: '从大家的痛点开场，留出 25 分钟共同演练，再用 10 分钟复盘并整理团队做法。',
      agenda: [
        { title: '业务痛点：先找最卡的一步', minutes: 12, reserveInteraction: true, description: '摆出{problem}三个具体困难，建立本次演练的问题清单。' },
        { kind: 'interaction' },
        { title: '拆开问题，示范第一步', minutes: 8, description: '示范从{source}中找出遗漏信息，不从工具功能清单讲起。' },
        { title: '场景演练：一起把工作推进', minutes: 25, description: '沿{caseTitle}完成摘要和{table}，共同核对每次交接。' },
        { title: '团队复盘：把做法留下来', minutes: 10, description: '比较演练前后的卡点，把一条可复用做法写进{knowledge}。' },
        { title: '收束：带走一个动作', minutes: 5, description: '每人默选一个明天能用的动作；无需逐个发言。' },
      ],
      caseSteps: ['找痛点：检查{source}，标出缺信息和交接不清的地方。', '共同演练：分角色整理{record}、填写{table}，核对交接结果。', '团队复盘：对照开始的卡点，找出哪一步减少了反复确认。', '沉淀做法：将核对清单写入{knowledge}，关联{archive}。'],
      slides: ['最卡在哪里：{problem}', '{interaction}', '今天要解决的问题清单', '拆开一份{source}', '演练任务：{caseTitle}', '角色分工与{table}', '{relation}', '复盘：哪一步减少了返工', '团队做法：{knowledge}', '明天先做一个动作'],
    },
    {
      impact: '先看 10 分钟完整案例，再拆解工具如何衔接；最后用另一份材料检验能否迁移。',
      agenda: [
        { title: '完整案例：先看工作怎样完成', minutes: 10, description: '连续演示{caseTitle}从原始资料到归档的完整过程。' },
        { title: '工具拆解：每一步用什么', minutes: 18, description: '逆向拆开{record}、{table}与{knowledge}各自承担的工作。' },
        { title: '迁移应用：换一份材料试试', minutes: 17, reserveInteraction: true, description: '{transfer}，比较哪些步骤可以保留。' },
        { kind: 'interaction' },
        { title: '迁移复盘：保留方法和边界', minutes: 10, description: '把迁移后的流程写成团队模板，记下仍需人工核对的信息。' },
        { title: '回顾与下一步', minutes: 5, description: '回到完整案例，让大家指出自己下次会从哪一步开始。' },
      ],
      caseSteps: ['完整演示：展示{caseTitle}从{source}到{archive}的成品链路。', '逆向拆解：逐个打开{record}、{table}和{knowledge}，解释交接依据。', '换材料迁移：{transfer}，重新走一遍信息核对与团队交接。', '形成模板：保留通用步骤，标出适用条件和必须人工判断的部分。'],
      slides: ['完整案例：{caseTitle}', '先看成果：从{record}到{archive}', '倒推第一步：{source}', '工具拆解：文档与{table}', '{relation}', '换一份虚构材料', '迁移任务：哪些做法还能用', '{interaction}', '形成团队模板：{knowledge}', '适用边界与下一步'],
    },
  ],
  interactionPlans: [
    { minutes: 3, title: '痛点投票：举手或默选',
      description: '用三个具体困难做投票，允许默选，不点名；按票数选一个例子继续讲。',
      impact: '留出 3 分钟投票；可以默选，不点名，也不需要用笑话暖场。',
      scripts: { general: '“补件来回沟通、跨部门核对、查找过去做法，哪件事最耗时间？可以举手，也可以默选。我按大家的选择往下演示。”', technology: '“变更记录整理、跨组核对、故障经验查找，哪件事最耗时间？可以举手，也可以默选。我按大家的选择往下演示。”' },
    },
    { minutes: 5, title: '匿名收集：挑一个共性问题',
      description: '用 2 分钟匿名写问题，1 分钟归类，2 分钟演示一个共性问题的处理起点。',
      impact: '留出 5 分钟匿名收集和归类；不公开署名，选一个共性问题现场示范。',
      scripts: { general: '“请匿名写下资料准备或跨部门补件中最想少做的一件重复工作。不用写客户信息。我们一起挑一个共性问题看怎么开始。”', technology: '“请匿名写下变更核对或故障复盘中最想少做的一件重复工作。不用写系统名称。我们一起挑一个共性问题看怎么开始。”' },
    },
    { minutes: 7, title: '两人交流：找一个共同卡点',
      description: '给 2 分钟同伴交流，2 分钟整理共同卡点，3 分钟自愿分享与讲师回应。',
      impact: '留出 7 分钟同伴交流和回应；先与身边的人聊，再自愿分享。',
      scripts: { general: '“请和身边的人聊两分钟：从收到资料到交给下一位同事，哪一步最容易反复确认？一起选一个卡点。愿意的话，再分享给大家。”', technology: '“请和身边的人聊两分钟：从变更记录到故障复盘，哪一步最容易跨组反复确认？一起选一个卡点。愿意的话，再分享给大家。”' },
    },
  ],
  relationOptions: [['一张流程关系图', '在同一页看清资料如何在文档、表格、知识库和归档之间流转。'], ['按场景逐页对照', '用四页分别比较原始资料、协作核对、经验复用和团队归档。']],
  questions: [
    { header: '打断频率', question: '你希望我什么时候暂停下来问你？', options: [['只问关键风险','多数情况自动推进。'],['重要判断问我','方向、偏好、关键判断会问你，普通执行自动推进。'],['多给我参与','有练习价值或需要判断时更积极地问你。']] },
    { header: '方向偏好', question: '遇到风格、方向、取舍选择时，你更希望怎么处理？', options: [['你先自动选','AI 根据上下文选择。'],['重要选择问我','影响结果的偏好选择先问你。'],['多数选择问我','明显涉及你的偏好时，倾向先问你。']] },
    { header: '学习目标', question: '你希望这个插件更多帮助你完成任务，还是帮助你练习判断？', options: [['快速完成','少打断，优先交付。'],['平衡参与','重要处参与，其他地方自动推进。'],['练习判断','有学习价值时，更常让你先想。']] },
    { header: '打断上限', question: '单个任务中，你通常最多接受几次 Your Turn？', options: [['1 次以内','只保留最关键的一次。'],['2 到 3 次','适合中等或较长任务。'],['有价值就问','可以多问，但不要连续打断。']] },
  ],
  policy: {    candidateReasons: ['主线已明确，现有上下文足够。','关系页可以修改，调整成本低。','把注意力留给更需要你的现场表达。'],
  },
  learning: { labels: ['关键方向与结果责任','学习与专业判断','现场表达与个人偏好'], initial: [75,30,30], evolved: [80,75,90], threshold: 0.55,
    candidates: [{ title: '培训主线取舍', tags: [0.95,0.5,0.45] },{ title: '现场互动表达', tags: [0.2,0.75,1] },{ title: '课件关系排版', tags: [0.15,0.15,0.2] }],
  },
};
export const nodeFixtures = [
  { id: 'research', title: '先核对资料', objective: '把客户信息、产品材料与可用边界核对清楚。', steps: ['核对培训边界','整理可用素材','检查产品术语'], results: ['60 分钟；银行客户；Dawn 亲自授课。','示例素材已整理为个人办公、团队协作、知识复用三组。','统一使用文档、表格、知识库、团队归档；未验证功能不作承诺。'] },
  { id: 'main', title: '这堂课怎么讲', objective: '决定这 60 分钟按什么逻辑组织，明确后续课件方向。', steps: ['确定培训逻辑','分配 60 分钟'], results: ['','开场 5 分钟、个人办公 15 分钟、团队协作 20 分钟、知识复用 15 分钟、收束 5 分钟。'] },
  { id: 'case', title: '课堂用什么例子', objective: '用一个客户理解的工作场景贯穿培训。', steps: ['换成适合听众的例子','把案例里的材料串起来'], results: ['科技与业务部门共同参与：以虚构的小微企业信贷业务推进资料练习办公协作。','文档整理虚构资料 → 表格协同补件与核对 → 知识库复用资料准备经验。'] },
  { id: 'relation', title: '把工具关系讲清楚', objective: '呈现文档、表格、知识库与团队归档的关系。', steps: ['评估是否召回','组织关系页'], results: ['上下文充分、可逆、有限打扰，继续 Auto。','文档承载过程，表格协同执行，知识库沉淀经验，团队归档保留依据。'] },
  { id: 'interaction', title: '现场怎么互动', objective: '选择既适合客户，也适合 Dawn 本人表达的互动。', steps: ['选择互动方式','准备现场话术'], results: ['','“哪件事最占用大家的时间？可以举手，也可以先在心里选。”'] },
  { id: 'output', title: '整理成备课方案', objective: '汇总培训方案，并记录 Dawn 的判断如何改变结果。', steps: ['汇总备课方案','检查时间与要求'], results: ['培训主线、贯穿案例、关系页和互动话术已合并。','合计 60 分钟；后半段包含团队协作与知识复用。'] },
];
export function makeArtifact(s) {
  const index = (value, length) => Number.isInteger(value) && value >= 0 && value < length ? value : 0;
  const mainChoice = index(s.mainChoice, scenario.mainPlans.length);
  const interactionChoice = index(s.interactionChoice, scenario.interactionPlans.length);
  const relationChoice = index(s.relationChoice, scenario.relationOptions.length);
  // Audience is an explicit scenario control. Free text never changes the selected template.
  const audienceVariant = s.audienceVariant === 'technology' ? 'technology' : 'general';
  const audience = scenario.audiences[audienceVariant];
  const mainPlan = scenario.mainPlans[mainChoice];
  const interactionPlan = scenario.interactionPlans[interactionChoice];
  const render = text => text.replace(/\{(\w+)\}/g, (_, key) => audience[key] ?? `{${key}}`);
  const relation = [audience.record, audience.table, audience.knowledge, audience.archive].join(' → ');
  const relationSlides = relationChoice === 0
    ? [`一张关系图：${relation}`]
    : [`原始记录与整理结果：${audience.record}`, `协作核对前后：${audience.table}`, `经验复用前后：${audience.knowledge}`, `团队归档：${audience.archive}与原始依据`];
  const agenda = mainPlan.agenda.map(item => item.kind === 'interaction'
    ? { title: interactionPlan.title, minutes: interactionPlan.minutes, description: interactionPlan.description, kind: 'interaction' }
    : { title: render(item.title), minutes: item.minutes - (item.reserveInteraction ? interactionPlan.minutes : 0), description: render(item.description), kind: 'teaching' });
  const slides = mainPlan.slides.flatMap(title => title === '{relation}' ? relationSlides
    : title === '{interaction}' ? [`现场互动（${interactionPlan.minutes} 分钟）：${interactionPlan.title}`] : [render(title)]);
  const mainNote = s.mainNote ?? '';
  const interactionNote = s.interactionNote ?? '';
  const relationNote = s.relationNote ?? '';
  const pendingRequirements = [
    [mainNote, scenario.mainNote, '主线补充'], [interactionNote, scenario.interactionNote, '互动补充'],
    [relationNote, '', '课件补充'],
    [s.revisionInstruction, audienceVariant === 'technology' ? scenario.revision : '', '修改要求'],
    [s.prompt, scenario.prompt, '任务补充'],
  ].filter(([text, preset]) => text?.trim() && text.trim() !== preset.trim()).map(([text, , label]) => `${label}：${text}`);
  return {
    version: s.version, audience: audience.audience, audienceVariant, caseTitle: audience.caseTitle,
    agenda, slides, prompt: s.prompt, main: scenario.mainOptions[mainChoice][0], interaction: scenario.interactionOptions[interactionChoice][0],
    mainImpact: mainPlan.impact, interactionImpact: interactionPlan.impact, interactionMinutes: interactionPlan.minutes,
    actors: { main: s.decisionActors?.main ?? 'AI', interaction: s.decisionActors?.interaction ?? 'AI', relation: s.decisionActors?.relation ?? 'AI' },
    mainNote, interactionNote, relationNote, notes: [mainNote, interactionNote, relationNote].filter(Boolean).join('\n'),
    requirements: s.revisionInstruction || `${audience.audience}；素材使用虚构内容。`,
    pendingRequirements, requirementsStatus: pendingRequirements.length ? '待人工应用' : '已采用预设要求',
    script: interactionPlan.scripts[audienceVariant], caseSteps: mainPlan.caseSteps.map(render),
    relation, relationFormat: scenario.relationOptions[relationChoice][0],
    boundaries: '这是预设分支生成的备课草案，未执行真实检索；自由文本只记录，不会自动改写方案。演练仅用虚构办公资料，不涉及信贷决策建议。',
  };
}

