# dsh-journal-calendar

English | [中文](README.zh.md)

A daily journal and calendar for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). The agent records what you did and what you intend to do into one JSON file per day, and the Web UI draws those files as a calendar in the right sidebar.

## What it contributes

One bundle row mounts all three faces:

| Face | What it is |
|---|---|
| Host service | `journal`, a Remote namespace over `$DSH_HOME/journal` |
| Tool | `journal_record`, plus a standing-duty prompt section |
| Browser half | the calendar card, a right-sidebar tab |

The card shows a month grid with a marker per day, and below it the selected day's `TO DO` and `MEMORY` sections. Todos carry a checkbox that writes straight back to the day file.

## Install

```sh
dsh plugin --profile web add dsh-journal-calendar
```

Then reload the page. The **日历 / Journal** tab appears in the right sidebar.

`dsh plugin` forwards to pnpm, so pnpm must be on the machine. To remove it again:

```sh
dsh plugin --profile web remove dsh-journal-calendar
```

### Installing from the repository instead

The npm package ships prebuilt, so it needs no build step. Installing straight from GitHub fetches **source** and builds it on your machine:

```sh
dsh plugin --profile web add git+https://github.com/crease123/dsh-journal-calendar
```

The first attempt stops, because pnpm refuses to run a git-hosted package's build script until you allow that exact package. `dsh` prints the key to paste under `allowBuilds` in the profile's `pnpm-workspace.yaml`; add it and re-run. Treat that authorization as permission for this package's code to run on your machine at install time, and pin a commit (`…#<sha>`) if you want the installed code to stay fixed.

Both paths are verified end to end: the packed tarball — byte-for-byte what `npm publish` ships — and the `git+https://` install above, through its authorization step. Each boots with no warnings and reads and writes real day files.

## Where your entries live

One JSON file per day, at `$DSH_HOME/journal/<YYYY-MM-DD>.json` (`~/.dsh/journal` by default). Each file is the complete record of that day:

```json
{
  "version": 1,
  "date": "2026-09-30",
  "entries": [
    { "id": "…", "kind": "todo", "time": "20:00", "title": "跑 2 公里", "done": false }
  ]
}
```

Point it somewhere else by giving the row a `dir`:

```yaml
- id: journal
  name: dsh-journal-calendar
  config:
    dir: /absolute/path/to/journal
```

**Your entries are plain files you own.** Anything that can read JSON can read them, and editing them by hand is supported: keep every entry `id` and the top-level `"version": 1`.

The service treats a file it cannot parse as a hard error rather than rebuilding it, because silently rewriting a day would destroy the record it holds.

## What the agent does with it

The plugin registers the `journal_record` tool and one prompt sentence telling the agent that recording is part of its job. The tool takes a `kind` (`todo` = an intention, checkable; `memory` = something that happened), a one-line `title`, and optionally `detail`, `tags`, `date`, and `time`.

Recording the same `id` twice returns the stored entry instead of appending a second one, so a retried tool call is safe.

## Development

```sh
pnpm install
pnpm run build      # tsc (both faces) then tsdown (both bundles)
pnpm run test
pnpm run typecheck
pnpm pack           # builds, then writes the publishable tarball
```

The repository owns its own tool roots — `pnpm-workspace.yaml` and `vitest.config.ts` exist so pnpm and Vitest do not walk up into an ancestor repository when this package is developed inside a DSH checkout.

### The generated Remote artifacts

`generated/` holds the Typert artifacts (`typert.host.*`, `typert.remote-client.*`) that the Host contributes and the browser bundle inlines. They are **generated, not built here**:

`@deepseek-ai/dsh-typert-generator` discovers contributing packages only under `<root>/packages`, and identifies `TypertRemoteService` by requiring that symbol to be declared in a *registered* package. A package that takes `@deepseek-ai/dsh-typert-protocol` from `node_modules` therefore can never be analyzed.

So regenerate them where the generator can run, and commit the result:

```sh
DSH_CHECKOUT=/path/to/deepseek-harness pnpm run regen-typert
```

