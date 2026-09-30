/**
 * Guards the declared DSH compatibility ranges.
 *
 * node-semver only lets a prerelease version satisfy a range when some
 * comparator in that range shares the version's exact `major.minor.patch` tuple
 * and itself carries a prerelease tag. So a broad-looking
 * `>=0.1.7-rc.1 <0.3.0` silently excludes `0.2.0-rc.2`: neither comparator sits
 * on the `0.2.0` tuple, pnpm only warns, and the install resolves to something
 * neither side intended. The ranges therefore name each supported release line
 * explicitly.
 *
 * This test pins the ranges to the versions an acceptance run actually exercised,
 * so widening the code's verified reach without widening the range — or the
 * reverse — fails here rather than in a user's install.
 */

import { readFileSync } from 'node:fs'
import semver from 'semver'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  engines?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/** DSH versions this package has been installed and booted against. */
const VERIFIED = ['0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2']

/** DSH versions outside the supported release lines. */
const UNVERIFIED = ['0.1.6-alpha.2', '0.3.0-rc.1']

/** Every range whose job is to describe which DSH builds this package runs on. */
const ranges: [string, string][] = [
  ...Object.entries(manifest.peerDependencies ?? {})
    .filter(([name]) => name.startsWith('@deepseek-ai/dsh-')),
  ['engines.dsh', manifest.engines?.['dsh'] ?? ''],
]

describe('declared DSH compatibility', () => {
  it('declares a range for every DSH package this package peers on', () => {
    expect(ranges.length).toBeGreaterThan(1)
    for (const [name, range] of ranges) expect(range, name).not.toBe('')
  })

  it.each(ranges)('%s admits every DSH version the package was verified against', (_name, range) => {
    for (const version of VERIFIED) {
      expect(semver.satisfies(version, range), `${range} must admit ${version}`).toBe(true)
    }
  })

  it.each(ranges)('%s claims no DSH version outside the supported release lines', (_name, range) => {
    for (const version of UNVERIFIED) {
      expect(semver.satisfies(version, range), `${range} must not admit ${version}`).toBe(false)
    }
  })
})
