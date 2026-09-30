# dsh-journal-calendar

[English](README.md) | 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的每日日志与日历。Agent 把"你做了什么、你打算做什么"记成一天一个 JSON 文件，Web UI 把这些文件画成右侧栏里的日历。

## 它贡献什么

一行组合包同时挂载三个面：

| 面 | 是什么 |
|---|---|
| Host 服务 | `journal`，覆盖 `$DSH_HOME/journal` 的 Remote 命名空间 |
| 工具 | `journal_record`，以及一条常驻职责提示词段 |
| 浏览器半边 | 日历卡片，一个右侧栏标签页 |

卡片是月历网格 + 每天的标记，下面是所选日期的 `TO DO` 与 `MEMORY` 两段。待办带勾选框，勾选直接写回当天文件。

## 安装

```sh
dsh plugin --profile web add dsh-journal-calendar
```

刷新页面，右侧栏出现 **日历** 标签页。

`dsh plugin` 会转发给 pnpm，所以机器上需要 pnpm。卸载：

```sh
dsh plugin --profile web remove dsh-journal-calendar
```

### 改为从仓库安装

npm 包里是预构建产物，不需要任何构建步骤。直接从 GitHub 安装拉的是**源码**，会在你机器上现场构建：

```sh
dsh plugin --profile web add git+https://github.com/crease123/dsh-journal-calendar
```

第一次会停下：pnpm 拒绝执行 git 托管包的构建脚本，除非你显式放行那个确切的包。`dsh` 会把该填进 profile 的 `pnpm-workspace.yaml` 里 `allowBuilds` 的键打印出来，填好再重跑即可。请把这项授权理解为「允许这个包的代码在安装时于你的机器上执行」；若想让装上的代码固定不变，就钉住 commit（`…#<sha>`）。

两条路径都已验证：npm 预构建产物，以及走上述授权步骤的 git 安装。两者都启动无警告，并真实读写日期文件。

## 记录存在哪

一天一个 JSON 文件，位于 `$DSH_HOME/journal/<YYYY-MM-DD>.json`（默认 `~/.dsh/journal`）。每个文件就是那一天的完整记录：

```json
{
  "version": 1,
  "date": "2026-09-30",
  "entries": [
    { "id": "…", "kind": "todo", "time": "20:00", "title": "跑 2 公里", "done": false }
  ]
}
```

想换个位置就给那一行加 `dir`：

```yaml
- id: journal
  name: dsh-journal-calendar
  config:
    dir: /absolute/path/to/journal
```

**这些文件是你自己的。** 任何能读 JSON 的东西都能读，手改也支持：保留每个条目的 `id` 和顶层的 `"version": 1` 即可。

服务把读不懂的文件当成硬错误，而不是重建它——静默重写一天，等于毁掉那天留下的记录。

## Agent 拿它做什么

插件注册 `journal_record` 工具，外加一句提示词，告诉 agent 记录是它的职责之一。工具参数：`kind`（`todo` = 打算做的事，可勾选；`memory` = 已经发生的事）、单行 `title`，可选 `detail`、`tags`、`date`、`time`。

同一个 `id` 记两次返回已存在的那条，而不会追加第二条，所以工具调用重试是安全的。

## 开发

```sh
pnpm install
pnpm run build      # tsc（两个面）再 tsdown（两个 bundle）
pnpm run test
pnpm run typecheck
pnpm pack           # 先构建，再打出可分发的 tarball
```

本仓库自带工具根——`pnpm-workspace.yaml` 与 `vitest.config.ts` 的存在，是为了在这个包被放进 DSH checkout 内开发时，pnpm 和 Vitest 不会向上走进上一层仓库。

### 生成出来的 Remote 产物

`generated/` 存放 Typert 产物（`typert.host.*`、`typert.remote-client.*`），Host 半边导出它们，浏览器 bundle 内联它们。它们是**生成物，不是在这里构建的**：

`@deepseek-ai/dsh-typert-generator` 只在 `<root>/packages` 下发现贡献包，并且通过"该符号必须声明在一个**已注册**包里"来识别 `TypertRemoteService`。因此，从 `node_modules` 取 `@deepseek-ai/dsh-typert-protocol` 的包，永远分析不了。

