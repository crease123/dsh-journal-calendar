/**
 * Calendar card body for one right-Sidebar tab.
 *
 * Layout follows the owner's reference design: a month header with prev/next
 * and the duty-editor button, the weekday strip, a day grid whose cells carry
 * a marker, and below it the selected day's `TO DO` and `MEMORY` sections.
 *
 * The duty editor is a floating card over a blurred calendar rather than an
 * inline form: the header button is its whole chrome — open, save (it turns
 * into a check once the draft differs), or discard — so the card itself holds
 * only the field and one line of copy.
 *
 * Marker rule (from the owner's design):
 *   - todos exist and some are still open → hollow ring
 *   - todos exist and all are done      → filled dot (success colour)
 *   - no todos, memories exist          → filled dot (business colour)
 *   - nothing recorded                  → no marker
 *
 * @module dsh-journal-calendar/client/CalendarCard
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { JournalDay, JournalDuty, JournalMonthDay } from '../types.ts'
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
  /** Accessible name of the header button that opens the duty editor. */
  editDuty: string
  /** Accessible name of the same button once it commits the draft. */
  dutySave: string
  /** The floating card's one line of copy. */
  dutyHint: string
  /** Placeholder shown once the draft is cleared. */
  dutyEmptyHint: string
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
  /** The effective duty prompt, prefilled into the editor. */
  loadDuty: () => Promise<JournalDuty>
  /** Replace the duty prompt; empty text restores the built-in sentence. */
  saveDuty: (text: string) => Promise<JournalDuty>
}

/** The body's composed props: the tab it draws, the data face, and its copy. */
export type CalendarCardProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & CalendarInjected
  & PropsLocale<'journal'>

/** The duty editor's composed props: the draft, the commit path, and the discard gesture. */
export interface DutyPopoverProps {
  labels: CalendarLabels
  /** The text being edited; the owner keeps it so the header button can commit it. */
  draft: string
  /** A commit is in flight. */
  disabled: boolean
  /** The last failure, shown inside the card so the draft survives it. */
  failure: string | undefined
  onDraft: (text: string) => void
  onKey: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onDiscard: () => void
}

/** Whether the draft differs from the text now in effect. */
export function dutyDirty(draft: string, duty: JournalDuty | undefined): boolean {
  return duty !== undefined && draft !== duty.text
}

/**
 * What one key press inside the duty field means.
 * @param key - the pressed key.
 * @param meta - whether the platform command key was held.
 * @param ctrl - whether control was held.
 * @returns the gesture, or `undefined` when the field handles the key itself.
 */
export function dutyKeyIntent(key: string, meta: boolean, ctrl: boolean): 'save' | 'discard' | undefined {
  if (key === 'Escape') return 'discard'
  if (key === 'Enter' && (meta || ctrl)) return 'save'
  return undefined
}

/**
 * The duty editor as a floating card: the calendar behind it blurs, the field
 * carries the text now in effect, and the header button outside owns save,
 * discard, and open. Clicking the blur is the discard gesture.
 *
 * @param props - the draft, its commit path, and the discard gesture.
 * @returns the backdrop and the floating card.
 */
export function DutyPopover(props: DutyPopoverProps): ReactNode {
  const field = useRef<HTMLTextAreaElement | null>(null)

  // Focus on mount: the card appears only after the Host answered, so this
  // always lands on a prefilled field with the caret where the writing ends.
  useEffect(() => {
    const node = field.current
    if (node === null) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])

  return (
    <>
      <div className={css.scrim} aria-hidden="true" onMouseDown={props.onDiscard} />
      <div className={css.popover}>
        <textarea
          ref={field}
          className={css.dutyText}
          value={props.draft}
          placeholder={props.labels.dutyEmptyHint}
          aria-label={props.labels.editDuty}
          disabled={props.disabled}
          onChange={event => props.onDraft(event.target.value)}
          onKeyDown={props.onKey}
        />
        {props.failure === undefined ? null : <div className={css.failure}>{props.failure}</div>}
        <div className={css.dutyHint}>{props.labels.dutyHint}</div>
      </div>
    </>
  )
}

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
  const [duty, setDuty] = useState<JournalDuty | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [editingDuty, setEditingDuty] = useState(false)
  const [dutyFailure, setDutyFailure] = useState<string | undefined>(undefined)
  const [savingDuty, setSavingDuty] = useState(false)

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

  /** The header button commits the moment the draft stops matching what is stored. */
  const dutyChanged = editingDuty && dutyDirty(draft, duty)

  /**
   * Open the editor on the text now in effect. The floating card appears only
   * once the Host answered, so a failed read reports on the calendar instead
   * of opening an editor whose Save could never land.
   */
  const openDuty = (): void => {
    setEditingDuty(true)
    setDutyFailure(undefined)
    void props.loadDuty()
      .then((state) => { setDuty(state); setDraft(state.text) })
      .catch((error: unknown) => {
        setEditingDuty(false)
        setFailure(String(error))
      })
  }

  const closeDuty = (): void => {
    setEditingDuty(false)
    setDuty(undefined)
    setDraft('')
    setDutyFailure(undefined)
  }

  const commitDuty = async (): Promise<void> => {
    setSavingDuty(true)
    setDutyFailure(undefined)
    try {
      await props.saveDuty(draft)
      closeDuty()
    } catch (error) {
      // Keep the card open: the draft is the only copy of what the user wrote.
      setDutyFailure(String(error))
    } finally {
      setSavingDuty(false)
    }
  }

  /**
   * The header button carries the whole editor chrome: it opens the card,
   * commits a changed draft, and closes an unchanged one.
   */
  const onDutyButton = (): void => {
    if (!editingDuty) return openDuty()
    if (dutyChanged) void commitDuty()
    else closeDuty()
  }

  const onDutyKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    const intent = dutyKeyIntent(event.key, event.metaKey, event.ctrlKey)
    if (intent === undefined) return
    event.preventDefault()
    if (intent === 'save') void commitDuty()
    else closeDuty()
  }

  return (
    <div className={css.root}>
      <div className={css.header}>
        <button type="button" className={css.nav} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <span className={css.month}>{label}</span>
        <button type="button" className={css.nav} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        <button
          type="button"
          className={clsx(css.edit, dutyChanged && css.editReady)}
          aria-label={dutyChanged ? props.labels.dutySave : props.labels.editDuty}
          title={dutyChanged ? props.labels.dutySave : props.labels.editDuty}
          disabled={savingDuty}
          onClick={onDutyButton}
        >
          {dutyChanged ? '✓' : '✎'}
        </button>
      </div>

      {editingDuty && duty !== undefined ? (
        <DutyPopover
          labels={props.labels}
          draft={draft}
          disabled={savingDuty}
          failure={dutyFailure}
          onDraft={setDraft}
          onKey={onDutyKey}
          onDiscard={closeDuty}
        />
      ) : null}

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