The checkout must be built first (`pnpm run build`). Rerun whenever a `@Remote` method's name, signature, or return type changes, or when the Remote error table changes. `scripts/typert-identity.mjs` states the identity rewrite the artifacts need, and `tests/build-artifacts.spec.ts` fails the suite if a regenerated artifact still names the upstream package — the Typert loader rejects such a contribution at boot.

### The publint warning about `./client`

`npx publint` reports one warning: `./lib/client.js` is CommonJS inside a `"type": "module"` package, so Node would read it as ESM.

Leave it. The browser module table fetches that file's bytes and materializes it through `window.__ModuleLoader__.load({ id, factory })`; Node never resolves or imports it, so the extension it is judged by never applies. Renaming it to `.cjs` to silence the warning would depart from every DSH client plugin, all of which ship `lib/client.js` under `"type": "module"`.

## Compatibility

Declared through `peerDependencies` and `engines.dsh`. Verified end to end against DSH `0.1.7-rc.1` and `0.2.0-rc.2`: install, boot, bundle delivery, and the `month` / `day` / `setDone` endpoints reading and writing real day files.

On Node `22.19.0` and `26.4.0`, the same acceptance run passes and the host artifacts load. Node `24` and `25` sit between two verified versions; `engines.node` names the two release lines DSH itself supports.

Every DSH range names each supported release line explicitly, for example `>=0.1.7-rc.1 <0.2.0 || >=0.2.0-rc.1 <0.3.0-0`. This is not decoration: node-semver only lets a prerelease version satisfy a range when a comparator in that range shares the version's exact `major.minor.patch` tuple *and* carries a prerelease tag itself. A broad-looking `>=0.1.7-rc.1 <0.3.0` silently excludes `0.2.0-rc.2` — pnpm only warns, and the install resolves to something neither side intended. `tests/manifest.spec.ts` pins the ranges to the versions an acceptance run exercised.

DSH reads these ranges at install time and refuses an incompatible plugin, restoring the profile manifest — verified by installing a deliberately-incompatible copy and watching it rejected. But DSH evaluates them with `includePrerelease`, so a range too broad for your package manager still passes there. That asymmetry is exactly why the ranges are pinned by a test instead of eyeballed.

## Publishing

The repository is the source of truth for the npm package and for the community listing.

```sh
npm login --registry https://registry.npmjs.org
npm publish
```

`prepack` builds before the tarball is written, so `npm publish` ships compiled output and installs need no build step. `publishConfig` pins both the public access level and the official registry, because a machine configured against a mirror would otherwise publish somewhere no one else can install from. Check what would ship with `npm publish --dry-run`.

To list it in the [dsh-market](https://github.com/dsh-market/dsh-market) plugin market, open a PR that adds **one file** — `data/plugins/crease123__dsh-journal-calendar.yml` — to the [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) registry:

```yaml
url: https://github.com/crease123/dsh-journal-calendar
name: crease123/dsh-journal-calendar
category: memory
description:
  en: A daily journal the agent writes and the sidebar draws as a calendar.
  zh: 助手每天记录的日志，右侧栏画成日历。
```

The registry's `url` must match the repository exactly, and the repository must carry the `dsh-plugin` GitHub topic and be at least one day old. The published package's `repository` field points at the same URL, which is what links the two.

## Known limitations

- **The Web UI is required to see the calendar.** On a headless profile the tool still records entries; nothing draws them.
- **Regenerating the Remote artifacts needs a DSH checkout.** Changing a `@Remote` method's signature is not a self-contained operation here.
- **Days are grouped by the local date of the machine running DSH.** A day file does not carry a timezone, so a laptop that changes timezone mid-travel can attribute an entry to the neighbouring day.
- **`todo` here is not `todo_write`.** The calendar's todos are durable, one JSON file per day; the built-in `todo_write` tool is a per-session list. Both read as "记录一下" to a model, and no prompt currently distinguishes them.

## License

MIT. See [LICENSE](LICENSE).
