/**
 * Copy for the calendar card, registered into the client locale registry.
 *
 * The namespace merge lives here with its key set, so any module naming this
 * namespace needs only this file.
 *
 * @module dsh-journal-calendar/client/locales
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

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
}
