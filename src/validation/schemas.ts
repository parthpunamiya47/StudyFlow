/**
 * Zod schemas for every user-facing form. Validation errors are surfaced
 * inline; invalid durations and dates are rejected before hitting the DB.
 */

import { z } from 'zod'
import { TASK_TYPES } from '@/lib/constants'

const positiveInt = z.coerce
  .number()
  .int('Enter a whole number')
  .min(1, 'Must be at least 1 minute')
  .max(60 * 24, 'Must be under 24 hours')

const rating1to5 = z.coerce
  .number()
  .int()
  .min(1, 'Choose 1–5')
  .max(5, 'Choose 1–5')

export const taskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(160, 'Title is too long'),
    description: z.string().trim().max(4000, 'Description is too long').nullable(),
    subject_id: z.string().nullable(),
    task_type: z.enum(TASK_TYPES),
    deadline: z.string().nullable(),
    estimated_minutes: positiveInt,
    difficulty: rating1to5,
    importance: rating1to5,
    mastery_level: z.coerce
      .number()
      .min(0, 'Between 0 and 100')
      .max(100, 'Between 0 and 100')
      .nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.deadline && Number.isNaN(Date.parse(value.deadline))) {
      ctx.addIssue({
        code: 'custom',
        path: ['deadline'],
        message: 'Enter a valid date and time',
      })
    }
  })

export type TaskFormValues = z.input<typeof taskSchema>

export const subjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
  description: z.string().trim().max(500, 'Too long').nullable(),
  difficulty: rating1to5,
  mastery_level: z.coerce
    .number()
    .int('Enter 0–100')
    .min(0, 'Between 0 and 100')
    .max(100, 'Between 0 and 100'),
  target_grade: z.string().trim().max(20, 'Too long').nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a color'),
})

export type SubjectFormValues = z.input<typeof subjectSchema>

export const profileSchema = z.object({
  display_name: z.string().trim().min(1, 'Name is required').max(80, 'Too long'),
  institution: z.string().trim().max(120, 'Too long').nullable(),
  semester_start: z.string().min(1, 'Required'),
  semester_end: z.string().min(1, 'Required'),
  timezone: z.string().min(1, 'Required'),
})

export const profileWithDatesSchema = profileSchema
  .superRefine((value, ctx) => {
    if (value.semester_end < value.semester_start) {
      ctx.addIssue({
        code: 'custom',
        path: ['semester_end'],
        message: 'Semester end must be after the start',
      })
    }
  })

export const preferencesSchema = z.object({
  preferred_session_minutes: z.coerce
    .number()
    .int()
    .min(10, 'At least 10 minutes')
    .max(240, 'At most 4 hours'),
  break_minutes: z.coerce.number().int().min(0, 'Cannot be negative').max(60, 'At most 1 hour'),
  daily_limit_minutes: z.coerce
    .number()
    .int()
    .min(30, 'At least 30 minutes')
    .max(1440, 'At most 24 hours'),
})

export type PreferencesFormValues = z.input<typeof preferencesSchema>

export const availabilityRowSchema = z
  .object({
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  })
  .superRefine((value, ctx) => {
    if (value.end_time <= value.start_time) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_time'],
        message: 'End must be after start',
      })
    }
  })

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('. ')
}
