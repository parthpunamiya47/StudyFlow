import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Compass className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Button asChild>
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  )
}
