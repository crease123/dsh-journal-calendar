/**
 * The calendar card's own logic.
 *
 * Three things live here and nowhere else:
 *
 * 1. the marker rule its doc comment states — which dot a day cell carries;
 * 2. the month heading, which the locale composes rather than the card;
 * 3. a render smoke test, so a card that throws on empty data fails here
 *    instead of in someone's sidebar.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { CalendarCard, markerOf, monthHeadingOf } from '../src/client/CalendarCard.tsx'
import type { CalendarCardProps, CalendarLabels } from '../src/client/CalendarCard.tsx'
import type { JournalMonthDay } from '../src/types.ts'

/** One month row carrying only what the marker rule reads. */
function row(partial: Partial<JournalMonthDay>): JournalMonthDay {
  return { date: '2026-09-30', total: 0, memories: 0, todos: 0, todosPending: 0, ...partial }
}

/** Resolve a dictionary into the labels the card receives. */
function labelsOf(dictionary: Record<string, string>): CalendarLabels {
  return {
    memory: dictionary['memory'] ?? '',
    todo: dictionary['todo'] ?? '',
    empty: dictionary['empty'] ?? '',
    weekdays: (dictionary['weekdays'] ?? '').split(','),
    months: (dictionary['months'] ?? '').split(','),
    monthHeading: dictionary['monthHeading'] ?? '',
    toggleTodo: dictionary['toggleTodo'] ?? '',
  }
}

describe('markerOf', () => {
  it('draws no marker for a day with nothing recorded', () => {
    expect(markerOf(undefined)).toBe('none')
    expect(markerOf(row({}))).toBe('none')
  })

  it('rings a day whose todos are still open', () => {
    expect(markerOf(row({ todos: 2, todosPending: 1 }))).toBe('pending')
  })

  it('fills the dot once every todo is done', () => {
    expect(markerOf(row({ todos: 2, todosPending: 0 }))).toBe('done')
  })

  it('marks a day of memories only', () => {
    expect(markerOf(row({ memories: 3 }))).toBe('memory')
  })

  it('lets todos decide the marker when a day also holds memories', () => {
    expect(markerOf(row({ todos: 1, todosPending: 0, memories: 5 }))).toBe('done')
    expect(markerOf(row({ todos: 1, todosPending: 1, memories: 5 }))).toBe('pending')
  })
})

describe('monthHeadingOf', () => {
  it('writes the heading in the locale it was given', () => {
    expect(monthHeadingOf('2026-09', labelsOf(zh))).toBe('2026 年 9 月')
    expect(monthHeadingOf('2026-09', labelsOf(en))).toBe('September 2026')
  })

  it('keeps the heading in one language, whatever the locale', () => {
    // The regression this pins: the card used to assemble `年`/`月` itself, so an
    // English card rendered a Chinese heading beside English weekdays.
    const english = monthHeadingOf('2026-12', labelsOf(en))
    expect(english).not.toMatch(/[年月]/)
    expect(english).toBe('December 2026')
  })

  it('falls back to the numeric month when the locale names run short', () => {
    const short = { ...labelsOf(en), months: ['January'] }
    expect(monthHeadingOf('2026-03', short)).toBe('3 2026')
  })
})

describe('CalendarCard render', () => {
  /** The slot framework composes the remaining runtime seats; this drives only the ones the card reads. */
  function render(labels: CalendarLabels): string {
    const props = {
      labels,
      loadMonth: () => Promise.resolve<JournalMonthDay[]>([]),
      loadDay: () => Promise.resolve({ version: 1 as const, date: '2026-09-30', entries: [] }),
      setDone: () => Promise.resolve(),
      t: (key: string) => key,
    } as CalendarCardProps
    // An element, not `CalendarCard(props)`: calling the component directly runs
    // its hooks outside a render, where React's dispatcher is unset.
    return renderToStaticMarkup(createElement(CalendarCard, props))
  }

  it('renders the heading, the weekday strip, and the empty state without data', () => {
    const html = render(labelsOf(en))

    expect(html).toContain('September 2026')
    for (const name of labelsOf(en).weekdays) expect(html).toContain(`>${name}</span>`)
    expect(html).toContain(labelsOf(en).empty)
  })

  it('renders every Chinese label from its own dictionary', () => {
    const html = render(labelsOf(zh))

    expect(html).toContain('2026 年 9 月')
    expect(html).toContain(labelsOf(zh).empty)
  })
})
