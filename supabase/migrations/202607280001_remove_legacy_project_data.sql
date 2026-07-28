begin;

set local lock_timeout = '10s';

-- Recover any tags that may only exist in the legacy JSON snapshot.
insert into public.project_tags (project_id, user_id, tag)
select
  project.id,
  project.user_id,
  tag.value
from public.projects project
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(project.data->'tags') = 'array' then project.data->'tags'
    else '[]'::jsonb
  end
) as tag(value)
where project.data is not null
  and btrim(tag.value) <> ''
on conflict (project_id, tag) do nothing;

-- Insert legacy tasks without parent links first so every referenced task exists.
insert into public.project_tasks as existing_task (
  id,
  user_id,
  project_id,
  title,
  description,
  done,
  position,
  start_date,
  due_date,
  created_at,
  updated_at
)
select
  task.value->>'id',
  project.user_id,
  project.id,
  coalesce(nullif(task.value->>'title', ''), 'Untitled task'),
  coalesce(task.value->>'description', ''),
  coalesce((task.value->>'done')::boolean, false),
  case
    when task.value->>'position' ~ '^[0-9]+$' then (task.value->>'position')::integer
    else task.ordinality::integer - 1
  end,
  case
    when nullif(task.value->>'startDate', '') is not null
      then (task.value->>'startDate')::date
    else null
  end,
  case
    when nullif(task.value->>'dueDate', '') is not null
      then (task.value->>'dueDate')::date
    else null
  end,
  coalesce((task.value->>'createdAt')::timestamptz, project.created_at, now()),
  coalesce((task.value->>'updatedAt')::timestamptz, project.updated_at, now())
from public.projects project
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(project.data->'tasks') = 'array' then project.data->'tasks'
    else '[]'::jsonb
  end
) with ordinality as task(value, ordinality)
where project.data is not null
  and nullif(task.value->>'id', '') is not null
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  done = excluded.done,
  position = excluded.position,
  start_date = excluded.start_date,
  due_date = excluded.due_date,
  updated_at = excluded.updated_at
where excluded.user_id = existing_task.user_id
  and excluded.project_id = existing_task.project_id
  and excluded.updated_at >= existing_task.updated_at;

-- Restore hierarchy only after all legacy tasks have been inserted.
with legacy_task_parents as (
  select
    project.id as project_id,
    project.user_id,
    task.value->>'id' as task_id,
    nullif(task.value->>'parentTaskId', '') as parent_task_id
  from public.projects project
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(project.data->'tasks') = 'array' then project.data->'tasks'
      else '[]'::jsonb
    end
  ) as task(value)
  where project.data is not null
)
update public.project_tasks task
set parent_task_id = source.parent_task_id
from legacy_task_parents source
where task.id = source.task_id
  and task.project_id = source.project_id
  and task.user_id = source.user_id
  and source.parent_task_id is not null
  and exists (
    select 1
    from public.project_tasks parent
    where parent.id = source.parent_task_id
      and parent.project_id = source.project_id
      and parent.user_id = source.user_id
  );

-- Older snapshots could still contain project-scoped text materials.
insert into public.materials (
  id,
  user_id,
  title,
  kind,
  markdown,
  created_at,
  updated_at
)
select
  material.value->>'id',
  project.user_id,
  coalesce(nullif(material.value->>'title', ''), 'Untitled material'),
  'text',
  coalesce(material.value->>'markdown', ''),
  coalesce((material.value->>'createdAt')::timestamptz, project.created_at, now()),
  coalesce((material.value->>'updatedAt')::timestamptz, project.updated_at, now())
from public.projects project
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(project.data->'materials') = 'array' then project.data->'materials'
    else '[]'::jsonb
  end
) as material(value)
where project.data is not null
  and nullif(material.value->>'id', '') is not null
on conflict (id) do nothing;

insert into public.material_links (
  user_id,
  material_id,
  project_id,
  task_id
)
select
  project.user_id,
  material.value->>'id',
  case when nullif(material.value->>'taskId', '') is null then project.id else null end,
  nullif(material.value->>'taskId', '')
from public.projects project
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(project.data->'materials') = 'array' then project.data->'materials'
    else '[]'::jsonb
  end
) as material(value)
where project.data is not null
  and nullif(material.value->>'id', '') is not null
  and (
    nullif(material.value->>'taskId', '') is null
    or exists (
      select 1
      from public.project_tasks task
      where task.id = material.value->>'taskId'
        and task.user_id = project.user_id
    )
  )
on conflict do nothing;

-- Abort instead of dropping the snapshot if any legacy task failed to migrate.
do $$
begin
  if exists (
    select 1
    from public.projects project
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(project.data->'tasks') = 'array' then project.data->'tasks'
        else '[]'::jsonb
      end
    ) as task(value)
    where project.data is not null
      and nullif(task.value->>'id', '') is not null
      and not exists (
        select 1
        from public.project_tasks migrated_task
        where migrated_task.id = task.value->>'id'
          and migrated_task.project_id = project.id
          and migrated_task.user_id = project.user_id
      )
  ) then
    raise exception 'Legacy project tasks were not fully migrated; projects.data was preserved.';
  end if;

  if exists (
    select 1
    from public.projects project
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(project.data->'materials') = 'array' then project.data->'materials'
        else '[]'::jsonb
      end
    ) as material(value)
    where project.data is not null
      and nullif(material.value->>'id', '') is not null
      and not exists (
        select 1
        from public.materials migrated_material
        where migrated_material.id = material.value->>'id'
          and migrated_material.user_id = project.user_id
      )
  ) then
    raise exception 'Legacy project materials were not fully migrated; projects.data was preserved.';
  end if;
end
$$;

drop trigger if exists set_project_defaults_from_legacy_data on public.projects;
drop function if exists public.set_project_defaults_from_legacy_data();

alter table public.projects
  drop column data;

-- Supabase CLI uses supabase_migrations.schema_migrations. This public table was
-- part of the manual migration workflow and is no longer needed.
drop table if exists public.schema_migrations;

commit;
