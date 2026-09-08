# Your Turn for DSH

> Keep people where their judgment matters.

Your Turn 是一个 DeepSeek Harness Web 插件，起源于中国人民大学 Build with Care 黑客松，并获「最佳创意奖」。

当前项目继续探索一个更具体的问题：当 Agent 可以长时间自主执行时，如何在有限的人类注意力下，把人的参与留给真正值得人判断的地方，同时让其余执行尽量自主完成。

## 版本状态

- `renmin-v1`：人大 Build with Care 获奖原型基线。
- `zhongkesong-2026`：当前迭代分支，产品与工程方案正在继续收敛。
- `main`：目前保留人大版本的稳定基线。

## Renmin v1 已实现能力

- **实时路径**：显示主步骤、子步骤、当前状态与简要结果。
- **My Turn**：打开任意未完成节点，修改协作方式、整体要求或具体子步骤。
- **Your Turn**：Agent 在重要方向选择或值得用户练习的判断处暂停。
- **两类召回**：成长型召回让用户先判断、Agent 反馈、用户确认；结果型召回提供 2–3 个具体方向。
- **决策影响**：记录人的决定以及受影响的后续节点。
- **会话恢复**：根据 DSH 标准工具事件重建任务路径。

> 上述能力描述对应 `renmin-v1` 获奖原型。当前 `zhongkesong-2026` 分支正在重新收敛产品重点，后续机制不以此处的旧分类为最终定义。

## 工作原理

插件向当前 DSH Agent 注册七个结构化工具：

- `publish_task_plan`
- `update_task_node`
- `update_task_substep`
- `revise_task_node`
- `finish_task_run`
- `suggest_human_involvement`
- `request_human_decision`

Agent 根据实际任务生成路径并上报进度。插件将状态按 Session 隔离，通过 DSH Connection RPC 同步到 `shell.overlay` 侧边栏。`request_human_decision` 使用 DSH 原生问题卡暂停当前工具调用，回答后在同一个 Agent turn 内继续。

当任意 DSH 问题卡中的回答改变交付形式、范围或方法时，Agent 会通过 `revise_task_node` 同步对应路径节点。最终回答前，`finish_task_run` 会检查每个节点都已完成或因范围变化明确跳过。若本轮已经结束但路径仍未闭合，侧边栏会显示“路径待同步”，不会把未验证的节点自动标为完成。

插件不会展示或推断模型的隐藏思维过程，只呈现显式计划、动作、证据、产物和用户决策。

## 环境要求

- Node.js 20 或更新版本
- pnpm 9 或更新版本
- DeepSeek Harness `0.1.2-rc.1`
- DSH Web 中可正常使用的模型 Provider

## 从 GitHub 安装

打开 macOS Terminal、Windows PowerShell 或 Linux 终端，在任意目录中逐行执行：

```bash
pnpm dlx @deepseek-ai/dsh plugin --profile web add github:your-turn-lab/your-turn-dsh
pnpm dlx @deepseek-ai/dsh web
```

第二条命令会启动 DSH Web。请打开终端输出的完整地址；如果浏览器提示需要认证，请重新打开该地址。

卸载：

```bash
pnpm dlx @deepseek-ai/dsh plugin --profile web remove your-turn-dsh
```

如果已经全局安装 DSH，也可以将 `pnpm dlx @deepseek-ai/dsh` 简写为 `dsh`。

## 本地开发

```bash
git clone https://github.com/your-turn-lab/your-turn-dsh.git
cd your-turn-dsh
pnpm install
pnpm run build:client
pnpm run dev:link
dsh web --port 3081
```

修改前端后重新执行 `pnpm run build:client` 并刷新 DSH Web。

## 如何触发

以下规则描述当前 `renmin-v1` 原型行为：

1. 在任何实质执行前发布用户可理解的任务路径。
2. 在工作真实发生后更新主步骤和子步骤。
3. 默认自动完成搜索、整理、格式化和可逆执行。
4. 仅在成长价值高或显著影响结果且依赖用户取舍时召回。

是否展示路径与用户身份无关；“实习生、大学生、初级从业者”等身份只影响是否适合进行成长型召回。召回位置由当前模型结合任务、用户角色、已有证据和后续影响动态判断，不保证所有场景都能准确识别。

当前中客松迭代正在重新研究和明确：什么情况下值得占用人的有限注意力，以及如何把这部分判断从较隐性的 Agent 行为变成更可观察、可验证的产品机制。

## 模型配置

Your Turn 不保存 API Key，也不直接发起独立模型请求。它使用当前 DSH Session 已选择的 Provider 和模型。只要普通 DSH 会话能够正常回复，插件即可使用同一 Agent 循环。推荐在 DSH Web 的 **Settings → Models** 中配置 Provider。

## 隐私与安全

- 不包含遥测、分析 SDK 或独立网络请求。
- 不读取、记录或上传 Provider API Key。
- 路径状态来自当前 DSH Session 的显式工具事件。
- 主动修改使用 `agent.steer()`，只会在可用的执行边界生效。
- 已经发生的文件修改或外部副作用不会被自动回滚。

## 当前限制

- 路径和召回质量依赖模型遵守工具协议及其上下文理解。
- 陌生、目标模糊或证据不足的任务可能出现漏召回、误召回或路径抽象不准确。
- 若模型一次自动补救后仍未同步路径，侧边栏会提供“让 Agent 核对路径”入口。
- 侧边栏中的主动编辑记录目前不会在插件进程重启后完整恢复。
- 当前没有浏览器端自动化测试。
- 当前仅验证 DSH `0.1.2-rc.1`，其他版本尚未承诺兼容。

## 验证

```bash
pnpm run verify
pnpm pack --dry-run
```

## 团队与贡献

### Renmin v1 · 初始原型

- **[@luoqingru2017-blip](https://github.com/luoqingru2017-blip)**：项目发起与产品主导。负责问题定义、整体产品方向与范围收敛、用户研究、项目推进、Demo 场景与路演。具体产品方案在这一框架下，与 @caracacara22 持续共同讨论和迭代决定。
- **[@caracacara22](https://github.com/caracacara22)**：产品共创、设计与工程主力。参与产品方向与关键机制讨论，主要负责初版插件的技术实现、交互与视觉落地，并参与 Demo 与路演方案完善。

### Zhongkesong 2026 · 当前迭代

当前阶段的成员与贡献将在实际工作发生后持续记录。

## 参与贡献

欢迎提交 Issue 和 Pull Request。较大改动前，请先通过 Issue 描述问题、预期行为和验证方式。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE)
