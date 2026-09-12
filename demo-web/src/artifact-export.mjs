export function artifactMarkdown(a) {
  const author = key => a.actors[key] === 'Dawn' ? 'Dawn 的判断' : 'AI 沿用偏好代选';
  return `# Dawn · 60 分钟 AI 办公培训 · V${a.version}

${a.boundaries}

## 授课对象
${a.audience}

## 讲课主线 · ${author('main')}
${a.main}
${a.mainImpact}

${a.agenda.map(x => `- ${x.minutes} 分钟：${x.title}。${x.description}`).join('\n')}

## 课堂里的例子
${a.caseTitle}
${a.caseSteps.join('\n')}

## 工具关系 · ${author('relation')}
${a.relationFormat}
${a.relation}

## 现场互动 · ${author('interaction')}
${a.interaction}
${a.script}

## 课件页序
${a.slides.map((x, i) => `${i + 1}. ${x}`).join('\n')}

## 保留的备注
${a.notes}

## 额外要求 · ${a.requirementsStatus}
${a.pendingRequirements.length ? a.pendingRequirements.join('\n\n') : '无额外自由文字要求。'}

## 本次任务原文
${a.prompt}
`;
}
