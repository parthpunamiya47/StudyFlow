import { titleCase } from '@/lib/utils'
import type { SessionStatus, TaskStatus } from '@/types/models'
import { Badge } from '@/ui/badge'

const SESSION_STYLES: Record<SessionStatus, { label: string; variant: string }> = {
  planned: { label: 'Planned', variant: 'bg-secondary text-secondary-foreground' },
  in_progress: { label: 'In progress', variant: 'bg-info/15 text-info' },
  completed: { label: 'Completed', variant: 'bg-success/15 text-success' },
  missed: { label: 'Missed', variant: 'bg-destructive/15 text-destructive' },
  cancelled: { label: 'Cancelled', variant: 'bg-muted text-muted-foreground' },
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const conf = SESSION_STYLES[status]
  return <Badge className={conf.variant}>{conf.label}</Badge>
}

const TASK_STYLES: Record<TaskStatus, { label: string; variant: string }> = {
  todo: { label: 'To do', variant: 'bg-secondary text-secondary-foreground' },
  in_progress: { label: 'In progress', variant: 'bg-info/15 text-info' },
  completed: { label: 'Completed', variant: 'bg-success/15 text-success' },
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const conf = TASK_STYLES[status]
  return <Badge className={conf.variant}>{conf.label}</Badge>
}

export type WorkloadLevel = 'light' | 'balanced' | 'heavy' | 'overloaded'

const WORKLOAD_STYLES: Record<WorkloadLevel, { label: string; variant: string }> = {
  light: { label: 'Light', variant: 'bg-success/15 text-success' },
  balanced: { label: 'Balanced', variant: 'bg-info/15 text-info' },
  heavy: { label: 'Heavy', variant: 'bg-warning/15 text-warning' },
  overloaded: { label: 'Overloaded', variant: 'bg-destructive/15 text-destructive' },
}

export function WorkloadBadge({ level }: { level: WorkloadLevel }) {
  const conf = WORKLOAD_STYLES[level]
  return <Badge className={conf.variant}>{conf.label}</Badge>
}

export function DifficultyDots({ value, label }: { value: number; label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      title={label ?? `Difficulty ${value}/5`}
      aria-label={label ?? `Difficulty ${value} of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={
            i <= value
              ? 'h-1.5 w-1.5 rounded-full bg-warning'
              : 'h-1.5 w-1.5 rounded-full bg-muted-foreground/25'
          }
        />
      ))}
    </span>
  )
}

export { titleCase }
