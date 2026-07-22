# Loom Dev Log

Last updated: 2026-07-22

## Project Summary

Loom is a Vite + React project-management MVP. The current app supports projects, tasks, tags, statuses, priorities, and Markdown materials inside each project.

The frontend is deployed as a static site on Vercel. Data is stored in Supabase Postgres through the Supabase JavaScript client, called directly from the browser.

## Current Stack

- Frontend: React 19, TypeScript, Vite
- UI icons: lucide-react
- Markdown editor: `@mdxeditor/editor`
- Hosting: Vercel
- Database/Auth: Supabase
- Build command: `npm run build`
- Publish directory: `dist`

## Environment Variables

Required in Vercel:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_URL=
```

Local example is stored in `.env.example`.

`VITE_APP_URL` must point to the public production Vercel domain from the
project's `Domains` section, not to a per-deployment preview URL.

## Deployment Notes

The app is a static frontend. It does not require a VPS or a long-running Node.js server.

Recommended hosting setup:

- Vercel project connected to the GitHub repository
- Build command: `npm run build`
- Output directory: `dist`
- Supabase variables set in Vercel project settings

After changing environment variables in Vercel, redeploy the project.

## Supabase Setup

The database schema is stored in `supabase-schema.sql`.

Note: `supabase-schema.sql` is now deprecated. Use versioned migrations in:

```text
supabase/migrations/
```

Current table:

```text
projects
  id text primary key
  user_id uuid default auth.uid()
  data jsonb
  updated_at timestamptz
```

The initial MVP stored one row in `projects` per Loom project and nested tasks/materials inside `data`.

The project is now moving to normalized tables:

```text
projects
project_tags
project_tasks
materials
material_links
```

`projects.data` remains as a legacy backup during the transition.

## Row Level Security

RLS is enabled on `projects`.

Policies allow authenticated users to:

- read their own projects
- insert their own projects
- update their own projects
- delete their own projects

The frontend uses the Supabase anon key. This is acceptable only because RLS is enabled and tied to `auth.uid()`.

## Auth

Auth uses Supabase email + password.

The app now:

- checks the current Supabase session on load
- shows an email/password sign-in screen when no session exists
- supports sign-up with email/password
- supports password reset through Supabase recovery email
- has a sign-out button in the sidebar

Password recovery is intentionally handled defensively:

- reset emails are requested with `supabase.auth.resetPasswordForEmail`
- redirect URL is built from `VITE_APP_URL`
- recovery route is `/?mode=recovery`
- the app supports PKCE recovery URLs with `?code=...`
- the app supports implicit recovery URLs with `#access_token=...`
- recovery state is also tracked in `localStorage` as `loom.passwordRecoveryRequested`

Required Supabase dashboard settings:

- Email provider enabled
- `Site URL` set to the public production Vercel domain
- `Redirect URLs` include the public production Vercel domain
- `Redirect URLs` include `https://<production-domain>/?mode=recovery`
- `Redirect URLs` include `http://localhost:5173/**` for local development

Do not use Vercel per-deployment preview URLs for Supabase Auth redirects.
Those URLs may be protected by Vercel Deployment Protection and can strip or
consume Supabase recovery parameters before the app receives them.

## Saving Behavior

The app now shows a save-status indicator:

- `Сохранено`
- `Сохраняем...`
- `Есть несохраненные изменения`
- `Ошибка сохранения`

Structural changes save immediately:

- create/edit project
- archive/delete project
- create/delete task
- toggle task
- create/delete material

Text-heavy material edits are debounced by 800 ms:

- material markdown
- material title

This reduces unnecessary Supabase writes while keeping the UI responsive.

## Delete Safety

Deletion now requires confirmation through `window.confirm` for:

- projects
- tasks
- materials

This is a simple MVP-level safeguard. A custom modal can replace it later.

## Material Switching Bug

There was a bug where switching between materials appeared not to update the editor content.

The effective fix was adding:

```tsx
key={selectedMaterial.id}
```

to `MaterialEditor` usage in `App.tsx`.

Later attempted fixes were reverted after discovering the original fix worked once the deployed page was freshly opened. The issue was likely affected by browser tab/cache state rather than the final React logic.

## Local Verification

Run:

```powershell
npm run build
```

Expected result:

- TypeScript passes
- Vite production build succeeds
- Vite may warn about a large JS chunk because `@mdxeditor/editor` is heavy

For local development:

```powershell
npm run dev
```

Then open:

```text
http://127.0.0.1:5173
```

