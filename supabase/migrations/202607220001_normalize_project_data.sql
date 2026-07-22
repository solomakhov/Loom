begin;

create extension if not exists pgcrypto;

create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  user_id uuid not null default auth.uid(),
  data jsonb,
  updated_at timestamptz not null default now()
);

insert into public.schema_migrations (version)
values ('202607220001_normalize_project_data')
on conflict (version) do nothing;

alter table public.projects
  add column if not exists title text,
  add column if not exists description text not null default '',
  add column if not exists status text not null default 'active',
  add column if not exists priority text not null default 'medium',
  add column if not exists start_date date,
  add column if not exists due_date date,
  add column if not exists icon text not null default 'L',
  add column if not exists created_at timestamptz not null default now();

update public.projects
set
  title = coalesce(title, nullif(data->>'title', ''), 'Untitled project'),
  description = coalesce(nullif(description, ''), data->>'description', ''),
  status = coalesce(nullif(status, ''), data->>'status', 'active'),
  priority = coalesce(nullif(priority, ''), data->>'priority', 'medium'),
  start_date = case
    when start_date is not null then start_date
    when nullif(data->>'startDate', '') is not null then (data->>'startDate')::date
    else null
  end,
  due_date = case
    when due_date is not null then due_date
    when nullif(data->>'dueDate', '') is not null then (data->>'dueDate')::date
    else null
  end,
  icon = coalesce(nullif(icon, ''), data->>'icon', 'L'),
  created_at = coalesce((data->>'createdAt')::timestamptz, created_at, updated_at, now()),
  updated_at = coalesce((data->>'updatedAt')::timestamptz, updated_at, now())
where data is not null;

alter table public.projects
  alter column title set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_id_user_id_key'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_id_user_id_key unique (id, user_id);
  end if;
end $$;

alter table public.projects enable row level security;

drop policy if exists "Users can read their own projects" on public.projects;
drop policy if exists "Users can insert their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;

