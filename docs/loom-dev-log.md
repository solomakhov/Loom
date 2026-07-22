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
```

Local example is stored in `.env.example`.

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

Current table:

```text
projects
  id text primary key
  user_id uuid default auth.uid()
  data jsonb
  updated_at timestamptz
```

One row in `projects` equals one Loom project. Tasks and materials are currently nested inside the `data` JSON field.

This is intentional for MVP speed. Later, if the app needs stronger search, collaboration, or partial updates, the likely next schema is:

```text
projects
project_tasks
project_materials
```

## Row Level Security

RLS is enabled on `projects`.

Policies allow authenticated users to:

- read their own projects
- insert their own projects
- update their own projects
- delete their own projects

The frontend uses the Supabase anon key. This is acceptable only because RLS is enabled and tied to `auth.uid()`.

## Auth

Auth was changed from anonymous Supabase sessions to email magic-link auth.

The app now:

- checks the current Supabase session on load
- shows an email sign-in screen when no session exists
- sends a magic link with `supabase.auth.signInWithOtp`
- redirects back to `window.location.origin`
- has a sign-out button in the sidebar

Required Supabase dashboard settings:

- Email provider enabled
- Site URL set to the production Vercel URL
- Redirect URLs include the production Vercel URL
- Redirect URLs include `http://localhost:5173` for local development

If magic links show `{"error":"requested path is invalid"}`, check Supabase Auth URL Configuration and the Magic Link email template.

The Magic Link email template should use:

```html
<a href="{{ .ConfirmationURL }}">Log In</a>
```

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

- normalize database tables when project/material data grows
- search inside material markdown
- export project to JSON or Markdown
- replace browser `confirm` with app-level confirmation modal
- add explicit migration/backfill tooling
- split the large editor bundle with dynamic import
