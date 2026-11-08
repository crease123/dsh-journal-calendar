/**
 * Wire-visible journal types shared by the Host service, the tool, and the Remote gateway.
 *
 * @module dsh-journal-calendar/types
 */

/**
 * Entry kinds, matching the two sections the calendar card renders:
 * `todo` (an intention, checkable) and `memory` (something that happened).
 */
export type JournalEntryKind = 'todo' | 'memory'

/**
 * The five tags an entry can carry — one per entry. Ids are stable across
 * releases; the card renders them through its `tagLabels` dictionary entry, and
 * `journal_record` offers exactly this set.
 */
export type JournalTag = 'work' | 'study' | 'life' | 'health' | 'other'

/** Every tag, in the order `tagLabels` lists its copy. */
export const JOURNAL_TAGS: readonly JournalTag[] = ['work', 'study', 'life', 'health', 'other']

/** One journal entry: the unit the calendar card renders one by one. */
export interface JournalEntry {
  /** Stable identity; repeating the same id is idempotent. */
  readonly id: string
  /** Which section of the day it belongs to. */
  readonly kind: JournalEntryKind
  /** Local time, `HH:MM` or `HH:MM:SS`. */
  readonly time: string
  /** One-line summary shown as the entry's main line. */
  readonly title: string
  /** The one tag the card shows as a chip and search matches. */
  readonly tag?: JournalTag
  /** Present for `todo` only: whether it is done. */
  readonly done?: boolean
  /** Live Session that produced the entry, when the caller had one. */
  readonly sessionId?: string
  /** Turn of {@link sessionId} the entry was recorded in; the card opens the conversation there. */
  readonly turn?: number
  /** Step within {@link turn}, when the recording happened inside one. */
  readonly step?: number
}

/** One natural day: exactly the JSON written to `<dir>/<date>.json`. */
export interface JournalDay {
  readonly version: 1
  readonly date: string
  readonly entries: readonly JournalEntry[]
}

/** `record()` input: only `title` is required. */
export interface JournalEntryInput {
  /** One-line summary. */
  readonly title: string
  /** Defaults to `memory`. */
  readonly kind?: JournalEntryKind
  /** The one tag; the card renders it as a chip. */
  readonly tag?: JournalTag
  /** Live Session that produced the entry. */
  readonly sessionId?: string
  /** Turn within that Session; the service fills it from the Session's own events. */
  readonly turn?: number
  /** Step within that turn; the service fills it the same way. */
  readonly step?: number
  /** `YYYY-MM-DD`; defaults to the local today. */
  readonly date?: string
  /** Local time; defaults to now. */
  readonly time?: string
  /** Explicit identity; defaults to a fresh uuid. */
  readonly id?: string
}

/** One search result: an entry and the day that holds it. */
export interface JournalSearchHit {
  /** `YYYY-MM-DD` of the day file the entry lives in. */
  readonly date: string
  /** The matching entry, exactly as stored. */
  readonly entry: JournalEntry
}

/** Per-day summary the calendar grid draws its markers from. */
export interface JournalMonthDay {
  /** `YYYY-MM-DD`. */
  readonly date: string
  /** Entries that day. */
  readonly total: number
  /** `memory` entries that day. */
  readonly memories: number
  /** `todo` entries that day. */
  readonly todos: number
  /** `todo` entries still open that day. */
  readonly todosPending: number
}

/** Effective state of the duty prompt: what the model reads, and whether a file backs it. */
export interface JournalDuty {
  /** The duty text the next prompt assembly carries. */
  readonly text: string
  /** Whether a custom duty file is in effect; `false` means the built-in sentence. */
  readonly customized: boolean
}

/** Host plugin configuration. */
export interface Config {
  /** Directory holding one JSON file per day; defaults to `$DSH_HOME/journal`. */
  dir?: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** A day file exists but is not valid JSON; the service refuses to overwrite it. */
    'journal/not-json': { readonly path: string; readonly cause: string }
    /** A day file is valid JSON but does not match the journal document shape. */
    'journal/malformed': { readonly path: string }
    /** A day file declares a version this build does not read. */
    'journal/unsupported-version': { readonly path: string; readonly version: string }
    /** The requested date is not `YYYY-MM-DD`. */
    'journal/invalid-date': { readonly value: string }
    /** The requested month is not `YYYY-MM`. */
    'journal/invalid-month': { readonly value: string }
    /** `record()` received an empty title or an unknown kind. */
    'journal/invalid-entry': { readonly reason: string }
    /** No entry with that identity exists in the named day. */
    'journal/entry-not-found': { readonly id: string; readonly date: string }
    /** The identity names a memory, which has no completion flag. */
    'journal/not-a-todo': { readonly id: string; readonly kind: string }
    /** `setDuty()` received more characters than the duty prompt may carry. */
    'journal/invalid-duty': { readonly length: number; readonly limit: number }
  }
}
