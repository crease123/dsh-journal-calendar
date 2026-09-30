/**
 * Stage the committed Typert artifacts into `lib/` before the TypeScript build
 * starts.
 *
 * These are generated, not built here. `@deepseek-ai/dsh-typert-generator`
 * discovers contributing packages only under `<root>/packages`, so it cannot
 * analyze a package that takes `@deepseek-ai/dsh-typert-protocol` from
 * `node_modules` — the protocol symbol would never resolve to a registered
 * package. The artifacts are therefore produced in a Harness checkout and
 * committed; `scripts/regen-typert.mjs` refreshes them.
 *
 * Retargeting runs here as well as at regen time so a hand-edited `generated/`
 * file cannot reach the loader naming a package this one does not export.
 *
 * @module dsh-journal-calendar/scripts/stage-typert
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertRetargeted, retargetTypertIdentity } from './typert-identity.mjs'

const source = new URL('../generated/', import.meta.url)
const target = new URL('../lib/', import.meta.url)

mkdirSync(target, { recursive: true })
for (const name of readdirSync(source)) {
  const text = retargetTypertIdentity(readFileSync(new URL(name, source), 'utf8'))
  assertRetargeted(text, fileURLToPath(new URL(name, target)))
  writeFileSync(fileURLToPath(new URL(name, target)), text)
}
