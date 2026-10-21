import { useMemo, useState, type FormEvent } from 'react'
import {
  CheckCircle2,
  Circle,
  Filter,
  ListTodo,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/data/WorkspaceContext'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Field } from '@/components/shared/Field'
import { PageHeader } from '@/components/shared/PageHeader'
import { RowsSkeleton } from '@/components/shared/Loaders'
import {
  TASK_TYPES,
  TASK_TYPE_LABELS,
  DIFFICULTY_LABELS,
  IMPORTANCE_LABELS,
} from '@/lib/constants'
import { deadlinePhrase } from '@/lib/time'
import { computePriority, priorityBand } from '@/scheduler/priority'
import type { Task, TaskType } from '@/types/models'
import { formatZodError, taskSchema } from '@/validation/schemas'
import { Alert, AlertDescription } from '@/ui/alert'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import { cn, formatMinutes } from '@/lib/utils'

type SortKey = 'deadline' | 'priority' | 'duration' | 'subject'
type StatusFilter = 'all' | 'todo' | 'in_progress' | 'completed' | 'overdue' | 'upcoming'

interface FormState {
  title: string
  description: string
  subject_id: string
  task_type: TaskType
  deadline: string
  estimated_minutes: number
  difficulty: number
  importance: number
  mastery_level: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  subject_id: '',
  task_type: 'assignment',
  deadline: '',
  estimated_minutes: 60,
  difficulty: 3,
  importance: 3,
  mastery_level: '',
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const BAND_STYLES: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive',
  high: 'bg-warning/15 text-warning',
  medium: 'bg-info/15 text-info',
  low: 'bg-secondary text-secondary-foreground',
}

export function TasksPage() {
  const { subjects, tasks, loading, mutate } = useWorkspace()
  const { provider } = useAuth()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | TaskType>('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('deadline')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)

  const subjectById = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  )
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  const enriched = useMemo(() => {
    const now = new Date()
    return tasks.map((task) => ({
      task,
      priority: computePriority(task, { now, subjects: subjectMap }),
      overdue:
        task.status !== 'completed' &&
        task.deadline !== null &&
        new Date(task.deadline).getTime() < now.getTime(),
      upcoming:
        task.status !== 'completed' &&
        task.deadline !== null &&
        new Date(task.deadline).getTime() >= now.getTime() &&
        new Date(task.deadline).getTime() - now.getTime() < 7 * 86_400_000,
    }))
  }, [tasks, subjectMap])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = enriched.filter(({ task, overdue, upcoming }) => {
      if (query && !task.title.toLowerCase().includes(query)) return false
      if (typeFilter !== 'all' && task.task_type !== typeFilter) return false
      if (subjectFilter !== 'all' && task.subject_id !== subjectFilter) return false
      if (statusFilter === 'overdue' && !overdue) return false
      if (statusFilter === 'upcoming' && !upcoming) return false
      if (
        ['todo', 'in_progress', 'completed'].includes(statusFilter) &&
        task.status !== statusFilter
      ) {
        return false
      }
      return true
    })

    rows.sort((a, b) => {
      switch (sortKey) {
        case 'priority':
          return b.priority.score - a.priority.score
        case 'duration':
          return b.task.estimated_minutes - a.task.estimated_minutes
        case 'subject': {
          const an = subjectById.get(a.task.subject_id ?? '')?.name ?? 'zzz'
          const bn = subjectById.get(b.task.subject_id ?? '')?.name ?? 'zzz'
          return an.localeCompare(bn)
        }
        case 'deadline':
        default: {
          if (!a.task.deadline) return 1
          if (!b.task.deadline) return -1
          return a.task.deadline.localeCompare(b.task.deadline)
        }
      }
    })
    return rows
  }, [enriched, search, statusFilter, typeFilter, subjectFilter, sortKey, subjectById])

  const remainingMinutes = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== 'completed')
        .reduce((sum, t) => sum + Math.max(0, t.estimated_minutes - t.actual_minutes), 0),
    [tasks],
  )

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setErrors(null)
    setDialogOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditing(task)
    setForm({
      title: task.title,
      description: task.description ?? '',
      subject_id: task.subject_id ?? '',
      task_type: task.task_type,
      deadline: toLocalInput(task.deadline),
      estimated_minutes: task.estimated_minutes,
      difficulty: task.difficulty,
      importance: task.importance,
      mastery_level: task.mastery_level === null ? '' : String(task.mastery_level),
    })
    setErrors(null)
    setDialogOpen(true)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = taskSchema.safeParse({
      title: form.title,
      description: form.description || null,
      subject_id: form.subject_id || null,
      task_type: form.task_type,
      deadline: form.deadline
        ? new Date(form.deadline).toISOString()
        : null,
      estimated_minutes: Number(form.estimated_minutes),
      difficulty: Number(form.difficulty),
      importance: Number(form.importance),
      mastery_level: form.mastery_level === '' ? null : Number(form.mastery_level),
    })
    if (!parsed.success) {
      setErrors(formatZodError(parsed.error))
      return
    }
    if (!provider) return
    setErrors(null)
    setBusy(true)
    try {
      await mutate(async () => {
        if (editing) {
          await provider.updateTask(editing.id, parsed.data)
        } else {
          await provider.createTask(parsed.data)
        }
      })
      toast.success(editing ? 'Task updated' : 'Task created')
      setDialogOpen(false)
    } catch (err) {
      setErrors(err instanceof Error ? err.message : 'Could not save the task.')
    } finally {
      setBusy(false)
    }
  }

  const toggleComplete = async (task: Task) => {
    if (!provider) return
    try {
      await mutate(() =>
        provider.updateTask(task.id, {
          status: task.status === 'completed' ? 'todo' : 'completed',
          completed_at:
            task.status === 'completed' ? null : new Date().toISOString(),
        }),
      )
      toast.success(
        task.status === 'completed' ? 'Task reopened' : 'Task completed 🎉',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the task.')
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Tasks" description="Loading tasks…" />
        <RowsSkeleton rows={6} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={`${tasks.filter((t) => t.status !== 'completed').length} open · ${formatMinutes(remainingMinutes)} of estimated work remaining`}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add task
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" aria-hidden />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All statuses</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
            <option value="upcoming">Due this week</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | TaskType)}
            aria-label="Filter by type"
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All types</option>
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>
                {TASK_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            aria-label="Filter by subject"
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort tasks"
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="deadline">Sort: deadline</option>
            <option value="priority">Sort: priority</option>
            <option value="duration">Sort: duration</option>
            <option value="subject">Sort: subject</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={tasks.length === 0 ? 'No tasks yet' : 'No tasks match these filters'}
          description={
            tasks.length === 0
              ? 'Add assignments, exams, and projects — the planner will schedule study time for them.'
              : 'Try clearing the search or filters.'
          }
          actionLabel={tasks.length === 0 ? 'Add your first task' : undefined}
          onAction={tasks.length === 0 ? openCreate : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map(({ task, priority, overdue }) => {
            const subject = task.subject_id
              ? subjectById.get(task.subject_id)
              : undefined
            const band = priorityBand(priority.score)
            const done = task.status === 'completed'
            return (
              <li
                key={task.id}
                className={cn(
                  'card-shadow flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center',
                  overdue ? 'border-destructive/40' : 'border-border',
                  done && 'opacity-75',
                )}
              >
                <button
                  onClick={() => toggleComplete(task)}
                  aria-label={
                    done ? `Reopen ${task.title}` : `Mark ${task.title} complete`
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {done ? (
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  ) : (
                    <Circle className="h-6 w-6 text-muted-foreground" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      className={cn(
                        'text-sm font-semibold text-foreground',
                        done && 'line-through',
                      )}
                    >
                      {task.title}
                    </h2>
                    <Badge variant="outline">{TASK_TYPE_LABELS[task.task_type]}</Badge>
                    {overdue && <Badge variant="destructive">Overdue</Badge>}
                    <Badge className={BAND_STYLES[band]}>
                      P{priority.score}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {subject && (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: subject.color }}
                          aria-hidden
                        />
                        {subject.name}
                      </span>
                    )}
                    <span>{formatMinutes(task.estimated_minutes)} estimated</span>
                    {task.actual_minutes > 0 && (
                      <span>{formatMinutes(task.actual_minutes)} studied</span>
                    )}
                    {task.deadline && (
                      <span
                        className={cn(
                          overdue ? 'font-medium text-destructive' : undefined,
                        )}
                      >
                        Due {new Date(task.deadline).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        ({deadlinePhrase(task.deadline)})
                      </span>
                    )}
                  </div>
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs text-primary hover:underline">
                      Why this priority?
                    </summary>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                      {priority.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                      <li>
                        Difficulty {task.difficulty}/5 ({DIFFICULTY_LABELS[task.difficulty]}),
                        importance {task.importance}/5 ({IMPORTANCE_LABELS[task.importance]})
                      </li>
                    </ul>
                  </details>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${task.title}`}
                    onClick={() => openEdit(task)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${task.title}`}
                    onClick={() => setPendingDelete(task)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit task' : 'Add task'}</DialogTitle>
            <DialogDescription>
              Estimated duration and difficulty drive the schedule.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors && (
              <Alert variant="destructive">
                <AlertDescription>{errors}</AlertDescription>
              </Alert>
            )}
            <Field htmlFor="task-title" label="Title" required>
              <Input
                id="task-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Finish lab report 3"
                autoFocus
              />
            </Field>
            <Field htmlFor="task-desc" label="Description (optional)">
              <textarea
                id="task-desc"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="task-subject" label="Subject">
                <select
                  id="task-subject"
                  value={form.subject_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subject_id: e.target.value }))
                  }
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">No subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field htmlFor="task-type" label="Type">
                <select
                  id="task-type"
                  value={form.task_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, task_type: e.target.value as TaskType }))
                  }
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TASK_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TASK_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                htmlFor="task-deadline"
                label="Deadline (optional)"
                hint="Used to compute urgency"
              >
                <Input
                  id="task-deadline"
                  type="datetime-local"
                  value={form.deadline}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, deadline: e.target.value }))
                  }
                />
              </Field>
              <Field
                htmlFor="task-estimate"
                label="Estimated duration (minutes)"
                required
              >
                <Input
                  id="task-estimate"
                  type="number"
                  min={1}
                  max={1440}
                  value={form.estimated_minutes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, estimated_minutes: Number(e.target.value) }))
                  }
                />
              </Field>
              <Field htmlFor="task-difficulty" label="Difficulty">
                <select
                  id="task-difficulty"
                  value={form.difficulty}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, difficulty: Number(e.target.value) }))
                  }
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      {v} — {DIFFICULTY_LABELS[v]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field htmlFor="task-importance" label="Academic importance">
                <select
                  id="task-importance"
                  value={form.importance}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, importance: Number(e.target.value) }))
                  }
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      {v} — {IMPORTANCE_LABELS[v]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                htmlFor="task-mastery"
                label="Your mastery (optional)"
                hint="0–100; defaults to the subject's mastery"
              >
                <Input
                  id="task-mastery"
                  type="number"
                  min={0}
                  max={100}
                  value={form.mastery_level}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, mastery_level: e.target.value }))
                  }
                  placeholder="e.g. 40"
                />
              </Field>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Create task'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete “${pendingDelete?.title ?? ''}”?`}
        description="Planned sessions for this task are removed, but completed study sessions stay in your history."
        confirmLabel="Delete task"
        destructive
        onConfirm={async () => {
          if (!pendingDelete || !provider) return
          try {
            await mutate(() => provider.deleteTask(pendingDelete.id))
            toast.success('Task deleted')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not delete.')
          } finally {
            setPendingDelete(null)
          }
        }}
      />
    </div>
  )
}
