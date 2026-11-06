begin;

-- A new child may be submitted by a tab that still shows the old project.
-- Lock the parent so the check and the move cannot race. Existing task updates
-- use revisions, and backup restore can update a branch one row at a time.
create function public.check_new_task_parent_project()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.project_tasks
  where id = new.parent_task_id and project_id = new.project_id
  for key share;

  if not found then
    raise sqlstate '23503' using message = 'Parent task is no longer in this project';
  end if;

  return new;
end;
$$;

create trigger check_new_task_parent_project
after insert on public.project_tasks
for each row when (new.parent_task_id is not null)
execute function public.check_new_task_parent_project();

revoke all on function public.check_new_task_parent_project() from public, anon, authenticated;

create function public.move_project_task(
  task_id text,
  source_project_id text,
  target_project_id text,
  expected_revision bigint,
  anchor_task_id text default null,
  place_after boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moving_task public.project_tasks%rowtype;
  across_projects boolean := source_project_id <> target_project_id;
  changed_tasks jsonb;
begin
  -- A consistent lock order serializes moves that touch either project.
  perform 1 from public.projects
  where id in (source_project_id, target_project_id)
    and user_id = (select auth.uid())
  order by id
  for update;

  if not exists (
    select 1 from public.projects where id = target_project_id and user_id = (select auth.uid())
  ) then
    raise sqlstate '40001' using message = 'Destination project is no longer available';
  end if;

  perform 1 from public.project_tasks
  where project_id in (source_project_id, target_project_id)
  order by id
  for update;

  select * into moving_task from public.project_tasks
  where id = task_id and project_id = source_project_id and revision = expected_revision;

  if not found then
    raise sqlstate '40001' using message = 'Task has changed or is no longer available';
  end if;

  if not across_projects and (
    anchor_task_id = task_id or not exists (
      select 1 from public.project_tasks
      where id = anchor_task_id and project_id = source_project_id
        and parent_task_id is not distinct from moving_task.parent_task_id
    )
  ) then
    raise sqlstate '40001' using message = 'Drop target is no longer a sibling of the task';
  end if;

  with recursive subtree(id) as (
    select task_id where across_projects
    union
    select child.id
    from public.project_tasks as child
    join subtree on child.parent_task_id = subtree.id
    where child.project_id = source_project_id
  ),
  siblings as (
    select id, row_number() over (order by position, id) as rank
    from public.project_tasks
    where project_id = source_project_id
      and parent_task_id is not distinct from moving_task.parent_task_id
  ),
  source_order as (
    select id, row_number() over (
      order by case when id = task_id
        then 2 * (select rank from siblings where id = anchor_task_id)
             + case when place_after then 1 else -1 end
        else 2 * rank
      end
    ) - 1 as position
    from siblings
    where not across_projects or id <> task_id
  ),
  placements as (
    select id, source_project_id as project_id, moving_task.parent_task_id as parent_task_id,
           position
    from source_order
    union all
    select task.id, target_project_id,
           case when task.id <> task_id then task.parent_task_id end,
           case when task.id = task_id then (
             select coalesce(max(position)::bigint, -1) + 1
             from public.project_tasks
             where project_id = target_project_id and parent_task_id is null
           ) else task.position end
    from public.project_tasks as task
    join subtree on task.id = subtree.id
  ),
  changed as (
    update public.project_tasks as task
    set project_id = placements.project_id,
        parent_task_id = placements.parent_task_id,
        position = placements.position,
        revision = task.revision + 1,
        updated_at = now()
    from placements
    where task.id = placements.id
      and (task.project_id, task.parent_task_id, task.position)
        is distinct from (placements.project_id, placements.parent_task_id, placements.position)
    returning task.*
  )
  select coalesce(jsonb_agg(to_jsonb(changed)), '[]'::jsonb) into changed_tasks from changed;

  return changed_tasks;
end;
$$;

revoke all on function public.move_project_task(text, text, text, bigint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.move_project_task(text, text, text, bigint, text, boolean)
  to authenticated;

commit;
