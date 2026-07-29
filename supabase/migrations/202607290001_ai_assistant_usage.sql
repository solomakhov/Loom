create table if not exists public.ai_assistant_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  task_id text,
  status text not null default 'started'
    check (status in ('started', 'completed', 'failed')),
  model text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_assistant_requests_user_created_idx
on public.ai_assistant_requests (user_id, created_at desc);

alter table public.ai_assistant_requests enable row level security;

revoke all on table public.ai_assistant_requests from anon, authenticated;
grant all on table public.ai_assistant_requests to service_role;

