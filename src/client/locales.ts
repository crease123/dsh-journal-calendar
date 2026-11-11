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
  | 'help'
  | 'helpTitle'
  | 'helpClose'
  | 'helpRecord'
  | 'helpRecordText'
  | 'helpTags'
  | 'helpTagsText'
  | 'helpMarkers'
  | 'helpMarkersText'
  | 'helpCheck'
  | 'helpCheckText'
  | 'helpJumps'
  | 'helpJumpsText'
  | 'helpDuty'
  | 'helpDutyText'

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
  help: 'Journal guide',
  helpTitle: 'How the journal works',
  helpClose: 'Close the guide',
  helpRecord: 'Recording',
  helpRecordText: 'The assistant writes what you did and what you plan to do into the day\'s file. A todo is a plan and can be checked off; a memory has already happened.',
  helpTags: 'Tags',
  helpTagsText: 'Every entry carries one of five tags — Work, Study, Life, Health, Other — and its chip takes that tag\'s colour.',
  helpMarkers: 'Day markers',
  helpMarkersText: 'Hollow ring: todos still open. Green dot: every todo done. Blue dot: memories only. No marker: nothing recorded.',
  helpCheck: 'Checking off and search',
  helpCheckText: 'Click a todo row to flip it. The magnifier searches titles and tags across every day; picking a hit opens that day.',
  helpJumps: 'Back to the conversation',
  helpJumpsText: 'A memory recorded in a conversation opens that conversation, at the turn it was recorded in.',
  helpDuty: 'Duty and files',
  helpDutyText: '✎ rewrites the sentence that tells the assistant what the journal covers; empty restores the built-in one. Entries are plain JSON, one file per day in the journal folder — by default ~/.dsh/journal — and editable by hand.',
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
  help: '使用说明',
  helpTitle: '日历怎么用',
  helpClose: '关闭说明',
  helpRecord: '记录',
  helpRecordText: '助手把「做了什么、打算做什么」写进当天文件。待办是打算做的事，可以勾选；记事是已经发生的事。',
  helpTags: '标签',
  helpTagsText: '每条都带一个固定标签：工作、学习、生活、健康、其他，标签块的颜色跟着它走。',
  helpMarkers: '日期标记',
  helpMarkersText: '空心圈：还有待办没完成。绿点：待办都完成了。蓝点：这天只有记事。没有标记：这天没有记录。',
  helpCheck: '勾选与搜索',
  helpCheckText: '点待办行可以切换完成状态。放大镜按标题和标签搜所有日期，点一条结果就跳到那天。',
  helpJumps: '回到对话',
  helpJumpsText: '在对话里记下的记事，点标题就回到那条对话，停在记录它的那一轮。',
  helpDuty: '职责文案与文件',
  helpDutyText: '✎ 改写告诉助手「日记记什么」的那句话，留空恢复内置版本。条目是纯 JSON，日记目录里一天一个文件（默认 ~/.dsh/journal），可以直接编辑。',
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
