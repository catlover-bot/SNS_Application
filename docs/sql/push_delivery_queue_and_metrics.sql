-- Async push delivery queue + metrics for growth notifications
-- Used by:
-- - apps/web/src/app/api/me/post-performance/[id]/notify/route.ts (enqueue)
-- - apps/web/src/app/api/internal/push-dispatch/route.ts (worker)
-- - apps/web/src/app/api/me/push-delivery/dashboard/route.ts (dashboard)
-- - apps/mobile/App.tsx (push open event logging)

create table if not exists public.push_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid,
  post_id uuid,
  kind text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  available_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_notification_jobs_dispatch_idx
  on public.push_notification_jobs (status, available_after, created_at);

create index if not exists push_notification_jobs_user_idx
  on public.push_notification_jobs (user_id, created_at desc);

alter table public.push_notification_jobs enable row level security;

drop policy if exists "push_jobs_select_own" on public.push_notification_jobs;
create policy "push_jobs_select_own" on public.push_notification_jobs for select
using (auth.uid() = user_id);

drop policy if exists "push_jobs_insert_own" on public.push_notification_jobs;
create policy "push_jobs_insert_own" on public.push_notification_jobs for insert
with check (auth.uid() = user_id);

create table if not exists public.push_delivery_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.push_notification_jobs(id) on delete set null,
  notification_id uuid,
  post_id uuid,
  kind text,
  provider text not null default 'expo',
  event_type text not null,
  expo_push_token text,
  provider_ticket_id text,
  provider_receipt_id text,
  status text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists push_delivery_events_user_created_idx
  on public.push_delivery_events (user_id, created_at desc);

create index if not exists push_delivery_events_job_idx
  on public.push_delivery_events (job_id, created_at desc);

alter table public.push_delivery_events enable row level security;

drop policy if exists "push_delivery_events_select_own" on public.push_delivery_events;
create policy "push_delivery_events_select_own" on public.push_delivery_events for select
using (auth.uid() = user_id);

drop policy if exists "push_delivery_events_insert_own" on public.push_delivery_events;
create policy "push_delivery_events_insert_own" on public.push_delivery_events for insert
with check (auth.uid() = user_id);

create table if not exists public.push_delivery_daily_metrics (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null default '__all__',
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  error_count integer not null default 0,
  open_count integer not null default 0,
  device_not_registered_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, kind)
);

create index if not exists push_delivery_daily_metrics_user_day_idx
  on public.push_delivery_daily_metrics (user_id, day desc);

alter table public.push_delivery_daily_metrics enable row level security;

drop policy if exists "push_delivery_daily_metrics_select_own" on public.push_delivery_daily_metrics;
create policy "push_delivery_daily_metrics_select_own" on public.push_delivery_daily_metrics for select
using (auth.uid() = user_id);

create or replace function public.push_delivery_bump_daily_metrics(
  p_user_id uuid,
  p_day date,
  p_kind text default '__all__',
  p_queued_delta integer default 0,
  p_sent_delta integer default 0,
  p_error_delta integer default 0,
  p_open_delta integer default 0,
  p_device_not_registered_delta integer default 0
)
returns void
language plpgsql
as $$
begin
  insert into public.push_delivery_daily_metrics (
    user_id, day, kind, queued_count, sent_count, error_count, open_count, device_not_registered_count, updated_at
  )
  values (
    p_user_id, p_day, coalesce(nullif(trim(p_kind), ''), '__all__'),
    greatest(0, coalesce(p_queued_delta, 0)),
    greatest(0, coalesce(p_sent_delta, 0)),
    greatest(0, coalesce(p_error_delta, 0)),
    greatest(0, coalesce(p_open_delta, 0)),
    greatest(0, coalesce(p_device_not_registered_delta, 0)),
    now()
  )
  on conflict (user_id, day, kind) do update
  set
    queued_count = public.push_delivery_daily_metrics.queued_count + greatest(0, coalesce(p_queued_delta, 0)),
    sent_count = public.push_delivery_daily_metrics.sent_count + greatest(0, coalesce(p_sent_delta, 0)),
    error_count = public.push_delivery_daily_metrics.error_count + greatest(0, coalesce(p_error_delta, 0)),
    open_count = public.push_delivery_daily_metrics.open_count + greatest(0, coalesce(p_open_delta, 0)),
    device_not_registered_count = public.push_delivery_daily_metrics.device_not_registered_count + greatest(0, coalesce(p_device_not_registered_delta, 0)),
    updated_at = now();
end;
$$;
