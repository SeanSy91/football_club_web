begin;

alter table public.profiles
  add column if not exists age smallint,
  add column if not exists avatar_path text,
  add column if not exists use_default_avatar boolean not null default false,
  add column if not exists preferred_position text,
  add column if not exists preferred_foot text,
  add column if not exists shirt_number smallint,
  add column if not exists bio text;

alter table public.profiles
  drop constraint if exists profiles_age_check,
  drop constraint if exists profiles_avatar_path_check,
  drop constraint if exists profiles_preferred_position_check,
  drop constraint if exists profiles_preferred_foot_check,
  drop constraint if exists profiles_shirt_number_check,
  drop constraint if exists profiles_bio_check;

alter table public.profiles
  add constraint profiles_age_check
    check (age is null or age between 1 and 120),
  add constraint profiles_avatar_path_check
    check (avatar_path is null or avatar_path = id::text || '/avatar.webp'),
  add constraint profiles_preferred_position_check
    check (preferred_position is null or char_length(preferred_position) between 1 and 30),
  add constraint profiles_preferred_foot_check
    check (preferred_foot is null or preferred_foot in ('right', 'left', 'both')),
  add constraint profiles_shirt_number_check
    check (shirt_number is null or shirt_number between 0 and 99),
  add constraint profiles_bio_check
    check (bio is null or char_length(bio) between 1 and 300);

revoke update (display_name, avatar_url) on table public.profiles from authenticated;
grant update (
  display_name,
  age,
  avatar_path,
  use_default_avatar,
  preferred_position,
  preferred_foot,
  shirt_number,
  bio
) on table public.profiles to authenticated;

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_profile_updated_at() from public;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_profile_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-images',
  'profile-images',
  false,
  1048576,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_images_select_own" on storage.objects;
create policy "profile_images_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-images'
  and name = (select auth.uid())::text || '/avatar.webp'
  and owner_id = (select auth.uid())::text
);

drop policy if exists "profile_images_insert_own" on storage.objects;
create policy "profile_images_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and name = (select auth.uid())::text || '/avatar.webp'
  and storage.extension(name) = 'webp'
);

drop policy if exists "profile_images_update_own" on storage.objects;
create policy "profile_images_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-images'
  and name = (select auth.uid())::text || '/avatar.webp'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-images'
  and name = (select auth.uid())::text || '/avatar.webp'
  and owner_id = (select auth.uid())::text
);

drop policy if exists "profile_images_delete_own" on storage.objects;
create policy "profile_images_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and name = (select auth.uid())::text || '/avatar.webp'
  and owner_id = (select auth.uid())::text
);

commit;
