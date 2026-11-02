# 开发指南

本仓库是 DSH 插件 `dsh-journal-calendar` 的源码，也是当前运行的 DSH（desktop profile）所加载的那份代码（通过符号链接）。

## 当前安装形态

- `~/.dsh/profiles/desktop/package.json` 里声明的仍是 `"dsh-journal-calendar": "^0.2.0"`（与 `pnpm-lock.yaml` 一致，保证 DSH 启动时 manifest 与 lockfile 不打架）
- `~/.dsh/profiles/desktop/node_modules/dsh-journal-calendar` **是手工建的符号链接，指向本仓库**，所以运行时加载的是这里的源码
- 一旦有人执行 `dsh plugin add dsh-journal-calendar` 或 `pnpm install`，链接会被换回 npm 包，需要重建：
  ```sh
  cd ~/.dsh/profiles/desktop/node_modules
  rm -rf dsh-journal-calendar
  ln -s /Users/lw/code/prac/dsh-journal-calendar dsh-journal-calendar
  ```
- 想彻底回到 npm 版本：删掉链接后重装（`dsh plugin add dsh-journal-calendar`）

**改动要真正生效，重启 DSH app**（当前 app 进程里加载的仍是旧模块）。

## 开发回路

```sh
pnpm install     # 首次
pnpm test        # 单元测试
pnpm build       # stage-typert → tsc(host/client) → tsdown ×2
```

改完 `src/` 后：`pnpm build` → 重启 app（或 `dev_reload_package dsh-journal-calendar`）→ 刷新页面。

## 两个已知的坑

1. **改了 Remote 面（`service.ts` 的 `@Remote` 方法）或重新生成了 typert 产物后，必须重启宿主。**
   热重载只撤下旧登记、不补新登记，会报 `typert gateway: journal/day: its strict definition was withdrawn and SRC fallback is forbidden`，日历变空。README 的「重新生成 Remote 产物后要重启宿主」一节有原文。
2. **`scripts/*.mjs` 不能写 TS 类型标注**，否则报 `SyntaxError: Unexpected token ':'`。

## 重新生成 typert 产物

```sh
DSH_CHECKOUT=/Users/lw/code/create/agents/deepseek-harness pnpm run regen-typert
```

脚本会把 `src/` 自搭成临时包（`packages/experimental/journal`）注入 checkout，跑 `WorkspaceTypertGenerator`，把身份改回 `dsh-journal-calendar` 后写入 `generated/`，并逐字节还原 checkout。生成后重新 `pnpm build` 并**重启宿主**。

## 数据与职责文案

- 日记数据：`~/.dsh/journal/<YYYY-MM-DD>.json`（`version: 1`）
- 职责文案：`~/.dsh/journal/duty.md`（不存在或空白 = 内置默认句；上限 2000 字符；也可在日历卡片的 ✎ 浮层里编辑）
- `duty.md` 每组装一次系统提示词就同步读一次，改完下一条消息即生效

## 发布

```sh
pnpm pack                       # 生成 tgz
npm stage publish ./dsh-journal-calendar-<ver>.tgz --registry=https://registry.npmjs.org/
npm stage approve <stage-id> --registry=https://registry.npmjs.org/   # 浏览器 2FA 授权
```

npm 强制 2FA；无「Bypass 2FA」的 token 只能暂存，approve 必须人工完成。0.2.0 的完整过程见 git 历史与 README 的发布段。
