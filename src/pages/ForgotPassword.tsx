import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, MailCheck } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { friendlyAuthError, isValidEmail } from '@/auth/validation'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Alert, AlertDescription } from '@/ui/alert'

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Enter the email you registered with.')
      return
    }
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address, e.g. you@university.edu.')
      return
    }
    setBusy(true)
    try {
      await resetPassword(trimmed)
      setSent(true)
    } catch (err) {
      setError(
        friendlyAuthError(err, 'Could not send the reset email. Please try again.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to set a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <Alert variant="success">
          <MailCheck className="h-4 w-4" />
          <AlertDescription>
            If an account exists for <strong>{email}</strong>, a reset link is on
            its way. Check your inbox and spam folder.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
