/**
 * Daily journal service: one JSON file per calendar day, exposed to the browser
 * as the `journal` Remote namespace.
 *
 * The service owns the whole storage contract: directory resolution, the
 * `YYYY-MM-DD` file name, idempotent appends, atomic replacement, and the
 * duty file backing the editable prompt section. Callers — the
 * `journal_record` tool and the calendar card — never build a path, so a
 * model-supplied string can never reach the filesystem as one.
 *
 * Reads fail loud: a day file that is not valid JSON, carries an unknown
 * version, or has a malformed entry rejects instead of being rebuilt, because
 * silently rewriting it would destroy the user's record. The duty file is the
 * one exception: it is advisory prompt text, so a missing or unreadable file
 * falls back to the built-in sentence instead of failing the assembly.
 *
 * @module dsh-journal-calendar
 */


import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  Config,
  JournalDay,
  JournalDuty,
  JournalEntry,
  JournalEntryInput,
  JournalEntryKind,
  JournalMonthDay,
  JournalSearchHit,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `journal` Remote namespace. */
    journal: Journal
  }
}

/** `YYYY-MM-DD`: the only date shape accepted, so no other string reaches `join()`. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
/** Month shape for `listMonth`. */
const MONTH_PATTERN = /^\d{4}-\d{2}$/
/** File names this service owns. */
const DAY_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.json$/

/**
 * The duty sentence mounted when no custom duty file is set. Named here so
 * the service fallback and every test name the same string.
 */
export const DEFAULT_DUTY
  = 'Recording what the user has done and what the user intends to do in the journal is one of your duties.'

/** The single file backing the editable duty prompt. */
const DUTY_FILE = 'duty.md'
/** Upper bound on the duty text, so the section cannot silently bloat the prompt. */
export const DUTY_LIMIT = 2000

/** Upper bound on search hits, so one query cannot stream the whole journal into the card. */
export const SEARCH_LIMIT = 100

/** Local date, not UTC: the calendar flips pages in the user's timezone. */
function localDate(now = new Date()): string {
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Local time; entries carry seconds because the card renders them. */
function localTime(now = new Date()): string {
  return [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join(':')
}

/** Parse and validate one day file; never repairs in place. */
function parseDay(raw: string, path: string): JournalDay {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new RemoteError('journal/not-json', `${path} is not valid JSON; refusing to overwrite it`, {
      path,
      cause: (error as Error).message,
    })
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new RemoteError('journal/malformed', `${path} is not a JSON object`, { path })
  }
  const record = parsed as Record<string, unknown>
  if (record['version'] !== 1) {
    throw new RemoteError('journal/unsupported-version', `${path} has version ${String(record['version'])}`, {
      path,
      version: String(record['version']),
    })
  }
  const date = record['date']
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    throw new RemoteError('journal/malformed', `${path} has an invalid date: ${String(date)}`, { path })
  }
  if (!Array.isArray(record['entries'])) {
    throw new RemoteError('journal/malformed', `${path} has no entries array`, { path })
  }
  const entries = record['entries'].map((entry, index): JournalEntry => {
    if (typeof entry !== 'object' || entry === null) {
      throw new RemoteError('journal/malformed', `${path} entry ${index} is not an object`, { path })
    }
    const item = entry as Record<string, unknown>
    for (const field of ['id', 'time', 'title'] as const) {
      const value = item[field]
      if (typeof value !== 'string' || value === '') {
        throw new RemoteError('journal/malformed', `${path} entry ${index} is missing ${field}`, { path })
      }
    }
    // Files written before kinds existed hold memories.
    const kind = item['kind'] === undefined ? 'memory' : item['kind']
    if (kind !== 'todo' && kind !== 'memory') {
      throw new RemoteError('journal/malformed', `${path} entry ${index} has kind ${String(item['kind'])}`, { path })
    }
    return {
      id: item['id'] as string,
      kind,
      time: item['time'] as string,
      title: item['title'] as string,
      ...Array.isArray(item['tags']) ? { tags: item['tags'] as string[] } : {},
      ...typeof item['done'] === 'boolean' ? { done: item['done'] } : {},
      ...typeof item['sessionId'] === 'string' ? { sessionId: item['sessionId'] } : {},
      ...typeof item['turn'] === 'number' ? { turn: item['turn'] } : {},
      ...typeof item['step'] === 'number' ? { step: item['step'] } : {},
    }
  })
  return { version: 1, date, entries }
}

