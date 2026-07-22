begin;

insert into public.schema_migrations (version)
values ('202607220002_project_title_compatibility')
on conflict (version) do nothing;

update public.projects
set title = coalesce(nullif(title, ''), nullif(data->>'title', ''), 'Untitled project')
where title is null or title = '';

alter table public.projects
  alter column title set default 'Untitled project';

create or replace function public.set_project_defaults_from_legacy_data()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.title := coalesce(nullif(new.title, ''), nullif(new.data->>'title', ''), 'Untitled project');
  new.description := coalesce(new.description, new.data->>'description', '');
  new.status := coalesce(new.status, new.data->>'status', 'active');
  new.priority := coalesce(new.priority, new.data->>'priority', 'medium');
  new.icon := coalesce(new.icon, new.data->>'icon', 'L');
  new.created_at := coalesce(new.created_at, (new.data->>'createdAt')::timestamptz, now());
  new.updated_at := coalesce(new.updated_at, (new.data->>'updatedAt')::timestamptz, now());

  if new.start_date is null and nullif(new.data->>'startDate', '') is not null then
    new.start_date := (new.data->>'startDate')::date;
  end if;

  if new.due_date is null and nullif(new.data->>'dueDate', '') is not null then
    new.due_date := (new.data->>'dueDate')::date;
  end if;

  return new;
end;
$$;

drop trigger if exists set_project_defaults_from_legacy_data on public.projects;

create trigger set_project_defaults_from_legacy_data
before insert or update on public.projects
for each row
execute function public.set_project_defaults_from_legacy_data();

commit;
