import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronRight,
  CalendarDays,
  Play,
  Plus,
  RefreshCcw,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/data/WorkspaceContext'
import { EmptyState } from '@/components/shared/EmptyState'
import { SessionStatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Textarea } from '@/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import { formatTime } from '@/lib/time'
import { cn, formatMinutes } from '@/lib/utils'
import {
  cancelSession,
  completeSession,
  markMissed,
  startSession,
} from '@/scheduler/sessionActions'
import type { StudySession } from '@/types/models'

interface TodayPlanProps {
  todaySessions: StudySession[]
  timezone: string
  onReplan: () => void
  replanning: boolean
}

export function TodayPlan({ todaySessions, timezone, onReplan, replanning }: TodayPlanProps) {
  const { provider } = useAuth()
  const { tasks, subjects, mutate } = useWorkspace()
  const navigate = useNavigate()
  const [completing, setCompleting] = useState<StudySession | null>(null)
  const [actualMinutes, setActualMinutes] = useState(0)
  const [reflection, setReflection] = useState('')
  const [confidence, setConfidence] = useState(0)
  const [busy, setBusy] = useState(false)

  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const subjectById = new Map(subjects.map((s) => [s.id, s]))

  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (!provider) return
    try {
      await mutate(fn)
      toast.success(label)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed.')
    }
  }

  const openComplete = (session: StudySession) => {
    setCompleting(session)
    setActualMinutes(session.planned_minutes)
    setReflection('')
    setConfidence(0)
  }

  const confirmComplete = async () => {
    if (!completing || !provider) return
    setBusy(true)
    try {
      await mutate(() =>
        completeSession(provider, completing, {
          actualMinutes,
          reflection: reflection.trim() || null,
          confidenceRating: confidence || null,
        }),
      )
      toast.success('Session completed — time recorded')
      setCompleting(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not complete.')
    } finally {
      setBusy(false)
    }
  }

  const sorted = [...todaySessions].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  )

  return (
    <section className="card-shadow rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Today's study plan
          </h2>
          <p className="text-xs text-muted-foreground">
            {sorted.length === 0
              ? 'Nothing scheduled yet'
              : `${sorted.length} session${sorted.length === 1 ? '' : 's'} · ${formatMinutes(
                  sorted
                    .filter((s) => s.status !== 'completed')
                    .reduce((sum, s) => sum + s.planned_minutes, 0),
                )} remaining`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/tasks">
              <Plus className="h-3.5 w-3.5" /> Add task
            </Link>
          </Button>
          <Button size="sm" onClick={onReplan} disabled={replanning}>
            <RefreshCcw className={cn('h-3.5 w-3.5', replanning && 'animate-spin')} />
            {replanning ? 'Replanning…' : 'Replan the day'}
          </Button>
        </div>
      </header>

      {sorted.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={CalendarDays}
            title="No sessions planned for today"
            description="Add tasks and availability, then generate a plan to see your day laid out."
            actionLabel="Open the planner"
            onAction={() => navigate('/planner')}
            className="border-0 bg-transparent"
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((session) => {
            const task = taskById.get(session.task_id)
            const subject = task?.subject_id
              ? subjectById.get(task.subject_id)
              : undefined
            const isDone = session.status === 'completed'
            const isMissed = session.status === 'missed'
            return (
              <li
                key={session.id}
                className={cn(
                  'flex flex-col gap-3 p-4 sm:flex-row sm:items-center',
                  isDone && 'bg-success/5',
                  isMissed && 'bg-destructive/5',
                )}
              >
                <div className="flex w-full items-center gap-3 sm:w-24 sm:flex-col sm:items-start">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatTime(new Date(session.start_at), timezone)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatMinutes(session.planned_minutes)}
                  </span>
                </div>
                <span
                  className="hidden h-10 w-1 rounded-full sm:block"
                  style={{ backgroundColor: subject?.color ?? 'var(--color-primary)' }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-sm font-medium text-foreground',
                      isDone && 'line-through',
                    )}
                  >
                    {task?.title ?? 'Task removed'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {subject ? `${subject.name} · ` : ''}
                    {task ? task.task_type : 'unlinked'}
                    {isDone && session.actual_minutes > 0
                      ? ` · actually ${formatMinutes(session.actual_minutes)}`
                      : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <SessionStatusBadge status={session.status} />
                  {session.status === 'planned' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void run('Session started', () => startSession(provider!, session))
                      }
                    >
                      <Play className="h-3.5 w-3.5" /> Start
                    </Button>
                  )}
                  {(session.status === 'planned' ||
                    session.status === 'in_progress') && (
                    <>
                      <Button
                        size="sm"
                        className="bg-success hover:bg-success/90"
                        onClick={() => openComplete(session)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Done
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Mark session missed"
                        onClick={() =>
                          void run('Session marked missed', () =>
                            markMissed(provider!, session),
                          )
                        }
                      >
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                  {session.status === 'in_progress' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Cancel session"
                      onClick={() =>
                        void run('Session cancelled', () =>
                          cancelSession(provider!, session),
                        )
                      }
                    >
                      Cancel
                    </Button>
                  )}
                  <Link
                    to="/planner"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label="Open in planner"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Completion dialog */}
      <Dialog open={completing !== null} onOpenChange={(open) => !open && setCompleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete session</DialogTitle>
            <DialogDescription>
              Actual time improves future estimates and analytics.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="actual-minutes">
                Actual minutes ({completing ? formatMinutes(completing.planned_minutes) : ''} planned)
              </Label>
              <Input
                id="actual-minutes"
                type="number"
                min={1}
                max={720}
                value={actualMinutes}
                onChange={(e) => setActualMinutes(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confidence (optional)</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setConfidence(value === confidence ? 0 : value)}
                    aria-label={`Confidence ${value} of 5`}
                    className={cn(
                      'h-9 w-9 rounded-lg border text-sm font-medium transition-colors',
                      confidence === value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card hover:bg-muted',
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reflection">Reflection (optional)</Label>
              <Textarea
                id="reflection"
                rows={3}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="What went well? What should you revisit?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)}>
              Cancel
            </Button>
            <Button onClick={confirmComplete} disabled={busy}>
              {busy ? 'Saving…' : 'Complete session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