/**
 * Resolve the directory holding the day files.
 *
 * The service owns this rule, and the entry reads the same function to name the
 * directory in model-facing text, so a deployment cannot end up with a service
 * writing somewhere else than the description says.
 * @param config - the row's configuration.
 * @returns the configured directory, or `$DSH_HOME/journal`.
 */
export function resolveJournalDirectory(config: Config = {}): string {
  if (config.dir !== undefined && config.dir !== '') return config.dir
  return join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'journal')
}

/**
 * Whether one entry carries the search needle.
 * @param entry - stored entry.
 * @param needle - lower-cased, trimmed query.
 * @returns true when the title or a tag contains the needle.
 */
function matchesQuery(entry: JournalEntry, needle: string): boolean {
  // Only what the card draws is searchable: the title and the tag chips.
  const haystack = [entry.title, ...entry.tags ?? []].join('\n').toLowerCase()
  return haystack.includes(needle)
}

/** One JSON file per day, plus the Remote surface the calendar card reads. */
export class Journal extends TypertRemoteService {
  static Config: z<Config> = z.object({ dir: z.string().default('') })

  /** Resolved directory; exposed so a deployment can report where entries live. */
  readonly directory: string
  /** Per-date serial chain: read-modify-write must not interleave within one day. */
  private readonly queues = new Map<string, Promise<unknown>>()
  /**
   * Newest turn and step each live Session reached. An entry cites the
   * position it was recorded at so the card can jump back to that
   * conversation turn; the service owns it because a tool execution itself
   * carries no turn, while every Session event does.
   */
  private readonly positions = new Map<string, { readonly turn: number; readonly step: number }>()

  /**
   * @param ctx - owning Context.
   * @param config - directory override; defaults to `$DSH_HOME/journal`.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'journal')
    this.directory = resolveJournalDirectory(config)
    this.ctx.on('session/event', (session, event) => {
      if (event.type === 'turn/start') {
        this.positions.set(session.id, { turn: event.data.turn, step: 0 })
        return
      }
      // A tool call always runs inside a step, so this is the position the
      // journal_record execution can cite.
      if (event.type === 'step/start') {
        this.positions.set(session.id, { turn: event.data.turn, step: event.data.step })
      }
    })
  }

  /**
   * Append one entry to its day file. Repeating an existing `id` returns that
   * entry instead of writing a second one, so a retried tool call is safe.
   * @param input - entry content; `title` is required.
   * @returns the stored entry.
   */
  async record(input: JournalEntryInput): Promise<JournalEntry> {
    const date = this.assertDate(input.date ?? localDate())
    if (input.title.trim() === '') {
      throw new RemoteError('journal/invalid-entry', 'title must not be empty', { reason: 'empty title' })
    }
    const kind: JournalEntryKind = input.kind ?? 'memory'
    if (kind !== 'todo' && kind !== 'memory') {
      throw new RemoteError('journal/invalid-entry', `kind must be todo or memory, received ${kind}`, {
        reason: `kind=${kind}`,
      })
    }
    // Explicit fields win, so a caller replaying an entry keeps its citation.
    const position = input.turn === undefined
      ? input.sessionId === undefined ? undefined : this.positions.get(input.sessionId)
      : { turn: input.turn, step: input.step ?? 0 }
    const entry: JournalEntry = {
      id: input.id ?? randomUUID(),
      kind,
      time: input.time ?? localTime(),
      title: input.title.trim(),
      ...input.tags === undefined || input.tags.length === 0 ? {} : { tags: [...input.tags] },
      // A todo always carries its flag; the card's checkbox reads exactly this.
      ...kind === 'todo' ? { done: false } : {},
      ...input.sessionId === undefined ? {} : { sessionId: input.sessionId },
      // Where in that Session the recording happened. A caller inside the
      // Session supplies the Session; the position comes from its event stream.
      ...position === undefined ? {} : { turn: position.turn, step: position.step },
    }
    return this.serialize(date, async () => {
      const day = await this.readDay(date)
      const existing = day.entries.find(candidate => candidate.id === entry.id)
      if (existing !== undefined) return existing
      await this.writeDay(date, { version: 1, date, entries: [...day.entries, entry] })
      return entry
    })
  }

