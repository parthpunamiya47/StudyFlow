/**
 * Time and timezone helpers.
 *
 * The scheduler works in the student's *wall clock* (day keys + minutes from
 * midnight) and converts instants to UTC timestamps using the profile
 * timezone, so a plan generated for "09:00 Europe/Paris" is correct even when
 * the browser timezone differs.
 */

import { clamp } from '@/lib/utils'

export const MINUTES_PER_DAY = 24 * 60

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 'YYYY-MM-DD' for the given instant in the given timezone (local tz by default). */
export function dateKey(date: Date, timeZone?: string): string {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
    // en-CA yields YYYY-MM-DD
    return parts
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Parse 'YYYY-MM-DD' as local wall-clock midnight. */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
}

export function addDaysToKey(key: string, days: number): string {
  const d = keyToDate(key)
  d.setDate(d.getDate() + days)
  return dateKey(d)
}

export function todayKey(timeZone?: string): string {
  return dateKey(new Date(), timeZone)
}

/** Minutes since midnight for a Date (local wall clock). */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function formatMinutesOfDay(min: number): string {
  const m = clamp(Math.round(min), 0, MINUTES_PER_DAY - 1)
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}

/** Convert wall-clock parts in a timezone into a UTC instant. */
export function zonedTimeToUtc(
  dayKey: string,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  const hours = Math.floor(minutesFromMidnight / 60)
  const minutes = minutesFromMidnight % 60
  const naive = Date.UTC(y ?? 2024, (m ?? 1) - 1, d ?? 1, hours, minutes, 0, 0)
  // Two-pass offset resolution handles DST transitions.
  let offset = tzOffsetMs(new Date(naive), timeZone)
  let ts = naive - offset
  offset = tzOffsetMs(new Date(ts), timeZone)
  ts = naive - offset
  return new Date(ts)
}

/** Offset of `timeZone` from UTC (ms) at the given instant. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  return asUtc - date.getTime()
}

export interface WallClock {
  year: number
  month: number
  day: number
  hours: number
  minutes: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

/** Break an instant into wall-clock parts for a timezone. */
export function wallClock(date: Date, timeZone?: string): WallClock {
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const val = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? ''
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const hourNum = Number(val('hour'))
  return {
    year: Number(val('year')),
    month: Number(val('month')),
    day: Number(val('day')),
    hours: hourNum === 24 ? 0 : hourNum,
    minutes: Number(val('minute')),
    weekday: weekdayMap[val('weekday')] ?? 0,
  }
}

/** Day key of an instant in a timezone. */
export function dayKeyInTz(date: Date, timeZone?: string): string {
  const wc = wallClock(date, timeZone)
  return `${wc.year}-${pad2(wc.month)}-${pad2(wc.day)}`
}

/** Minutes since midnight of an instant in a timezone. */
export function minutesInTz(date: Date, timeZone?: string): number {
  const wc = wallClock(date, timeZone)
  return wc.hours * 60 + wc.minutes
}

/** Format an instant as HH:mm in the given timezone. */
export function formatTime(date: Date, timeZone?: string): string {
  return formatMinutesOfDay(minutesInTz(date, timeZone))
}

export function formatTimeRange(start: Date, end: Date, timeZone?: string): string {
  return `${formatTime(start, timeZone)}–${formatTime(end, timeZone)}`
}

/** 'Mon, Oct 14' style label for a day key. */
export function formatDayLabel(key: string, long = false): string {
  const d = keyToDate(key)
  return d.toLocaleDateString('en-US', {
    weekday: long ? 'long' : 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Monday-first week containing the given day key. */
export function weekKeys(anchorKey: string): string[] {
  const d = keyToDate(anchorKey)
  const weekday = (d.getDay() + 6) % 7 // 0 = Monday
  const monday = addDaysToKey(anchorKey, -weekday)
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i))
}

export function monthLabel(anchorKey: string): string {
  return keyToDate(anchorKey).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/** Human-friendly relative day label: Today / Tomorrow / Yesterday / weekday. */
export function relativeDayLabel(key: string, today: string): string {
  if (key === today) return 'Today'
  if (key === addDaysToKey(today, 1)) return 'Tomorrow'
  if (key === addDaysToKey(today, -1)) return 'Yesterday'
  return formatDayLabel(key)
}

/** "in 3 days" / "2 hours" / "overdue" style description for deadlines. */
export function deadlinePhrase(deadline: string, now = new Date()): string {
  const diffMs = new Date(deadline).getTime() - now.getTime()
  const absMin = Math.abs(Math.round(diffMs / 60000))
  const overdue = diffMs < 0
  const day = Math.floor(absMin / (60 * 24))
  const hours = Math.floor(absMin / 60)
  let phrase: string
  if (day >= 1) phrase = day === 1 ? '1 day' : `${day} days`
  else if (hours >= 1) phrase = hours === 1 ? '1 hour' : `${hours} hours`
  else phrase = absMin <= 1 ? 'under a minute' : `${absMin} minutes`
  return overdue ? `${phrase} ago` : `in ${phrase}`
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/** 'HH:mm' -> minutes since midnight. Returns null when malformed. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}
