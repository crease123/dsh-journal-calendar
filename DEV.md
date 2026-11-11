# 开发指南

本仓库是 DSH 插件 `dsh-journal-calendar` 的源码。

## 当前安装形态

- `~/.dsh/profiles/desktop/package.json` 声明 `"dsh-journal-calendar": "0.5.0"`，`node_modules/dsh-journal-calendar` 是 npm 包安装出来的**实体副本**：默认情况下运行中的 DSH 加载的是发布版，不读本仓库。
- 想让 DSH 加载本仓库（每条改动不必发包），把这个副本换成符号链接：
  ```sh
  cd ~/.dsh/profiles/desktop/node_modules
  rm -rf dsh-journal-calendar
  ln -s /Users/lw/code/prac/dsh-journal-calendar dsh-journal-calendar
  ```
- 反向：`dsh plugin --profile desktop add dsh-journal-calendar@<ver>` 会把链接换回实体副本（这也会让上面的符号链接失效，需要重建）。

**改动要真正生效，重启 DSH app**（app 进程里加载的仍是旧模块）。

## 开发回路

```sh
pnpm install     # 首次
pnpm test        # 单元测试
pnpm build       # stage-typert → tsc(host/client) → tsdown ×2
```

改完 `src/` 后：`pnpm build` → 重启 app（或 `dev_reload_package dsh-journal-calendar`）→ 刷新页面。

## 三个已知的坑

1. **改了 Remote 面（`service.ts` 的 `@Remote` 方法）或重新生成了 typert 产物后，必须重启宿主。**
   热重载只撤下旧登记、不补新登记，会报 `typert gateway: journal/day: its strict definition was withdrawn and SRC fallback is forbidden`，日历变空。README 的「重新生成 Remote 产物后要重启宿主」一节有原文。
2. **`scripts/*.mjs` 不能写 TS 类型标注**，否则报 `SyntaxError: Unexpected token ':'`。
3. **`@deepseek-ai/dsh-*` 的 devDependencies 必须与实际运行的 DSH 同线**（当前 `0.2.2-rc.1`）。生成器现在会 import `@deepseek-ai/dsh-typert-protocol/remote-info`，同步它是构建能过的最低要求；早期协议没有这个导出，所以 `peerDependencies` 与 `engines.dsh` 也从 `0.2.2-rc.1` 起算。反过来，checkout 里的生成器也要与这条线一致，否则产物可能与运行时协议对不上。

## 重新生成 typert 产物

```sh
DSH_CHECKOUT=/Users/lw/code/create/agents/deepseek-harness pnpm run regen-typert
```

脚本用 checkout 里（`/Users/lw/code/create/agents/deepseek-harness`）的生成器；它会把 `src/` 自搭成临时包（`packages/experimental/journal`）注入 checkout，跑 `WorkspaceTypertGenerator`，把身份改回 `dsh-journal-calendar` 后写入 `generated/`，并逐字节还原 checkout。生成后重新 `pnpm build` 并**重启宿主**。

## 数据与职责文案

- 日记数据：`~/.dsh/journal/<YYYY-MM-DD>.json`（`version: 1`）
- 标签：`tag` 是五个固定值之一（`work`/`study`/`life`/`health`/`other`），卡片画成中英 chip；旧文件里的自由 `tags` 数组读回时折算成一个（对不上的一律 `other`）
- 职责文案：`~/.dsh/journal/duty.md`（不存在或空白 = 内置默认句；上限 2000 字符；也可在日历卡片的 ✎ 浮层里编辑）
- `duty.md` 每组装一次系统提示词就同步读一次，改完下一条消息即生效

## 市场图片

插件市场的详情页从本仓库读截图，不需要改市场那边的条目、也不用提 PR：

- `screenshots.json` 放在 `package.json` 旁边，列出 1–8 张图片，路径相对该文件（当前是 `assets/screenshots/calendar.webp`）
- 格式限 `png`/`jpg`/`jpeg`/`webp`；路径不能以 `/` 开头、不能含 `..`；也接受 GitHub 托管的 https 绝对 URL，第三方图床会被拒
- 市场每晚构建时抓取 main 上的这份清单，推上去即可生效；没声明时市场会从 README 自动抽图
- `assets/` 不在 `package.json` 的 `files` 里，所以截图不进 npm 包
- `tests/screenshots.spec.ts` 会挡住条数越界、路径越界、指向不存在文件的写法

市场卡片左上角的图标不是这个文件：它来自市场条目里的 `icon:`（必须是 GitHub 托管的位图），改它要提 PR 到 awesome-dsh-plugin。本仓库的方块图是 `assets/icon.png`（512×512，蓝底 + 卡片里那个日历字形），条目里指向它的 `raw.githubusercontent.com` 地址。

## 发布

```sh
pnpm pack                       # 生成 tgz
npm stage publish ./dsh-journal-calendar-<ver>.tgz --registry=https://registry.npmjs.org/
npm stage approve <stage-id> --registry=https://registry.npmjs.org/   # 浏览器 2FA 授权
```

npm 强制 2FA；无「Bypass 2FA」的 token 只能暂存，approve 必须人工完成。0.2.0 的完整过程见 git 历史与 README 的发布段。
