begin;

alter table public.materials
  add column if not exists kind text not null default 'text',
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_kind_check'
      and conrelid = 'public.materials'::regclass
  ) then
    alter table public.materials
      add constraint materials_kind_check
      check (kind in ('text', 'pdf'));
  end if;
end $$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'materials',
  'materials',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own material files" on storage.objects;
drop policy if exists "Users can upload their own material files" on storage.objects;
drop policy if exists "Users can update their own material files" on storage.objects;
drop policy if exists "Users can delete their own material files" on storage.objects;

create policy "Users can read their own material files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can upload their own material files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can update their own material files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete their own material files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;
