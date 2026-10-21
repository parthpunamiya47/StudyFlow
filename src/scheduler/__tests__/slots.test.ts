import { describe, expect, it } from 'vitest'
import {
  availabilityWindowsForDay,
  clampStart,
  hasOverlap,
  intersectIntervals,
  mergeIntervals,
  subtractIntervals,
  totalMinutes,
} from '@/scheduler/slots'
import { makeAvailability } from '@/test/fixtures'

describe('mergeIntervals', () => {
  it('merges touching and overlapping intervals', () => {
    const merged = mergeIntervals([
      { start: 60, end: 120 },
      { start: 100, end: 180 },
      { start: 180, end: 240 },
      { start: 300, end: 360 },
    ])
    expect(merged).toEqual([
      { start: 60, end: 240 },
      { start: 300, end: 360 },
    ])
  })
})

describe('subtractIntervals', () => {
  it('removes busy time and never returns overlapping output', () => {
    const free = subtractIntervals(
      [{ start: 0, end: 600 }],
      [
        { start: 100, end: 150 },
        { start: 300, end: 400 },
      ],
    )
    expect(free).toEqual([
      { start: 0, end: 100 },
      { start: 150, end: 300 },
      { start: 400, end: 600 },
    ])
    for (let i = 1; i < free.length; i++) {
      expect(hasOverlap(free[i - 1]!, free[i]!)).toBe(false)
    }
  })

  it('keeps segments partially covered at the edges', () => {
    const free = subtractIntervals(
      [{ start: 60, end: 120 }],
      [{ start: 0, end: 80 }],
    )
    expect(free).toEqual([{ start: 80, end: 120 }])
  })

  it('returns nothing when everything is busy', () => {
    expect(
      subtractIntervals([{ start: 60, end: 120 }], [{ start: 0, end: 1440 }]),
    ).toEqual([])
  })

  it('subtracted output never overlaps the busy list', () => {
    const base = [{ start: 0, end: 480 }]
    const busy = [
      { start: 60, end: 120 },
      { start: 200, end: 260 },
    ]
    const free = subtractIntervals(base, busy)
    for (const f of free) {
      for (const b of busy) {
        expect(hasOverlap(f, b)).toBe(false)
      }
    }
    expect(totalMinutes(free) + totalMinutes(busy)).toBe(totalMinutes(base))
  })
})

describe('intersectIntervals', () => {
  it('returns only shared time', () => {
    expect(
      intersectIntervals(
        [
          { start: 0, end: 100 },
          { start: 200, end: 300 },
        ],
        [{ start: 50, end: 250 }],
      ),
    ).toEqual([
      { start: 50, end: 100 },
      { start: 200, end: 250 },
    ])
  })
})

describe('availability windows', () => {
  it('converts availability rows into windows for a day', () => {
    const slots = makeAvailability([1]) // Monday only
    const monday = availabilityWindowsForDay(slots, 1)
    expect(monday).toEqual([
      { start: 540, end: 720 },
      { start: 840, end: 1080 },
    ])
    expect(availabilityWindowsForDay(slots, 2)).toEqual([])
  })

  it('ignores unavailable rows', () => {
    const slots = makeAvailability([1], { is_available: false })
    expect(availabilityWindowsForDay(slots, 1)).toEqual([])
  })
})

describe('clampStart', () => {
  it('drops time before the requested start', () => {
    expect(clampStart([{ start: 60, end: 120 }], 90)).toEqual([
      { start: 90, end: 120 },
    ])
    expect(clampStart([{ start: 60, end: 120 }], 130)).toEqual([])
  })
})
