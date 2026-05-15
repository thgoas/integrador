import { getDb } from '../db/sqlite.js'
import { startJob } from '../etl/runner.js'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

let cronInterval: ReturnType<typeof setInterval> | null = null

function matchCron(cron: string): boolean {
  const now = new Date()
  const [minute, hour, dom, month, dow] = cron.split(' ')
  const match = (expr: string, val: number) => {
    if (expr === '*') return true
    if (expr.startsWith('*/')) return val % parseInt(expr.slice(2)) === 0
    return parseInt(expr) === val
  }
  return match(minute, now.getMinutes()) &&
    match(hour, now.getHours()) &&
    match(dom, now.getDate()) &&
    match(month, now.getMonth() + 1) &&
    match(dow, now.getDay())
}

export function startScheduler() {
  // Evaluate every minute
  cronInterval = setInterval(async () => {
    const db = getDb()
    const jobs = db.prepare("SELECT * FROM jobs WHERE status = 'idle'").all() as any[]
    const now = new Date()
    const isFirstOfMonth = now.getDate() === 1 && now.getHours() === 1 && now.getMinutes() === 0

    for (const job of jobs) {
      // Monthly reprocess: on 1st day of month at 01:00
      if (job.monthly_reprocess && isFirstOfMonth) {
        const prevMonth = subMonths(now, 1)
        const override = {
          ...job,
          date_mode: 'fixed',
          date_from: format(startOfMonth(prevMonth), 'yyyy-MM-dd'),
          date_to: format(endOfMonth(prevMonth), 'yyyy-MM-dd'),
        }
        await startJob(override).catch(console.error)
        continue
      }

      // Scheduled cron
      if (job.schedule_enabled && job.schedule_cron && matchCron(job.schedule_cron)) {
        const override = {
          ...job,
          date_mode: 'fixed',
          date_from: format(startOfMonth(now), 'yyyy-MM-dd'),
          date_to: format(now, 'yyyy-MM-dd'),
        }
        await startJob(override).catch(console.error)
      }
    }
  }, 60_000)
}

export function stopScheduler() {
  if (cronInterval) clearInterval(cronInterval)
}
