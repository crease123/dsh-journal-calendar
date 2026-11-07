/**
 * The calendar card's own logic.
 *
 * Four things live here and nowhere else:
 *
 * 1. the marker rule its doc comment states — which dot a day cell carries;
 * 2. the month heading, which the locale composes rather than the card;
 * 3. the duty editor's closed-by-default placement, so the calendar stays a
 *    calendar until its owner opens the prompt editor;
 * 4. a render smoke test, so a card that throws on empty data fails here
 *    instead of in someone's sidebar.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { CalendarCard, DutyPopover, MemoryEntry, SearchPanel, dutyDirty, dutyKeyIntent, markerOf, matchSnippet, monthHeadingOf } from '../src/client/CalendarCard.tsx'
import type { CalendarCardProps, CalendarLabels, DutyPopoverProps, SearchPanelProps } from '../src/client/CalendarCard.tsx'
import type { JournalDay, JournalDuty, JournalEntry, JournalMonthDay, JournalSearchHit } from '../src/types.ts'

/** One month row carrying only what the marker rule reads. */
function row(partial: Partial<JournalMonthDay>): JournalMonthDay {
  return { date: '2026-09-30', total: 0, memories: 0, todos: 0, todosPending: 0, ...partial }
}

/** renderToStaticMarkup escapes `&<>"'`; expectations carry the same escaping. */
function escaped(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
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
    editDuty: dictionary['editDuty'] ?? '',
    dutySave: dictionary['dutySave'] ?? '',
    dutyHint: dictionary['dutyHint'] ?? '',
    dutyEmptyHint: dictionary['dutyEmptyHint'] ?? '',
    openSource: dictionary['openSource'] ?? '',
    search: dictionary['search'] ?? '',
    searchPlaceholder: dictionary['searchPlaceholder'] ?? '',
    searchEmpty: dictionary['searchEmpty'] ?? '',
    searchClose: dictionary['searchClose'] ?? '',
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
  /** The duty face the editor test doubles, resolved like the card's own. */
  const duty: JournalDuty = { text: 'duty text', customized: true }

  /** The card opens on the current month, so the heading test derives it from the same clock. */
  function currentHeading(labels: CalendarLabels): string {
    const now = new Date()
    return monthHeadingOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, labels)
  }

  /** The slot framework composes the remaining runtime seats; this drives only the ones the card reads. */
  function render(labels: CalendarLabels, entries: JournalEntry[] = []): string {
    const day: JournalDay = { version: 1, date: '2026-09-30', entries }
    const props = {
      labels,
      loadMonth: () => Promise.resolve<JournalMonthDay[]>([]),
      loadDay: () => Promise.resolve(day),
      setDone: () => Promise.resolve(),
      loadDuty: () => Promise.resolve(duty),
      saveDuty: () => Promise.resolve(duty),
      search: () => Promise.resolve<JournalSearchHit[]>([]),
      openSource: () => undefined,
      t: (key: string) => key,
    } as CalendarCardProps
    // An element, not `CalendarCard(props)`: calling the component directly runs
    // its hooks outside a render, where React's dispatcher is unset.
    return renderToStaticMarkup(createElement(CalendarCard, props))
  }

  it('renders the heading, the weekday strip, and the empty state without data', () => {
    const html = render(labelsOf(en))

    expect(html).toContain(currentHeading(labelsOf(en)))
    for (const name of labelsOf(en).weekdays) expect(html).toContain(`>${name}</span>`)
    expect(html).toContain(labelsOf(en).empty)
  })

  it('renders every Chinese label from its own dictionary', () => {
    const html = render(labelsOf(zh))

    expect(html).toContain(currentHeading(labelsOf(zh)))
    expect(html).toContain(labelsOf(zh).empty)
  })

  it('links a memory to the conversation turn that recorded it', () => {
    const html = renderToStaticMarkup(createElement(MemoryEntry, {
      labels: labelsOf(en),
      entry: { id: 'a', kind: 'memory', time: '10:00', title: 'met the team', sessionId: 'session-1', turn: 3 },
      openSource: () => undefined,
    }))

    expect(html).toContain(`aria-label="${escaped(labelsOf(en).openSource)}: met the team"`)
    expect(html).toContain('>met the team</button>')
  })

  it('leaves a memory with no source conversation as plain text', () => {
    const html = renderToStaticMarkup(createElement(MemoryEntry, {
      labels: labelsOf(en),
      entry: { id: 'b', kind: 'memory', time: '11:00', title: 'no source' },
      openSource: () => undefined,
    }))

    expect(html).toContain('>no source</div>')
    expect(html).not.toContain(escaped(labelsOf(en).openSource))
  })

  it('carries the duty editor behind its button, closed by default', () => {
    const html = render(labelsOf(en))

    expect(html).toContain(`aria-label="${escaped(labelsOf(en).editDuty)}"`)
    expect(html).toContain(`aria-label="${escaped(labelsOf(en).search)}"`)
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain(labelsOf(en).dutyHint)
  })
})

