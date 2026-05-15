import { eachDayOfInterval, eachWeekOfInterval, format, endOfWeek, endOfMonth, startOfMonth, parseISO } from 'date-fns'

export interface DateRange {
  from: string
  to: string
}

export function generatePeriods(dateFrom: string, dateTo: string, windowSize: 'day' | 'week' | 'month'): DateRange[] {
  const start = parseISO(dateFrom)
  const end = parseISO(dateTo)

  if (windowSize === 'day') {
    return eachDayOfInterval({ start, end }).map(d => ({
      from: format(d, 'yyyy-MM-dd'),
      to: format(d, 'yyyy-MM-dd'),
    }))
  }

  if (windowSize === 'week') {
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
      return {
        from: format(weekStart < start ? start : weekStart, 'yyyy-MM-dd'),
        to: format(weekEnd > end ? end : weekEnd, 'yyyy-MM-dd'),
      }
    })
  }

  // month
  const periods: DateRange[] = []
  let cursor = startOfMonth(start)
  while (cursor <= end) {
    const monthEnd = endOfMonth(cursor)
    periods.push({
      from: format(cursor < start ? start : cursor, 'yyyy-MM-dd'),
      to: format(monthEnd > end ? end : monthEnd, 'yyyy-MM-dd'),
    })
    cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
  }
  return periods
}
