/**
 * Browser half: register `journal` as a right-Sidebar tab type and draw the
 * calendar card in its pane.
 *
 * The same package provides the Host service and its Remote namespace, so one
 * composition row mounts both halves.
 *
 * @module dsh-journal-calendar/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import journalRemote from 'dsh-journal-calendar/remote'
// Type-only: supplies the `ctx.remote` augmentation this half mounts into.
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { CalendarCard, type CalendarInjected } from './CalendarCard.tsx'
import { en, zh } from './locales.ts'
import type { JournalDay, JournalEntry, JournalMonthDay } from '../types.ts'

/** Tab type identity; also the key of the body seat. */
const ID = 'dsh-journal-calendar'

/** Copy namespace registered with the client locale registry. */
const NS = 'journal'

// Only `remote` is injected: `remote.journal` does not exist until this plugin
// mounts its own contribution below, so waiting on it would leave the plugin
// pending and take the whole Web plugin boot down with it.
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote']

/** The `journal` Remote namespace as this deployment declares it. */
interface JournalRemote {
  month: (month: string) => Promise<RemoteResult<JournalMonthDay[]>>
  day: (date: string) => Promise<RemoteResult<JournalDay>>
  setDone: (id: string, done: boolean, date: string) => Promise<RemoteResult<JournalEntry>>
}

/** Unwrap a Remote result, raising its failure as a plain error. */
function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

/**
 * Register the tab type, its dictionaries, and its body.
 * @param ctx - Client Context with the sidebar, slot, locale, and Remote services.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)

  // Mount this package's own Remote namespace. The shared assembly
  // (`dsh-api-remotes/client`) is a release package and must not name an
  // experimental one, so the contribution is mounted here instead.
  const mount = (ctx.remote as unknown as {
    $mount: (contribution: TypertRemoteContribution) => Promise<() => Promise<void>>
  })
  const mounted = mount.$mount(journalRemote)
  ctx.effect(() => () => { void mounted.then(dispose => dispose()) }, 'journal.remote')

  // Resolve the namespace by strict store lookup. Reading `ctx.remote.journal`
  // through the property proxy would demand a matching `inject` entry, and
  // declaring one for a service this plugin provides itself would leave it
  // pending forever; `ctx.get` reads the global service store instead.
  const services = ctx as unknown as { get: (name: string) => unknown }
  const remote = (): JournalRemote => {
    const namespace = services.get('remote.journal') as JournalRemote | undefined
    if (namespace === undefined) throw new Error('journal Remote namespace is not mounted')
    return namespace
  }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'journal.copy')

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: ID,
    kind: 'journal',
    title: () => t('title'),
    guide: [{ id: 'journal', order: 40, title: () => t('title'), description: () => t('description') }],
  }), 'journal.type')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: ID,
    locale: NS,
    inject: (): CalendarInjected => ({
      labels: {
        memory: t('memory'),
        todo: t('todo'),
        empty: t('empty'),
        weekdays: t('weekdays').split(','),
        months: t('months').split(','),
        monthHeading: t('monthHeading'),
        toggleTodo: t('toggleTodo'),
      },
      loadMonth: async (month) => {
        await mounted
        return unwrap(await remote().month(month))
      },
      loadDay: async (date) => {
        await mounted
        return unwrap(await remote().day(date))
      },
      setDone: async (id, done, date) => {
        await mounted
        unwrap(await remote().setDone(id, done, date))
      },
    }),
  }, CalendarCard)), 'journal.body')
}
