begin;

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_display_name text not null check (char_length(actor_display_name) between 1 and 40),
  action text not null check (char_length(action) between 1 and 60),
  target_type text not null check (target_type in ('club', 'member', 'invite')),
  target_id text not null check (char_length(target_id) between 1 and 100),
  target_display_name text not null check (char_length(target_display_name) between 1 and 100),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_club_created_idx
on public.audit_logs (club_id, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

create or replace function private.is_club_owner(
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
    from public.clubs c
    join public.club_members cm
      on cm.club_id = c.id
     and cm.user_id = p_user_id
     and cm.role = 'owner'
     and cm.status = 'active'
    where c.id = p_club_id
      and c.owner_id = p_user_id
      and c.status = 'active'
  );
$$;

revoke all on function private.is_club_owner(uuid, uuid) from public;
grant execute on function private.is_club_owner(uuid, uuid) to authenticated;

drop policy if exists "audit_logs_select_owner" on public.audit_logs;
create policy "audit_logs_select_owner"
on public.audit_logs
for select
to authenticated
using ((select private.is_club_owner(club_id)));

create or replace function public.change_member_role(
  p_club_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_name text;
  v_target_name text;
  v_previous_role text;
  v_target_status text;
begin
  if v_actor_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.is_club_owner(p_club_id, v_actor_user_id) then
    raise exception '총관리자만 회원 권한을 변경할 수 있습니다.';
  end if;

  if p_new_role not in ('admin', 'member') then
    raise exception '관리자 또는 일반 회원 역할만 지정할 수 있습니다.';
  end if;

  select cm.role, cm.status, p.display_name
  into v_previous_role, v_target_status, v_target_name
  from public.club_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.club_id = p_club_id
    and cm.user_id = p_target_user_id
  for update of cm;

  if not found or v_target_status <> 'active' then
    raise exception '활성 회원을 찾을 수 없습니다.';
  end if;

  if v_previous_role = 'owner' or p_target_user_id = v_actor_user_id then
    raise exception '총관리자 역할은 이 기능으로 변경할 수 없습니다.';
  end if;

  if v_previous_role = p_new_role then
    return;
  end if;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_actor_user_id;

  update public.club_members
  set
    role = p_new_role,
    promoted_at = case when p_new_role = 'admin' then now() else null end,
    promoted_by = case when p_new_role = 'admin' then v_actor_user_id else null end
  where club_id = p_club_id and user_id = p_target_user_id;

  insert into public.audit_logs (
    club_id,
    actor_user_id,
    actor_display_name,
    action,
    target_type,
    target_id,
    target_display_name,
    before_state,
    after_state
  )
  values (
    p_club_id,
    v_actor_user_id,
    v_actor_name,
    case when p_new_role = 'admin' then 'member_promoted' else 'admin_revoked' end,
    'member',
    p_target_user_id::text,
    v_target_name,
    jsonb_build_object('role', v_previous_role, 'status', v_target_status),
    jsonb_build_object('role', p_new_role, 'status', 'active')
  );
end;
$$;

create or replace function public.remove_club_member(
  p_club_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_name text;
  v_target_name text;
  v_previous_role text;
  v_target_status text;
begin
  if v_actor_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.is_club_owner(p_club_id, v_actor_user_id) then
    raise exception '총관리자만 회원을 탈퇴 처리할 수 있습니다.';
  end if;

  select cm.role, cm.status, p.display_name
  into v_previous_role, v_target_status, v_target_name
  from public.club_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.club_id = p_club_id
    and cm.user_id = p_target_user_id
  for update of cm;

  if not found or v_target_status <> 'active' then
    raise exception '활성 회원을 찾을 수 없습니다.';
  end if;

  if v_previous_role = 'owner' or p_target_user_id = v_actor_user_id then
    raise exception '총관리자는 탈퇴 처리할 수 없습니다.';
  end if;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_actor_user_id;

  update public.club_members
  set
    role = 'member',
    status = 'removed',
    promoted_at = null,
    promoted_by = null,
    removed_at = now(),
    removed_by = v_actor_user_id
  where club_id = p_club_id and user_id = p_target_user_id;

  insert into public.audit_logs (
    club_id,
    actor_user_id,
    actor_display_name,
    action,
    target_type,
    target_id,
    target_display_name,
    before_state,
    after_state
  )
  values (
    p_club_id,
    v_actor_user_id,
    v_actor_name,
    'member_removed',
    'member',
    p_target_user_id::text,
    v_target_name,
    jsonb_build_object('role', v_previous_role, 'status', v_target_status),
    jsonb_build_object('role', 'member', 'status', 'removed')
  );
end;
$$;

create or replace function public.rotate_club_invite_code(
  p_club_id uuid,
  p_invite_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := private.normalize_invite_code(p_invite_code);
  v_actor_name text;
  v_club_name text;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_code !~ '^[A-Z0-9]{10}$' then
    raise exception '초대 코드는 영문 대문자와 숫자 10자리여야 합니다.';
  end if;

  if not private.is_club_owner(p_club_id, v_user_id) then
    raise exception '총관리자만 초대 코드를 새로 발급할 수 있습니다.';
  end if;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_user_id;
  select c.name into v_club_name
  from public.clubs c where c.id = p_club_id;

  update public.club_invites
  set
    code_hash = extensions.crypt(v_code, extensions.gen_salt('bf', 10)),
    is_active = true,
    updated_at = now(),
    updated_by = v_user_id
  where club_id = p_club_id;

  if not found then
    raise exception '초대 코드 설정을 찾을 수 없습니다.';
  end if;

  insert into public.audit_logs (
    club_id,
    actor_user_id,
    actor_display_name,
    action,
    target_type,
    target_id,
    target_display_name,
    before_state,
    after_state
  )
  values (
    p_club_id,
    v_user_id,
    v_actor_name,
    'invite_code_rotated',
    'invite',
    p_club_id::text,
    v_club_name,
    null,
    jsonb_build_object('is_active', true)
  );
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
  v_user_name text;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_code !~ '^[A-Z0-9]{10}$' then
    raise exception '초대 코드를 확인해 주세요.';
  end if;

  select p.display_name into v_user_name
  from public.profiles p
  where p.id = v_user_id and p.age is not null;
  if not found then
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

  insert into public.club_members (
    club_id,
    user_id,
    role,
    status,
    joined_at,
    promoted_at,
    promoted_by,
    removed_at,
    removed_by
  )
  values (
    v_club_id,
    v_user_id,
    'member',
    'active',
    now(),
    null,
    null,
    null,
    null
  )
  on conflict (club_id, user_id) do update
  set
    role = 'member',
    status = 'active',
    joined_at = now(),
    promoted_at = null,
    promoted_by = null,
    removed_at = null,
    removed_by = null
  where public.club_members.status = 'removed';

  if not found then
    raise exception '이 클럽에 다시 가입할 수 없는 상태입니다.';
  end if;

  insert into public.audit_logs (
    club_id,
    actor_user_id,
    actor_display_name,
    action,
    target_type,
    target_id,
    target_display_name,
    before_state,
    after_state
  )
  values (
    v_club_id,
    v_user_id,
    v_user_name,
    'member_joined',
    'member',
    v_user_id::text,
    v_user_name,
    null,
    jsonb_build_object('role', 'member', 'status', 'active')
  );

  return v_club_id;
exception
  when unique_violation then
    raise exception '이미 가입한 활성 클럽이 있습니다.';
end;
$$;

revoke all on function public.change_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_club_member(uuid, uuid) from public, anon;
revoke all on function public.rotate_club_invite_code(uuid, text) from public, anon;
revoke all on function public.join_club_with_invite_code(text) from public, anon;
grant execute on function public.change_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_club_member(uuid, uuid) to authenticated;
grant execute on function public.rotate_club_invite_code(uuid, text) to authenticated;
grant execute on function public.join_club_with_invite_code(text) to authenticated;

commit;
