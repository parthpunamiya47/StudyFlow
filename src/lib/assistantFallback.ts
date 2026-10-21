/**
 * Rule-based assistant fallback.
 *
 * Used when no LLM endpoint is configured, so the assistant stays honest: it
 * answers from the student's actual records and clearly states that it is the
 * built-in fallback rather than a model. It never invents data.
 */

import { computePriority } from '@/scheduler/priority'
import { workloadLevel } from '@/scheduler/engine'
import {
  addDaysToKey,
  deadlinePhrase,
  dayKeyInTz,
} from '@/lib/time'
import { formatMinutes } from '@/lib/utils'
import type { StudySession, Subject, Task } from '@/types/models'
import type { PriorityResult } from '@/scheduler/priority'

export interface AssistantContext {
  tasks: Task[]
  subjects: Subject[]
  sessions: StudySession[]
  timezone: string
  dailyLimitMinutes: number
  now?: Date
}

export interface AssistantReply {
  text: string
  /** Optional CTA the UI can render (label + route). */
  action?: { label: string; to: string }
  source: 'llm' | 'rules'
}

export function summarizeWorkload(ctx: AssistantContext): string {
  const now = ctx.now ?? new Date()
  const today = dayKeyInTz(now, ctx.timezone)
  const weekEnd = addDaysToKey(today, 7)
  const upcoming = ctx.sessions.filter((s) => {
    if (s.status !== 'planned' && s.status !== 'in_progress') return false
    const key = dayKeyInTz(new Date(s.start_at), ctx.timezone)
    return key >= today && key <= weekEnd
  })
  const minutes = upcoming.reduce((sum, s) => sum + s.planned_minutes, 0)
  const capacity = ctx.dailyLimitMinutes * 7
  const level = workloadLevel(minutes, capacity)

  const open = ctx.tasks.filter((t) => t.status !== 'completed')
  const overdue = open.filter(
    (t) => t.deadline && new Date(t.deadline).getTime() < now.getTime(),
  )
  const missed = ctx.sessions.filter(
    (s) =>
      s.status === 'missed' &&
      new Date(s.start_at).getTime() > now.getTime() - 7 * 86_400_000,
  )

  const lines: string[] = []
  lines.push(
    `You have ${formatMinutes(minutes)} planned over the next 7 days against a capacity of ${formatMinutes(capacity)} — a **${level}** workload.`,
  )
  lines.push(
    `${open.length} open task${open.length === 1 ? '' : 's'}${overdue.length ? `, ${overdue.length} overdue` : ''}.`,
  )
  if (missed.length > 0) {
    lines.push(
      `${missed.length} session${missed.length === 1 ? ' was' : 's were'} missed in the last 7 days — replan to recover them.`,
    )
  }
  return lines.join('\n')
}

export function nextTaskAdvice(ctx: AssistantContext): string {
  const now = ctx.now ?? new Date()
  const subjectMap = new Map(ctx.subjects.map((s) => [s.id, s]))
  const ranked = ctx.tasks
    .filter((t) => t.status !== 'completed')
    .map((task) => ({ task, priority: computePriority(task, { now, subjects: subjectMap }) }))
    .sort((a, b) => b.priority.score - a.priority.score)

  if (ranked.length === 0) {
    return 'You have no open tasks — add assignments or exams and I will rank them for you.'
  }
  const top = ranked.slice(0, 3)
  const lines = ['**Study next (highest priority first):**']
  top.forEach(({ task, priority }, index) => {
    const subject = task.subject_id ? subjectMap.get(task.subject_id) : undefined
    lines.push(
      `${index + 1}. **${task.title}**${subject ? ` (${subject.name})` : ''} — score ${priority.score}/100. ${priority.reasons[0] ?? ''}`,
    )
  })
  lines.push('Open the Planner to schedule these, or the Tasks page to review all.')
  return lines.join('\n')
}

export function catchUpAdvice(ctx: AssistantContext): string {
  const now = ctx.now ?? new Date()
  const missed = ctx.sessions.filter(
    (s) =>
      s.status === 'missed' &&
      new Date(s.start_at).getTime() > now.getTime() - 14 * 86_400_000,
  )
  const overdue = ctx.tasks.filter(
    (t) =>
      t.status !== 'completed' &&
      t.deadline &&
      new Date(t.deadline).getTime() < now.getTime(),
  )
  const lines: string[] = []
  if (missed.length > 0) {
    lines.push(
      `You missed ${missed.length} session${missed.length === 1 ? '' : 's'} in the last two weeks (${formatMinutes(missed.reduce((s, x) => s + x.planned_minutes, 0))} of study time). Those sessions are kept in your history and their work is redistributed when you replan.`,
    )
  }
  if (overdue.length > 0) {
    lines.push(
      `**${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}:** ${overdue
        .map((t) => t.title)
        .slice(0, 5)
        .join(', ')}.`,
    )
    lines.push(
      'Overdue tasks get maximum urgency (100/100), so the engine schedules them first where capacity allows.',
    )
  }
  if (lines.length === 0) {
    lines.push(
      'Nothing to catch up on — no missed sessions or overdue tasks right now. Keep the plan going.',
    )
  } else {
    lines.push('Run **Generate / recalculate** on the Planner to build a recovery plan.')
  }
  return lines.join('\n')
}

