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
 * only the field and one line of copy. The guide uses the same treatment for
 * the feature list, opened from a `?` beside those buttons.
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
import type { JournalDay, JournalDuty, JournalEntry, JournalMonthDay, JournalSearchHit, JournalTag } from '../types.ts'
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
  /** The five tag chips' text, keyed by tag id. */
  tags: Record<JournalTag, string>
  /** Accessible name of a memory that links back to the conversation that recorded it. */
  openSource: string
  /** Accessible name of the header button that opens keyword search. */
  search: string
  /** Placeholder of the search field. */
  searchPlaceholder: string
  /** Shown when a query matches nothing. */
  searchEmpty: string
  /** Accessible name of the button that closes search. */
  searchClose: string
  /** Accessible name of the header button that opens the guide. */
  help: string
  /** Heading of the guide. */
  helpTitle: string
  /** Accessible name of the button that closes the guide. */
  helpClose: string
  /** Guide section names, each followed by its own line of copy. */
  helpRecord: string
  helpRecordText: string
  helpTags: string
  helpTagsText: string
  helpMarkers: string
  helpMarkersText: string
  helpCheck: string
  helpCheckText: string
  helpJumps: string
  helpJumpsText: string
  helpDuty: string
  helpDutyText: string
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
  /** Show the conversation that recorded this entry, at the turn it was recorded in. */
  openSource: (entry: JournalEntry) => void
  /** Keyword search across every stored day, newest day first. */
  search: (query: string) => Promise<JournalSearchHit[]>
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

/** The search field's copy, its results, and the two gestures that leave it. */
export interface SearchPanelProps {
  labels: CalendarLabels
  /** Current query, owned by the card so the field survives re-renders. */
  query: string
  /** Hits for the current query; `undefined` while the first answer is pending. */
  results: readonly JournalSearchHit[] | undefined
  failure: string | undefined
  onQuery: (text: string) => void
  onPick: (hit: JournalSearchHit) => void
  onClose: () => void
}

/** The guide's floating card: the feature list, and the three ways out. */
export interface HelpPopoverProps {
  labels: CalendarLabels
  /** Dismiss the card: the blur, the ✕, or Escape. */
  onClose: () => void
}

/** One guide section: a feature's name and the line that explains it. */
export interface HelpSection {
  /** Feature name, drawn as the section heading. */
  title: string
  /** What the feature does, in one sentence. */
  body: string
}

/**
 * The guide's sections in reading order, resolved from the active dictionary.
 * The order is the card's own: what gets written, how it is labelled, how a day
 * is marked, how to act on it, and where the text and the files come from.
 * @param labels - copy for the locale in effect.
 * @returns one section per feature the card offers.
 */
export function helpSectionsOf(labels: CalendarLabels): readonly HelpSection[] {
  return [
    { title: labels.helpRecord, body: labels.helpRecordText },
    { title: labels.helpTags, body: labels.helpTagsText },
    { title: labels.helpMarkers, body: labels.helpMarkersText },
    { title: labels.helpCheck, body: labels.helpCheckText },
    { title: labels.helpJumps, body: labels.helpJumpsText },
    { title: labels.helpDuty, body: labels.helpDutyText },
  ]
}

/**
 * The guide as a floating card over the blurred calendar, sharing the duty
 * editor's treatment so the card has one way of interrupting itself. The card
 * scrolls rather than growing past the sidebar, and the header stays live:
 * its buttons are how the other panels replace this one.
 *
 * @param props - copy for the active locale and the dismiss gesture.
 * @returns the blur, the card with its feature list, and the close button.
 */
