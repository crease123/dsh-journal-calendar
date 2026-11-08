/**
 * The day-file contract: what {@link Journal} writes, what it refuses to
 * write, and what it refuses to repair.
 *
 * These tests own the storage rules a caller cannot see from the Remote
 * surface: the `YYYY-MM-DD` file name, per-day serialization, atomic
 * replacement, and the refusal to rewrite a file it cannot parse.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { Journal, DEFAULT_DUTY, DUTY_LIMIT, SEARCH_LIMIT, TAG_WORDS, resolveJournalDirectory } from '../src/service.ts'
import { en, tagLabels, zh } from '../src/client/locales.ts'
import { JOURNAL_TAGS } from '../src/types.ts'

const directories: string[] = []
const contexts: Context[] = []

/** One service rooted in a fresh directory. */
async function mounted(): Promise<{ journal: Journal; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'journal-spec-'))
  directories.push(dir)
  const ctx = new Context()
  contexts.push(ctx)
  return { journal: new Journal(ctx, { dir }), dir }
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** The failure code one rejected call carried. */
async function codeOf(call: Promise<unknown>): Promise<string | undefined> {
  return remoteErrorOf(await call.catch((error: unknown) => error))?.code
}

describe('resolveJournalDirectory', () => {
  it('falls back to $DSH_HOME/journal, so no deployment path is compiled in', () => {
    const previous = process.env['DSH_HOME']
    process.env['DSH_HOME'] = '/tmp/fixture-home'
    try {
      expect(resolveJournalDirectory({})).toBe('/tmp/fixture-home/journal')
      expect(resolveJournalDirectory({ dir: '/elsewhere' })).toBe('/elsewhere')
    } finally {
      if (previous === undefined) delete process.env['DSH_HOME']
      else process.env['DSH_HOME'] = previous
    }
  })
})

describe('record()', () => {
  it('writes one file per day, named for the date it recorded', async () => {
    const { journal, dir } = await mounted()
    const entry = await journal.record({ title: 'run 3km', kind: 'todo', date: '2026-03-04', time: '20:00' })

    expect(entry).toMatchObject({ kind: 'todo', time: '20:00', title: 'run 3km', done: false })
    expect(await readdir(dir)).toEqual(['2026-03-04.json'])
    expect(JSON.parse(await readFile(join(dir, '2026-03-04.json'), 'utf8'))).toEqual({
      version: 1,
      date: '2026-03-04',
      entries: [{ id: entry.id, kind: 'todo', time: '20:00', title: 'run 3km', done: false }],
    })
  })

  it('defaults the date to the service local day, so a caller may omit it', async () => {
    const { journal } = await mounted()
    const entry = await journal.record({ title: 'coffee' })

    expect(entry.kind).toBe('memory')
    expect(entry.done).toBeUndefined()
    await expect(journal.readDay(journal.today())).resolves.toMatchObject({
      date: journal.today(),
      entries: [{ title: 'coffee' }],
    })
  })

  it('returns the stored entry when the same id is recorded twice, instead of appending', async () => {
    const { journal } = await mounted()
    await journal.record({ title: 'first', id: 'same', date: '2026-03-04' })
    const again = await journal.record({ title: 'second', id: 'same', date: '2026-03-04' })

    expect(again.title).toBe('first')
    const day = await journal.readDay('2026-03-04')
    expect(day.entries.map(entry => entry.title)).toEqual(['first'])
  })

  it('rejects an empty title and an unknown kind', async () => {
    const { journal } = await mounted()
    await expect(codeOf(journal.record({ title: '   ' }))).resolves.toBe('journal/invalid-entry')
    await expect(codeOf(journal.record({ title: 'x', kind: 'note' as never }))).resolves.toBe('journal/invalid-entry')
  })

  it('rejects a date that is not YYYY-MM-DD, so no other string reaches the file name', async () => {
    const { journal, dir } = await mounted()
    for (const date of ['2026-3-4', '../../escape', 'tomorrow', '']) {
      await expect(codeOf(journal.record({ title: 'x', date }))).resolves.toBe('journal/invalid-date')
    }
    await expect(readdir(dir)).resolves.toEqual([])
  })

  it('serializes concurrent writes to one day, losing no entry', async () => {
    const { journal } = await mounted()
    await Promise.all(Array.from({ length: 12 }, (_value, index) =>
      journal.record({ title: `entry ${index}`, date: '2026-03-04' })))

    const day = await journal.readDay('2026-03-04')
    expect(day.entries).toHaveLength(12)
    expect(new Set(day.entries.map(entry => entry.title)).size).toBe(12)
  })
})

