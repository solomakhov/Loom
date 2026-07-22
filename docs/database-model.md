# Loom Database Model

Last updated: 2026-07-22

## Direction

The initial MVP stored one row per project in `projects.data` as JSONB. That was acceptable for a fast start, but it becomes limiting for:

- subtasks
- task ordering
- material links to multiple objects
- free materials
- search inside tasks/materials
- future collaboration

The next database direction is normalized relational storage.

## Migration Files

Versioned migrations live in:

```text
supabase/migrations/
```

Current migration:

```text
202607220001_normalize_project_data.sql
```

Apply migrations manually through Supabase SQL Editor for now. Later, this can be moved to Supabase CLI.

## Tables

### `projects`

User-owned project records.

Important columns:

- `id`
- `user_id`
- `title`
- `description`
- `status`
- `priority`
- `start_date`
- `due_date`
- `icon`
- `created_at`
- `updated_at`
- `data`

`data` remains temporarily as a legacy backup during migration from the JSONB model. The frontend now reads and writes normalized tables, while still writing `data` for compatibility during the transition.

### `project_tags`

Tags are separated from project JSON.

Key columns:

- `project_id`
- `user_id`
- `tag`

Primary key:

```text
(project_id, tag)
```

### `project_tasks`

Tasks and subtasks.

Key columns:

- `id`
- `user_id`
- `project_id`
- `parent_task_id`
- `title`
- `done`
- `position`
- `created_at`
- `updated_at`

Subtasks are represented by `parent_task_id`.

Ordering is represented by `position`. Ordering is scoped by:

```text
project_id + parent_task_id
```

Top-level tasks have `parent_task_id = null`.

### `materials`

Materials are independent user-owned documents.

Key columns:

- `id`
- `user_id`
- `title`
- `markdown`
- `created_at`
- `updated_at`

Materials do not directly belong to a single project or task. This is required for multiple links and free materials.

### `material_links`

Links materials to projects or tasks.

Key columns:

- `id`
- `user_id`
- `material_id`
- `project_id`
- `task_id`
- `created_at`

Rules:

- one link targets exactly one object: project or task
- one material can have many links
- a material with no links is a free material

## User Separation

Every user-owned table has `user_id`.

RLS policies restrict access to rows where:

```sql
auth.uid() = user_id
```

This prevents objects from different users from mixing in reads/writes.

## Migration Strategy

The first normalization migration:

1. Creates migration bookkeeping with `schema_migrations`.
2. Keeps the existing `projects` table.
3. Adds relational columns to `projects`.
4. Migrates `projects.data` fields into relational columns.
5. Creates `project_tags`, `project_tasks`, `materials`, and `material_links`.
6. Migrates nested JSON tasks/materials/tags into those tables.
7. Keeps `projects.data` for rollback/compatibility during the frontend transition.

## Frontend Transition Status

The frontend storage layer now:

1. Reads projects from normalized `projects` columns.
2. Reads tags from `project_tags`.
3. Reads tasks from `project_tasks`.
4. Reads materials from `materials`.
5. Reads project-material relationships from `material_links`.
6. Writes updates back into those normalized tables.
7. Still writes `projects.data` as a legacy backup.

Next implementation steps:

1. Render nested tasks using `ProjectTask.parentTaskId`.
2. Add task reordering using `ProjectTask.position`.
3. Add material link/unlink UI.
4. Add free-material view.
5. Remove dependency on `projects.data` after production data is verified.

## Operational Rule

Schema changes should be represented as new files in `supabase/migrations/`.

Do not edit already-applied migration files after production use. Add a new migration instead.
