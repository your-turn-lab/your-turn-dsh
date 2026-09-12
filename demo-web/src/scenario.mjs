// Replaceable scenario copy and illustrative values; never a live agent policy.
export const scenario = {
  sourceCommit: '919f335e847eb2358379947b3571da8cf74fc884', sourceBranch: 'zhongkesong-p0-1-2', name: 'Dawn',
  identity: '毕业约一年 · 企业培训讲师 · 需要亲自面对客户授课',
  opening: '这场培训要由我亲自讲。主线和现场表达，我想自己拿定；资料和课件，尽量交给你。',
  promise: '我来推进任务，值得你判断时叫你回来。你也可以随时接手。',
  playbackMs: { path: 1400, auto: 1100, candidate: 2800, assessed: 3600, autoRelation: 2200, rerunning: 1800 },
  prompt: '请帮我为银行客户准备一场 60 分钟的 AI 办公产品培训。我需要亲自讲授，希望有一条清楚的培训主线、一个贯穿案例、文档／表格／知识库之间的关系，以及适合现场的互动。先核对材料与术语，再产出可以用于备课的培训方案。',
  retained: '培训主线、客户语境和我在现场说得出口的表达', delegated: '资料核对、素材整理、术语检查、可逆的课件编排',
  mainNote: '后半段一定要进入团队协作和知识复用，不能停留在个人提效。', interactionNote: '自然、低压力。我不采用自己说不出口的冷幽默。',
  clientMessage: 'Dawn，参会范围临时调整了，这次只有科技部门参加。请把案例改得更贴近我们的日常工作。',
  revision: '本次只有科技部门参加。请改用“系统变更与故障复盘”作为贯穿案例：个人整理记录 → 团队协同核对 → 知识库沉淀。不要再以全行通用办公为主要场景。',
  mainOptions: [['个人办公 → 团队协作 → 知识复用','从个人提效进入团队共同工作，再形成可复用的知识。'],['业务痛点 → 场景演练 → 团队复盘','先建立痛点共识，再用演练串起协作和知识复用。'],['贯穿案例 → 工具拆解 → 迁移应用','从完整工作过程入手，最后迁移到团队场景。']],
  interactionOptions: [['自然、低压力的痛点投票','举手或默选都可以，不点名，不要求讲笑话。'],['匿名问题收集','先写下困扰，再选择共性问题现场演示。'],['两人交流一个工作痛点','给短暂的同伴交流时间，再自愿分享。']],
  questions: [
    { header: '打断频率', question: '你希望我什么时候暂停下来问你？', options: [['只问关键风险','多数情况自动推进。'],['重要判断问我','方向、偏好、关键判断会问你，普通执行自动推进。'],['多给我参与','有练习价值或需要判断时更积极地问你。']] },
    { header: '方向偏好', question: '遇到风格、方向、取舍选择时，你更希望怎么处理？', options: [['你先自动选','AI 根据上下文选择。'],['重要选择问我','影响结果的偏好选择先问你。'],['多数选择问我','明显涉及你的偏好时，倾向先问你。']] },
    { header: '学习目标', question: '你希望这个插件更多帮助你完成任务，还是帮助你练习判断？', options: [['快速完成','少打断，优先交付。'],['平衡参与','重要处参与，其他地方自动推进。'],['练习判断','有学习价值时，更常让你先想。']] },
    { header: '打断上限', question: '单个任务中，你通常最多接受几次 Your Turn？', options: [['1 次以内','只保留最关键的一次。'],['2 到 3 次','适合中等或较长任务。'],['有价值就问','可以多问，但不要连续打断。']] },
  ],
  policy: { threshold: 0.65, maxRecall: 3,
    main: { recallValue: 0.86, autoRisk: 0.72, humanValue: 0.92 }, relation: { recallValue: 0.48, autoRisk: 0.2, humanValue: 0.76 }, interaction: { recallValue: 0.82, autoRisk: 0.6, humanValue: 0.94 },
    candidateReasons: ['主线已明确，现有上下文足够。','关系页可以修改，调整成本低。','把注意力留给更需要你的现场表达。'],
  },
  learning: { labels: ['关键方向与结果责任','学习与专业判断','现场表达与个人偏好'], initial: [75,30,30], evolved: [80,75,90], threshold: 0.55,
    candidates: [{ title: '培训主线取舍', tags: [0.95,0.5,0.45] },{ title: '现场互动表达', tags: [0.2,0.75,1] },{ title: '课件关系排版', tags: [0.15,0.15,0.2] }],
  },
};
export const nodeFixtures = [
  { id: 'research', title: '资料核对', objective: '把客户信息、产品材料与可用边界核对清楚。', steps: ['核对培训边界','整理可用素材','检查产品术语'], results: ['60 分钟；银行客户；Dawn 亲自授课。','示例素材已整理为个人办公、团队协作、知识复用三组。','统一使用文档、表格、知识库、团队归档；未验证功能不作承诺。'] },
  { id: 'main', title: '培训主线', objective: '决定这 60 分钟按什么逻辑组织，明确后续课件方向。', steps: ['确定培训逻辑','分配 60 分钟'], results: ['','开场 5 分钟、个人办公 15 分钟、团队协作 20 分钟、知识复用 15 分钟、收束 5 分钟。'] },
  { id: 'case', title: '贯穿案例', objective: '用一个客户理解的工作场景贯穿培训。', steps: ['确定授课对象与案例','串联案例产物'], results: ['银行跨部门办公：会议记录到团队行动清单。','文档提炼记录 → 表格跟进行动 → 知识库复用经验。'] },
  { id: 'relation', title: '课件关系呈现', objective: '呈现文档、表格、知识库与团队归档的关系。', steps: ['评估是否召回','组织关系页'], results: ['上下文充分、可逆、有限打扰，继续 Auto。','文档承载过程，表格协同执行，知识库沉淀经验，团队归档保留依据。'] },
  { id: 'interaction', title: '现场互动', objective: '选择既适合客户，也适合 Dawn 本人表达的互动。', steps: ['选择互动方式','准备现场话术'], results: ['','“哪件事最占用大家的时间？可以举手，也可以先在心里选。”'] },
  { id: 'output', title: '最终输出', objective: '汇总培训方案，并记录 Dawn 的判断如何改变结果。', steps: ['汇总备课方案','检查时间与要求'], results: ['培训主线、贯穿案例、关系页和互动话术已合并。','合计 60 分钟；后半段包含团队协作与知识复用。'] },
];
export function makeArtifact(s) {
  const tech = s.version > 1 && /科技|系统|故障|技术/.test(s.revisionInstruction);
  const titles = s.mainChoice === 1 ? ['开场与目标','业务痛点与个人办公','场景演练与团队协作','团队复盘与知识复用','收束与下一步'] : s.mainChoice === 2 ? ['开场与案例预览','贯穿案例与个人办公','工具拆解与团队协作','迁移应用与知识复用','收束与下一步'] : ['开场与工作痛点','个人办公：从原始记录到清晰文档','团队协作：任务、责任人与共同核对','知识复用：经验沉淀与团队归档','回顾与问答'];
  const scripts = [tech ? '“变更记录整理、跨组核对、故障经验查找，哪件事最耗时间？可以举手，也可以默选。”' : '“整理记录、跟进协作、查找经验，哪件事最耗时间？可以举手，也可以默选。”','“请匿名写下一件最想减少的重复工作，我们挑一个共性问题一起看。”','“请和身边的人聊一分钟最近遇到的工作痛点。愿意的话，可以分享一个。”'];
  return {
    version: s.version, audience: s.version === 1 ? '银行客户 · 跨部门办公用户' : tech ? '银行科技部门' : '按 My Turn 新要求调整的授课对象',
    caseTitle: tech ? '系统变更与故障复盘' : s.version > 1 ? '按 My Turn 要求修订的贯穿案例' : '会议记录到团队行动清单',
    agenda: titles.map((title,i) => ({ title, minutes: [5,15,20,15,5][i] })),
    prompt: s.prompt, main: scenario.mainOptions[s.mainChoice][0], interaction: scenario.interactionOptions[s.interactionChoice][0],
    notes: `${s.mainNote}\n${s.interactionNote}`, requirements: s.revisionInstruction || '银行跨部门办公；素材使用虚构内容。', script: scripts[s.interactionChoice],
    caseSteps: tech ? ['个人办公：把虚构故障记录整理成复盘文档。','团队协作：表格列出影响范围、负责人、整改动作和核对状态。','知识复用：把核对后的原因、处理步骤和适用边界沉淀到知识库。'] : ['个人办公：把虚构会议记录整理为摘要与待办。','团队协作：表格明确负责人、时间和状态，协同核对。','知识复用：提炼可复用经验，关联原始文档并归档。'],
    relation: tech ? '复盘文档 → 整改跟踪表 → 运维知识库 → 团队变更归档' : '会议文档 → 行动清单表格 → 经验知识库 → 团队归档',
    slides: ['任务目标与工作痛点','贯穿案例与虚构素材','个人办公：整理文档','从文档到共同任务','团队表格：分工与核对','文档／表格／知识库／归档关系','现场互动与案例演练','知识复用与适用边界','回顾与行动建议'],
    boundaries: '这是 fixture 备课成果，未执行真实检索或验证特定产品功能。演练仅用虚构材料。',
  };
}
