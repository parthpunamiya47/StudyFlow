import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BellRing, Check, DatabaseZap, Palette, Save, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/data/WorkspaceContext'
import { PageHeader } from '@/components/shared/PageHeader'
import { Field } from '@/components/shared/Field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Switch } from '@/ui/switch'
import { Textarea } from '@/ui/textarea'
import { Alert, AlertDescription } from '@/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'
import { DAY_NAMES } from '@/lib/constants'
import { browserTimezone, isValidTimezone } from '@/lib/time'
import { cn } from '@/lib/utils'
import { formatZodError, preferencesSchema, profileWithDatesSchema } from '@/validation/schemas'
import { isAssistantConfigured, isDemoMode } from '@/lib/env'
import {
  getDemoImportSummary,
  importDemoData,
  type DemoImportSummary,
} from '@/data/demoImport'

function timezoneList(current: string): string[] {
  let zones: string[] = []
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf
    if (supported) zones = supported('timeZone')
  } catch {
    zones = []
  }
  if (zones.length === 0) zones = ['UTC', 'America/New_York', 'Europe/London']
  return zones.includes(current) ? zones : [current, ...zones]
}

interface DayWindow {
  enabled: boolean
  start: string
  end: string
}

export function SettingsPage() {
  const { provider, profile, preferences, refresh, user } = useAuth()
  const { availability, sessions, mutate, reload } = useWorkspace()

  const [activeTab, setActiveTab] = useState('profile')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // One-time demo-data import (only offered in cloud mode when this browser
  // still holds demo records that have not been imported).
  const [demoImport, setDemoImport] = useState<DemoImportSummary | null>(null)
  const [importing, setImporting] = useState(false)

  // Profile
  const [displayName, setDisplayName] = useState('')
  const [institution, setInstitution] = useState('')
  const [goals, setGoals] = useState('')
  const [semesterStart, setSemesterStart] = useState('')
  const [semesterEnd, setSemesterEnd] = useState('')
  const [timezone, setTimezone] = useState('')

  // Preferences
  const [sessionMinutes, setSessionMinutes] = useState(50)
  const [breakMinutes, setBreakMinutes] = useState(10)
  const [dailyLimit, setDailyLimit] = useState(180)

  // Availability
  const [days, setDays] = useState<DayWindow[]>(() =>
    DAY_NAMES.map(() => ({ enabled: false, start: '09:00', end: '12:00' })),
  )

  // Notifications
  const [deadlineReminders, setDeadlineReminders] = useState(true)
  const [dailyReminder, setDailyReminder] = useState(true)
  const [reminderTime, setReminderTime] = useState('08:00')
  const [permissionState, setPermissionState] = useState<string>('unsupported')

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name)
    setInstitution(profile.institution ?? '')
    setGoals(profile.academic_goals ?? '')
    setSemesterStart(profile.semester_start)
    setSemesterEnd(profile.semester_end)
    setTimezone(profile.timezone)
  }, [profile])

  useEffect(() => {
    if (!preferences) return
    setSessionMinutes(preferences.preferred_session_minutes)
    setBreakMinutes(preferences.break_minutes)
    setDailyLimit(preferences.daily_limit_minutes)
    setDeadlineReminders(preferences.notification_preferences.deadline_reminders)
    setDailyReminder(preferences.notification_preferences.daily_plan_reminder)
    setReminderTime(preferences.notification_preferences.reminder_time)
  }, [preferences])

  useEffect(() => {
    if (availability.length === 0) return
    setDays(
      DAY_NAMES.map((_, index) => {
        const row = availability.find((a) => a.day_of_week === index)
        return row
          ? { enabled: row.is_available, start: row.start_time, end: row.end_time }
          : { enabled: false, start: '09:00', end: '12:00' }
      }),
    )
  }, [availability])

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setPermissionState('unsupported')
      return
    }
    setPermissionState(Notification.permission)
  }, [])

  // Offer the one-time demo-data import only when running against Supabase
  // and this browser still holds unimported demo records.
  useEffect(() => {
    setDemoImport(isDemoMode ? null : getDemoImportSummary(user?.email))
  }, [user?.email])

  const handleDemoImport = async () => {
    if (!provider) return
    setImporting(true)
    setError(null)
    try {
      const result = await importDemoData(provider, user?.email)
      setDemoImport(null)
      await reload()
      const created =
        result.subjects +
        result.tasks +
        result.sessions +
        result.logs +
        result.versions +
        result.availability
      const skippedNote =
        result.skipped > 0
          ? `${result.skipped} already existed and were skipped${
              result.failed > 0 ? `, ${result.failed} failed.` : '.'
            }`
          : result.failed > 0
            ? `${result.failed} could not be imported.`
            : undefined
      if (created === 0) {
        toast.info(
          `Nothing new to import — everything already exists in your account.`,
          { description: skippedNote },
        )
      } else {
        toast.success(
          `Imported ${created} record${created === 1 ? '' : 's'} from demo data.`,
          { description: skippedNote },
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  const zones = useMemo(() => timezoneList(timezone || browserTimezone()), [timezone])

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (!provider || !profile) return
    const parsed = profileWithDatesSchema.safeParse({
      display_name: displayName,
      institution: institution || null,
      semester_start: semesterStart,
      semester_end: semesterEnd,
      timezone,
    })
    if (!parsed.success) {
      setError(formatZodError(parsed.error))
      return
    }
    if (!isValidTimezone(timezone)) {
      setError('Choose a valid timezone.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await provider.saveProfile({
        id: profile.id,
        ...parsed.data,
        academic_goals: goals.trim() || null,
        onboarding_completed: profile.onboarding_completed,
      })
      await refresh()
      toast.success('Profile saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.')
    } finally {
      setBusy(false)
    }
  }

  const savePreferences = async (event: FormEvent) => {
    event.preventDefault()
    if (!provider || !preferences) return
    const parsed = preferencesSchema.safeParse({
      preferred_session_minutes: sessionMinutes,
      break_minutes: breakMinutes,
      daily_limit_minutes: dailyLimit,
    })
    if (!parsed.success) {
      setError(formatZodError(parsed.error))
      return
    }
    if (Number(sessionMinutes) > Number(dailyLimit)) {
      setError('A single session cannot be longer than your daily limit.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await provider.savePreferences({
        ...parsed.data,
        theme: preferences.theme,
        notification_preferences: preferences.notification_preferences,
      })
      await refresh()
      toast.success('Study preferences saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preferences.')
    } finally {
      setBusy(false)
    }
  }

  const saveAvailability = async () => {
    if (!provider) return
    const enabled = days.filter((d) => d.enabled)
    if (enabled.length === 0) {
      setError('Mark at least one day as available.')
      return
    }
    if (enabled.some((d) => d.end <= d.start)) {
      setError('Each window must end after it starts.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await mutate(() =>
        provider.saveAvailability(
          days
            .map((day, index) => ({ day, index }))
            .filter(({ day }) => day.enabled)
            .map(({ day, index }) => ({
              day_of_week: index,
              start_time: day.start,
              end_time: day.end,
              is_available: true,
            })),
        ),
      )
      toast.success('Availability saved — replan to apply it.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save availability.')
    } finally {
      setBusy(false)
    }
  }

  const saveNotifications = async (patch: {
    browser_enabled?: boolean
    deadline_reminders?: boolean
    daily_plan_reminder?: boolean
    reminder_time?: string
  }) => {
    if (!provider || !preferences) return
    try {
      await provider.savePreferences({
        preferred_session_minutes: preferences.preferred_session_minutes,
        break_minutes: preferences.break_minutes,
        daily_limit_minutes: preferences.daily_limit_minutes,
        theme: preferences.theme,
        notification_preferences: {
          ...preferences.notification_preferences,
          ...patch,
        },
      })
      await refresh()
    } catch {
      toast.error('Notification preference could not be saved.')
    }
  }

  const requestBrowserPermission = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('This browser does not support notifications.')
      return
    }
    const result = await Notification.requestPermission()
    setPermissionState(result)
    if (result === 'granted') {
      await saveNotifications({ browser_enabled: true })
      toast.success('Browser notifications enabled')
    } else {
      await saveNotifications({ browser_enabled: false })
      toast.error(
        result === 'denied'
          ? 'Notifications are blocked in your browser settings.'
          : 'Notification permission was not granted.',
      )
    }
  }

  const testNotification = () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      toast.error('Grant notification permission first.')
      return
    }
    // Only claims success when the browser accepts the notification.
    try {
      const n = new Notification('StudyFlow AI', {
        body: 'Your next study session is ready.',
      })
      n.onclick = () => n.close()
      toast.success('Notification displayed by the browser')
    } catch {
      toast.error('The browser refused to display the notification.')
    }
  }

  const setTheme = async (theme: 'light' | 'dark' | 'system') => {
    if (!provider || !preferences) return
    try {
      await provider.savePreferences({
        preferred_session_minutes: preferences.preferred_session_minutes,
        break_minutes: preferences.break_minutes,
        daily_limit_minutes: preferences.daily_limit_minutes,
        theme,
        notification_preferences: preferences.notification_preferences,
      })
      await refresh()
      toast.success(`Theme set to ${theme}`)
    } catch {
      toast.error('Could not save the theme.')
    }
  }

  const upcomingSessions = sessions.filter(
    (s) =>
      (s.status === 'planned' || s.status === 'in_progress') &&
      new Date(s.start_at).getTime() > Date.now(),
  ).length

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Profile, study preferences, availability, and notifications."
      />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full flex-wrap sm:w-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Study</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          {demoImport && <TabsTrigger value="data">Data</TabsTrigger>}
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" /> Academic profile
              </CardTitle>
              <CardDescription>
                Used for scheduling and display. We never collect more than we need.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="grid gap-5 sm:grid-cols-2">
                <Field htmlFor="s-name" label="Display name" required>
                  <Input
                    id="s-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </Field>
                <Field htmlFor="s-inst" label="Institution (optional)">
                  <Input
                    id="s-inst"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                  />
                </Field>
                <Field htmlFor="s-start" label="Semester start" required>
                  <Input
                    id="s-start"
                    type="date"
                    value={semesterStart}
                    onChange={(e) => setSemesterStart(e.target.value)}
                  />
                </Field>
                <Field htmlFor="s-end" label="Semester end" required>
                  <Input
                    id="s-end"
                    type="date"
                    value={semesterEnd}
                    onChange={(e) => setSemesterEnd(e.target.value)}
                  />
                </Field>
                <Field htmlFor="s-tz" label="Timezone" required>
                  <select
                    id="s-tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {zones.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  htmlFor="s-goals"
                  label="Academic goals (optional)"
                  className="sm:col-span-2"
                >
                  <Textarea
                    id="s-goals"
                    rows={3}
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={busy}>
                    <Save className="h-4 w-4" />
                    {busy ? 'Saving…' : 'Save profile'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Study preferences */}
        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>Study preferences</CardTitle>
              <CardDescription>
                The planner splits work into sessions of this length and never
                exceeds your daily limit. Changes apply on the next replan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePreferences} className="grid gap-5 sm:grid-cols-3">
                <Field htmlFor="p-session" label="Session length (min)" required>
                  <Input
                    id="p-session"
                    type="number"
                    min={10}
                    max={240}
                    value={sessionMinutes}
                    onChange={(e) => setSessionMinutes(Number(e.target.value))}
                  />
                </Field>
                <Field htmlFor="p-break" label="Break (min)" required>
                  <Input
                    id="p-break"
                    type="number"
                    min={0}
                    max={60}
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                  />
                </Field>
                <Field htmlFor="p-limit" label="Daily limit (min)" required>
                  <Input
                    id="p-limit"
                    type="number"
                    min={30}
                    max={1440}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                  />
                </Field>
                <div className="sm:col-span-3">
                  <Button type="submit" disabled={busy}>
                    <Save className="h-4 w-4" />
                    {busy ? 'Saving…' : 'Save preferences'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Availability */}
        <TabsContent value="availability">
          <Card>
            <CardHeader>
              <CardTitle>Weekly availability</CardTitle>
              <CardDescription>
                Sessions are only planned inside these windows. You currently have{' '}
                {upcomingSessions} upcoming session{upcomingSessions === 1 ? '' : 's'}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {days.map((day, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 sm:flex-nowrap',
                      day.enabled ? 'bg-card' : 'bg-background',
                    )}
                  >
                    <div className="flex w-36 items-center gap-3">
                      <Switch
                        checked={day.enabled}
                        onCheckedChange={(checked) =>
                          setDays((prev) =>
                            prev.map((d, i) =>
                              i === index ? { ...d, enabled: checked } : d,
                            ),
                          )
                        }
                        aria-label={`${DAY_NAMES[index]} available`}
                      />
                      <Label className={cn(!day.enabled && 'text-muted-foreground')}>
                        {DAY_NAMES[index]}
                      </Label>
                    </div>
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        type="time"
                        value={day.start}
                        disabled={!day.enabled}
                        aria-label={`${DAY_NAMES[index]} start`}
                        onChange={(e) =>
                          setDays((prev) =>
                            prev.map((d, i) =>
                              i === index ? { ...d, start: e.target.value } : d,
                            ),
                          )
                        }
                        className="w-32"
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={day.end}
                        disabled={!day.enabled}
                        aria-label={`${DAY_NAMES[index]} end`}
                        onChange={(e) =>
                          setDays((prev) =>
                            prev.map((d, i) =>
                              i === index ? { ...d, end: e.target.value } : d,
                            ),
                          )
                        }
                        className="w-32"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button onClick={saveAvailability} disabled={busy}>
                  <Save className="h-4 w-4" />
                  {busy ? 'Saving…' : 'Save availability'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-primary" /> Notifications
              </CardTitle>
              <CardDescription>
                Browser notifications run locally on this device. Email
                reminders require a scheduled server job (see README).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Browser notifications</p>
                  <p className="text-xs text-muted-foreground">
                    Permission status: <strong>{permissionState}</strong>
                  </p>
                </div>
                <div className="flex gap-2">
                  {permissionState !== 'granted' && (
                    <Button size="sm" variant="outline" onClick={requestBrowserPermission}>
                      Enable
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={testNotification}
                    disabled={permissionState !== 'granted'}
                  >
                    Test
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Deadline reminders</p>
                  <p className="text-xs text-muted-foreground">
                    Surface tasks that are due soon or overdue.
                  </p>
                </div>
                <Switch
                  checked={deadlineReminders}
                  onCheckedChange={(checked) => {
                    setDeadlineReminders(checked)
                    void saveNotifications({ deadline_reminders: checked })
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Daily plan reminder</p>
                  <p className="text-xs text-muted-foreground">
                    Remind me about today's plan at the time below.
                  </p>
                </div>
                <Switch
                  checked={dailyReminder}
                  onCheckedChange={(checked) => {
                    setDailyReminder(checked)
                    void saveNotifications({ daily_plan_reminder: checked })
                  }}
                />
              </div>

              <Field htmlFor="reminder-time" label="Reminder time" className="max-w-40">
                <Input
                  id="reminder-time"
                  type="time"
                  value={reminderTime}
                  disabled={!dailyReminder}
                  onChange={(e) => {
                    setReminderTime(e.target.value)
                    void saveNotifications({ reminder_time: e.target.value })
                  }}
                />
              </Field>

              <Alert>
                <AlertDescription>
                  Email reminders are <strong>not sent</strong> — no mail service
                  is configured. To enable them, deploy a scheduled Supabase Edge
                  Function with an email provider key (instructions in README).
                  {isDemoMode && ' Notifications are also unavailable in demo mode.'}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" /> Appearance
              </CardTitle>
              <CardDescription>
                Light by default, with a functional dark theme.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:max-w-md">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => void setTheme(theme)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border border-border p-4 text-left text-sm transition-colors hover:bg-muted',
                      preferences?.theme === theme && 'border-primary bg-accent',
                    )}
                  >
                    <span className="capitalize font-medium">{theme}</span>
                    {preferences?.theme === theme && (
                      <Check className="h-4 w-4 text-primary" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
              {!isAssistantConfigured && (
                <p className="mt-4 text-xs text-muted-foreground">
                  AI assistant isn’t connected — the assistant runs in
                  rule-based mode.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* One-time demo data import (cloud mode only) */}
        {demoImport && (
          <TabsContent value="data">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DatabaseZap className="h-4 w-4 text-primary" /> Import demo data
                </CardTitle>
                <CardDescription>
                  One-time copy of the demo records stored in this browser into
                  your cloud account. Demo data is left untouched.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <li>{demoImport.subjects} subject{demoImport.subjects === 1 ? '' : 's'}</li>
                  <li>{demoImport.tasks} task{demoImport.tasks === 1 ? '' : 's'}</li>
                  <li>{demoImport.sessions} study session{demoImport.sessions === 1 ? '' : 's'}</li>
                  <li>{demoImport.versions} schedule version{demoImport.versions === 1 ? '' : 's'}</li>
                  <li>{demoImport.logs} study log{demoImport.logs === 1 ? '' : 's'}</li>
                  <li>{demoImport.availability} availability row{demoImport.availability === 1 ? '' : 's'}</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  Records that already exist in your account are skipped, so the
                  import is safe even if you have used the cloud app before.
                </p>
                <Button onClick={() => void handleDemoImport()} disabled={importing}>
                  <DatabaseZap className="h-4 w-4" />
                  {importing ? 'Importing…' : 'Import demo data into my account'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