export function HelpPopover(props: HelpPopoverProps): ReactNode {
  const card = useRef<HTMLDivElement | null>(null)

  // Focus moves into the card so Escape reaches it and the ✕ is one tab stop
  // away; clicking the blur and the header buttons remain the other gestures.
  useEffect(() => {
    card.current?.focus()
  }, [])

  return (
    <>
      <div className={css.scrim} aria-hidden="true" onMouseDown={props.onClose} />
      <div
        ref={card}
        className={css.help}
        role="dialog"
        aria-label={props.labels.helpTitle}
        tabIndex={-1}
        onKeyDown={(event) => { if (event.key === 'Escape') props.onClose() }}
      >
        <div className={css.helpHead}>
          <span className={css.helpTitle}>{props.labels.helpTitle}</span>
          <button
            type="button"
            className={css.helpClose}
            aria-label={props.labels.helpClose}
            title={props.labels.helpClose}
            onClick={props.onClose}
          >
            ✕
          </button>
        </div>
        <div className={css.helpBody}>
          {helpSectionsOf(props.labels).map(section => (
            <div key={section.title}>
              <div className={css.helpSection}>{section.title}</div>
              <div className={css.helpText}>{section.body}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * Keyword search over every stored day, drawn in place of the day sections.
 * @param props - the query, its hits, and the gestures that leave the panel.
 * @returns the field, its failure line, and one row per hit.
 */
export function SearchPanel(props: SearchPanelProps): ReactNode {
  const field = useRef<HTMLInputElement | null>(null)

  // Opening the panel is a request to type: focus follows it.
  useEffect(() => {
    field.current?.focus()
  }, [])

  const query = props.query.trim()
  return (
    <div className={css.search}>
      <div className={css.searchBar}>
        <input
          ref={field}
          type="search"
          className={css.searchInput}
          value={props.query}
          placeholder={props.labels.searchPlaceholder}
          aria-label={props.labels.search}
          onChange={event => props.onQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') props.onClose() }}
        />
        <button
          type="button"
          className={css.searchClose}
          aria-label={props.labels.searchClose}
          title={props.labels.searchClose}
          onClick={props.onClose}
        >
          ✕
        </button>
      </div>
      {props.failure === undefined ? null : <div className={css.failure}>{props.failure}</div>}
      {query === '' || props.results === undefined ? null : props.results.length === 0
        ? <div className={css.empty}>{props.labels.searchEmpty}</div>
        : (
          <div className={css.searchList}>
            {props.results.map(hit => (
              <button
                key={`${hit.date}:${hit.entry.id}`}
                type="button"
                className={css.searchHit}
                onClick={() => props.onPick(hit)}
              >
                <span className={css.searchHitMeta}>
                  <span className={css.searchKind}>
                    {hit.entry.kind === 'todo' ? props.labels.todo : props.labels.memory}
                  </span>
                  <span className={css.time}>{hit.date} · {hit.entry.time}</span>
                </span>
                <span className={css.searchHitTitle}>{hit.entry.title}</span>
                {hit.entry.tag === undefined ? null : (
                  // The tag is searchable, so a hit that matched one shows it here.
                  <span className={css.chips}>
                    <TagChip tag={hit.entry.tag} label={props.labels.tags[hit.entry.tag]} />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
    </div>
  )
}

/**
 * One tag, drawn as a tinted chip. The hue identifies the tag, the text names it,
 * so the card needs no legend.
 * @param props - the tag and its localized label.
 * @returns the chip element.
 */
export function TagChip({ tag, label }: { tag: JournalTag; label: string }): ReactNode {
  return <em className={css.chip} data-tag={tag}>{label}</em>
}

/**
 * One todo row: the mark whose click flips it, the title, the tag, and the time.
 * @param props - the entry, whether its write is in flight, and the flip gesture.
 * @returns the row as a button, so the whole line is the target.
 */
export function TodoRow({ labels, entry, pending, onToggle }: {
  labels: CalendarLabels
  entry: JournalEntry
  pending: boolean
  onToggle: (id: string, done: boolean) => void
}): ReactNode {
  return (
    <button
      type="button"
      className={css.todoRow}
      aria-label={labels.toggleTodo}
      aria-pressed={entry.done === true}
      data-entry-id={entry.id}
      disabled={pending}
      onClick={() => onToggle(entry.id, entry.done !== true)}
    >
      <span className={clsx(css.todoMark, entry.done === true && css.todoMarkDone)} />
      <span className={clsx(css.todoTitle, entry.done === true && css.todoFinished)}>{entry.title}</span>
      {entry.tag === undefined ? null : <TagChip tag={entry.tag} label={labels.tags[entry.tag]} />}
      <span className={css.time}>{entry.time}</span>
    </button>
  )
}

/** One memory row: its chips, time, and the title that links back to where it was recorded. */
export function MemoryEntry({ labels, entry, openSource }: {
  labels: CalendarLabels
  entry: JournalEntry
  openSource: (entry: JournalEntry) => void
}): ReactNode {
  return (
    <div className={css.memory} data-entry-id={entry.id}>
      <div className={css.memoryHead}>
        <span className={css.chips}>
          {entry.tag === undefined ? null : <TagChip tag={entry.tag} label={labels.tags[entry.tag]} />}
        </span>
        <span className={css.time}>{entry.time}</span>
      </div>
      {entry.sessionId === undefined
        // No Session recorded it (hand-edited file, or a write outside a
        // conversation): the row is text, because there is nowhere to go.
        ? <div>{entry.title}</div>
        : (
          <button
            type="button"
            className={css.memoryLink}
            title={labels.openSource}
            aria-label={`${labels.openSource}: ${entry.title}`}
            onClick={() => { openSource(entry) }}
          >
            {entry.title}
          </button>
        )}
    </div>
  )
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly JournalSearchHit[] | undefined>(undefined)
  const [searchFailure, setSearchFailure] = useState<string | undefined>(undefined)
  const [helpOpen, setHelpOpen] = useState(false)
  const [highlight, setHighlight] = useState<string | undefined>(undefined)
  const root = useRef<HTMLDivElement | null>(null)

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

  // Keyword search runs on a short debounce so typing does not ask the Host per
  // keystroke; a newer query supersedes the pending timer and its answer.
  useEffect(() => {
    if (!searchOpen) return
    const needle = query.trim()
    if (needle === '') {
      setResults(undefined)
      setSearchFailure(undefined)
      return
    }
    let live = true
    const timer = window.setTimeout(() => {
      void props.search(needle)
        .then((hits) => { if (live) { setResults(hits); setSearchFailure(undefined) } })
        .catch((error: unknown) => { if (live) setSearchFailure(String(error)) })
    }, 250)
    return () => { live = false; window.clearTimeout(timer) }
  }, [query, searchOpen, props])

  // A picked result selects its day first; this scrolls that entry into view
  // once the day list holds it, then flashes it the way a conversation jump does.
  useEffect(() => {
    if (highlight === undefined) return
    const node = root.current?.querySelector<HTMLElement>(`[data-entry-id="${highlight}"]`)
    if (node === null || node === undefined) return
    const reveal = css.revealed
    if (reveal === undefined) return
    node.scrollIntoView({ block: 'center' })
    node.classList.add(reveal)
    const timer = window.setTimeout(() => { node.classList.remove(reveal) }, 1600)
    setHighlight(undefined)
    return () => { window.clearTimeout(timer) }
  }, [highlight, day])

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
    // The card holds one panel at a time: opening one closes the others.
    if (!editingDuty) { closeSearch(); closeHelp(); return openDuty() }
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

  const closeSearch = (): void => {
    setSearchOpen(false)
    setQuery('')
    setResults(undefined)
    setSearchFailure(undefined)
  }

  /** Open search over the calendar; the duty editor and search never share the card. */
  const openSearch = (): void => {
    closeDuty()
    closeHelp()
    setSearchOpen(true)
  }

  /** Open the guide over the calendar; like the other panels it holds the card alone. */
  const openHelp = (): void => {
    closeDuty()
    closeSearch()
    setHelpOpen(true)
  }

  const closeHelp = (): void => setHelpOpen(false)

  /** Show one hit: switch month and day, leave search, then let the highlight effect scroll to it. */
  const pickHit = (hit: JournalSearchHit): void => {
    setMonth(hit.date.slice(0, 7))
    setSelected(hit.date)
    closeSearch()
    setHighlight(hit.entry.id)
  }

  return (
    <div className={css.root} ref={root}>
      <div className={css.header}>
        <button type="button" className={css.nav} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <span className={css.month}>{label}</span>
        <div className={css.actions}>
          <button
            type="button"
            className={css.edit}
            aria-label={props.labels.help}
            title={props.labels.help}
            aria-expanded={helpOpen}
            onClick={() => { if (helpOpen) closeHelp(); else openHelp() }}
          >
            <span className={css.glyph} aria-hidden="true">?</span>
          </button>
          <button
            type="button"
            className={css.edit}
            aria-label={props.labels.search}
            title={props.labels.search}
            aria-pressed={searchOpen}
            onClick={() => { if (searchOpen) closeSearch(); else openSearch() }}
          >
            <svg
              className={css.icon}
              viewBox="0 0 16 16"
              width="14"
              height="14"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M10.4 10.4 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
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
        <button type="button" className={css.nav} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
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

      {helpOpen ? <HelpPopover labels={props.labels} onClose={closeHelp} /> : null}

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
              aria-pressed={date === selected}
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

      {searchOpen ? (
        <SearchPanel
          labels={props.labels}
          query={query}
          results={results}
          failure={searchFailure}
          onQuery={setQuery}
          onPick={pickHit}
          onClose={closeSearch}
        />
      ) : (
      <div className={css.day} role="group" aria-label={selected}>

        {todos.length === 0 ? null : (
          <>
            <div className={css.section}>{props.labels.todo}</div>
            {todos.map(entry => (
              <TodoRow
                key={entry.id}
                labels={props.labels}
                entry={entry}
                pending={writing.includes(entry.id)}
                onToggle={(id, done) => { void toggle(id, done) }}
              />
            ))}
          </>
        )}

        {memories.length === 0 ? null : (
          <>
            <div className={css.section}>{props.labels.memory}</div>
            {memories.map(entry => (
              <MemoryEntry key={entry.id} labels={props.labels} entry={entry} openSource={props.openSource} />
            ))}
          </>
        )}

        {todos.length === 0 && memories.length === 0 ? <div className={css.empty}>{props.labels.empty}</div> : null}
      </div>
      )}
    </div>
  )
}
