/**
 * `journal_record`: appends one entry to the daily journal, plus the one
 * prompt fact its tool definition cannot carry — how to correct an entry, at
 * the directory the mounted service reports.
 *
 * The tool only shapes arguments and delegates to {@link Journal}; the service
 * owns the date, the file name, deduplication, and atomic replacement, so a
 * model-supplied string never becomes a path. {@link registerJournalTool} is
 * called by the package entry, so the tool, the prompt section, and the card
 * all come from one composition row.
 *
 * @module dsh-journal-calendar
 */


import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { Journal } from './service.ts'

/**
 * The service this capability writes through.
 * @param ctx - the entry's Context.
 * @returns the mounted journal service.
 */
function requiredService(ctx: Context): Journal {
  const journal = ctx.get('journal')
  if (journal === undefined) {
    throw new Error('journal_record: the journal service is not mounted on this composition')
  }
  return journal
}

/**
 * The Agent's duty toward this journal, stated where the capability is mounted.
 * A tool definition can describe mechanics but cannot impose a standing duty,
 * which is why this sentence lives in a section instead.
 */
function journalDuty(): string {
  return 'Recording what the user has done and what the user intends to do in the journal is one of your duties.'
}

/**
 * Where the duty section sits: between the deployment persona (0) and the
 * deployment policies (500) in the Harness's own section-order table.
 *
 * Written as a literal rather than read from `getSectionOrder`, because that
 * table is a closed union owned by the Harness release: a third-party package
 * cannot add a member, and depending on one would tie this package to the exact
 * build that happens to define it.
 */
const DUTY_SECTION_ORDER = 100

/**
 * The correction contract, appended to the tool description. It names the
 * directory the entry resolved for its service, so the description and the
 * service can never disagree about where the files are.
 * @param directory - absolute journal directory.
 * @returns one sentence.
 */
function correctionClause(directory: string): string {
  return ` To correct or delete an entry, edit ${directory}/<YYYY-MM-DD>.json directly and keep every entry id and the top-level version: 1.`
}

/**
 * Register the `journal_record` tool and its prompt section on the entry's Context.
 *
 * The service is resolved per call instead of injected: the entry provides it
 * itself, so an `inject` edge back to it would never settle.
 * @param ctx - the entry's Context, which mounts the service as a child.
 * @param directory - the directory the entry resolved for that service.
 */
export function registerJournalTool(ctx: Context, directory: string): void {
  ctx.tools.register(defineTool({
    name: 'journal_record',
    description: `Append one entry to the personal daily journal — one JSON file per calendar day, which the calendar card renders. Call it whenever the user asks to record something, or when the conversation produced a notable decision, progress, or outcome worth keeping. Record one thing per entry; skip greetings and exploratory chatter, and record nothing when the user says not to.${correctionClause(directory)}`,
    parameters: {
      kind: {
        type: 'string',
        required: true,
        enum: ['todo', 'memory'],
        description: 'todo = an intention or plan ("run 3km at 8pm"); memory = something that happened ("talked with Mr. Gu").',
      },
      title: {
        type: 'string',
        required: true,
        description: 'One-line summary — the line shown in the day list.',
      },
      detail: {
        type: 'string',
        description: 'Optional longer detail: what was decided, why, and what comes next.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional 1–3 short tags, rendered as chips in the calendar card.',
      },
      date: {
        type: 'string',
        description: 'YYYY-MM-DD. Omit for today. Set it only when the user clearly refers to another day; a topic spanning several days is recorded once per day, in the entry for when it happened.',
      },
      time: {
        type: 'string',
        description: 'Local time, HH:MM or HH:MM:SS. Omit to use the current time.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'Stable entry identity; repeating it is idempotent.' },
          kind: { type: 'string', required: true, enum: ['todo', 'memory'], description: 'Stored entry kind.' },
          date: { type: 'string', required: true, description: 'Journal day the entry landed in.' },
          time: { type: 'string', required: true, description: 'Stored entry time.' },
          title: { type: 'string', required: true, description: 'Stored title.' },
          total: { type: 'integer', required: true, description: 'Entries in that day after this write.' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Recorded ${value.kind} ${value.date} ${value.time}: ${value.title} (${value.total} entries that day)`,
      }],
    },
    async execute(args, exec) {
      const journal = requiredService(ctx)
      const entry = await journal.record({
        title: args.title,
        kind: args.kind,
        ...args.detail === undefined ? {} : { detail: args.detail },
        ...args.tags === undefined ? {} : { tags: args.tags },
        ...args.date === undefined ? {} : { date: args.date },
        ...args.time === undefined ? {} : { time: args.time },
        // The calling agent identifies the conversation the memory came from.
        ...exec.agent === undefined ? {} : { sessionId: exec.agent.id },
      })
      // Remote methods require explicit arguments; the host-local path resolves "today" here.
      const day = await journal.readDay(args.date ?? journal.today())
      return {
        id: entry.id,
        kind: entry.kind,
        date: day.date,
        time: entry.time,
        title: entry.title,
        total: day.entries.length,
      }
    },
  }))

  // Tool guidance, not Agent identity: the text exists exactly while this
  // capability is mounted in the assembling scope.
  ctx.systemPrompt.section({
    name: 'journal:duty',
    order: DUTY_SECTION_ORDER,
    text: ({ scope }) => ctx.tools.get('journal_record', scope) === undefined ? '' : journalDuty(),
  })
}
