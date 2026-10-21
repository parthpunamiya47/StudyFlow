import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { friendlyAuthError, isValidEmail } from '@/auth/validation'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { PasswordInput } from '@/components/shared/PasswordInput'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Alert, AlertDescription } from '@/ui/alert'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const resetSent = new URLSearchParams(location.search).has('reset')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const trimmed = email.trim()
    if (!trimmed || !password) {
      setError('Enter your email and password.')
      return
    }
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address, e.g. you@university.edu.')
      return
    }

    setBusy(true)
    try {
      await signIn(trimmed, password)
      toast.success('Welcome back!')
      navigate(from, { replace: true })
    } catch (err) {
      setError(friendlyAuthError(err, 'Sign in failed. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue planning your studies."
      footer={
        <>
          New to StudyFlow?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {resetSent && (
        <Alert variant="success" className="mb-4">
          <AlertDescription>
            Password reset email sent. Open the link to choose a new password.
          </AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={error !== null}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
