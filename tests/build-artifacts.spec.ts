/**
 * Guards the two build constraints no type checker can see.
 *
 * 1. The committed Typert artifacts must name THIS package. The generator stamps
 *    the analyzed package's name into every descriptor id and manifest `package`
 *    field, and the Typert loader refuses a contribution whose manifest names a
 *    package other than the one exporting it — a failure that only appears at
 *    boot, in a browser-facing deployment.
 *
 * 2. When the bundle is built, its only `require()` calls must be the
 *    shell-seeded module table. A `require()` the table cannot answer throws the
 *    moment the bundle materializes, which `pnpm run typecheck` cannot catch.
 */

import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  GENERATED_PACKAGE,
  PUBLISHED_PACKAGE,
  assertRetargeted,
  retargetTypertIdentity,
} from '../scripts/typert-identity.mjs'

const GENERATED = new URL('../generated/', import.meta.url)
const CLIENT_BUNDLE = fileURLToPath(new URL('../lib/client.js', import.meta.url))

/** The module table the shell seeds; every other specifier must be inlined. */
const PLATFORM_MODULES = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

describe('typert identity', () => {
  it('rewrites the generator name onto this package, and refuses to leave a foreign one', () => {
    expect(retargetTypertIdentity(`id: '${GENERATED_PACKAGE}#journal/day'`))
      .toBe(`id: '${PUBLISHED_PACKAGE}#journal/day'`)
    expect(() => assertRetargeted(`package: '${GENERATED_PACKAGE}'`, 'fixture.js')).toThrow(GENERATED_PACKAGE)
  })

  it('committed artifacts name this package and no other', async () => {
    const files = await readdir(GENERATED)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const text = await readFile(new URL(file, GENERATED), 'utf8')
      expect(text, `${file} names ${GENERATED_PACKAGE}`).not.toContain(GENERATED_PACKAGE)
      if (file.endsWith('.js')) {
        expect(text, `${file} names ${PUBLISHED_PACKAGE}`).toContain(PUBLISHED_PACKAGE)
      }
    }
  })
})

describe.skipIf(!existsSync(CLIENT_BUNDLE))('built client bundle', () => {
  it('registers through the module loader and requires only the shell-seeded table', async () => {
    const code = await readFile(CLIENT_BUNDLE, 'utf8')

    expect(code).toContain(`window.__ModuleLoader__.load({`)
    expect(code).toContain(`id: ${JSON.stringify(PUBLISHED_PACKAGE)}`)

    const required = [...code.matchAll(/require\("([^"]+)"\)/gu)].map(match => match[1])
    // Without this the emptiness assertion below would pass vacuously if the
    // extraction regex ever stopped matching.
    expect(new Set(required)).toEqual(new Set(['react', 'react/jsx-runtime']))
    const foreign = [...new Set(required)].filter(specifier => !PLATFORM_MODULES.has(specifier ?? ''))
    expect(foreign, 'the browser module table cannot answer these').toEqual([])
  })
})
