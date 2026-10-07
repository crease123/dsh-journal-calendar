/**
 * Refresh `generated/` from a Harness checkout, scaffolding the analysis
 * package itself.
 *
 * `@deepseek-ai/dsh-typert-generator` discovers contributing packages only
 * under `<root>/packages` and identifies `TypertRemoteService` by requiring
 * that symbol to be declared in a *registered* package. A package that takes
 * `@deepseek-ai/dsh-typert-protocol` from `node_modules` therefore can never
 * be analyzed in place — so this script copies this repository's `src/` into
 * the checkout under the upstream experimental name, registers the scaffold
 * in the Host aggregate for the length of one run, and restores the checkout
 * byte-for-byte afterwards.
 *
 *   DSH_CHECKOUT=/path/to/deepseek-harness pnpm run regen-typert
 *
 * The checkout's `packages/typert/generator` must be built (`pnpm run build`).
 * Rerun whenever a `@Remote` method's name, signature, or return type changes,
 * or when the Remote error table changes.
 *
 * @module dsh-journal-calendar/scripts/regen-typert
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GENERATED_PACKAGE, PUBLISHED_PACKAGE, assertRetargeted, retargetTypertIdentity } from './typert-identity.mjs'

/** Artifacts the Host face contributes and the Client bundle inlines. */
const ARTIFACTS = {
  'typert.host.js': artifact => artifact.js,
  'typert.host.d.ts': artifact => artifact.dts,
}

/** Remote-client artifacts derived from the same Host face. */
const REMOTE_ARTIFACTS = {
  'typert.remote-client.js': remote => remote.js,
  'typert.remote-client.d.ts': remote => remote.dts,
  'typert.remote-client.d.ts.map': remote => remote.dtsMap,
}

/** Methods the regenerated Host artifact must name, so a stale copy cannot pass silently. */
const REQUIRED_METHODS = ['day', 'month', 'setDone', 'duty', 'setDuty']

const checkout = process.env.DSH_CHECKOUT
if (checkout === undefined || checkout === '') {
  console.error('regen-typert: set DSH_CHECKOUT to a deepseek-harness checkout with packages/typert/generator built')
  process.exit(1)
}

const root = resolve(checkout)
const scaffold = join(root, 'packages/experimental/journal')
const aggregatePath = join(root, 'tsconfig.host.json')
const generatorEntry = join(root, 'packages/typert/generator/lib/index.js')
for (const required of [aggregatePath, generatorEntry]) {
  if (!existsSync(required)) {
    console.error(`regen-typert: ${required} is missing — build the checkout first`)
    process.exit(1)
  }
}

/** The analysis package's manifest: this repository's own, under the upstream name. */
function scaffoldManifest() {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  return `${JSON.stringify({ ...manifest, name: GENERATED_PACKAGE }, null, 2)}\n`
}

/**
 * Stage the scaffold and patch the Host aggregate; returns the restore action.
 * The aggregate is restored from its snapshot bytes, not by editing back, so
 * the checkout ends this run exactly as it began.
 */
function stage() {
  const aggregateOriginal = readFileSync(aggregatePath, 'utf8')
  cpSync(new URL('../src/', import.meta.url), join(scaffold, 'src'), { recursive: true })
  writeFileSync(join(scaffold, 'package.json'), scaffoldManifest())
  writeFileSync(join(scaffold, 'tsconfig.host.json'), `${JSON.stringify({
    extends: '../../../tsconfig.base.json',
    compilerOptions: { rootDir: 'src', outDir: 'lib/types', tsBuildInfoFile: 'lib/tsconfig.host.tsbuildinfo' },
    files: ['src/index.ts', 'src/service.ts', 'src/tool.ts', 'src/types.ts'],
  }, null, 2)}\n`)
  const reference = '    { "path": "./packages/experimental/journal/tsconfig.host.json" },\n'
  const patched = aggregateOriginal.replace('"references": [\n', `"references": [\n${reference}`)
  if (patched === aggregateOriginal) {
    throw new Error('regen-typert: tsconfig.host.json has no references array to register the scaffold in')
  }
  writeFileSync(aggregatePath, patched)
  return () => {
    writeFileSync(aggregatePath, aggregateOriginal)
    rmSync(join(scaffold, 'src'), { recursive: true, force: true })
    rmSync(join(scaffold, 'package.json'), { force: true })
    rmSync(join(scaffold, 'tsconfig.host.json'), { force: true })
  }
}

const restore = stage()
let artifact
try {
  const { WorkspaceTypertGenerator } = await import(pathToFileURL(generatorEntry))
  const generator = new WorkspaceTypertGenerator(root, { checkDiagnostics: false })
  const artifacts = generator.generate([GENERATED_PACKAGE], ['host'])
  artifact = artifacts.find(candidate => candidate.package === GENERATED_PACKAGE && candidate.face === 'host')
  if (artifact === undefined) {
    throw new Error(`regen-typert: the generator produced no Host artifact for ${GENERATED_PACKAGE}`)
  }
  for (const method of REQUIRED_METHODS) {
    if (!artifact.js.includes(`'${method}'`)) {
      throw new Error(`regen-typert: the generated artifact does not name the ${method} method`)
    }
  }
} finally {
  restore()
}

const target = new URL('../generated/', import.meta.url)
mkdirSync(target, { recursive: true })
for (const [name, render] of Object.entries(ARTIFACTS)) {
  const text = retargetTypertIdentity(render(artifact))
  assertRetargeted(text, name)
  writeFileSync(new URL(name, target), text)
  console.log(`regen-typert: ${name}`)
}
if (artifact.remote !== undefined) {
  for (const [name, render] of Object.entries(REMOTE_ARTIFACTS)) {
    const text = retargetTypertIdentity(render(artifact.remote))
    assertRetargeted(text, name)
    writeFileSync(new URL(name, target), text)
    console.log(`regen-typert: ${name}`)
  }
} else {
  throw new Error(`regen-typert: the Host artifact carries no Remote client for ${PUBLISHED_PACKAGE}`)
}