  /** The local day boundary the service names files by. */
  today(): string {
    return localDate()
  }

  /**
   * Keyword search across every stored day, newest day first.
   *
   * The query matches a title or a tag, case-insensitively — the two things the
   * card draws — so every hit is something the owner can see. Results
   * stop at {@link SEARCH_LIMIT} so one query cannot stream the whole journal
   * into the card; a malformed day file fails the search instead of being
   * skipped, the same way {@link readDay} refuses to repair it.
   * @param query - free text; blank returns no hits.
   * @returns matching entries with the day each one lives in.
   */
  @Remote('search')
  async search(query: string): Promise<JournalSearchHit[]> {
    const needle = query.trim().toLowerCase()
    if (needle === '') return []
    let names: string[]
    try {
      names = await readdir(this.directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const dates = names
      .map(name => DAY_FILE_PATTERN.exec(name)?.[1])
      .filter((date): date is string => date !== undefined)
      .sort()
      .reverse()
    const hits: JournalSearchHit[] = []
    for (const date of dates) {
      const day = await this.readDay(date)
      for (const entry of day.entries) {
        if (!matchesQuery(entry, needle)) continue
        hits.push({ date, entry })
        if (hits.length >= SEARCH_LIMIT) return hits
      }
    }
    return hits
  }

  /**
   * The effective duty prompt, read on every prompt assembly so an edit lands
   * on the next message without a reload.
   * @returns the custom text when a duty file carries non-whitespace content, the built-in sentence otherwise.
   */
  dutyNow(): JournalDuty {
    const custom = this.dutyText()
    return custom === undefined
      ? { text: DEFAULT_DUTY, customized: false }
      : { text: custom, customized: true }
  }

  /**
   * The custom duty text, when one is in effect.
   * @returns the file's text, or `undefined` when it is missing, unreadable, or blank.
   */
  private dutyText(): string | undefined {
    let raw: string
    try {
      raw = readFileSync(this.dutyPath(), 'utf8')
    } catch {
      // ENOENT or any read failure: no custom duty is in effect, and prompt
      // assembly must not fail over advisory text.
      return undefined
    }
    return raw.trim() === '' ? undefined : raw
  }

  /**
   * Read one day.
   *
   * Remote parameters cannot carry default values, so `date` is required here;
   * host-local callers that want "today" read {@link today} first.
   * @param date - `YYYY-MM-DD`.
   * @returns the day's entries, or an empty day when the file does not exist.
   */
  @Remote('day')
  async readDay(date: string): Promise<JournalDay> {
    const normalized = this.assertDate(date)
    const path = this.pathFor(normalized)
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, date: normalized, entries: [] }
      }
      throw error
    }
    return parseDay(raw, path)
  }

  /**
   * Per-day counts for one month, which is what the calendar grid draws from.
   * @param month - `YYYY-MM`.
   * @returns one row per day that has entries, ascending by date.
   */
  @Remote('month')
  async listMonth(month: string): Promise<JournalMonthDay[]> {
    if (!MONTH_PATTERN.test(month)) {
      throw new RemoteError('journal/invalid-month', `month must be YYYY-MM, received ${month}`, { value: month })
    }
    let names: string[]
    try {
      names = await readdir(this.directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const days: JournalMonthDay[] = []
    for (const name of names.sort()) {
      const match = DAY_FILE_PATTERN.exec(name)
      const date = match?.[1]
      if (date === undefined || !date.startsWith(`${month}-`)) continue
      const day = await this.readDay(date)
      days.push({
        date: day.date,
        total: day.entries.length,
        memories: day.entries.filter(entry => entry.kind === 'memory').length,
        todos: day.entries.filter(entry => entry.kind === 'todo').length,
        todosPending: day.entries.filter(entry => entry.kind === 'todo' && entry.done !== true).length,
      })
    }
    return days
  }

  /**
   * Set a todo's completion flag.
   * @param id - entry identity.
   * @param done - target state.
   * @param date - day holding the entry.
   * @returns the updated entry.
   */
  @Remote('setDone')
  async setDone(id: string, done: boolean, date: string): Promise<JournalEntry> {
    const normalized = this.assertDate(date)
    return this.serialize(normalized, async () => {
      const day = await this.readDay(normalized)
      const entry = day.entries.find(candidate => candidate.id === id)
      if (entry === undefined) {
        throw new RemoteError('journal/entry-not-found', `no entry ${id} in ${normalized}`, { id, date: normalized })
      }
      if (entry.kind !== 'todo') {
        throw new RemoteError('journal/not-a-todo', `entry ${id} is a ${entry.kind}, not a todo`, {
          id,
          kind: entry.kind,
        })
      }
      const updated: JournalEntry = { ...entry, done }
      await this.writeDay(normalized, {
        version: 1,
        date: normalized,
        entries: day.entries.map(candidate => candidate.id === id ? updated : candidate),
      })
      return updated
    })
  }

  /**
   * Read the effective duty prompt for the editor's prefill.
   * @returns the text the next prompt assembly carries and whether a file backs it.
   */
  @Remote('duty')
  async readDuty(): Promise<JournalDuty> {
    return this.dutyNow()
  }

  /**
   * Replace the duty prompt.
   *
   * Empty or whitespace-only text removes the file and restores the built-in
   * sentence, so clearing the editor and saving is the reset.
   * @param text - the new duty text.
   * @returns the effective duty after the write.
   */
  @Remote('setDuty')
  async setDuty(text: string): Promise<JournalDuty> {
    if (text.length > DUTY_LIMIT) {
      throw new RemoteError('journal/invalid-duty', `duty text is ${text.length} characters; the limit is ${DUTY_LIMIT}`, {
        length: text.length,
        limit: DUTY_LIMIT,
      })
    }
    if (text.trim() === '') {
      await rm(this.dutyPath(), { force: true })
    } else {
      await this.writeDuty(text)
    }
    return this.dutyNow()
  }

  /** Reject any date that is not `YYYY-MM-DD`, so no other string reaches `join()`. */
  private assertDate(date: string): string {
    if (!DATE_PATTERN.test(date)) {
      throw new RemoteError('journal/invalid-date', `date must be YYYY-MM-DD, received ${date}`, { value: date })
    }
    return date
  }

  /** The one file this service owns for a day. */
  private pathFor(date: string): string {
    return join(this.directory, `${date}.json`)
  }

  /** The one file the duty prompt lives in. */
  private dutyPath(): string {
    return join(this.directory, DUTY_FILE)
  }

  /** Replace a day file atomically so a reader never observes half a JSON document. */
  private async writeDay(date: string, day: JournalDay): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const path = this.pathFor(date)
    const temporary = `${path}.tmp-${randomUUID()}`
    await writeFile(temporary, `${JSON.stringify(day, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }

  /** Replace the duty file atomically, mirroring the day-file write. */
  private async writeDuty(text: string): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = `${this.dutyPath()}.tmp-${randomUUID()}`
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, this.dutyPath())
  }

  /** Run tasks for one key in order; a failure does not block the next task. */
  private serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.queues.set(key, next.catch(() => undefined))
    return next
  }
}

