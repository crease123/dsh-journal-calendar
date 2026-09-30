/**
 * Refresh `generated/` from a Harness checkout.
 *
 * `@deepseek-ai/dsh-typert-generator` cannot run in this repository (see
 * scripts/stage-typert.mjs), so the artifacts are produced where the protocol
 * package is a registered workspace member and copied back here.
 *
 *   DSH_CHECKOUT=/path/to/deepseek-harness pnpm run regen-typert
 *
 * The checkout's `packages/experimental/journal` must be built first
 * (`pnpm run build`), which is what emits its `lib/typert.*` files.
 *
 * Rerun whenever a `@Remote` method's name, signature, or return type changes,
 * or when the Remote error table changes.
 *
 * @module dsh-journal-calendar/scripts/regen-typert
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { assertRetargeted, retargetTypertIdentity } from './typert-identity.mjs'

/** Artifacts the Host face contributes and the Client bundle inlines. */
const ARTIFACTS = [
  'typert.host.js',
  'typert.host.d.ts',
  'typert.remote-client.js',
  'typert.remote-client.d.ts',
  'typert.remote-client.d.ts.map',
]

const checkout = process.env.DSH_CHECKOUT
if (checkout === undefined || checkout === '') {
  console.error('regen-typert: set DSH_CHECKOUT to a built deepseek-harness checkout')
  process.exit(1)
}

const source = resolve(checkout, 'packages/experimental/journal/lib')
const target = new URL('../generated/', import.meta.url)
mkdirSync(target, { recursive: true })

for (const name of ARTIFACTS) {
  const file = join(source, name)
  if (!existsSync(file)) {
    console.error(`regen-typert: ${file} is missing — build the checkout first`)
    process.exit(1)
  }
  // Retarget before committing: the checkout's package name is not this one's,
  // and the Typert loader rejects a contribution that names a foreign package.
  const text = retargetTypertIdentity(readFileSync(file, 'utf8'))
  assertRetargeted(text, name)
  writeFileSync(new URL(name, target), text)
  console.log(`regen-typert: ${name}`)
}
