/**
 * Calendar card body for one right-Sidebar tab.
 *
 * Layout follows the owner's reference design: a month header with prev/next,
 * the weekday strip, a day grid whose cells carry a marker, and below it the
 * selected day's `TO DO` and `MEMORY` sections.
 *
 * Marker rule (from the owner's design):
 *   - todos exist and some are still open → hollow ring
 *   - todos exist and all are done      → filled dot (success colour)
 *   - no todos, memories exist          → filled dot (business colour)
 *   - nothing recorded                  → no marker
 *
 * @module dsh-journal-calendar/client/CalendarCard
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { JournalDay, JournalMonthDay } from '../types.ts'
import css from './CalendarCard.module.css'

/** Copy resolved for the active locale by the plugin's inject face. */
export interface CalendarLabels {
  memory: string
  todo: string
  empty: string
  /** Seven weekday labels, Sunday first. */
  weekdays: readonly string[]
  /** Twelve localized month names, January first. */
  months: readonly string[]
  /** Heading template with `{year}` and `{month}` placeholders, in the locale's word order. */
  monthHeading: string
  /** Accessible name of a todo row's completion toggle. */
  toggleTodo: string
}

/** Data access handed to the body by the plugin's inject face. */
export interface CalendarInjected {
  labels: CalendarLabels
  /** Per-day counts for one `YYYY-MM` month. */
  loadMonth: (month: string) => Promise<JournalMonthDay[]>
  /** One day's entries. */
  loadDay: (date: string) => Promise<JournalDay>
  /** Flip one todo's completion flag. */
  setDone: (id: string, done: boolean, date: string) => Promise<void>
}

/** The body's composed props: the tab it draws, the data face, and its copy. */
export type CalendarCardProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & CalendarInjected
  & PropsLocale<'journal'>

