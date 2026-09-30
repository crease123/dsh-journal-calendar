/**
 * The one place that states which package identity the Typert artifacts carry.
 *
 * `@deepseek-ai/dsh-typert-generator` stamps the analyzed package's own name
 * into every descriptor id, type symbol, and manifest `package` field. The
 * Typert loader then refuses a contribution whose manifest names a package
 * other than the one exporting it:
 *
 *   typert-loader: dsh-journal-calendar TYPERT manifest names package
 *   "@deepseek-ai/dsh-experimental-journal" — the manifest must be owned by the
 *   package that exports it
 *
 * The generator cannot run in this repository (see scripts/stage-typert.mjs), so
 * the artifacts come from the upstream experimental package and are retargeted
 * here. Host and Client artifacts must be retargeted together: descriptor ids
 * are the join between them.
 *
 * @module dsh-journal-calendar/scripts/typert-identity
 */

import { readFileSync } from 'node:fs'

/** Package the generator ran against; every generated artifact names it. */
export const GENERATED_PACKAGE = '@deepseek-ai/dsh-experimental-journal'

/** Package these artifacts must name: this one, read from the manifest so the two cannot drift. */
export const PUBLISHED_PACKAGE = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
).name

/**
 * Rewrite one generated artifact onto this package's identity.
 * @param text - generated artifact contents.
 * @returns the same text naming {@link PUBLISHED_PACKAGE}.
 */
export function retargetTypertIdentity(text) {
  return text.split(GENERATED_PACKAGE).join(PUBLISHED_PACKAGE)
}

/**
 * Fail loud when an artifact would reach the loader still naming another package.
 * @param text - artifact contents after retargeting.
 * @param file - artifact name, for the diagnostic.
 */
export function assertRetargeted(text, file) {
  if (text.includes(GENERATED_PACKAGE)) {
    throw new Error(
      `${file} still names ${GENERATED_PACKAGE}; the Typert loader would refuse this contribution as not owned by ${PUBLISHED_PACKAGE}`,
    )
  }
}
