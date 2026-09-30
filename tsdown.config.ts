/**
 * Host-face build: bundle the tsc-emitted JavaScript into `lib/index.js`.
 *
 * The Remote contribution (`lib/typert.host.js`, `lib/typert.remote-client.js`)
 * is not produced here: `scripts/stage-typert.mjs` copies the committed
 * artifacts in before this runs. See that script for why the Typert generator
 * cannot run in this repository.
 *
 * @module dsh-journal-calendar
 */

import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { defineConfig, type UserConfig } from 'tsdown'

const manifest = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

/** Escape a package name for literal use inside a RegExp source. */
function escapeSpecifier(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A production dependency is on disk in a real install, so it stays an import;
 * everything else inlines. Stating both halves takes the artifact off tsdown's
 * package-manifest fallback, where moving a dependency between sections would
 * silently re-bundle it.
 */
const productionExternals = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
].sort().map(name => new RegExp(`^${escapeSpecifier(name)}(/|$)`))

const isProductionDependency = (specifier: string): boolean =>
  productionExternals.some(pattern => pattern.test(specifier))

const config: UserConfig = {
  name: 'dsh-journal-calendar/host',
  entry: { index: 'lib/types/index.js' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    neverBundle: isProductionDependency,
    // Builtins keep tsdown's own handling; neither side claims them.
    alwaysBundle: (specifier: string) => !isBuiltin(specifier) && !isProductionDependency(specifier),
  },
}

export default defineConfig(config)