/** Local date, matching the Host service's own day boundary. */
function today(): string {
  const now = new Date()
  return [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

/** Shift a `YYYY-MM` month string by whole months. */
function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number) as [number, number]
  const shifted = new Date(year, index - 1 + delta, 1)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`
}

/** Which marker a day cell carries, per the design rule. */
export function markerOf(day: JournalMonthDay | undefined): 'none' | 'pending' | 'done' | 'memory' {
  if (day === undefined) return 'none'
  if (day.todos > 0) return day.todosPending > 0 ? 'pending' : 'done'
  return day.memories > 0 ? 'memory' : 'none'
}

const MONTH_LABEL = /^(\d{4})-(\d{2})$/

/**
 * Compose the month heading from the locale's own month names and word order.
 *
 * The card does not assemble a fixed template: Chinese writes
 * `<year> 年 <month> 月` while English writes `<month> <year>`, so the locale owns
 * both the names and the order and the card only fills the placeholders.
 * @param month - `YYYY-MM`.
 * @param labels - resolved month names and heading template.
 * @returns the heading as the active locale writes it.
 */
export function monthHeadingOf(month: string, labels: CalendarLabels): string {
  const match = MONTH_LABEL.exec(month)
  const year = match?.[1] ?? month.slice(0, 4)
  const index = Number(match?.[2] ?? 1)
  return labels.monthHeading
    .replace('{year}', year)
    .replace('{month}', labels.months[index - 1] ?? String(index))
}

/** Render the calendar card for whichever pane holds it. */
export function CalendarCard(props: CalendarCardProps): ReactNode {
  const current = today()
  const [month, setMonth] = useState(current.slice(0, 7))
  const [selected, setSelected] = useState(current)
  const [days, setDays] = useState<readonly JournalMonthDay[]>([])
  const [day, setDay] = useState<JournalDay | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [writing, setWriting] = useState<readonly string[]>([])

  // Presentation-local data: the card is the only thing that knows which month
  // it is showing, so the fetch result lives in component state.
  useEffect(() => {
    let live = true
    setFailure(undefined)
    void props.loadMonth(month)
      .then((rows) => { if (live) setDays(rows) })
      .catch((error: unknown) => { if (live) setFailure(String(error)) })
    return () => { live = false }
  }, [month, props])

  useEffect(() => {
    let live = true
    void props.loadDay(selected)
      .then((value) => { if (live) setDay(value) })
      .catch((error: unknown) => { if (live) setFailure(String(error)) })
    return () => { live = false }
  }, [selected, props])

  const byDate = useMemo(() => new Map(days.map(row => [row.date, row])), [days])
  const cells = useMemo(() => {
    const match = MONTH_LABEL.exec(month)
    const year = Number(match?.[1] ?? 0)
    const index = Number(match?.[2] ?? 1)
    const length = new Date(year, index, 0).getDate()
    const lead = new Date(year, index - 1, 1).getDay()
    return [
      ...Array.from({ length: lead }, () => undefined),
      ...Array.from({ length }, (_value, offset) => offset + 1),
    ]
  }, [month])

  /**
   * Flip a todo. The card shows the new state immediately and only reports a
   * failure after the Host answered, so the checkbox never lies about a write
   * that did not land; both the day and the month counts are reloaded because
   * the same write also decides the day's marker.
   */
  const toggle = async (id: string, next: boolean): Promise<void> => {
    setWriting(pending => [...pending, id])
    setDay(current => current === undefined ? current : {
      ...current,
      entries: current.entries.map(entry => entry.id === id ? { ...entry, done: next } : entry),
    })
    try {
      await props.setDone(id, next, selected)
    } catch (error) {
      setFailure(String(error))
    } finally {
      setWriting(pending => pending.filter(candidate => candidate !== id))
      void props.loadMonth(month).then(setDays).catch((error: unknown) => setFailure(String(error)))
      void props.loadDay(selected).then(setDay).catch((error: unknown) => setFailure(String(error)))
    }
  }

  const todos = day?.entries.filter(entry => entry.kind === 'todo') ?? []
  const memories = day?.entries.filter(entry => entry.kind === 'memory') ?? []
  const label = monthHeadingOf(month, props.labels)

  return (
    <div className={css.root}>
      <div className={css.header}>
        <button type="button" className={css.nav} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <span className={css.month}>{label}</span>
        <button type="button" className={css.nav} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>

      <div className={css.weekdays}>
        {props.labels.weekdays.map((name, index) => <span key={`w${index}`}>{name}</span>)}
      </div>

      <div className={css.grid}>
        {cells.map((dayNumber, index) => {
          if (dayNumber === undefined) return <span key={`blank${index}`} className={css.cellOutside} />
          const date = `${month}-${String(dayNumber).padStart(2, '0')}`
          const marker = markerOf(byDate.get(date))
          return (
            <button
              key={date}
              type="button"
              className={clsx(css.cell, date === selected && css.cellSelected)}
              onClick={() => setSelected(date)}
            >
              <span>{dayNumber}</span>
              <span className={css.markerRow}>
                {marker === 'pending' ? <i className={clsx(css.dot, css.dotPending)} /> : null}
                {marker === 'done' ? <i className={clsx(css.dot, css.dotDone)} /> : null}
                {marker === 'memory' ? <i className={clsx(css.dot, css.dotMemory)} /> : null}
              </span>
            </button>
          )
        })}
      </div>

      {failure === undefined ? null : <div className={css.failure}>{failure}</div>}

      <div className={css.day}>
        <div className={css.dayTitle}>{selected}</div>

        {todos.length === 0 ? null : (
          <>
            <div className={css.section}>{props.labels.todo}</div>
            {todos.map(entry => (
              <button
                key={entry.id}
                type="button"
                className={css.todoRow}
                aria-label={props.labels.toggleTodo}
                aria-pressed={entry.done === true}
                disabled={writing.includes(entry.id)}
                onClick={() => { void toggle(entry.id, entry.done !== true) }}
              >
                <span className={clsx(css.todoMark, entry.done === true && css.todoMarkDone)} />
                <span className={clsx(css.todoTitle, entry.done === true && css.todoFinished)}>{entry.title}</span>
                <span className={css.time}>{entry.time}</span>
              </button>
            ))}
          </>
        )}

        {memories.length === 0 ? null : (
          <>
            <div className={css.section}>{props.labels.memory}</div>
            {memories.map(entry => (
              <div key={entry.id} className={css.memory}>
                <div className={css.memoryHead}>
                  <span className={css.chips}>
                    {(entry.tags ?? []).map(tag => <em key={tag} className={css.chip}>{tag}</em>)}
                  </span>
                  <span className={css.time}>{entry.time}</span>
                </div>
                <div>{entry.title}</div>
              </div>
            ))}
          </>
        )}

        {todos.length === 0 && memories.length === 0 ? <div className={css.empty}>{props.labels.empty}</div> : null}
      </div>
    </div>
  )
}
