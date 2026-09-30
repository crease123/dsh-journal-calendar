/**
 * Daily journal service: one JSON file per calendar day, exposed to the browser
 * as the `journal` Remote namespace.
 *
 * The service owns the whole storage contract: directory resolution, the
 * `YYYY-MM-DD` file name, idempotent appends, and atomic replacement. Callers —
 * the `journal_record` tool and the calendar card — never build a path, so a
 * model-supplied string can never reach the filesystem as one.
 *
 * Reads fail loud: a day file that is not valid JSON, carries an unknown
 * version, or has a malformed entry rejects instead of being rebuilt, because
 * silently rewriting it would destroy the user's record.
 *
 * @module dsh-journal-calendar
 */


import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  Config,
  JournalDay,
  JournalEntry,
  JournalEntryInput,
  JournalEntryKind,
  JournalMonthDay,
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
      ...typeof item['detail'] === 'string' ? { detail: item['detail'] } : {},
      ...Array.isArray(item['tags']) ? { tags: item['tags'] as string[] } : {},
      ...typeof item['done'] === 'boolean' ? { done: item['done'] } : {},
      ...typeof item['sessionId'] === 'string' ? { sessionId: item['sessionId'] } : {},
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

/** One JSON file per day, plus the Remote surface the calendar card reads. */
export class Journal extends TypertRemoteService {
  static Config: z<Config> = z.object({ dir: z.string().default('') })

  /** Resolved directory; exposed so a deployment can report where entries live. */
  readonly directory: string
  /** Per-date serial chain: read-modify-write must not interleave within one day. */
  private readonly queues = new Map<string, Promise<unknown>>()

  /**
   * @param ctx - owning Context.
   * @param config - directory override; defaults to `$DSH_HOME/journal`.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'journal')
    this.directory = resolveJournalDirectory(config)
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
    const entry: JournalEntry = {
      id: input.id ?? randomUUID(),
      kind,
      time: input.time ?? localTime(),
      title: input.title.trim(),
      ...input.detail === undefined ? {} : { detail: input.detail },
      ...input.tags === undefined || input.tags.length === 0 ? {} : { tags: [...input.tags] },
      // A todo always carries its flag; the card's checkbox reads exactly this.
      ...kind === 'todo' ? { done: false } : {},
      ...input.sessionId === undefined ? {} : { sessionId: input.sessionId },
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

  /** Replace a day file atomically so a reader never observes half a JSON document. */
  private async writeDay(date: string, day: JournalDay): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const path = this.pathFor(date)
    const temporary = `${path}.tmp-${randomUUID()}`
    await writeFile(temporary, `${JSON.stringify(day, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }

  /** Run tasks for one key in order; a failure does not block the next task. */
  private serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.queues.set(key, next.catch(() => undefined))
    return next
  }
}

