create table if not exists public.digest_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (length(trim(email)) > 3),
  enabled boolean not null default false,
  delivery_hour smallint not null default 9 check (delivery_hour between 0 and 23),
  timezone text not null default 'Europe/Moscow' check (length(trim(timezone)) > 0),
  last_sent_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists digest_settings_enabled_idx
  on public.digest_settings (enabled, delivery_hour)
  where enabled;

alter table public.digest_settings enable row level security;

drop policy if exists "Users can read their digest settings" on public.digest_settings;
create policy "Users can read their digest settings"
on public.digest_settings
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their digest settings" on public.digest_settings;
create policy "Users can insert their digest settings"
on public.digest_settings
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their digest settings" on public.digest_settings;
create policy "Users can update their digest settings"
on public.digest_settings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their digest settings" on public.digest_settings;
create policy "Users can delete their digest settings"
on public.digest_settings
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.digest_settings to authenticated;
