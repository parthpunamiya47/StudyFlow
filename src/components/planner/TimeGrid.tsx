/**
 * Time grid used by the planner.
 *
 * Renders day columns with hour rows, availability shading, session blocks
 * (colour-coded by subject), deadline markers, and HTML5 drag-and-drop for
 * rescheduling. Drops snap to 15 minutes; the parent validates the move.
 */

import { useState, type DragEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatMinutesOfDay,
  timeToMinutes,
  keyToDate,
  dayKeyInTz,
  minutesInTz,
} from '@/lib/time'
import type { AvailabilitySlot, StudySession, Subject, Task } from '@/types/models'

const HOUR_HEIGHT = 48
const START_HOUR = 6
const END_HOUR = 24

export interface TimeGridProps {
  dayKeys: string[]
  sessions: StudySession[]
  tasks: Task[]
  subjects: Subject[]
  availability: AvailabilitySlot[]
  timezone: string
  todayKeyString: string
  onMoveSession: (session: StudySession, dayKey: string, minutes: number) => void
  onSelectSession: (session: StudySession) => void
  selectedSessionId?: string | null
}

interface DragState {
  sessionId: string | null
  overDay: string | null
  overMinutes: number | null
}

export function TimeGrid({
  dayKeys,
  sessions,
  tasks,
  subjects,
  availability,
  timezone,
  todayKeyString,
  onMoveSession,
  onSelectSession,
  selectedSessionId,
}: TimeGridProps) {
  const [drag, setDrag] = useState<DragState>({
    sessionId: null,
    overDay: null,
    overMinutes: null,
  })

  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const subjectById = new Map(subjects.map((s) => [s.id, s]))

  const hours = Array.from(
    { length: END_HOUR - START_HOUR },
    (_, i) => START_HOUR + i,
  )

  const availabilityFor = (dayKey: string) => {
    const weekday = keyToDate(dayKey).getDay()
    return availability
      .filter((a) => a.is_available && a.day_of_week === weekday)
      .map((a) => ({
        start: timeToMinutes(a.start_time) ?? 0,
        end: timeToMinutes(a.end_time) ?? 0,
      }))
  }

  const sessionsFor = (dayKey: string) =>
    sessions
      .filter(
        (s) =>
          s.status !== 'cancelled' &&
          dayKeyInTz(new Date(s.start_at), timezone) === dayKey,
      )
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      )

  const minutesFor = (session: StudySession) =>
    minutesInTz(new Date(session.start_at), timezone)

  const handleDragOver = (event: DragEvent<HTMLDivElement>, dayKey: string) => {
    if (!drag.sessionId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const offsetY = event.clientY - rect.top
    const rawMinutes = START_HOUR * 60 + (offsetY / HOUR_HEIGHT) * 60
    const snapped = Math.max(
      START_HOUR * 60,
      Math.min(END_HOUR * 60 - 15, Math.round(rawMinutes / 15) * 15),
    )
    setDrag((d) => ({ ...d, overDay: dayKey, overMinutes: snapped }))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, dayKey: string) => {
    event.preventDefault()
    const sessionId = drag.sessionId
    const minutes = drag.overMinutes
    setDrag({ sessionId: null, overDay: null, overMinutes: null })
    if (!sessionId || minutes === null) return
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return
    onMoveSession(session, dayKey, minutes)
  }

  const dayCount = dayKeys.length
  const gridColumns =
    dayCount === 1 ? 'minmax(0, 1fr)' : `repeat(${dayCount}, minmax(140px, 1fr))`

  return (
    <div className="card-shadow overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Header */}
          <div
            className="grid border-b border-border bg-muted/50"
            style={{ gridTemplateColumns: `56px ${gridColumns}` }}
          >
            <div className="border-r border-border" />
            {dayKeys.map((key) => {
              const isToday = key === todayKeyString
              return (
                <div
                  key={key}
                  className={cn(
                    'border-r border-border px-2 py-2 text-center last:border-r-0',
                    isToday && 'bg-primary/10',
                  )}
                >
                  <p
                    className={cn(
                      'text-[11px] uppercase tracking-wide',
                      isToday ? 'font-semibold text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {keyToDate(key).toLocaleDateString('en-US', {
                      weekday: 'short',
                    })}
                  </p>
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      isToday ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {keyToDate(key).getDate()}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Body */}
          <div
            className="grid"
            style={{ gridTemplateColumns: `56px ${gridColumns}` }}
          >
            {/* Hour labels */}
            <div className="border-r border-border">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="relative border-b border-border/60"
                  style={{ height: HOUR_HEIGHT }}
                >
                  <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">
                    {formatMinutesOfDay(hour * 60)}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {dayKeys.map((key) => {
              const windows = availabilityFor(key)
              const daySessions = sessionsFor(key)
              const isToday = key === todayKeyString
              const isOver = drag.overDay === key
              return (
                <div
                  key={key}
                  className={cn(
                    'relative border-r border-border last:border-r-0',
                    isOver && 'bg-primary/5 ring-2 ring-inset ring-primary/40',
                  )}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDrop={(e) => handleDrop(e, key)}
                  onDragLeave={() =>
                    setDrag((d) => ({ ...d, overDay: null, overMinutes: null }))
                  }
                >
                  {/* Availability shading */}
                  {windows.map((window, index) => (
                    <div
                      key={index}
                      className="absolute inset-x-0 bg-success/5 border-y border-success/20"
                      style={{
                        top: ((window.start - START_HOUR * 60) / 60) * HOUR_HEIGHT,
                        height: ((window.end - window.start) / 60) * HOUR_HEIGHT,
                      }}
                      aria-hidden
                    />
                  ))}

                  {/* Hour lines */}
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="border-b border-border/60"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Drag preview line */}
                  {isOver && drag.overMinutes !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-primary"
                      style={{
                        top:
                          ((drag.overMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT,
                      }}
                    />
                  )}

                  {/* Session blocks */}
                  {daySessions.map((session) => {
                    const startMinutes = minutesFor(session)
                    const task = taskById.get(session.task_id)
                    const subject = task?.subject_id
                      ? subjectById.get(task.subject_id)
                      : undefined
                    const top =
                      ((startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT
                    const height = Math.max(
                      22,
                      (session.planned_minutes / 60) * HOUR_HEIGHT - 2,
                    )
                    const isDragging = drag.sessionId === session.id
                    const tone =
                      session.status === 'completed'
                        ? 'bg-success/15 border-success text-success'
                        : session.status === 'missed'
                          ? 'bg-destructive/15 border-destructive text-destructive'
                          : session.status === 'in_progress'
                            ? 'bg-info/15 border-info text-info'
                            : 'bg-card border-border text-foreground'
                    return (
                      <div
                        key={session.id}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', session.id)
                          setDrag({
                            sessionId: session.id,
                            overDay: null,
                            overMinutes: null,
                          })
                        }}
                        onDragEnd={() =>
                          setDrag({
                            sessionId: null,
                            overDay: null,
                            overMinutes: null,
                          })
                        }
                        onClick={() => onSelectSession(session)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onSelectSession(session)
                          }
                        }}
                        title={`${task?.title ?? 'Session'} — drag to reschedule`}
                        className={cn(
                          'absolute inset-x-1 cursor-grab overflow-hidden rounded-md border-l-4 px-2 py-1 text-[11px] leading-tight shadow-sm transition-opacity active:cursor-grabbing',
                          tone,
                          isDragging && 'opacity-40',
                          selectedSessionId === session.id &&
                            'ring-2 ring-primary ring-offset-1',
                        )}
                        style={{ top, height }}
                      >
                        <p className="truncate font-semibold">
                          {task?.title ?? 'Study session'}
                        </p>
                        <p className="truncate opacity-80">
                          {formatMinutesOfDay(startMinutes)} ·{' '}
                          {subject?.name ?? 'General'}
                        </p>
                        {height > 54 && session.status === 'completed' && (
                          <p className="mt-0.5 truncate text-success">
                            Completed · {session.actual_minutes}m
                          </p>
                        )}
                      </div>
                    )
                  })}

                  {/* Today marker */}
                  {isToday && (
                    <div
                      className="pointer-events-none absolute inset-x-0 border-t-2 border-destructive/70"
                      style={{
                        top:
                          (minutesInTz(new Date(), timezone) -
                            START_HOUR * 60) /
                          60 *
                          HOUR_HEIGHT,
                      }}
                      aria-hidden
                    >
                      <span className="absolute -top-2 left-1 rounded bg-destructive px-1 text-[9px] font-bold text-white">
                        now
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-success/40 bg-success/10" />
          Available study window
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-border bg-card" />
          Planned session
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-destructive" /> Drag a session to
          reschedule it
        </span>
      </div>
    </div>
  )
}