create policy "Users can read their own projects"
on public.projects
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own projects"
on public.projects
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own projects"
on public.projects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own projects"
on public.projects
for delete
to authenticated
using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_status_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_status_check
      check (status in ('active', 'paused', 'done', 'archived'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_priority_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_priority_check
      check (priority in ('low', 'medium', 'high'));
  end if;
end $$;

create table if not exists public.project_tags (
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, tag)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_tags_project_user_fk'
      and conrelid = 'public.project_tags'::regclass
  ) then
    alter table public.project_tags
      add constraint project_tags_project_user_fk
      foreign key (project_id, user_id)
      references public.projects(id, user_id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.project_tasks (
  id text primary key,
  user_id uuid not null default auth.uid(),
  project_id text not null references public.projects(id) on delete cascade,
  parent_task_id text references public.project_tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_tasks_id_user_id_key'
      and conrelid = 'public.project_tasks'::regclass
  ) then
    alter table public.project_tasks
      add constraint project_tasks_id_user_id_key unique (id, user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_tasks_project_user_fk'
      and conrelid = 'public.project_tasks'::regclass
  ) then
    alter table public.project_tasks
      add constraint project_tasks_project_user_fk
      foreign key (project_id, user_id)
      references public.projects(id, user_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_tasks_parent_user_fk'
      and conrelid = 'public.project_tasks'::regclass
  ) then
    alter table public.project_tasks
      add constraint project_tasks_parent_user_fk
      foreign key (parent_task_id, user_id)
      references public.project_tasks(id, user_id)
      on delete cascade;
  end if;
end $$;

create index if not exists project_tasks_project_position_idx
on public.project_tasks (project_id, parent_task_id, position);

create table if not exists public.materials (
  id text primary key,
  user_id uuid not null default auth.uid(),
  title text not null,
  markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_id_user_id_key'
      and conrelid = 'public.materials'::regclass
  ) then
    alter table public.materials
      add constraint materials_id_user_id_key unique (id, user_id);
  end if;
end $$;

create table if not exists public.material_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  material_id text not null references public.materials(id) on delete cascade,
  project_id text references public.projects(id) on delete cascade,
  task_id text references public.project_tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint material_links_exactly_one_target
    check (
      (project_id is not null and task_id is null)
      or (project_id is null and task_id is not null)
    )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'material_links_material_user_fk'
      and conrelid = 'public.material_links'::regclass
  ) then
    alter table public.material_links
      add constraint material_links_material_user_fk
      foreign key (material_id, user_id)
      references public.materials(id, user_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'material_links_project_user_fk'
      and conrelid = 'public.material_links'::regclass
  ) then
    alter table public.material_links
      add constraint material_links_project_user_fk
      foreign key (project_id, user_id)
      references public.projects(id, user_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'material_links_task_user_fk'
      and conrelid = 'public.material_links'::regclass
  ) then
    alter table public.material_links
      add constraint material_links_task_user_fk
      foreign key (task_id, user_id)
      references public.project_tasks(id, user_id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists material_links_unique_project_target
on public.material_links (material_id, project_id)
where project_id is not null;

create unique index if not exists material_links_unique_task_target
on public.material_links (material_id, task_id)
where task_id is not null;

create index if not exists material_links_project_idx
on public.material_links (project_id);

create index if not exists material_links_task_idx
on public.material_links (task_id);

insert into public.project_tags (project_id, user_id, tag)
select
  p.id,
  p.user_id,
  tag.value
from public.projects p
cross join lateral jsonb_array_elements_text(coalesce(p.data->'tags', '[]'::jsonb)) as tag(value)
where p.data is not null
on conflict (project_id, tag) do nothing;

insert into public.project_tasks (
  id,
  user_id,
  project_id,
  title,
  done,
  position,
  created_at,
  updated_at
)
select
  task.value->>'id',
  p.user_id,
  p.id,
  coalesce(nullif(task.value->>'title', ''), 'Untitled task'),
  coalesce((task.value->>'done')::boolean, false),
  task.ordinality::integer - 1,
  coalesce((task.value->>'createdAt')::timestamptz, p.created_at, now()),
  coalesce((task.value->>'updatedAt')::timestamptz, p.updated_at, now())
from public.projects p
cross join lateral jsonb_array_elements(coalesce(p.data->'tasks', '[]'::jsonb))
  with ordinality as task(value, ordinality)
where p.data is not null
  and task.value ? 'id'
on conflict (id) do update
set
  title = excluded.title,
  done = excluded.done,
  position = excluded.position,
  updated_at = excluded.updated_at;

insert into public.materials (
  id,
  user_id,
  title,
  markdown,
  created_at,
  updated_at
)
select
  material.value->>'id',
  p.user_id,
  coalesce(nullif(material.value->>'title', ''), 'Untitled material'),
  coalesce(material.value->>'markdown', ''),
  coalesce((material.value->>'createdAt')::timestamptz, p.created_at, now()),
  coalesce((material.value->>'updatedAt')::timestamptz, p.updated_at, now())
from public.projects p
cross join lateral jsonb_array_elements(coalesce(p.data->'materials', '[]'::jsonb))
  with ordinality as material(value, ordinality)
where p.data is not null
  and material.value ? 'id'
on conflict (id) do update
set
  title = excluded.title,
  markdown = excluded.markdown,
  updated_at = excluded.updated_at;

insert into public.material_links (
  user_id,
  material_id,
  project_id,
  task_id
)
select
  p.user_id,
  material.value->>'id',
  case when nullif(material.value->>'taskId', '') is null then p.id else null end,
  nullif(material.value->>'taskId', '')
from public.projects p
cross join lateral jsonb_array_elements(coalesce(p.data->'materials', '[]'::jsonb))
  as material(value)
where p.data is not null
  and material.value ? 'id'
on conflict do nothing;

alter table public.project_tags enable row level security;
alter table public.project_tasks enable row level security;
alter table public.materials enable row level security;
alter table public.material_links enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['project_tags', 'project_tasks', 'materials', 'material_links']
  loop
    execute format('drop policy if exists "Users can read their own rows" on public.%I', table_name);
    execute format('drop policy if exists "Users can insert their own rows" on public.%I', table_name);
    execute format('drop policy if exists "Users can update their own rows" on public.%I', table_name);
    execute format('drop policy if exists "Users can delete their own rows" on public.%I', table_name);

    execute format(
      'create policy "Users can read their own rows" on public.%I for select to authenticated using (auth.uid() = user_id)',
      table_name
    );
    execute format(
      'create policy "Users can insert their own rows" on public.%I for insert to authenticated with check (auth.uid() = user_id)',
      table_name
    );
    execute format(
      'create policy "Users can update their own rows" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name
    );
    execute format(
      'create policy "Users can delete their own rows" on public.%I for delete to authenticated using (auth.uid() = user_id)',
      table_name
    );
  end loop;
end $$;

commit;
