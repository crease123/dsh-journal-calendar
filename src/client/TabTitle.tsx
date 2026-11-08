/**
 * The chip title: a calendar glyph before the title the registry captured when
 * the tab opened.
 *
 * A tab type carries no icon of its own. The chip dispatches this seat to the
 * type that registered it, and a type that registers nothing keeps the bare
 * title text.
 */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TabTitle.module.css'

/**
 * A sixteen-pixel calendar: the month grid's frame, its header rule, and two
 * marked days. Decorative — the chip's text carries the meaning.
 * @returns the glyph in the surrounding text color.
 */
function CalendarIcon(): ReactNode {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={css.icon}>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" />
    <path d="M2.5 6.5H13.5" stroke="currentColor" />
    <path d="M5.5 2.2V4.6M10.5 2.2V4.6" stroke="currentColor" strokeLinecap="round" />
    <circle cx="6.2" cy="9.2" r="0.9" fill="currentColor" />
    <circle cx="9.8" cy="9.2" r="0.9" fill="currentColor" />
  </svg>
}

/**
 * Render the sidebar chip: the glyph followed by the tab's title.
 * @param props - the tab information hook supplied by the sidebar shell.
 * @returns the glyph and the title text.
 */
export function TabTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return <>
    <CalendarIcon />
    <span className={css.title}>{tab.title}</span>
  </>
}
