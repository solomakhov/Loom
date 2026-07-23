begin;

insert into public.schema_migrations (version)
values ('202607230001_task_details')
on conflict (version) do nothing;

alter table public.project_tasks
  add column if not exists description text not null default '',
  add column if not exists start_date date,
  add column if not exists due_date date;

update public.project_tasks task
set
  description = coalesce(nullif(task.description, ''), source.task_data->>'description', ''),
  start_date = case
    when task.start_date is not null then task.start_date
    when nullif(source.task_data->>'startDate', '') is not null then (source.task_data->>'startDate')::date
    else null
  end,
  due_date = case
    when task.due_date is not null then task.due_date
    when nullif(source.task_data->>'dueDate', '') is not null then (source.task_data->>'dueDate')::date
    else null
  end
from (
  select
    projects.id as project_id,
    task_item.value as task_data
  from public.projects
  cross join lateral jsonb_array_elements(coalesce(projects.data->'tasks', '[]'::jsonb)) as task_item(value)
  where projects.data is not null
) as source
where task.project_id = source.project_id
  and task.id = source.task_data->>'id';

commit;
