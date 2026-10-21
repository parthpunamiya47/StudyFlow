/**
 * Time-slot primitives: minute-based intervals inside a single day.
 *
 * Invariant: a list returned by these helpers is always sorted and
 * non-overlapping, which is what prevents double-booking.
 */

import type { AvailabilitySlot } from '@/types/models'
import { timeToMinutes } from '@/lib/time'

export interface Interval {
  start: number // minutes from midnight (inclusive)
  end: number // minutes from midnight (exclusive)
}

export const DAY_START = 0
export const DAY_END = 24 * 60

export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const out: Interval[] = [{ ...sorted[0]! }]
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!
    const last = out[out.length - 1]!
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      out.push({ ...current })
    }
  }
  return out
}

export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i]!.start, b[j]!.start)
    const end = Math.min(a[i]!.end, b[j]!.end)
    if (start < end) out.push({ start, end })
    if (a[i]!.end < b[j]!.end) i++
    else j++
  }
  return out
}

/** Returns `base` minus every interval in `busy` (sorted, non-overlapping). */
export function subtractIntervals(base: Interval[], busy: Interval[]): Interval[] {
  if (busy.length === 0) return mergeIntervals(base)
  const mergedBusy = mergeIntervals(busy)
  const out: Interval[] = []
  for (const segment of mergeIntervals(base)) {
    let cursor = segment.start
    for (const block of mergedBusy) {
      if (block.end <= cursor) continue
      if (block.start >= segment.end) break
      if (block.start > cursor) out.push({ start: cursor, end: Math.min(block.start, segment.end) })
      cursor = Math.max(cursor, block.end)
      if (cursor >= segment.end) break
    }
    if (cursor < segment.end) out.push({ start: cursor, end: segment.end })
  }
  return out
}

export function totalMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0)
}

/** True when any pair of interval lists share time — used by conflict tests. */
export function hasOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

/** Convert availability rows into raw windows for a JS day-of-week index. */
export function availabilityWindowsForDay(
  slots: AvailabilitySlot[],
  dayOfWeek: number,
): Interval[] {
  return slots
    .filter((slot) => slot.is_available && slot.day_of_week === dayOfWeek)
    .map((slot) => ({
      start: timeToMinutes(slot.start_time) ?? 0,
      end: timeToMinutes(slot.end_time) ?? 0,
    }))
    .filter((w) => w.end > w.start)
    .sort((a, b) => a.start - b.start)
}

/** Clamp a free interval so it starts no earlier than `notBefore`. */
export function clampStart(intervals: Interval[], notBefore: number): Interval[] {
  return intervals
    .map((i) => ({ start: Math.max(i.start, notBefore), end: i.end }))
    .filter((i) => i.end > i.start)
}

export function overlapsAny(interval: Interval, list: Interval[]): boolean {
  return list.some((other) => hasOverlap(interval, other))
}