describe('readDay()', () => {
  it('reads a missing day as empty rather than failing, and writes nothing', async () => {
    const { journal, dir } = await mounted()
    await expect(journal.readDay('2026-03-04')).resolves.toEqual({ version: 1, date: '2026-03-04', entries: [] })
    await expect(readdir(dir)).resolves.toEqual([])
  })

  it('refuses a file it cannot parse instead of rewriting it', async () => {
    const { journal, dir } = await mounted()
    const path = join(dir, '2026-03-04.json')
    await writeFile(path, '{ not json', 'utf8')

    await expect(codeOf(journal.readDay('2026-03-04'))).resolves.toBe('journal/not-json')
    await expect(readFile(path, 'utf8')).resolves.toBe('{ not json')
  })

  it('refuses a version it does not read, keeping the file intact', async () => {
    const { journal, dir } = await mounted()
    const path = join(dir, '2026-03-04.json')
    await writeFile(path, JSON.stringify({ version: 2, date: '2026-03-04', entries: [] }), 'utf8')

    await expect(codeOf(journal.readDay('2026-03-04'))).resolves.toBe('journal/unsupported-version')
    await expect(readFile(path, 'utf8')).resolves.toContain('"version":2')
  })

  it('refuses an entry missing a required field', async () => {
    const { journal, dir } = await mounted()
    await writeFile(join(dir, '2026-03-04.json'), JSON.stringify({
      version: 1,
      date: '2026-03-04',
      entries: [{ id: 'a', time: '09:00' }],
    }), 'utf8')

    await expect(codeOf(journal.readDay('2026-03-04'))).resolves.toBe('journal/malformed')
  })

  it('reads the free-form tags of an older file as one tag', async () => {
    const { journal, dir } = await mounted()
    await writeFile(join(dir, '2026-03-04.json'), JSON.stringify({
      version: 1,
      date: '2026-03-04',
      entries: [
        { id: 'a', time: '09:00', title: 'named a label', tags: ['论文', '精读'] },
        { id: 'b', time: '10:00', title: 'named a language', tags: ['学习'] },
        { id: 'c', time: '11:00', title: 'named nothing we know', tags: ['某个旧标签'] },
        { id: 'd', time: '12:00', title: 'carried no tags' },
      ],
    }), 'utf8')

    const day = await journal.readDay('2026-03-04')
    // A label that names a tag still maps; anything else lands in `other`, and an
    // entry without labels gains none.
    expect(day.entries.map(entry => entry.tag)).toEqual(['other', 'study', 'other', undefined])
  })

  it('treats a pre-kinds entry as a memory', async () => {
    const { journal, dir } = await mounted()
    await writeFile(join(dir, '2026-03-04.json'), JSON.stringify({
      version: 1,
      date: '2026-03-04',
      entries: [{ id: 'a', time: '09:00', title: 'older file' }],
    }), 'utf8')

    const day = await journal.readDay('2026-03-04')
    expect(day.entries[0]?.kind).toBe('memory')
  })
})

describe('listMonth()', () => {
  it('reports one row per recorded day in that month, with kinds split', async () => {
    const { journal } = await mounted()
    await journal.record({ title: 'done thing', kind: 'todo', date: '2026-03-01', id: 'a' })
    await journal.record({ title: 'open thing', kind: 'todo', date: '2026-03-01', id: 'b' })
    await journal.record({ title: 'a memory', kind: 'memory', date: '2026-03-02' })
    await journal.record({ title: 'other month', date: '2026-04-01' })
    await journal.setDone('a', true, '2026-03-01')

    await expect(journal.listMonth('2026-03')).resolves.toEqual([
      { date: '2026-03-01', total: 2, memories: 0, todos: 2, todosPending: 1 },
      { date: '2026-03-02', total: 1, memories: 1, todos: 0, todosPending: 0 },
    ])
  })

  it('reads a month in a directory that does not exist yet as empty', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const journal = new Journal(ctx, { dir: join(tmpdir(), 'journal-spec-absent', 'nested') })
    await expect(journal.listMonth('2026-03')).resolves.toEqual([])
  })

  it('rejects a month that is not YYYY-MM', async () => {
    const { journal } = await mounted()
    await expect(codeOf(journal.listMonth('2026-3'))).resolves.toBe('journal/invalid-month')
  })
})

