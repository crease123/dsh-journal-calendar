/**
 * The sidebar chip's title.
 *
 * The tab type owns no icon field, so the chip shows whatever this seat
 * renders; a bare word next to other types' glyphs is the failure this guards.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { TabTitle } from '../src/client/TabTitle.tsx'
import { en, zh } from '../src/client/locales.ts'

/** The only slice of the seat's props the component reads. */
function props(title: string): PropsRuntime<'sidebar.right.pane.tab.title'> {
  return { useTabInfo: () => ({ tab: { title } }) } as unknown as PropsRuntime<'sidebar.right.pane.tab.title'>
}

describe('TabTitle', () => {
  it('draws a decorative glyph before the title', () => {
    const html = renderToStaticMarkup(createElement(TabTitle, props(zh['title'] ?? '')))
    expect(html).toContain('<svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html.indexOf('<svg')).toBeLessThan(html.indexOf(zh['title'] ?? ''))
    expect(html).toContain(zh['title'] ?? '')
  })

  it('shows the title the sidebar captured, not the dictionary entry', () => {
    const html = renderToStaticMarkup(createElement(TabTitle, props('Renamed tab')))
    expect(html).toContain('Renamed tab')
    expect(html).not.toContain(en['title'] ?? '')
  })
})
