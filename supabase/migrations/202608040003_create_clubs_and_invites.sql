begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 50),
  owner_id uuid not null references auth.users (id) on delete restrict,
  time_zone text not null default 'Asia/Seoul' check (time_zone = 'Asia/Seoul'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  joined_at timestamptz not null default now(),
  promoted_at timestamptz,
  promoted_by uuid references auth.users (id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  primary key (club_id, user_id)
);

create table if not exists public.club_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null unique references public.clubs (id) on delete cascade,
  code_hash text not null check (char_length(code_hash) = 60),
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists club_members_one_active_club_per_user
on public.club_members (user_id)
where status = 'active';

create index if not exists club_members_active_club_idx
on public.club_members (club_id, joined_at)
where status = 'active';

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_invites enable row level security;

revoke all on table public.clubs from anon, authenticated;
revoke all on table public.club_members from anon, authenticated;
revoke all on table public.club_invites from anon, authenticated;
grant select on table public.clubs to authenticated;
grant select on table public.club_members to authenticated;

create or replace function private.is_active_club_member(
  p_club_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.club_members cm
    where cm.club_id = p_club_id
      and cm.user_id = p_user_id
      and cm.status = 'active'
  );
$$;

create or replace function private.shares_active_club(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.club_members viewer
    join public.club_members target
      on target.club_id = viewer.club_id
     and target.status = 'active'
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and target.user_id = p_target_user_id
  );
$$;

create or replace function private.can_view_profile_image(p_owner_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    p_owner_id = (select auth.uid())::text
    or exists (
      select 1
      from public.club_members viewer
      join public.club_members target
        on target.club_id = viewer.club_id
       and target.status = 'active'
      where viewer.user_id = (select auth.uid())
        and viewer.status = 'active'
        and target.user_id::text = p_owner_id
    )
  );
$$;

revoke all on function private.is_active_club_member(uuid, uuid) from public;
revoke all on function private.shares_active_club(uuid) from public;
revoke all on function private.can_view_profile_image(text) from public;
grant execute on function private.is_active_club_member(uuid, uuid) to authenticated;
grant execute on function private.shares_active_club(uuid) to authenticated;
grant execute on function private.can_view_profile_image(text) to authenticated;

drop policy if exists "clubs_select_members" on public.clubs;
create policy "clubs_select_members"
on public.clubs
for select
to authenticated
using ((select private.is_active_club_member(id)));

drop policy if exists "club_members_select_members" on public.club_members;
create policy "club_members_select_members"
on public.club_members
for select
to authenticated
using ((select private.is_active_club_member(club_id)));

drop policy if exists "profiles_select_shared_club" on public.profiles;
create policy "profiles_select_shared_club"
on public.profiles
for select
to authenticated
using ((select private.shares_active_club(id)));

drop policy if exists "profile_images_select_club_members" on storage.objects;
create policy "profile_images_select_club_members"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-images'
  and name = owner_id || '/avatar.webp'
  and (select private.can_view_profile_image(owner_id))
);

drop view if exists public.club_member_profiles;
create view public.club_member_profiles
with (security_invoker = true)
as
select
  cm.club_id,
  cm.user_id,
  cm.role,
  cm.status,
  cm.joined_at,
  p.display_name,
  p.age,
  p.avatar_url,
  p.avatar_path,
  p.use_default_avatar,
  p.preferred_position,
  p.preferred_foot,
  p.shirt_number,
  p.bio
from public.club_members cm
join public.profiles p on p.id = cm.user_id;

revoke all on table public.club_member_profiles from anon, authenticated;
grant select on table public.club_member_profiles to authenticated;

create or replace function private.normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(btrim(coalesce(p_code, '')));
$$;

revoke all on function private.normalize_invite_code(text) from public;

create or replace function public.create_club_with_invite_code(
  p_name text,
  p_invite_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := private.normalize_invite_code(p_invite_code);
  v_club_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 50 then
    raise exception '클럽 이름은 2자부터 50자까지 입력해 주세요.';
  end if;

  if v_code !~ '^[A-Z0-9]{10}$' then
    raise exception '초대 코드는 영문 대문자와 숫자 10자리여야 합니다.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.age is not null
  ) then
    raise exception '클럽을 만들기 전에 프로필을 완성해 주세요.';
  end if;

  if exists (
    select 1 from public.club_members cm
    where cm.user_id = v_user_id and cm.status = 'active'
  ) then
    raise exception '이미 가입한 활성 클럽이 있습니다.';
  end if;

  insert into public.clubs (name, owner_id)
  values (v_name, v_user_id)
  returning id into v_club_id;

  insert into public.club_members (club_id, user_id, role, status)
  values (v_club_id, v_user_id, 'owner', 'active');

  insert into public.club_invites (club_id, code_hash, created_by)
  values (
    v_club_id,
    extensions.crypt(v_code, extensions.gen_salt('bf', 10)),
    v_user_id
  );

  return v_club_id;
exception
  when unique_violation then
    raise exception '이미 가입한 활성 클럽이 있습니다.';
end;
$$;

create or replace function public.join_club_with_invite_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := private.normalize_invite_code(p_invite_code);
  v_club_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_code !~ '^[A-Z0-9]{10}$' then
    raise exception '초대 코드를 확인해 주세요.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.age is not null
  ) then
    raise exception '클럽에 가입하기 전에 프로필을 완성해 주세요.';
  end if;

  if exists (
    select 1 from public.club_members cm
    where cm.user_id = v_user_id and cm.status = 'active'
  ) then
    raise exception '이미 가입한 활성 클럽이 있습니다.';
  end if;

  select ci.club_id
  into v_club_id
  from public.club_invites ci
  join public.clubs c on c.id = ci.club_id
  where ci.is_active
    and c.status = 'active'
    and ci.code_hash = extensions.crypt(v_code, ci.code_hash)
  order by ci.updated_at desc
  limit 1
  for update of ci;

  if v_club_id is null then
    raise exception '유효하지 않은 초대 코드입니다.';
  end if;

  insert into public.club_members (club_id, user_id, role, status)
  values (v_club_id, v_user_id, 'member', 'active');

  return v_club_id;
exception
  when unique_violation then
    raise exception '이미 가입한 활성 클럽이 있습니다.';
end;
$$;

revoke all on function public.create_club_with_invite_code(text, text) from public, anon;
revoke all on function public.join_club_with_invite_code(text) from public, anon;
grant execute on function public.create_club_with_invite_code(text, text) to authenticated;
grant execute on function public.join_club_with_invite_code(text) to authenticated;

commit;
