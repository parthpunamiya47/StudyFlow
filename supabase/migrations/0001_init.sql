-- ============================================================================
-- StudyFlow AI — initial schema
-- Normalized PostgreSQL schema with Row Level Security on every table that
-- stores user-specific data.
--
-- Apply with:  supabase db push   (or paste into the SQL editor)
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  display_name         text not null check (char_length(display_name) between 1 and 80),
  institution          text,
  academic_goals       text,
  semester_start       date not null default current_date,
  semester_end         date not null default current_date + interval '120 days',
  timezone             text not null default 'UTC',
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (semester_end >= semester_start)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------
create table if not exists public.subjects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  description   text,
  difficulty    smallint not null default 3 check (difficulty between 1 and 5),
  mastery_level smallint not null default 50 check (mastery_level between 0 and 100),
  target_grade  text,
  color         text not null default '#7C6CF0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists subjects_user_id_idx on public.subjects (user_id);

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  subject_id       uuid references public.subjects(id) on delete set null,
  title            text not null check (char_length(title) between 1 and 160),
  description      text,
  task_type        text not null default 'assignment'
                   check (task_type in ('assignment','examination','project','revision','reading','practice','other')),
  deadline         timestamptz,
  estimated_minutes integer not null default 60 check (estimated_minutes > 0 and estimated_minutes <= 1440),
  actual_minutes   integer not null default 0 check (actual_minutes >= 0),
  difficulty       smallint not null default 3 check (difficulty between 1 and 5),
  importance       smallint not null default 3 check (importance between 1 and 5),
  mastery_level    smallint check (mastery_level between 0 and 100),
  status           text not null default 'todo'
                   check (status in ('todo','in_progress','completed')),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),  updated_at           timestamptz not null default now(),
  constraint tasks_completed_requires_timestamp
    check (status <> 'completed' or completed_at is not null)
);

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_subject_id_idx on public.tasks (subject_id);
create index if not exists tasks_deadline_idx on public.tasks (user_id, deadline);
create index if not exists tasks_status_idx on public.tasks (user_id, status);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- availability (weekly recurring free-time grid)
-- ---------------------------------------------------------------------------
create table if not exists public.availability (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time  text not null check (start_time ~ '^\d{2}:\d{2}$'),
  end_time    text not null check (end_time ~ '^\d{2}:\d{2}$'),
  is_available boolean not null default true,
  unique (user_id, day_of_week, start_time, end_time),
  check (end_time > start_time)
);

create index if not exists availability_user_id_idx on public.availability (user_id);

-- ---------------------------------------------------------------------------
-- schedule_versions (immutable history of replans)
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_versions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  version_number integer not null,
  reason         text not null,
  summary        text not null,
  created_at     timestamptz not null default now(),
  unique (user_id, version_number)
);

create index if not exists schedule_versions_user_idx
  on public.schedule_versions (user_id, version_number desc);

-- ---------------------------------------------------------------------------
-- study_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.study_sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  -- nullable: history survives task deletion
  task_id              uuid references public.tasks(id) on delete set null,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  planned_minutes      integer not null check (planned_minutes > 0 and planned_minutes <= 720),
  actual_minutes       integer not null default 0 check (actual_minutes >= 0),
  status               text not null default 'planned'
                       check (status in ('planned','in_progress','completed','missed','cancelled')),
  completion_timestamp timestamptz,
  reflection           text,
  confidence_rating    smallint check (confidence_rating between 1 and 5),
  schedule_version_id  uuid references public.schedule_versions(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint sessions_end_after_start check (end_at > start_at),
  constraint sessions_completed_has_timestamp
    check (status <> 'completed' or completion_timestamp is not null)
);

create index if not exists study_sessions_user_start_idx
  on public.study_sessions (user_id, start_at);
create index if not exists study_sessions_task_idx on public.study_sessions (task_id);
create index if not exists study_sessions_status_idx on public.study_sessions (user_id, status);

create trigger study_sessions_set_updated_at
  before update on public.study_sessions
  for each row execute function public.set_updated_at();

-- Server-side overlap prevention (defense in depth alongside the client).
create or replace function public.assert_no_session_overlap()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.study_sessions s
    where s.user_id = new.user_id
      and s.id <> new.id
      and s.status in ('planned','in_progress')
      and new.status in ('planned','in_progress')
      and s.start_at < new.end_at
      and new.start_at < s.end_at
  ) then
    raise exception 'Study sessions cannot overlap';
  end if;
  return new;
end;
$$;

create trigger study_sessions_no_overlap
  before insert or update of start_at, end_at, status, user_id
  on public.study_sessions
  for each row execute function public.assert_no_session_overlap();

-- ---------------------------------------------------------------------------
-- study_logs
-- ---------------------------------------------------------------------------
create table if not exists public.study_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  session_id       uuid references public.study_sessions(id) on delete set null,
  actual_minutes   integer not null check (actual_minutes >= 0),
  task_progress    smallint not null default 0 check (task_progress between 0 and 100),
  confidence_rating smallint check (confidence_rating between 1 and 5),
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists study_logs_user_idx on public.study_logs (user_id, created_at);

-- ---------------------------------------------------------------------------
-- user_preferences
-- ---------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  preferred_session_minutes integer not null default 50
                            check (preferred_session_minutes between 10 and 240),
  break_minutes            integer not null default 10
                            check (break_minutes between 0 and 60),
  daily_limit_minutes      integer not null default 180
                            check (daily_limit_minutes between 30 and 1440),
  theme                    text not null default 'light'
                            check (theme in ('light','dark','system')),
  notification_preferences jsonb not null default
    '{"browser_enabled": false, "deadline_reminders": true, "daily_plan_reminder": true, "reminder_time": "08:00"}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile + preferences for new auth users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'student'), '@', 1)
    )
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.subjects        enable row level security;
alter table public.tasks           enable row level security;
alter table public.availability    enable row level security;
alter table public.study_sessions  enable row level security;
alter table public.study_logs      enable row level security;
alter table public.schedule_versions enable row level security;
alter table public.user_preferences  enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- subjects -------------------------------------------------------------------
drop policy if exists "subjects_all_own" on public.subjects;
create policy "subjects_all_own" on public.subjects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- tasks ----------------------------------------------------------------------
drop policy if exists "tasks_all_own" on public.tasks;
create policy "tasks_all_own" on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- availability ---------------------------------------------------------------
drop policy if exists "availability_all_own" on public.availability;
create policy "availability_all_own" on public.availability
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- study sessions --------------------------------------------------------------
drop policy if exists "sessions_all_own" on public.study_sessions;
create policy "sessions_all_own" on public.study_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- study logs -------------------------------------------------------------------
drop policy if exists "logs_all_own" on public.study_logs;
create policy "logs_all_own" on public.study_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- schedule versions ------------------------------------------------------------
drop policy if exists "versions_all_own" on public.schedule_versions;
create policy "versions_all_own" on public.schedule_versions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- user preferences --------------------------------------------------------------
drop policy if exists "preferences_all_own" on public.user_preferences;
create policy "preferences_all_own" on public.user_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
