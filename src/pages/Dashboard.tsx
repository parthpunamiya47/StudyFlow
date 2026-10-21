import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/data/WorkspaceContext'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { TodayPlan } from '@/components/dashboard/TodayPlan'
import {
  AlertsPanel,
  NextTaskCard,
  SubjectProgressCards,
  UpcomingDeadlines,
  UpcomingSessionStrip,
  WeekHoursChart,
  WorkloadDistribution,
} from '@/components/dashboard/Panels'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState } from '@/components/shared/ErrorState'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { dayKeyInTz, todayKey } from '@/lib/time'
import { computePriority } from '@/scheduler/priority'
import { generatePlan, type PlanWarning } from '@/scheduler/engine'
import { loadEngineInput, runReplan } from '@/scheduler/actions'
import { isDemoMode } from '@/lib/env'

export function DashboardPage() {
  const { provider, profile, preferences } = useAuth()
  const {
    loading,
    error,
    subjects,
    tasks,
    sessions,
    versions,
    reload,
    mutate,
  } = useWorkspace()

  const [warnings, setWarnings] = useState<PlanWarning[]>([])
  const [replanning, setReplanning] = useState(false)
  const [planDiff, setPlanDiff] = useState<string | null>(null)

  const timezone = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = todayKey(timezone)

  const todaysSessions = useMemo(
    () =>
      sessions.filter(
        (s) => dayKeyInTz(new Date(s.start_at), timezone) === today,
      ),
    [sessions, timezone, today],
  )

  const missedSessions = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000
    return sessions.filter(
      (s) => s.status === 'missed' && new Date(s.updated_at).getTime() >= cutoff,
    )
  }, [sessions])

  const hasUnrecoveredMissed = useMemo(() => {
    if (missedSessions.length === 0) return false
    const latestVersion = versions[0]
    if (!latestVersion) return true
    const newestMissed = Math.max(
      ...missedSessions.map((s) => new Date(s.updated_at).getTime()),
    )
    return new Date(latestVersion.created_at).getTime() < newestMissed
  }, [missedSessions, versions])

  // Dry-run the engine (no persistence) to surface warnings and priorities.
  const computePlanState = useCallback(async () => {
    if (!provider || !profile) return
    try {
      const input = await loadEngineInput(provider)
      const result = generatePlan(input)
      setWarnings(result.warnings)
    } catch {
      setWarnings([])
    }
  }, [provider, profile])

  useEffect(() => {
    if (!loading && provider && profile) void computePlanState()
  }, [loading, provider, profile, computePlanState, sessions])

  const nextTask = useMemo(() => {
    const now = new Date()
    const subjectMap = new Map(subjects.map((s) => [s.id, s]))
    const open = tasks
      .filter((t) => t.status !== 'completed')
      .map((task) => ({
        task,
        priority: computePriority(task, { now, subjects: subjectMap }),
      }))
      .sort((a, b) => b.priority.score - a.priority.score)
    return open[0] ?? null
  }, [tasks, subjects])

  const handleReplan = async () => {
    if (!provider) return
    setReplanning(true)
    const beforeCount = sessions.filter(
      (s) => s.status === 'planned' || s.status === 'in_progress',
    ).length
    try {
      const outcome = await mutate(() => runReplan(provider, { reason: 'Replanned from dashboard' }))
      const afterCount = outcome.sessions.filter(
        (s) => s.status === 'planned' || s.status === 'in_progress',
      ).length
      const changes = `Planned sessions: ${beforeCount} → ${afterCount}. ${outcome.result.summary}`
      setPlanDiff(changes)
      await computePlanState()
      toast.success('Plan updated', { description: outcome.result.summary })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Replanning failed.')
    } finally {
      setReplanning(false)
    }
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => void reload()}
      />
    )
  }

  const dailyLimit = preferences?.daily_limit_minutes ?? 180

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}`}
        description={
          hasUnrecoveredMissed
            ? 'You missed a session — your plan can recover it.'
            : 'Here is your plan for today.'
        }
        actions={
          <button
            onClick={() => void computePlanState()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh analysis
          </button>
        }
      />

      <SummaryCards
        sessions={sessions}
        tasks={tasks}
        timezone={timezone}
        dailyLimitMinutes={dailyLimit}
      />

      {planDiff && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground">
          <p className="font-semibold">Before &amp; after replan</p>
          <p className="mt-1 text-sm text-muted-foreground">{planDiff}</p>
        </div>
      )}

      <AlertsPanel
        missedCount={hasUnrecoveredMissed ? missedSessions.length : 0}
        warnings={warnings}
        sessions={sessions}
        onReplan={() => void handleReplan()}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodayPlan
            todaySessions={todaysSessions}
            timezone={timezone}
            onReplan={() => void handleReplan()}
            replanning={replanning}
          />
        </div>
        <div className="space-y-6">
          <NextTaskCard
            task={nextTask?.task ?? null}
            score={nextTask?.priority.score ?? 0}
            reasons={nextTask?.priority.reasons ?? []}
            subjectName={
              nextTask?.task.subject_id
                ? subjects.find((s) => s.id === nextTask.task.subject_id)?.name
                : undefined
            }
          />
          <UpcomingDeadlines tasks={tasks} subjects={subjects} />
          <UpcomingSessionStrip sessions={sessions} timezone={timezone} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WeekHoursChart sessions={sessions} timezone={timezone} />
        <WorkloadDistribution sessions={sessions} tasks={tasks} subjects={subjects} />
      </div>

      <SubjectProgressCards subjects={subjects} tasks={tasks} sessions={sessions} />

      <Card>
        <CardHeader>
          <CardTitle>How your plan is built</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          Every task's priority is computed as{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
            0.35·Urgency + 0.25·Difficulty + 0.25·Mastery Gap + 0.15·Importance
          </code>
          . Sessions are allocated inside your availability, split to your
          preferred length, separated by breaks, and capped by your daily limit.
          {isDemoMode && ' Data is stored in this browser only (demo mode).'}
        </CardContent>
      </Card>
    </div>
  )
}
