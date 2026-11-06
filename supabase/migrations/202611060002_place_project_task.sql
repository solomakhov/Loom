begin;

create function public.place_project_task(
  task_id text,
  task_project_id text,
  expected_revision bigint,
  anchor_task_id text,
  placement text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moving_task public.project_tasks%rowtype;
  anchor_task public.project_tasks%rowtype;
  target_parent_id text;
  changed_tasks jsonb;
begin
  if placement is null or placement not in ('before', 'after', 'inside') then
    raise sqlstate '22023' using message = 'Invalid task placement';
  end if;

  -- Use the same lock order as the cross-project move.
  perform 1 from public.projects
  where id = task_project_id and user_id = (select auth.uid())
  for update;

  if not found then
    raise sqlstate '40001' using message = 'Project is no longer available';
  end if;

  perform 1 from public.project_tasks
  where project_id = task_project_id
  order by id
  for update;

  select * into moving_task from public.project_tasks
  where id = task_id and project_id = task_project_id and revision = expected_revision;

  if not found then
    raise sqlstate '40001' using message = 'Task has changed or is no longer available';
  end if;

  select * into anchor_task from public.project_tasks
  where id = anchor_task_id and project_id = task_project_id;

  if not found then
    raise sqlstate '40001' using message = 'Drop target is no longer available';
  end if;

  if exists (
    with recursive branch(id) as (
      select task_id
      union
      select child.id
      from public.project_tasks as child
      join branch on child.parent_task_id = branch.id
      where child.project_id = task_project_id
    )
    select 1 from branch where id = anchor_task_id
  ) then
    raise sqlstate '40001' using message = 'A task cannot be placed relative to its own branch';
  end if;

  target_parent_id := case when placement = 'inside' then anchor_task.id else anchor_task.parent_task_id end;

  with target_siblings as (
    select id, 2 * row_number() over (order by position, id) as sort_key
    from public.project_tasks
    where project_id = task_project_id and id <> task_id
      and parent_task_id is not distinct from target_parent_id
  ),
  target_order as (
    select id, row_number() over (order by sort_key) - 1 as position
    from (
      select id, sort_key from target_siblings
      union all
      select task_id, case placement
        when 'inside' then coalesce((select max(sort_key) from target_siblings), 0) + 1
        else (select sort_key from target_siblings where id = anchor_task_id)
          + case when placement = 'after' then 1 else -1 end
      end
    ) as ordered_tasks
  ),
  placements as (
    select id, target_parent_id as parent_task_id, position from target_order
    union all
    select id, moving_task.parent_task_id, row_number() over (order by position, id) - 1
    from public.project_tasks
    where project_id = task_project_id and id <> task_id
      and parent_task_id is not distinct from moving_task.parent_task_id
      and target_parent_id is distinct from moving_task.parent_task_id
  ),
  changed as (
    update public.project_tasks as task
    set parent_task_id = placements.parent_task_id,
        position = placements.position,
        revision = task.revision + 1,
        updated_at = now()
    from placements
    where task.id = placements.id
      and (task.parent_task_id, task.position)
        is distinct from (placements.parent_task_id, placements.position)
    returning task.*
  )
  select coalesce(jsonb_agg(to_jsonb(changed)), '[]'::jsonb) into changed_tasks from changed;

  return changed_tasks;
end;
$$;

revoke all on function public.place_project_task(text, text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.place_project_task(text, text, bigint, text, text)
  to authenticated;

commit;
