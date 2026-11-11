/**
 * Copy for the calendar card, registered into the client locale registry.
 *
 * The namespace merge lives here with its key set, so any module naming this
 * namespace needs only this file.
 *
 * @module dsh-journal-calendar/client/locales
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { JournalTag } from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Calendar tab name, guide entry, section headings, and empty state. */
    journal: CalendarKey
  }
}

/** Keys this package contributes. */
export type CalendarKey =
  | 'title'
  | 'description'
  | 'memory'
  | 'todo'
  | 'empty'
  | 'weekdays'
  | 'months'
  | 'monthHeading'
  | 'toggleTodo'
  | 'editDuty'
  | 'dutySave'
  | 'dutyHint'
  | 'dutyEmptyHint'
  | 'openSource'
  | 'search'
  | 'searchPlaceholder'
  | 'searchEmpty'
  | 'searchClose'
  | 'tagLabels'
  | 'openRepo'
  | 'repoUrl'

/**
 * English dictionary.
 *
 * `monthHeading` carries the order the locale writes: English puts the month
 * name first, Chinese puts the year first and suffixes the month. `{month}` is
 * the localized entry from `months`, so the heading never mixes languages.
 */
export const en: Record<CalendarKey, string> = {
  title: 'Journal',
  description: 'What happened each day, recorded by your assistant.',
  memory: 'MEMORY',
  todo: 'TO DO',
  empty: 'Nothing recorded for this day yet.',
  weekdays: 'S,M,T,W,T,F,S',
  months: 'January,February,March,April,May,June,July,August,September,October,November,December',
  monthHeading: '{month} {year}',
  toggleTodo: 'Toggle done',
  editDuty: 'Edit journal duty',
  dutySave: 'Save journal duty',
  dutyHint: 'Edit system prompt',
  dutyEmptyHint: 'Empty restores the built-in sentence.',
  openSource: 'Show the conversation that recorded this',
  search: 'Search entries',
  searchPlaceholder: 'Search titles and tags',
  searchEmpty: 'Nothing matches.',
  searchClose: 'Close search',
  tagLabels: 'Work,Study,Life,Health,Other',
  openRepo: 'Open the project on GitHub',
  repoUrl: 'https://github.com/crease123/dsh-journal-calendar',
}

/** Chinese dictionary. */
export const zh: Record<CalendarKey, string> = {
  title: '日历',
  description: '助手每天记录下来的事。',
  memory: 'MEMORY',
  todo: 'TO DO',
  empty: '这一天还没有记录。',
  weekdays: '日,一,二,三,四,五,六',
  months: '1,2,3,4,5,6,7,8,9,10,11,12',
  monthHeading: '{year} 年 {month} 月',
  toggleTodo: '切换完成状态',
  editDuty: '编辑日记职责',
  dutySave: '保存日记职责',
  dutyHint: '编辑系统提示词',
  dutyEmptyHint: '留空即用内置句子。',
  openSource: '查看记录这条的对话',
  search: '搜索条目',
  searchPlaceholder: '搜索标题与标签',
  searchEmpty: '没有匹配的条目。',
  searchClose: '关闭搜索',
  tagLabels: '工作,学习,生活,健康,其他',
  openRepo: '在 GitHub 上打开项目',
  repoUrl: 'https://github.com/crease123/dsh-journal-calendar',
}

/**
 * The five chip labels, keyed by tag id.
 * @param text - the dictionary's `tagLabels`, comma-joined in the tag order the
 * service declares; the card never sees the raw string.
 * @returns one label per tag id.
 */
export function tagLabels(text: string): Record<JournalTag, string> {
  const [work = 'work', study = 'study', life = 'life', health = 'health', other = 'other'] = text.split(',')
  return { work, study, life, health, other }
}
