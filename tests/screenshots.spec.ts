/**
 * Guards the storefront screenshots the plugin market reads from this repository.
 *
 * The registry resolves `screenshots.json` beside `package.json`, treats every
 * entry as a path relative to that file, and republishes the list on its nightly
 * build. A path that leaves the plugin directory, or names a file that is not
 * committed, becomes a broken tile on the plugin page without failing anything,
 * so the registry's rules are checked here instead.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../', import.meta.url)

/** Formats the registry accepts for a storefront screenshot. */
const RASTER = /\.(?:png|jpe?g|webp)$/i

/** The registry shows at most this many, in declared order. */
const LIMIT = 8

const declared: unknown = JSON.parse(readFileSync(new URL('screenshots.json', ROOT), 'utf8'))

describe('storefront screenshots', () => {
  it('declares a list of one to eight paths', () => {
    expect(Array.isArray(declared)).toBe(true)
    const paths = declared as unknown[]
    expect(paths.length).toBeGreaterThanOrEqual(1)
    expect(paths.length).toBeLessThanOrEqual(LIMIT)
    for (const path of paths) expect(typeof path).toBe('string')
  })

  it('keeps every path inside this repository and names a raster image', () => {
    for (const raw of declared as string[]) {
      expect(raw.startsWith('/'), raw).toBe(false)
      expect(raw.split('/'), raw).not.toContain('..')
      expect(RASTER.test(raw), raw).toBe(true)
    }
  })

  it('finds every declared image in the working tree', () => {
    for (const raw of declared as string[]) {
      const file = new URL(raw, ROOT)
      expect(existsSync(file), raw).toBe(true)
      expect(statSync(file).size, raw).toBeGreaterThan(0)
    }
  })
})