所以要在生成器能跑的地方生成，然后把结果提交回来：

```sh
DSH_CHECKOUT=/path/to/deepseek-harness pnpm run regen-typert
```

那份 checkout 必须先构建过（`pnpm run build`）。凡是 `@Remote` 方法的名称、签名、返回类型变了，或者 Remote 错误码表变了，就重跑一次。`scripts/typert-identity.mjs` 写明产物需要的身份重写，而 `tests/build-artifacts.spec.ts` 会在重新生成后仍带着上游包名时让测试套件失败——Typert loader 会在启动时拒绝这种贡献。

### publint 关于 `./client` 的那条警告

`npx publint` 会报一条警告：`./lib/client.js` 是 CommonJS，却位于 `"type": "module"` 的包里，Node 会按 ESM 解读它。

**不要改。** 浏览器模块表取的是这个文件的字节，再经 `window.__ModuleLoader__.load({ id, factory })` 物化；Node 从不解析或导入它，所以「按什么扩展名判定」这件事根本不适用。为了消掉这条警告而改名成 `.cjs`，会偏离所有 DSH 客户端插件的做法——它们全都是 `"type": "module"` 配 `lib/client.js`。

## 兼容性

通过 `peerDependencies` 与 `engines.dsh` 声明。已对 DSH `0.1.7-rc.1` 与 `0.2.0-rc.2` 做过端到端验证：安装、启动、bundle 投递，以及 `month` / `day` / `setDone` 三个端点读写真实日期文件。

在 Node `22.19.0` 与 `26.4.0` 上，同一套验收同样通过，宿主产物也能正常加载。Node `24`、`25` 位于两个已验证版本之间；`engines.node` 写的是 DSH 自身支持的两条发布线。

每一条 DSH 范围都显式写出各条受支持的发布线，例如 `>=0.1.7-rc.1 <0.2.0 || >=0.2.0-rc.1 <0.3.0-0`。这不是装饰：node-semver 只有当范围里*某个*比较符与该版本的 `major.minor.patch` 元组完全一致、且自身也带预发布标签时，才放行预发布版本。看起来很宽的 `>=0.1.7-rc.1 <0.3.0` 会静默排除 `0.2.0-rc.2`——pnpm 只会警告，安装结果两边都不符合预期。`tests/manifest.spec.ts` 把范围钉在验收实际跑过的版本上。

## 发布

本仓库同时是 npm 包与社区列表的事实来源。

```sh
npm login --registry https://registry.npmjs.org
npm publish
```

`prepack` 会在打包前构建，所以 `npm publish` 发的是编译产物，安装方不需要任何构建步骤。`publishConfig` 同时钉住了 public 访问级别与官方源——机器上若配置了镜像，否则会发到一个别人装不到的地方。用 `npm publish --dry-run` 可以核对究竟会发出什么。

要进入 [dsh-market](https://github.com/dsh-market/dsh-market) 插件市场，向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 注册表提一个**只加一个文件**的 PR——`data/plugins/crease123__dsh-journal-calendar.yml`：

```yaml
url: https://github.com/crease123/dsh-journal-calendar
name: crease123/dsh-journal-calendar
category: memory
description:
  en: A daily journal the agent writes and the sidebar draws as a calendar.
  zh: 助手每天记录的日志，右侧栏画成日历。
```

注册表里的 `url` 必须与仓库完全一致，且仓库需要带上 `dsh-plugin` 这个 GitHub topic、并已创建满一天。已发布包的 `repository` 字段指向同一个地址，这就是两者关联的依据。

## 已知限制

- **要有 Web UI 才看得到日历。** 在 headless profile 上工具照常记录，只是没人把它画出来。
- **重新生成 Remote 产物需要一份 DSH checkout。** 改动 `@Remote` 方法签名不是一件自包含的操作。
- **按运行 DSH 那台机器的本地日期分天。** 日期文件不携带时区，所以旅途中切换时区的笔记本可能把一条记录归到相邻的一天。
- **这里的 `todo` 不是 `todo_write`。** 日历的待办是持久的、一天一个 JSON 文件；内置的 `todo_write` 工具是会话内的清单。对模型来说两者都读作"记录一下"，目前没有提示词区分它们。

## 许可

MIT，见 [LICENSE](LICENSE)。