describe('setDone()', () => {
  it('flips a todo and persists it', async () => {
    const { journal, dir } = await mounted()
    await journal.record({ title: 'water plants', kind: 'todo', date: '2026-03-04', id: 'todo-1' })

    await expect(journal.setDone('todo-1', true, '2026-03-04')).resolves.toMatchObject({ id: 'todo-1', done: true })
    const stored = JSON.parse(await readFile(join(dir, '2026-03-04.json'), 'utf8'))
    expect(stored.entries[0].done).toBe(true)

    await expect(journal.setDone('todo-1', false, '2026-03-04')).resolves.toMatchObject({ done: false })
  })

  it('refuses an unknown entry and a memory', async () => {
    const { journal } = await mounted()
    await journal.record({ title: 'a memory', date: '2026-03-04', id: 'memory-1' })

    await expect(codeOf(journal.setDone('missing', true, '2026-03-04'))).resolves.toBe('journal/entry-not-found')
    await expect(codeOf(journal.setDone('memory-1', true, '2026-03-04'))).resolves.toBe('journal/not-a-todo')
  })
})

describe('duty', () => {
  it('serves the built-in sentence when no duty file exists', async () => {
    const { journal } = await mounted()

    await expect(journal.readDuty()).resolves.toEqual({ text: DEFAULT_DUTY, customized: false })
    expect(journal.dutyNow()).toEqual({ text: DEFAULT_DUTY, customized: false })
  })

  it('persists a custom duty and serves it to the next assembly read', async () => {
    const { journal, dir } = await mounted()
    await journal.setDuty('记录我的写作进度。')

    expect(journal.dutyNow()).toEqual({ text: '记录我的写作进度。', customized: true })
    await expect(journal.readDuty()).resolves.toEqual({ text: '记录我的写作进度。', customized: true })
    await expect(readFile(join(dir, 'duty.md'), 'utf8')).resolves.toBe('记录我的写作进度。')
  })

  it('treats blank text as the reset: the file is removed and the built-in sentence returns', async () => {
    const { journal, dir } = await mounted()
    await journal.setDuty('custom')
    await journal.setDuty('   ')

    expect(journal.dutyNow()).toEqual({ text: DEFAULT_DUTY, customized: false })
    await expect(readdir(dir)).resolves.not.toContain('duty.md')
  })

  it('rejects a duty longer than the limit, keeping the previous one in effect', async () => {
    const { journal } = await mounted()
    await journal.setDuty('keep')

    await expect(codeOf(journal.setDuty('x'.repeat(DUTY_LIMIT + 1)))).resolves.toBe('journal/invalid-duty')
    expect(journal.dutyNow().text).toBe('keep')
  })

  it('leaves the month listing untouched by the duty file', async () => {
    const { journal } = await mounted()
    await journal.setDuty('custom duty')
    await journal.record({ title: 'a day', date: '2026-03-04' })

    await expect(journal.listMonth('2026-03')).resolves.toEqual([
      { date: '2026-03-04', total: 1, memories: 1, todos: 0, todosPending: 0 },
    ])
  })
})

describe('record() citation', () => {
  /** Publish one Session event the way the Session service does. */
  type Emitter = (thisArg: unknown, name: string, session: unknown, event: unknown) => void

  /** One `step/start` publication for a Session this service is observing. */
  function publish(journal: Journal, sessionId: string, event: { type: string; data: unknown }): void {
    ;(journal.ctx.emit as Emitter)(journal.ctx, 'session/event', { id: sessionId }, event)
  }

  it('cites the turn and step the entry was recorded in', async () => {
    const { journal } = await mounted()
    publish(journal, 'session-1', { type: 'step/start', data: { turn: 3, step: 2 } })

    const entry = await journal.record({ title: 'talked with the team', date: '2026-05-06', sessionId: 'session-1' })

    expect(entry).toMatchObject({ sessionId: 'session-1', turn: 3, step: 2 })
  })

  it('keeps the citation when the day file is read back', async () => {
    const { journal } = await mounted()
    publish(journal, 'session-1', { type: 'step/start', data: { turn: 7, step: 1 } })
    await journal.record({ title: 'decided', date: '2026-05-06', sessionId: 'session-1' })

    const day = await journal.readDay('2026-05-06')

    expect(day.entries[0]).toMatchObject({ turn: 7, step: 1 })
  })

  it('opens a turn before its first step', async () => {
    const { journal } = await mounted()
    publish(journal, 'session-1', { type: 'turn/start', data: { turn: 4 } })

    const entry = await journal.record({ title: 'between steps', date: '2026-05-06', sessionId: 'session-1' })

    expect(entry).toMatchObject({ turn: 4, step: 0 })
  })

  it('records a Session it never saw as a plain citation', async () => {
    const { journal } = await mounted()

    const entry = await journal.record({ title: 'replayed', date: '2026-05-06', sessionId: 'unknown-session' })

    expect(entry).toMatchObject({ sessionId: 'unknown-session' })
    expect(entry.turn).toBeUndefined()
  })

  it('stamps no citation at all without a Session', async () => {
    const { journal } = await mounted()

    const entry = await journal.record({ title: 'typed by hand', date: '2026-05-06' })

    expect(entry.sessionId).toBeUndefined()
    expect(entry.turn).toBeUndefined()
  })
})

