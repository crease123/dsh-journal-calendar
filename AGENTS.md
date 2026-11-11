# AGENTS.md

本仓库是 DSH 插件 `dsh-journal-calendar` 的源码。开发回路、typert 生成、发布流程见 [DEV.md](DEV.md)；面向用户的说明见 [README.md](README.md) 与 [README.zh.md](README.zh.md)。

## 硬规则：改项目就同时改 README 和插件市场的简介

任何改动插件可见行为（工具参数、卡片、数据格式、界面文案）的提交，必须在同一个提交里同步下面两处，不许留到「以后再说」：

1. **README 两版** —— `README.md` 与 `README.zh.md` 的同一节要一起改，不许只改一版。功能类改动的正文落在「What it does / 功能介绍」下对应的小节；新增或去掉小节时，两版的「Contents / 目录」一起更新，新条目要带一句「这节回答什么」。
2. **插件市场的简介** —— 市场那份文案的唯一来源是 awesome-dsh-plugin 仓库的 `data/plugins/crease123__dsh-journal-calendar.yml`，即其中的 `description.en` 与 `description.zh` 两行；本仓库里没有它的副本。README 的「功能介绍」是底稿：**先改 README，再照着它改这两行**，顺序不要反过来。

改市场条目时：

- 描述里每一句都要在代码里站得住（工具、卡片、搜索、跳转各自在哪个文件里，提 PR 时在 body 列出来）。
- 不写还没发布的版本才有的行为：条目里的 `tarball` 指向某个已发布版本，用户装到的就是那个版本的行为。措辞要在这两者之间都成立，或者等发版后再改。
- `en` 用双引号（正文含 `: ` 时必须引），`zh` 用单引号（正文不要出现 ASCII 撇号）。
- 一个 PR 只改我们自己这一条条目，不动别人的、不动生成的列表。
- 提交前用 `npx --yes js-yaml@4 <文件>` 解析一遍。

发版时版本号出现在这些地方，一次改齐：`package.json` 的 `version`、README 两版的安装示例、README 两版的 Release 附件链接、README 内嵌的市场 YAML 片段、市场条目的 `tarball` 行。

## 图片

- 截图由本仓库的 `screenshots.json` 声明（1–8 张、相对路径、限 png/jpg/jpeg/webp），推上 main 后由市场的夜间构建抓取，**不走市场那边的 PR**；格式与校验规则见 [DEV.md](DEV.md#市场图片)。
- 市场卡片上的图标走市场条目的 `icon:`（GitHub 托管的位图），指到本仓库的 `assets/icon.png`；包级图标是仓库根的 `icon.svg`（由 `package.json` 的 `icon` 引用），两处是同一个日历字形，换字形时一起换。
- 市场简介与截图不是推完立刻可见：条目合并后、截图推上 main 后，都要等那次夜间构建。验证看 `https://awesome-dsh-plugin.com/plugins.json` 里我们条目的 `description` / `screenshots`，或直接开详情页。

## 改完的自检

```sh
pnpm test && pnpm build
```

- 用户可见的文案改动，检查 `src/client/locales.ts` 的 zh/en 两侧是否都加了键。
- 改过 `src/types.ts` 或 `@Remote` 方法后，按 [DEV.md](DEV.md#重新生成-typert-产物) 重生成产物，并提醒用户完全重启宿主。
- README 与市场描述的对照：把 `description.zh` 和 README 的「功能介绍」并排读一遍，功能列表应当一一对应。

## 这个仓库的既有做法

- 用户可见文案成对存在：`src/client/locales.ts` 的 zh/en、README 两版、市场描述的中英两行。
- 测试描述行为，不锁死时钟或机器状态：`tests/calendar-card.spec.ts` 按当前时钟推导月份标题，不写死月份名。
- 提交信息用英文祈使句的单行标题，一次提交做一件事。
- `.design/`、`lib/`、`*.tgz` 不进库（`.gitignore` 已挡）；`.design/` 只放给人看的 UI 稿。
