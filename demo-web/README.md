# Your Turn · Dawn 交互 Demo

公开体验：[your-turn-demo.vercel.app](https://your-turn-demo.vercel.app)。无需登录，可在电脑和手机浏览器打开。

Dawn 要为银行客户准备一场 60 分钟 AI 办公培训。Your Turn 把培训主线留给她练习判断，把现场互动留给她选择适合自己的表达，其余工作继续 Auto。

这是同一仓库内可独立运行的 Web Demo，使用 React、esbuild 和本地状态，不需要 API key。真实 DSH 插件保留为产品实现与源码证据；Demo 复用它的界面和召回策略纯函数，通过预设情境展示完整体验。

## 本地运行

使用 Node.js 22 或更新版本，在 **`demo-web/` 目录内**执行：

```sh
npm ci --workspaces=false
npm run dev
```

打开 `http://127.0.0.1:4173/`。可通过 `PORT` 环境变量更换端口。`npm run build` 生成 `dist/`；刷新页面或点击「重新开始」可重置本次体验。

## 连接 Vercel

当前生产版由 Vercel CLI 发布。若从 GitHub 新建项目，导入 `your-turn-lab/your-turn-dsh` 并使用以下设置：

| 设置 | 值 |
| --- | --- |
| Root Directory | **`demo-web`** |
| Framework Preset | **Other** |
| Install Command | `npm ci --workspaces=false` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 22.x 或更新的受支持版本 |
| 环境变量 | 无需设置 |

`vercel.json` 已包含构建命令和输出目录。确认 Production Branch 指向包含 Demo 的分支；无需执行仓库根目录的 pnpm 命令，也不需要 Root Directory 以外的文件。

部署后，用未登录的浏览器窗口检查公开链接，确保评委无需登录 Vercel 即可访问。相关设置见 [Vercel 构建配置](https://vercel.com/docs/builds/configure-a-build) 与 [Deployment Protection](https://vercel.com/docs/deployment-protection)。

当前 GitHub 自动部署尚未连接：需要项目所有者在 Vercel 添加 GitHub Login Connection，再授权此仓库。此前仍可使用 CLI 发布 `zhongkesong-p0-1-2` 分支的更新。

## 选择会怎样影响结果

- **任务模式实际参与召回判断。** 在默认长任务和默认偏好下，快速完成、平衡模式、练习判断分别产生 1、2、3 次邀请；修改个人偏好后，次数可能变化。每次判断采用真实插件的召回策略纯函数，候选标签、上下文和逻辑时钟由 Demo 提供。
- **选项实际改变培训方案。** 三种培训主线、三种互动方式、两类客户和两种关系呈现组合成 36 组预设方案，议程总时长均为 60 分钟。选择会改变议程、案例或讲稿；自由文字会记录为待人工应用的要求，不会被模型自动理解。
- **Auto 连续推进。** 培训主线邀请强调 Dawn 想培养的讲课逻辑，现场互动邀请关注她的表达风格与客户情境。其他节点按当前策略继续执行；可暂停、回看，也可查看为什么某个候选没有召回。
- **My Turn 是可选支线。** 验收首轮结果后，客户消息带来新的授课对象要求。Dawn 可以从任务路径中的案例节点修改，保留前面的判断并更新后续内容，也可以结束体验。
- **长期变化是示意。** 权重调整会改变图中的未来路由，用于解释个体化判断分配；这不代表已经完成长期实测或自动学习。

## 实现与替换位置

| 文件 | 用途 |
| --- | --- |
| `src/copy.mjs`、Dawn 画像资源 | 人物介绍与界面文案；公开版本不包含采访原稿、真实公司或受访者姓名 |
| `src/scenario.mjs` | 任务要求、节点、选项、方案模板、播放节奏 |
| `src/policy.mjs` | 情境输入与真实召回策略的连接 |
| `src/state.mjs` | 集中的状态流、偏好、判断、节点状态和成果版本 |
| `src/app.jsx`、`src/styles.css` | 聊天界面、画像页、进度与交互样式 |
| `src/plugin-adapter.jsx` | 原插件 UI 与本地 `state` / `dispatch` 的桥接 |
| `src/vendor/` | 原插件 UI、召回策略纯函数、来源记录与许可证 |
| `scripts/build.mjs` | 独立构建和依赖边界检查 |

`src/vendor/plugin-client.jsx` 保留真实插件的浮动任务路径、节点卡片、抽屉、编辑器和结果视图；问题卡片样式来自固定版本的 DSH 客户端。当前邀请统一显示 Your Turn，邀请理由写在具体任务中，不使用旧的召回分类。Demo 的字体、点击引导和外围页面使用独立样式，未修改真实插件源码、根目录依赖或运行配置。

UI 与策略快照的来源和校验值记录在 `src/vendor/` 中。后续同步真实产品时，更新对应快照与来源记录，核对适配器状态格式，再运行验证。不要直接从仓库父目录导入源码或引入 DSH runtime，以保持 `demo-web/` 可以单独部署。

## 验证

```sh
npm run verify
npx playwright install chromium --only-shell
npm run test:browser
```

单元检查覆盖状态流、模式和选项变化、播放控制及源码隔离；浏览器检查验证可点击流程、节点编辑、结果和布局。浏览器测试使用独立的无头 Chromium，可通过 `PORT` 指定端口。截图与构建依赖清单输出到已忽略的 `verification/` 目录。

若验证线上版本，先设置 `DEMO_BASE_URL=https://your-turn-demo.vercel.app`，再运行 `npm run test:browser`；此时不会启动本地服务器。检查包括无登录访问和 360 / 390 宽度触屏模拟，不等于所有实体手机与 Safari 的实机测试。
