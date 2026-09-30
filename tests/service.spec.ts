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
import { Journal, resolveJournalDirectory } from '../src/service.ts'

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