describe('dutyDirty', () => {
  const stored: JournalDuty = { text: 'stored', customized: true }

  it('reports a change only once the draft leaves the stored text', () => {
    expect(dutyDirty('stored', stored)).toBe(false)
    expect(dutyDirty('stored ', stored)).toBe(true)
    expect(dutyDirty('', stored)).toBe(true)
  })

  it('reports nothing while the duty is still loading', () => {
    expect(dutyDirty('typed', undefined)).toBe(false)
  })
})

describe('dutyKeyIntent', () => {
  it('discards on escape and commits on the command chord', () => {
    expect(dutyKeyIntent('Escape', false, false)).toBe('discard')
    expect(dutyKeyIntent('Enter', true, false)).toBe('save')
    expect(dutyKeyIntent('Enter', false, true)).toBe('save')
  })

  it('leaves a plain enter and ordinary typing to the field', () => {
    expect(dutyKeyIntent('Enter', false, false)).toBeUndefined()
    expect(dutyKeyIntent('a', false, false)).toBeUndefined()
  })
})

describe('DutyPopover render', () => {
  function render(labels: CalendarLabels, draft: string, failure?: string): string {
    const props = {
      labels,
      draft,
      disabled: false,
      failure,
      onDraft: () => {},
      onKey: () => {},
      onDiscard: () => {},
    } as DutyPopoverProps
    // SSR runs no effects, so the field renders its value without mount focus.
    return renderToStaticMarkup(createElement(DutyPopover, props))
  }

  it('renders the floating card with the draft, one line of copy, and no buttons', () => {
    const html = render(labelsOf(en), 'duty text')

    expect(html).toContain('duty text')
    expect(html).toContain(`placeholder="${escaped(labelsOf(en).dutyEmptyHint)}"`)
    expect(html).toContain(escaped(labelsOf(en).dutyHint))
    // The header button outside the card is the whole chrome.
    expect(html).not.toContain('<button')
  })

  it('renders the Chinese copy from its own dictionary', () => {
    const html = render(labelsOf(zh), '职责')

    expect(html).toContain(labelsOf(zh).dutyHint)
    expect(html).toContain(labelsOf(zh).dutyEmptyHint)
  })

  it('shows a failed commit inside the card so the draft stays visible', () => {
    const html = render(labelsOf(en), 'duty text', 'journal/invalid-duty')

    expect(html).toContain('journal/invalid-duty')
    expect(html).toContain('duty text')
  })
})

