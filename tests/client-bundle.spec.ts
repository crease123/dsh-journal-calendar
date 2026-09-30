/**
 * Executes the built browser bundle the way the page does.
 *
 * The bundle is a classic script: it calls `window.__ModuleLoader__.load({ id,
 * factory })`, and the module table later runs the factory with a `require`
 * that answers the shell-seeded specifiers. This spec reproduces exactly that —
 * a fake window, Node's own `require`, and the factory — so a bundle that
 * throws while loading, registers the wrong id, or hands out something that is
 * not the plugin module fails here instead of in someone's sidebar.
 *
 * It does NOT prove the tab renders in a browser: the registrations are driven
 * against a minimal `Context` double, which asserts this plugin calls the APIs
 * it declares, not that the framework accepts them. The live acceptance run
 * covers the composition and delivery that this cannot.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CLIENT_BUNDLE = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const require_ = createRequire(import.meta.url)

/** One module-table registration, as the bundle makes it. */
interface Registration {
  id: string
  factory: (require: (specifier: string) => unknown) => {
    inject?: readonly string[]
    apply?: (ctx: unknown) => void
  }
}

/** Load the bundle with a window that captures its registration. */
async function loadBundle(): Promise<Registration> {
  let registration: Registration | undefined
  const window = { __ModuleLoader__: { load: (entry: Registration) => { registration = entry } } }
  const code = await readFile(CLIENT_BUNDLE, 'utf8')
  // eslint-disable-next-line no-new-func -- the bundle is a classic script, not a module.
  const run = new Function('window', 'require', 'module', 'exports', code)
  run(window, require_, { exports: {} }, {})
  if (registration === undefined) throw new Error('the bundle registered nothing with the module table')
  return registration
}

describe.skipIf(!existsSync(CLIENT_BUNDLE))('executing the built client bundle', () => {
  it('registers under the package name and hands out the plugin module', async () => {
    const registration = await loadBundle()
    expect(registration.id).toBe('dsh-journal-calendar')

    const plugin = registration.factory(require_)
    expect(plugin.inject).toEqual(['slots', 'locale', 'sidebarRightTabs', 'remote'])
    expect(typeof plugin.apply).toBe('function')
  })

  it('drives the tab, copy, and pane registrations it declares', async () => {
    const plugin = (await loadBundle()).factory(require_)
    const tabs: { id?: string, kind?: string, guide?: unknown[] }[] = []
    const paneSlots: string[] = []
    const locales: string[] = []

    const ctx = {
      // A Cordis effect runs its callback immediately and returns the disposer;
      // a double that only stored the callback would see no registration at all.
      effect: (fn: () => unknown) => { fn(); return () => {} },
      locale: {
        bind: () => (key: string) => key,
        register: (namespace: string) => { locales.push(namespace); return () => {} },
      },
      sidebarRightTabs: {
        register: (tab: { id?: string, kind?: string, guide?: unknown[] }) => { tabs.push(tab); return () => {} },
      },
      slots: {
        inject: (name: string) => { paneSlots.push(name); return () => {} },
        register: () => () => {},
      },
      remote: { $mount: () => Promise.resolve(() => Promise.resolve()) },
    }

    plugin.apply?.(ctx)

    expect(locales).toEqual(['journal'])
    expect(tabs).toHaveLength(1)
    expect(tabs[0]?.id).toBe('dsh-journal-calendar')
    expect(tabs[0]?.kind).toBe('journal')
    // The tab's guide row is what the sidebar's tab picker lists.
    expect(tabs[0]?.guide).toHaveLength(1)
    expect(paneSlots).toEqual(['sidebar.right.pane.tab'])
  })
})