describe('TAG_WORDS', () => {
  it('mirrors the chip copy both dictionaries ship, so search finds what the card shows', () => {
    for (const dictionary of [en, zh]) {
      const labels = tagLabels(dictionary['tagLabels'] ?? '')
      for (const tag of JOURNAL_TAGS) {
        // Every chip label is searchable in every language the card can render;
        // search lowercases both sides, so capitalisation is not compared here.
        const searchable = TAG_WORDS[tag].map(word => word.toLowerCase())
        expect(searchable).toContain(labels[tag].toLowerCase())
      }
    }
  })
})

describe('search()', () => {
  it('finds a word in a title and reports the day it lives in, newest day first', async () => {
    const { journal } = await mounted()
    await journal.record({ title: 'ship the calendar search', kind: 'memory', date: '2026-03-04', time: '09:00' })
    await journal.record({ title: 'ship the release notes', kind: 'memory', date: '2026-03-09', time: '10:00' })
    await journal.record({ title: 'water the plants', kind: 'todo', date: '2026-03-09', time: '11:00' })

    const hits = await journal.search('ship')

    expect(hits.map(hit => hit.date)).toEqual(['2026-03-09', '2026-03-04'])
    expect(hits.map(hit => hit.entry.title)).toEqual(['ship the release notes', 'ship the calendar search'])
  })

  it('matches a tag as well as a title, and nothing the card does not draw', async () => {
    const { journal } = await mounted()
    await journal.record({ title: 'talked with the team', date: '2026-03-04' })
    await journal.record({ title: 'read a paper', date: '2026-03-05', tag: 'study' })

    // The chip is drawn in the reader's language, so both languages find the entry.
    await expect(journal.search('STUDY')).resolves.toMatchObject([{ entry: { title: 'read a paper' } }])
    await expect(journal.search('学习')).resolves.toMatchObject([{ entry: { title: 'read a paper' } }])
    // Neither a kind name nor a time is drawn as text, so neither is searchable.
    await expect(journal.search('memory')).resolves.toEqual([])
    await expect(journal.search('2026-03-04')).resolves.toEqual([])
  })

  it('matches a todo as well as a memory, keeping both kinds', async () => {
    const { journal } = await mounted()
    await journal.record({ title: 'review the draft', kind: 'todo', date: '2026-03-04', time: '20:00' })
    await journal.record({ title: 'review went well', kind: 'memory', date: '2026-03-05', time: '21:00' })

    const hits = await journal.search('review')

    expect(hits.map(hit => hit.entry.kind)).toEqual(['memory', 'todo'])
  })

  it('answers a blank query with nothing, reading no day at all', async () => {
    const { journal, dir } = await mounted()
    await journal.record({ title: 'anything', date: '2026-03-04' })

    await expect(journal.search('   ')).resolves.toEqual([])
    // The day file is still the only file: search wrote nothing and removed nothing.
    expect(await readdir(dir)).toEqual(['2026-03-04.json'])
  })

  it('answers a matchless query with an empty list', async () => {
    const { journal } = await mounted()
    await journal.record({ title: 'a memory', date: '2026-03-04' })

    await expect(journal.search('zzz')).resolves.toEqual([])
  })

  it('stops at the hit limit instead of streaming the whole journal', async () => {
    const { journal, dir } = await mounted()
    const entries = Array.from({ length: SEARCH_LIMIT + 5 }, (_value, index) => ({
      id: `entry-${index}`, kind: 'memory', time: '10:00', title: `needle ${index}`,
    }))
    await writeFile(join(dir, '2026-03-04.json'), JSON.stringify({ version: 1, date: '2026-03-04', entries }))

    await expect(journal.search('needle')).resolves.toHaveLength(SEARCH_LIMIT)
  })
})
