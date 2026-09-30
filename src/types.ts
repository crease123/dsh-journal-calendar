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
  /** Optional expanded detail. */
  readonly detail?: string
  /** Optional short tags rendered as chips (for example `人际`). */
  readonly tags?: readonly string[]
  /** Present for `todo` only: whether it is done. */
  readonly done?: boolean
  /** Live Session that produced the entry, when the caller had one. */
  readonly sessionId?: string
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
  /** Optional expanded detail. */
  readonly detail?: string
  /** Optional short tags. */
  readonly tags?: readonly string[]
  /** Live Session that produced the entry. */
  readonly sessionId?: string
  /** `YYYY-MM-DD`; defaults to the local today. */
  readonly date?: string
  /** Local time; defaults to now. */
  readonly time?: string
  /** Explicit identity; defaults to a fresh uuid. */
  readonly id?: string
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
  }
}
