begin;

alter table public.profiles
add column if not exists account_status text not null default 'active',
add column if not exists deletion_requested_at timestamptz;

alter table public.profiles
drop constraint if exists profiles_account_status_check;

alter table public.profiles
add constraint profiles_account_status_check
check (account_status in ('active', 'deletion_requested'));

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete set null,
  avatar_path text,
  status text not null default 'pending' check (status = 'pending'),
  requested_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
revoke all on table public.account_deletion_requests from anon, authenticated;
grant select on table public.account_deletion_requests to authenticated;

drop policy if exists "account_deletion_requests_select_own" on public.account_deletion_requests;
create policy "account_deletion_requests_select_own"
on public.account_deletion_requests
for select
to authenticated
using (user_id = (select auth.uid()));

alter table public.club_invites alter column created_by drop not null;
alter table public.club_invites drop constraint if exists club_invites_created_by_fkey;
alter table public.club_invites
add constraint club_invites_created_by_fkey
foreign key (created_by) references auth.users (id) on delete set null;

alter table public.club_invites drop constraint if exists club_invites_updated_by_fkey;
alter table public.club_invites
add constraint club_invites_updated_by_fkey
foreign key (updated_by) references auth.users (id) on delete set null;

alter table public.events
alter column created_by drop not null,
alter column updated_by drop not null;
alter table public.events drop constraint if exists events_created_by_fkey;
alter table public.events drop constraint if exists events_updated_by_fkey;
alter table public.events
add constraint events_created_by_fkey
foreign key (created_by) references auth.users (id) on delete set null;
alter table public.events
add constraint events_updated_by_fkey
foreign key (updated_by) references auth.users (id) on delete set null;

alter table public.attendance_records alter column checked_by drop not null;
alter table public.attendance_records drop constraint if exists attendance_records_checked_by_fkey;
alter table public.attendance_records
add constraint attendance_records_checked_by_fkey
foreign key (checked_by) references auth.users (id) on delete set null;

alter table public.announcements
alter column created_by drop not null,
alter column updated_by drop not null;
alter table public.announcements drop constraint if exists announcements_created_by_fkey;
alter table public.announcements drop constraint if exists announcements_updated_by_fkey;
alter table public.announcements
add constraint announcements_created_by_fkey
foreign key (created_by) references auth.users (id) on delete set null;
alter table public.announcements
add constraint announcements_updated_by_fkey
foreign key (updated_by) references auth.users (id) on delete set null;

create or replace function private.ensure_active_account_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and not exists (
    select 1
    from public.profiles p
    where p.id = new.user_id and p.account_status = 'active'
  ) then
    raise exception '삭제 요청 중인 계정은 클럽에 가입할 수 없습니다.';
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_active_account_membership() from public, anon, authenticated;

drop trigger if exists club_members_require_active_account on public.club_members;
create trigger club_members_require_active_account
before insert or update of status on public.club_members
for each row execute function private.ensure_active_account_membership();

create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_membership public.club_members%rowtype;
  v_requested_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_profile
  from public.profiles p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception '계정 프로필을 찾을 수 없습니다.';
  end if;

  if v_profile.account_status = 'deletion_requested' then
    return v_profile.deletion_requested_at;
  end if;

  if exists (
    select 1
    from public.clubs c
    where c.owner_id = v_user_id and c.status = 'active'
  ) then
    raise exception '총관리자는 클럽 소유권을 정리한 뒤 계정 삭제를 요청할 수 있습니다.';
  end if;

  select * into v_membership
  from public.club_members cm
  where cm.user_id = v_user_id and cm.status = 'active'
  for update;

  insert into public.account_deletion_requests (
    user_id, club_id, avatar_path, status, requested_at
  )
  values (
    v_user_id, v_membership.club_id, v_profile.avatar_path, 'pending', v_requested_at
  )
  on conflict (user_id) do update
  set
    club_id = excluded.club_id,
    avatar_path = excluded.avatar_path,
    status = 'pending',
    requested_at = excluded.requested_at;

  if v_membership.club_id is not null then
    update public.club_members
    set
      status = 'removed',
      removed_at = v_requested_at,
      removed_by = v_user_id
    where club_id = v_membership.club_id and user_id = v_user_id;

    insert into public.audit_logs (
      club_id, actor_user_id, actor_display_name, action,
      target_type, target_id, target_display_name, after_state
    )
    values (
      v_membership.club_id,
      null,
      '탈퇴 회원',
      'account_deletion_requested',
      'member',
      'deleted-account',
      '탈퇴 회원',
      jsonb_build_object('requested_at', v_requested_at)
    );
  end if;

  update public.audit_logs
  set actor_user_id = null, actor_display_name = '탈퇴 회원'
  where actor_user_id = v_user_id;

  update public.audit_logs
  set target_id = 'deleted-account', target_display_name = '탈퇴 회원'
  where target_type = 'member' and target_id = v_user_id::text;

  update public.profiles
  set account_status = 'deletion_requested', deletion_requested_at = v_requested_at
  where id = v_user_id;

  return v_requested_at;
end;
$$;

revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

commit;
