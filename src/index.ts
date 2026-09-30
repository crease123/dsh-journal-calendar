/**
 * Personal daily journal: the composition row that mounts the day-file service,
 * the `journal_record` tool, and its model-facing guidance.
 *
 * The package carries three faces, and this one row wires all of them: the
 * entry mounts {@link Journal} (whose `@Remote` methods feed the calendar) and
 * registers the tool beside it. The browser half rides along because this same
 * entry declares `dsh.client`, so a composition that mounts this row gets the
 * service, the tool, and the calendar card together.
 *
 * @module dsh-journal-calendar
 */

import type { Context } from '@deepseek-ai/cordis'
import { Journal, resolveJournalDirectory } from './service.ts'
import { registerJournalTool } from './tool.ts'
import type { Config as JournalConfig } from './types.ts'

export * from './types.ts'
export { Journal }

/** Loader entry name. */
export const name = 'journal'

/** Provided by the surrounding composition: the tool registry and prompt assembly. */
export const inject = ['tools', 'systemPrompt']

/** The service's configuration schema, validated by the Loader for this row. */
export const Config = Journal.Config

/**
 * Mount the journal service and the capability that ships with it.
 * @param ctx - the row's Context.
 * @param config - directory override for the day files.
 */
export function apply(ctx: Context, config: JournalConfig = {}): void {
  ctx.plugin(Journal, config)
  registerJournalTool(ctx, resolveJournalDirectory(config))
}
