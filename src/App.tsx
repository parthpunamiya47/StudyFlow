import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/ui/tooltip'
import { AuthProvider } from '@/auth/AuthProvider'
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireOnboarding,
} from '@/auth/guards'
import { AppShell } from '@/components/layout/AppShell'
import { FullPageLoader } from '@/components/shared/Loaders'
import { OfflineIndicator } from '@/pages/OfflineIndicator'

// Route-level code splitting keeps the initial bundle small.
const LandingPage = lazy(() => import('@/pages/Landing').then((m) => ({ default: m.LandingPage })))
const LoginPage = lazy(() => import('@/pages/Login').then((m) => ({ default: m.LoginPage })))
const SignupPage = lazy(() => import('@/pages/Signup').then((m) => ({ default: m.SignupPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPassword').then((m) => ({ default: m.ForgotPasswordPage })))
const OnboardingPage = lazy(() => import('@/pages/Onboarding').then((m) => ({ default: m.OnboardingPage })))
const DashboardPage = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.DashboardPage })))
const TasksPage = lazy(() => import('@/pages/Tasks').then((m) => ({ default: m.TasksPage })))
const PlannerPage = lazy(() => import('@/pages/Planner').then((m) => ({ default: m.PlannerPage })))
const SubjectsPage = lazy(() => import('@/pages/Subjects').then((m) => ({ default: m.SubjectsPage })))
const AnalyticsPage = lazy(() => import('@/pages/Analytics').then((m) => ({ default: m.AnalyticsPage })))
const AssistantPage = lazy(() => import('@/pages/Assistant').then((m) => ({ default: m.AssistantPage })))
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFoundPage })))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          <OfflineIndicator />
          <Suspense fallback={<FullPageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/login"
              element={
                <RedirectIfAuthenticated>
                  <LoginPage />
                </RedirectIfAuthenticated>
              }
            />
            <Route
              path="/signup"
              element={
                <RedirectIfAuthenticated>
                  <SignupPage />
                </RedirectIfAuthenticated>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <RedirectIfAuthenticated>
                  <ForgotPasswordPage />
                </RedirectIfAuthenticated>
              }
            />
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <OnboardingPage />
                </RequireAuth>
              }
            />
            <Route
              element={
                <RequireAuth>
                  <RequireOnboarding>
                    <AppShell />
                  </RequireOnboarding>
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/subjects" element={<SubjectsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/assistant" element={<AssistantPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
          <Toaster
            position="top-right"
            toastOptions={{
              classNames: {
                toast: 'rounded-lg border border-border bg-card text-foreground shadow-lg text-sm',
              },
            }}
          />
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
