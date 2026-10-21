import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m'
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`
}

export function titleCase(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
