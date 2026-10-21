import { useMemo, useState, type FormEvent } from 'react'
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/data/WorkspaceContext'
import { useAuth } from '@/auth/AuthProvider'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Field } from '@/components/shared/Field'
import { PageHeader } from '@/components/shared/PageHeader'
import { RowsSkeleton } from '@/components/shared/Loaders'
import { DIFFICULTY_LABELS, SUBJECT_COLORS } from '@/lib/constants'
import { cn, formatMinutes } from '@/lib/utils'
import type { Subject } from '@/types/models'
import { formatZodError, subjectSchema } from '@/validation/schemas'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Progress } from '@/ui/progress'
import { Textarea } from '@/ui/textarea'
import { Alert, AlertDescription } from '@/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'

interface FormState {
  name: string
  description: string
  difficulty: number
  mastery_level: number
  target_grade: string
  color: string
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  difficulty: 3,
  mastery_level: 50,
  target_grade: '',
  color: SUBJECT_COLORS[0],
}

export function SubjectsPage() {
  const { subjects, tasks, sessions, loading, mutate } = useWorkspace()
  const { provider } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Subject | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Subject | null>(null)

  const stats = useMemo(() => {
    const bySubject = new Map<
      string,
      { total: number; completed: number; estimated: number; studied: number }
    >()
    for (const subject of subjects) {
      bySubject.set(subject.id, {
        total: 0,
        completed: 0,
        estimated: 0,
        studied: 0,
      })
    }
    for (const task of tasks) {
      if (!task.subject_id) continue
      const entry = bySubject.get(task.subject_id)
      if (!entry) continue
      entry.total += 1
      if (task.status === 'completed') entry.completed += 1
      entry.estimated += task.estimated_minutes
    }
    const taskIdsBySubject = new Map<string, Set<string>>()
    for (const task of tasks) {
      if (!task.subject_id) continue
      const set = taskIdsBySubject.get(task.subject_id) ?? new Set<string>()
      set.add(task.id)
      taskIdsBySubject.set(task.subject_id, set)
    }
    for (const session of sessions) {
      if (session.status !== 'completed') continue
      for (const [subjectId, ids] of taskIdsBySubject) {
        if (!ids.has(session.task_id)) continue
        const entry = bySubject.get(subjectId)
        if (entry) entry.studied += session.actual_minutes || session.planned_minutes
      }
    }
    return bySubject
  }, [subjects, tasks, sessions])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setErrors(null)
    setDialogOpen(true)
  }

  const openEdit = (subject: Subject) => {
    setEditing(subject)
    setForm({
      name: subject.name,
      description: subject.description ?? '',
      difficulty: subject.difficulty,
      mastery_level: subject.mastery_level,
      target_grade: subject.target_grade ?? '',
      color: subject.color,
    })
    setErrors(null)
    setDialogOpen(true)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = subjectSchema.safeParse({
      name: form.name,
      description: form.description || null,
      difficulty: Number(form.difficulty),
      mastery_level: Number(form.mastery_level),
      target_grade: form.target_grade || null,
      color: form.color,
    })
    if (!parsed.success) {
      setErrors(formatZodError(parsed.error))
      return
    }
    setErrors(null)
    setBusy(true)
    try {
      if (!provider) throw new Error('You are not signed in.')
      await mutate(async () => {
        if (editing) {
          await provider.updateSubject(editing.id, parsed.data)
        } else {
          await provider.createSubject(parsed.data)
        }
      })
      toast.success(editing ? 'Subject updated' : 'Subject created')
      setDialogOpen(false)
    } catch (err) {
      setErrors(err instanceof Error ? err.message : 'Could not save the subject.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Subjects" description="Loading your subjects…" />
        <RowsSkeleton rows={4} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Difficulty and mastery guide which subjects the planner prioritizes."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add subject
          </Button>
        }
      />

      {subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          description="Add the courses you're taking this semester so tasks and study sessions can be linked to them."
          actionLabel="Add your first subject"
          onAction={openCreate}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => {
            const stat = stats.get(subject.id)
            const progress =
              stat && stat.total > 0
                ? Math.round((stat.completed / stat.total) * 100)
                : 0
            return (
              <article
                key={subject.id}
                className="card-shadow flex flex-col rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="h-9 w-9 shrink-0 rounded-lg"
                      style={{ backgroundColor: subject.color }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-foreground">
                        {subject.name}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {DIFFICULTY_LABELS[subject.difficulty] ?? `Difficulty ${subject.difficulty}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${subject.name}`}
                      onClick={() => openEdit(subject)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${subject.name}`}
                      onClick={() => setPendingDelete(subject)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {subject.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {subject.description}
                  </p>
                )}

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Course progress</span>
                    <span className="font-medium text-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} indicatorClassName="bg-success" />
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Your mastery</span>
                    <span className="font-medium text-foreground">
                      {subject.mastery_level}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={subject.mastery_level}
                    aria-label={`Mastery of ${subject.name}`}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      void mutate(() =>
                        provider!.updateSubject(subject.id, {
                          mastery_level: value,
                        }),
                      ).catch(() => toast.error('Could not save mastery.'))
                    }}
                    className="w-full accent-[var(--color-primary)]"
                  />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Tasks
                    </dt>
                    <dd className="text-sm font-semibold text-foreground">
                      {stat?.completed ?? 0}/{stat?.total ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Workload
                    </dt>
                    <dd className="text-sm font-semibold text-foreground">
                      {formatMinutes(stat?.estimated ?? 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Studied
                    </dt>
                    <dd className="text-sm font-semibold text-foreground">
                      {formatMinutes(stat?.studied ?? 0)}
                    </dd>
                  </div>
                </dl>

                {subject.target_grade && (
                  <div className="mt-3">
                    <Badge variant="outline">Target: {subject.target_grade}</Badge>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit subject' : 'Add subject'}</DialogTitle>
            <DialogDescription>
              Difficulty and mastery influence scheduling priority.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors && (
              <Alert variant="destructive">
                <AlertDescription>{errors}</AlertDescription>
              </Alert>
            )}
            <Field htmlFor="subject-name" label="Name" required>
              <Input
                id="subject-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Organic Chemistry"
                autoFocus
              />
            </Field>
            <Field htmlFor="subject-desc" label="Description (optional)">
              <Textarea
                id="subject-desc"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="subject-diff" label="Difficulty">
                <select
                  id="subject-diff"
                  value={form.difficulty}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, difficulty: Number(e.target.value) }))
                  }
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value} — {DIFFICULTY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                htmlFor="subject-mastery"
                label={`Mastery: ${form.mastery_level}%`}
              >
                <input
                  id="subject-mastery"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.mastery_level}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      mastery_level: Number(e.target.value),
                    }))
                  }
                  className="mt-3 w-full accent-[var(--color-primary)]"
                />
              </Field>
              <Field
                htmlFor="subject-grade"
                label="Target grade (optional)"
                hint="e.g. A, 70%, Pass"
              >
                <Input
                  id="subject-grade"
                  value={form.target_grade}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, target_grade: e.target.value }))
                  }
                />
              </Field>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUBJECT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Color ${color}`}
                      onClick={() => setForm((f) => ({ ...f, color }))}
                      className={cn(
                        'h-7 w-7 rounded-full transition-transform',
                        form.color === color &&
                          'scale-110 ring-2 ring-ring ring-offset-2',
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
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
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Create subject'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? 'subject'}?`}
        description="Linked tasks stay available but lose their subject link. Completed history is preserved."
        confirmLabel="Delete subject"
        destructive
        onConfirm={async () => {
          if (!pendingDelete) return
          try {
            await mutate(() => provider!.deleteSubject(pendingDelete.id))
            toast.success('Subject deleted')
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
