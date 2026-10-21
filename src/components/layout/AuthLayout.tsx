import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from './Logo'

/**
 * Centered, full-viewport authentication shell.
 *
 * Deliberately minimal: brand mark, title/subtitle, form, footer link.
 * No promotional panel, no illustrations — the form is the page.
 * The configuration indicator never appears here; developers see
 * configuration state in the app shell and the dev console instead.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex justify-center">
            <Logo />
          </div>

          <div className="card-shadow rounded-xl border border-border bg-card p-6 sm:p-7">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
            <div className="mt-6">{children}</div>
          </div>

          {footer && (
            <div className="mt-5 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link
              to="/"
              className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
