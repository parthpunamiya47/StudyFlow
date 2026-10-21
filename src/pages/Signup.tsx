import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import {
  friendlyAuthError,
  isValidEmail,
  passwordIssue,
} from '@/auth/validation'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { PasswordInput } from '@/components/shared/PasswordInput'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'

export function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()
    const trimmedName = name.trim()

    if (!trimmedName) {
      setError('Please enter your full name.')
      return
    }
    if (!trimmedEmail) {
      setError('Please enter your email address.')
      return
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Enter a valid email address, e.g. you@university.edu.')
      return
    }
    const policyIssue = passwordIssue(password)
    if (policyIssue) {
      setError(policyIssue)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      await signUp(trimmedEmail, password, trimmedName)
      toast.success('Account created')
      navigate('/onboarding', { replace: true })
    } catch (err) {
      if (err instanceof Error && err.name === 'EmailConfirmationRequired') {
        // Real provider flow: the project requires email confirmation first.
        setPendingEmail(trimmedEmail)
      } else {
        setError(friendlyAuthError(err, 'Could not create your account. Please try again.'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (pendingEmail) {
    return (
      <AuthLayout
        title="Confirm your email"
        subtitle="One more step before you can sign in."
        footer={
          <>
            Already confirmed?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <Alert variant="success">
          <MailCheck className="h-4 w-4" aria-hidden />
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>
            We sent a confirmation link to <strong>{pendingEmail}</strong>. Open
            it to activate your account, then sign in.
          </AlertDescription>
        </Alert>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Didn’t get it? Check your spam folder, or{' '}
          <button
            type="button"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
            onClick={() => setPendingEmail(null)}
          >
            try a different email
          </button>
          .
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your account to start planning your studies."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Alex Johnson"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

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
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-xs text-muted-foreground">
            Use at least 8 characters.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
