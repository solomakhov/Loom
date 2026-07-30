begin;

alter table public.projects
  add column if not exists revision bigint not null default 1;

alter table public.project_tasks
  add column if not exists revision bigint not null default 1;

alter table public.materials
  add column if not exists revision bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_revision_positive'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_revision_positive check (revision > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_tasks_revision_positive'
      and conrelid = 'public.project_tasks'::regclass
  ) then
    alter table public.project_tasks
      add constraint project_tasks_revision_positive check (revision > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_revision_positive'
      and conrelid = 'public.materials'::regclass
  ) then
    alter table public.materials
      add constraint materials_revision_positive check (revision > 0);
  end if;
end
$$;

alter table public.projects replica identity full;
alter table public.project_tasks replica identity full;
alter table public.materials replica identity full;
alter table public.project_tags replica identity full;
alter table public.material_links replica identity full;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'projects',
    'project_tasks',
    'materials',
    'project_tags',
    'material_links'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end
$$;

commit;