export function explainPriority(task: Task, result: PriorityResult): string {
  return [
    `**${task.title}** scores ${result.score}/100.`,
    `Urgency ${Math.round(result.factors.urgency)}, difficulty ${Math.round(result.factors.difficulty)}, mastery gap ${Math.round(result.factors.masteryGap)}, importance ${Math.round(result.factors.importance)} — combined as 0.35·U + 0.25·D + 0.25·G + 0.15·I.`,
    ...result.reasons.map((r) => `• ${r}`),
  ].join('\n')
}

export function deadlineOverview(ctx: AssistantContext): string {
  const now = ctx.now ?? new Date()
  const upcoming = ctx.tasks
    .filter((t) => t.status !== 'completed' && t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 5)
  if (upcoming.length === 0) return 'You have no upcoming deadlines.'
  return [
    '**Next deadlines:**',
    ...upcoming.map(
      (t) => `• ${t.title} — ${deadlinePhrase(t.deadline!, now)}`,
    ),
  ].join('\n')
}

export function respondWithRules(
  message: string,
  ctx: AssistantContext,
): AssistantReply {
  const text = message.toLowerCase()

  const contains = (...words: string[]) => words.some((w) => text.includes(w))

  if (contains('next', 'what should i study', 'priorit', 'start with')) {
    return { text: nextTaskAdvice(ctx), source: 'rules', action: { label: 'Open planner', to: '/planner' } }
  }
  if (contains('catch up', 'fall behind', 'missed', 'overdue', 'behind')) {
    return { text: catchUpAdvice(ctx), source: 'rules', action: { label: 'Recalculate plan', to: '/planner' } }
  }
  if (contains('workload', 'busy', 'too much', 'manageable', 'load')) {
    return { text: summarizeWorkload(ctx), source: 'rules', action: { label: 'View analytics', to: '/analytics' } }
  }
  if (contains('available', 'availability', 'free time', 'schedule has changed', 'time has changed')) {
    return {
      text: 'Update your weekly windows under **Settings → Availability**, then recalculate the plan — the engine will only place sessions inside your new windows and will flag anything that no longer fits.',
      source: 'rules',
      action: { label: 'Update availability', to: '/settings' },
    }
  }
  if (contains('deadline', 'due', 'exam soon')) {
    return { text: deadlineOverview(ctx), source: 'rules', action: { label: 'Open tasks', to: '/tasks' } }
  }
  if (contains('revision', 'revision plan', 'exam next week', 'study plan for')) {
    const revisions = ctx.tasks.filter(
      (t) => t.status !== 'completed' && (t.task_type === 'revision' || t.task_type === 'examination'),
    )
    const lines = [
      revisions.length > 0
        ? `You have ${revisions.length} revision/examination task${revisions.length === 1 ? '' : 's'} open.`
        : 'You have no revision tasks yet — add them as task type “Revision” or “Examination”.',
      'Recalculate the plan and the engine will spread revision sessions across your available windows before the deadline, prioritising weaker subjects (mastery gap).',
    ]
    return { text: lines.join('\n'), source: 'rules', action: { label: 'Go to planner', to: '/planner' } }
  }
  if (contains('why', 'explain', 'priority score')) {
    const now = ctx.now ?? new Date()
    const subjectMap = new Map(ctx.subjects.map((s) => [s.id, s]))
    const top = ctx.tasks
      .filter((t) => t.status !== 'completed')
      .map((task) => ({ task, priority: computePriority(task, { now, subjects: subjectMap }) }))
      .sort((a, b) => b.priority.score - a.priority.score)[0]
    if (!top) return { text: 'Add tasks first and I will explain how their priorities are calculated.', source: 'rules' }
    return { text: explainPriority(top.task, top.priority), source: 'rules', action: { label: 'See tasks', to: '/tasks' } }
  }

  return {
    text: [
      'I can help with these questions (running in **rule-based mode** — no LLM endpoint is configured):',
      '• "What should I study next?"',
      '• "Help me catch up on missed assignments"',
      '• "Is my workload manageable this week?"',
      '• "My available study time changed"',
      '• "What are my next deadlines?"',
      '• "Explain why this task is a priority"',
      '',
      'Scheduling decisions always come from the deterministic engine — I only explain them.',
    ].join('\n'),
    source: 'rules',
  }
}
