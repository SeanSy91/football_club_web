begin;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  content text not null check (char_length(content) between 1 and 4000),
  is_pinned boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_period_check check (ends_at is null or ends_at > starts_at)
);

create index if not exists announcements_club_visibility_idx
on public.announcements (club_id, status, is_pinned desc, starts_at desc);

alter table public.announcements enable row level security;
revoke all on table public.announcements from anon, authenticated;
grant select on table public.announcements to authenticated;

drop policy if exists "announcements_select_club_members" on public.announcements;
create policy "announcements_select_club_members"
on public.announcements
for select
to authenticated
using (
  (select private.is_active_club_member(club_id))
  and (
    (select private.can_manage_club(club_id))
    or (
      status = 'published'
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
    )
  )
);

alter table public.audit_logs
drop constraint if exists audit_logs_target_type_check;

alter table public.audit_logs
add constraint audit_logs_target_type_check
check (target_type in ('club', 'member', 'invite', 'event', 'announcement'));

create or replace function private.validate_announcement_details(
  p_title text,
  p_content text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 100 then
    raise exception '공지 제목은 2자 이상 100자 이하로 입력해 주세요.';
  end if;

  if char_length(btrim(coalesce(p_content, ''))) not between 1 and 4000 then
    raise exception '공지 내용은 1자 이상 4,000자 이하로 입력해 주세요.';
  end if;

  if p_starts_at is null then
    raise exception '공지 시작 시각을 입력해 주세요.';
  end if;

  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception '공지 종료 시각은 시작 시각보다 늦어야 합니다.';
  end if;

  if p_status is null or p_status not in ('draft', 'published') then
    raise exception '공지 상태를 확인해 주세요.';
  end if;
end;
$$;

revoke all on function private.validate_announcement_details(text, text, timestamptz, timestamptz, text) from public;

create or replace function public.create_announcement(
  p_club_id uuid,
  p_title text,
  p_content text,
  p_is_pinned boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_announcement_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := btrim(coalesce(p_content, ''));
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.can_manage_club(p_club_id, v_user_id) then
    raise exception '총관리자와 관리자만 공지를 작성할 수 있습니다.';
  end if;

  perform private.validate_announcement_details(
    v_title, v_content, p_starts_at, p_ends_at, p_status
  );

  insert into public.announcements (
    club_id, title, content, is_pinned, starts_at, ends_at,
    status, created_by, updated_by
  )
  values (
    p_club_id, v_title, v_content, coalesce(p_is_pinned, false),
    p_starts_at, p_ends_at, p_status, v_user_id, v_user_id
  )
  returning id into v_announcement_id;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_user_id;

  insert into public.audit_logs (
    club_id, actor_user_id, actor_display_name, action,
    target_type, target_id, target_display_name, after_state
  )
  values (
    p_club_id, v_user_id, v_actor_name, 'announcement_created',
    'announcement', v_announcement_id::text, v_title,
    jsonb_build_object('status', p_status, 'is_pinned', coalesce(p_is_pinned, false))
  );

  return v_announcement_id;
end;
$$;

create or replace function public.update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_content text,
  p_is_pinned boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_announcement public.announcements%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := btrim(coalesce(p_content, ''));
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_announcement
  from public.announcements a
  where a.id = p_announcement_id
  for update;

  if not found then
    raise exception '수정할 공지를 찾을 수 없습니다.';
  end if;

  if not private.can_manage_club(v_announcement.club_id, v_user_id) then
    raise exception '총관리자와 관리자만 공지를 수정할 수 있습니다.';
  end if;

  if v_announcement.status = 'archived' then
    raise exception '보관된 공지는 수정할 수 없습니다.';
  end if;

  perform private.validate_announcement_details(
    v_title, v_content, p_starts_at, p_ends_at, p_status
  );

  update public.announcements
  set
    title = v_title,
    content = v_content,
    is_pinned = coalesce(p_is_pinned, false),
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    status = p_status,
    updated_by = v_user_id,
    updated_at = now()
  where id = p_announcement_id;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_user_id;

  insert into public.audit_logs (
    club_id, actor_user_id, actor_display_name, action,
    target_type, target_id, target_display_name, before_state, after_state
  )
  values (
    v_announcement.club_id, v_user_id, v_actor_name, 'announcement_updated',
    'announcement', p_announcement_id::text, v_title,
    jsonb_build_object(
      'title', v_announcement.title,
      'status', v_announcement.status,
      'is_pinned', v_announcement.is_pinned
    ),
    jsonb_build_object('title', v_title, 'status', p_status, 'is_pinned', coalesce(p_is_pinned, false))
  );
end;
$$;

create or replace function public.archive_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_announcement public.announcements%rowtype;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_announcement
  from public.announcements a
  where a.id = p_announcement_id
  for update;

  if not found then
    raise exception '보관할 공지를 찾을 수 없습니다.';
  end if;

  if not private.can_manage_club(v_announcement.club_id, v_user_id) then
    raise exception '총관리자와 관리자만 공지를 보관할 수 있습니다.';
  end if;

  if v_announcement.status = 'archived' then
    return;
  end if;

  update public.announcements
  set status = 'archived', is_pinned = false, updated_by = v_user_id, updated_at = now()
  where id = p_announcement_id;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_user_id;

  insert into public.audit_logs (
    club_id, actor_user_id, actor_display_name, action,
    target_type, target_id, target_display_name, before_state, after_state
  )
  values (
    v_announcement.club_id, v_user_id, v_actor_name, 'announcement_archived',
    'announcement', p_announcement_id::text, v_announcement.title,
    jsonb_build_object('status', v_announcement.status),
    jsonb_build_object('status', 'archived')
  );
end;
$$;

revoke all on function public.create_announcement(uuid, text, text, boolean, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.update_announcement(uuid, text, text, boolean, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.archive_announcement(uuid) from public, anon;
grant execute on function public.create_announcement(uuid, text, text, boolean, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.update_announcement(uuid, text, text, boolean, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.archive_announcement(uuid) to authenticated;

commit;