describe('SearchPanel render', () => {
  function hit(date: string, entry: JournalEntry): JournalSearchHit {
    return { date, entry }
  }

  function render(labels: CalendarLabels, query: string, results: readonly JournalSearchHit[] | undefined): string {
    const props = {
      labels,
      query,
      results,
      failure: undefined,
      onQuery: () => {},
      onPick: () => {},
      onClose: () => {},
    } as SearchPanelProps
    return renderToStaticMarkup(createElement(SearchPanel, props))
  }

  it('renders the field and one row per hit, each labelled by kind and day', () => {
    const html = render(labelsOf(en), 'search', [
      hit('2026-09-03', { id: 'm1', kind: 'memory', time: '09:12', title: 'shipped the search' }),
      hit('2026-09-04', { id: 't1', kind: 'todo', time: '20:00', title: 'write the docs' }),
    ])

    expect(html).toContain(`placeholder="${escaped(labelsOf(en).searchPlaceholder)}"`)
    expect(html).toContain('2026-09-03')
    expect(html).toContain('09:12')
    expect(html).toContain('shipped the search')
    expect(html).toContain('2026-09-04')
    expect(html).toContain('write the docs')
    // Each row carries its kind, so a todo hit is never mistaken for a memory.
    expect(html).toContain(`>${escaped(labelsOf(en).todo)}</span>`)
    expect(html).toContain(`>${escaped(labelsOf(en).memory)}</span>`)
  })

  it('explains a hit whose match is not in the title', () => {
    const html = render(labelsOf(en), 'four agents', [
      hit('2026-09-03', { id: 'm1', kind: 'memory', time: '09:12', title: '三代理系统跑通', detail: 'four agents in one loop' }),
    ])

    expect(html).toContain('in one loop')
    expect(html).toContain('<mark')
    expect(html).toContain('four agents</mark>')
    // The title match needs no excerpt, because the title is already the row.
    const titled = render(labelsOf(en), '三代理', [
      hit('2026-09-03', { id: 'm1', kind: 'memory', time: '09:12', title: '三代理系统跑通', detail: 'four agents in one loop' }),
    ])
    expect(titled).not.toContain('<mark')
  })

  it('says nothing matches instead of leaving the list blank', () => {
    const html = render(labelsOf(en), 'zzz', [])

    expect(html).toContain(labelsOf(en).searchEmpty)
  })

  it('stays silent before the first answer arrives', () => {
    const html = render(labelsOf(en), 'search', undefined)

    expect(html).not.toContain(labelsOf(en).searchEmpty)
    expect(html).not.toContain(`>${escaped(labelsOf(en).todo)}</span>`)
  })

  it('renders the Chinese copy from its own dictionary', () => {
    const html = render(labelsOf(zh), '搜索', undefined)

    expect(html).toContain(`placeholder="${escaped(labelsOf(zh).searchPlaceholder)}"`)
    expect(html).toContain(`aria-label="${escaped(labelsOf(zh).search)}"`)
    expect(html).toContain(`aria-label="${escaped(labelsOf(zh).searchClose)}"`)
  })
})

describe('matchSnippet', () => {
  const entry = (partial: Partial<JournalEntry>): JournalEntry => ({ id: 'e', kind: 'memory', time: '10:00', title: 'title', ...partial })

  it('reports a title match as the title itself', () => {
    expect(matchSnippet(entry({ title: 'shipped the search' }), 'search')).toEqual({ field: 'title', excerpt: 'shipped the search' })
  })

  it('windows a detail match so a long detail does not flood the row', () => {
    const detail = `${'x'.repeat(80)}needle${'y'.repeat(80)}`
    const snippet = matchSnippet(entry({ detail }), 'NEEDLE')

    expect(snippet?.field).toBe('detail')
    expect(snippet?.excerpt).toContain('needle')
    expect(snippet?.excerpt.startsWith('…')).toBe(true)
    expect(snippet?.excerpt.endsWith('…')).toBe(true)
    expect(snippet?.excerpt.length).toBeLessThan(detail.length)
  })

  it('reports a tag match', () => {
    expect(matchSnippet(entry({ tags: ['research'] }), 'research')).toEqual({ field: 'tag', excerpt: 'research' })
  })

  it('answers nothing for a blank query or an entry that only matched elsewhere', () => {
    expect(matchSnippet(entry({}), '   ')).toBeUndefined()
    expect(matchSnippet(entry({ detail: 'some other text' }), 'search')).toBeUndefined()
  })
})
