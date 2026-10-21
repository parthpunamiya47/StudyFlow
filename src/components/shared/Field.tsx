import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/ui/label'

interface FieldProps {
  htmlFor: string
  label: string
  error?: string | null
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
}

export function Field({
  htmlFor,
  label,
  error,
  hint,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