## Operational Notes

If Vercel deployment appears successful but behavior does not change:

- close the browser tab and open the site again
- try hard refresh
- check that the latest commit is the active Vercel deployment
- check that Vercel environment variables are set for the correct environment

If Supabase has no tables after adding Vercel variables, this is expected. Environment variables do not create schema. Run `supabase-schema.sql` in Supabase SQL Editor.

## Next MVP Candidates

Recommended next improvements:

- render and edit nested subtasks
- reorder tasks and subtasks
- link/unlink materials to projects and tasks
- support materials linked to multiple objects
- add a free-materials view for unlinked materials
- search inside material markdown
- export project to JSON or Markdown
- replace browser `confirm` with app-level confirmation modal
- add explicit migration/backfill tooling
- split the large editor bundle with dynamic import

## 2026-07-22 Work Session

### Goal

Move Loom from a local/prototype shape toward a usable hosted MVP:

- host the app on Vercel
- store data in Supabase Postgres
- separate user data by authenticated Supabase users
- prepare the database model for subtasks and flexible material links
- make auth usable with email/password

### Hosting And Runtime

Vercel is used as static hosting for the Vite app.

Important hosting conclusions:

- The app does not need a VPS or a long-running backend server for the current MVP.
- Vercel build command is `npm run build`.
- Vercel output directory is `dist`.
- Environment variables must be set in the Vercel project settings.
- After changing Vercel environment variables, redeploy the project.

Important domain rule:

- Use the stable production domain from Vercel `Domains`.
- Do not use per-deployment URLs from the `Deployments` list for Supabase Auth redirects.

### Supabase Configuration

Required Vercel variables:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
VITE_APP_URL=https://<production-domain>.vercel.app
```

`VITE_SUPABASE_ANON_KEY` is the Supabase `anon public` key. Never put the
`service_role` key in the frontend.

Required Supabase Auth URL configuration:

```text
Site URL:
https://<production-domain>.vercel.app

Redirect URLs:
https://<production-domain>.vercel.app/**
https://<production-domain>.vercel.app/?mode=recovery
http://localhost:5173/**
```

### Database Work

The initial data model stored one row per project in `projects.data` as JSONB.
That was useful for speed, but insufficient for the planned model.

The project now has versioned migrations in:

```text
supabase/migrations/
```

Current migrations:

```text
202607220001_normalize_project_data.sql
202607220002_project_title_compatibility.sql
```

Tables created or normalized:

- `projects`
- `project_tags`
- `project_tasks`
- `materials`
- `material_links`

Every user-owned table has `user_id`, and RLS policies keep user data separated
by `auth.uid()`.

The frontend storage layer now reads and writes normalized tables while still
writing `projects.data` as a compatibility backup.

### Auth Work

Auth evolved in several steps:

1. Anonymous/local-style access was replaced with Supabase Auth.
2. Magic-link auth was added first.
3. The flow was switched to email/password.
4. Sign-up and sign-in modes were added to the auth screen.
5. Password reset UI was added for users created before password auth existed.
6. Recovery links were fixed to use the public production domain through `VITE_APP_URL`.

The final recovery issue was not caused only by frontend logic. The recovery
link was going through a Vercel-protected deployment URL, so the browser reached
Vercel login instead of the Loom app. Using the stable production domain fixed
the flow.

### UI/UX Work

MVP UI improvements completed:

- save status indicator
- debounced material text saving
- delete confirmations for projects, tasks, and materials
- material switching fix using a keyed editor instance
- sidebar sign-out button
- auth screen for sign-in, sign-up, and password reset

### Bugs Resolved

Material switching:

- Symptom: selecting another material did not update editor content.
- Fix: force `MaterialEditor` remount by passing `key={selectedMaterial.id}`.

Project creation after normalized migration:

- Symptom: `null value in column "title" of relation "projects" violates not-null constraint`.
- Fix: compatibility migration backfilled titles and added safe handling for older JSON-style writes.

Password recovery:

- Symptom: recovery link opened the app as signed-in instead of showing password change.
- Frontend fixes: explicit recovery mode, `?code=...` handling, hash-token handling.
- Deployment fix: use public production Vercel domain, not protected deployment URL.

### Current State

The project is ready for the next UI/data-model pass:

- subtasks already have database support through `project_tasks.parent_task_id`
- task ordering already has database support through `project_tasks.position`
- independent materials already have database support through `materials`
- project/task/material relationships already have database support through `material_links`

The next implementation should focus on exposing this existing model in the UI.
