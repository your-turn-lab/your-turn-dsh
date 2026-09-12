# Your Turn · Dawn interactive demo

Independent front end inside `your-turn-lab/your-turn-dsh`, based on branch `zhongkesong-p0-1-2`, commit `919f335e847eb2358379947b3571da8cf74fc884`.

This is an explicitly labelled, local-state scenario, not a running DSH agent. No API key, server, model call, analytics, or authentication is needed. The real plugin remains the implementation and source evidence.

## Run locally

Use Node.js 22 or newer. From **this directory**, not the plugin repository root:

```sh
npm ci --workspaces=false
npm run dev
```

Open http://127.0.0.1:4173. `PORT` may override the local port. Production output is generated with `npm run build` into `dist/`.

```sh
npm test
npm run build
npx playwright install chromium --only-shell
npx playwright test
```

Browser tests cover the full flow with automatic progression, pause/resume, history review, original plugin editor, output download, V1/V2 comparison, reset, and viewport overflow. The 1280×720 check also keeps the judgment button within the viewport. They use a separate headless browser, never your signed-in browser. Screenshots are written to the ignored `verification/` directory. Build input evidence is `verification/build-inputs.json`.

## Vercel

After reviewing and pushing `demo-web/` to a branch in **the same GitHub repository**, import `your-turn-lab/your-turn-dsh` in Vercel as a new project. Select the branch containing the demo (the repository's default branch may be different).

| Setting | Value |
| --- | --- |
| Root Directory | **`demo-web`** |
| Framework Preset | **Other** |
| Install Command | `npm ci --workspaces=false` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 22.x or newer supported version |
| Environment variables | None |

`vercel.json` already specifies the commands and output directory. Do not run the repository's root pnpm install/build: those belong to the real plugin. Files outside Root Directory are not required. No SPA rewrite is needed because the demo uses one URL and in-memory state.

Set the Production Branch to the branch containing `demo-web/` if it is not the GitHub default. After deployment, use the production URL and check it in a signed-out/private window: it must not ask judges for a Vercel login. Adjust that project's Deployment Protection if necessary. Refresh starts a new demo; this intentionally has no resumable backend.

Official references: [build settings and Root Directory](https://vercel.com/docs/builds/configure-a-build), [Deployment Protection](https://vercel.com/docs/deployment-protection).

This implementation does not push the repository or create a Vercel deployment automatically.

## UI reuse and isolation

- `src/vendor/plugin-client.jsx` is a **byte-for-byte snapshot** of the real plugin's `src/client.jsx`. Its floating rail, launcher, hover/pinned drawer, status colors, task controls, substep editor, resize/drag behavior and decision outcome view are the real implementation. It is not restyled into a marketing page.
- `src/plugin-adapter.jsx` invokes the original `apply()` registration contract and injects a local `state` / `dispatch` bridge. No DSH connection, sessions, RPC transport, or runtime is imported. Original polling only reads in-memory state; it never advances the demo. The host refreshes the injected callback when the reducer revision changes, triggering the original UI's load effect immediately without resetting its drawer state.
- `src/vendor/question-card.css` is extracted from `@deepseek-ai/dsh-client-ui-user-questions@0.1.2-rc.1`. Question card markup and the surrounding chat shell are independent implementations using the original card class names and visual hierarchy. The DSH shell is not a full runtime replica. The demo adds a four-stage progress indicator, automatic playback controls, larger system typography and a concise decision recap. Repeated profile panels in the original drawer are hidden with demo-only CSS; preferences remain editable from Dawn's sidebar menu.
- `src/vendor/provenance.json` records the source commit and SHA-256. The licenses are included alongside the snapshots. The tests detect accidental edits to the pinned plugin snapshot.
- No plugin source, root package manifest, root lockfile, build script, installed plugin registration or runtime configuration is changed.

When the new UI arrives: copy its reviewed `src/client.jsx` into the vendor location, update source metadata/hash, and rerun browser tests. Review registration/state shape changes in the adapter. Do not import `../src` or DSH packages in this front end. This is deliberately a checked-in snapshot so deploying this directory alone works.

## Data and state

| File | Responsibility |
| --- | --- |
| `src/scenario.mjs` | Dawn, prompt, onboarding questions, node names/materials, choices, revision fixture, artifact templates, illustrative policy and learning weights |
| `src/state.mjs` | Central reducer, draft answers, phase guards, node status, decisions, versions, outcome, local store |
| `src/plugin-adapter.jsx` | Local implementation of the plugin UI's public bridge |
| `src/app.jsx` | DSH-style chat host, decisions, fixture step controls and final artifact display |
| `src/styles.css` | Chat host, display sizing and demo-only UI |
| `scripts/build.mjs` | Independent build/preview; rejects parent/DSH bundle inputs |

The main prompt, opening copy, Recall Policy numbers and playback durations are provisional, configured in `scenario.mjs`. Input remarks are recorded in outputs. Alternative supported choices change the agenda and interaction script. Arbitrary free text does not trigger model reasoning: the technology-department revision is a configured scenario, and other text is retained as requirements rather than represented as a newly inferred task.

Automatic progression is bounded to `path`, `auto`, `candidate`, `assessed`, `autoRelation` and `rerunning`. It never submits a human judgment or accepts a final result. Three research substeps and four revised nodes advance individually. Pausing, opening history or a dialog, and hiding the browser tab suspend progression. Scheduled ticks carry their originating phase/substep key; stale ticks are ignored, and React cleanup cancels them on reset. Candidate appearance, evaluation and no-recall execution remain visibly distinct; the evaluation also remains in history and the completed node.

Only presentation state (expanded history, viewed artifact tab, reset dialog, and the untouched plugin's internal drawer state) lives in React components. Domain state and meaningful input drafts live in the reducer. The original plugin may store its display positions/preference snapshot in localStorage on the demo origin; it cannot access the real DSH origin's storage.

## Walkthrough

1. Read Dawn's task and judgment preferences on one opening card. **编辑偏好** expands the original four preference questions plus retained/delegated work; **查看任务要求** exposes the editable prompt. This run explicitly uses **long task + balanced mode**. Saved preferences do not silently rewrite the fixed scenario.
2. Click **开始任务** once. The original floating path opens on desktop; the demo progress shows 建档 → 首轮任务 → 客户变更 → 结果回顾.
3. Watch three research substeps complete automatically. Use **暂停演示** if needed.
4. Your Turn ① stops until you choose **个人办公 → 团队协作 → 知识复用** and confirm the second-half requirement.
5. **Candidate → evaluation → Auto** progresses without confirmation clicks. No question card appears and no extra recall is counted. You can pause or review the record.
6. Your Turn ② waits for the low-pressure pain-point voting choice and natural-expression note.
7. The result begins with a decision-to-outcome recap. Expand **查看培训方案** to inspect/download the full 60-minute plan. **确认成果，查看客户消息** accepts this version and opens the client change.
8. In the **real path rail**, click **3. 贯穿案例**, or use **定位贯穿案例**. Click **确定授课对象与案例**, edit the prefilled technology-department draft, then use **保存并从这里重做** (the circular arrow). The first two nodes stay unchanged; four dependent nodes update automatically.
9. Inspect the final decision recap, compare V1 and V2 in the expanded artifact, and accept the result.
10. Optionally expand **继续使用，会有什么变化？**. Change the illustrative presets or weights; future routing updates. This is not longitudinal evidence or the final production algorithm.

The chosen substep editor is the actual plugin editor, including its existing hover/focus behavior. Other nodes remain inspectable; unsupported rerun branches return an explicit scenario-boundary message. Use Escape/close to dismiss a drawer. The original rail can be dragged/resized and collapsed. Header **重新开始** resets the run after confirmation. **情境演示 ⓘ** opens the concise explanation of fixture and long-term-value boundaries.

## Local verification — 2026-09-12

- Demo unit/isolation/playback tests: **14 passed**.
- Browser tests: **3 passed**, covering automatic progression, pause/history/reset, editing preferences, and 1280×720 / 390×844 layouts. The full scenario asserts rail synchronization within 500 ms, no page exceptions, and no external requests.
- Original plugin regression tests: **75 passed** (`node --test test/*.test.js`, repository root).
- Production build: passed; bundle input check found no DSH runtime or parent imports.
- Standalone copy: fresh install, tests and build passed from a temporary directory outside the repository.
- Plugin snapshot SHA-256 matches `src/client.jsx` exactly; original tracked files have no diff.
- Screenshots of Your Turn, suppressed candidate, My Turn editor and learning view were inspected locally. These checks do not constitute a live DSH runtime session or a Vercel deployment.
