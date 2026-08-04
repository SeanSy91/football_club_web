begin;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text check (description is null or char_length(description) <= 2000),
  venue text not null check (char_length(venue) between 2 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity smallint not null check (capacity between 1 and 100),
  registration_deadline timestamptz not null,
  cancellation_deadline timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (
    cancellation_reason is null or char_length(cancellation_reason) between 2 and 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order_check check (ends_at > starts_at),
  constraint events_registration_deadline_check check (registration_deadline < starts_at),
  constraint events_cancellation_deadline_check check (
    cancellation_deadline >= registration_deadline and cancellation_deadline < starts_at
  )
);

create index if not exists events_club_status_starts_idx
on public.events (club_id, status, starts_at);

alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;
grant select on table public.events to authenticated;

create or replace function private.can_manage_club(
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
     and cm.role in ('owner', 'admin')
     and cm.status = 'active'
    where c.id = p_club_id
      and c.status = 'active'
  );
$$;

revoke all on function private.can_manage_club(uuid, uuid) from public;
grant execute on function private.can_manage_club(uuid, uuid) to authenticated;

drop policy if exists "events_select_club_members" on public.events;
create policy "events_select_club_members"
on public.events
for select
to authenticated
using (
  (select private.is_active_club_member(club_id))
  and (
    status in ('published', 'cancelled')
    or (select private.can_manage_club(club_id))
  )
);

alter table public.audit_logs
drop constraint if exists audit_logs_target_type_check;

alter table public.audit_logs
add constraint audit_logs_target_type_check
check (target_type in ('club', 'member', 'invite', 'event'));

create or replace function private.validate_event_details(
  p_title text,
  p_description text,
  p_venue text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_registration_deadline timestamptz,
  p_cancellation_deadline timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 80 then
    raise exception '일정 이름은 2자 이상 80자 이하로 입력해 주세요.';
  end if;

  if char_length(btrim(coalesce(p_venue, ''))) not between 2 and 120 then
    raise exception '장소는 2자 이상 120자 이하로 입력해 주세요.';
  end if;

  if char_length(coalesce(p_description, '')) > 2000 then
    raise exception '상세 안내는 2,000자 이하로 입력해 주세요.';
  end if;

  if p_starts_at is null or p_ends_at is null
    or p_registration_deadline is null or p_cancellation_deadline is null then
    raise exception '일정 시각과 마감 시각을 모두 입력해 주세요.';
  end if;

  if p_starts_at <= now() then
    raise exception '시작 시각은 현재보다 이후여야 합니다.';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception '종료 시각은 시작 시각보다 이후여야 합니다.';
  end if;

  if p_capacity is null or p_capacity not between 1 and 100 then
    raise exception '정원은 1명 이상 100명 이하로 입력해 주세요.';
  end if;

  if p_registration_deadline >= p_starts_at then
    raise exception '신청 마감은 시작 시각보다 이전이어야 합니다.';
  end if;

  if p_cancellation_deadline < p_registration_deadline
    or p_cancellation_deadline >= p_starts_at then
    raise exception '취소 마감은 신청 마감 이후이면서 시작 시각보다 이전이어야 합니다.';
  end if;
end;
$$;

revoke all on function private.validate_event_details(
  text, text, text, timestamptz, timestamptz, integer, timestamptz, timestamptz
) from public, anon, authenticated;

create or replace function public.create_event(
  p_club_id uuid,
  p_title text,
  p_description text,
  p_venue text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_registration_deadline timestamptz,
  p_cancellation_deadline timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_event_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_venue text := btrim(coalesce(p_venue, ''));
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.can_manage_club(p_club_id, v_user_id) then
    raise exception '총관리자와 관리자만 일정을 작성할 수 있습니다.';
  end if;

  perform private.validate_event_details(
    v_title,
    v_description,
    v_venue,
    p_starts_at,
    p_ends_at,
    p_capacity,
    p_registration_deadline,
    p_cancellation_deadline
  );

  if p_registration_deadline <= now() then
    raise exception '신청 마감은 현재보다 이후여야 합니다.';
  end if;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_user_id;

  insert into public.events (
    club_id,
    title,
    description,
    venue,
    starts_at,
    ends_at,
    capacity,
    registration_deadline,
    cancellation_deadline,
    created_by,
    updated_by
  )
  values (
    p_club_id,
    v_title,
    v_description,
    v_venue,
    p_starts_at,
    p_ends_at,
    p_capacity,
    p_registration_deadline,
    p_cancellation_deadline,
    v_user_id,
    v_user_id
  )
  returning id into v_event_id;

  insert into public.audit_logs (
    club_id,
    actor_user_id,
    actor_display_name,
    action,
    target_type,
    target_id,
    target_display_name,
    after_state
  )
  values (
    p_club_id,
    v_user_id,
    v_actor_name,
    'event_created',
    'event',
    v_event_id::text,
    v_title,
    jsonb_build_object('status', 'draft', 'starts_at', p_starts_at, 'capacity', p_capacity)
  );

  return v_event_id;
end;
$$;

create or replace function public.update_event(
  p_event_id uuid,
  p_club_id uuid,
  p_title text,
  p_description text,
  p_venue text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_registration_deadline timestamptz,
  p_cancellation_deadline timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_existing public.events%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_venue text := btrim(coalesce(p_venue, ''));
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.can_manage_club(p_club_id, v_user_id) then
    raise exception '총관리자와 관리자만 일정을 수정할 수 있습니다.';
  end if;

  select * into v_existing
  from public.events e
  where e.id = p_event_id and e.club_id = p_club_id
  for update;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  if v_existing.status = 'cancelled' then
    raise exception '취소된 일정은 수정할 수 없습니다.';
  end if;

  perform private.validate_event_details(
    v_title,
    v_description,
    v_venue,
    p_starts_at,
    p_ends_at,
    p_capacity,
    p_registration_deadline,
    p_cancellation_deadline
  );

  if v_existing.status = 'draft' and p_registration_deadline <= now() then
    raise exception '공개 전 일정의 신청 마감은 현재보다 이후여야 합니다.';
  end if;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_user_id;

  update public.events
  set
    title = v_title,
    description = v_description,
    venue = v_venue,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    capacity = p_capacity,
    registration_deadline = p_registration_deadline,
    cancellation_deadline = p_cancellation_deadline,
    updated_by = v_user_id,
    updated_at = now()
  where id = p_event_id;

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
    'event_updated',
    'event',
    p_event_id::text,
    v_title,
    jsonb_build_object(
      'title', v_existing.title,
      'venue', v_existing.venue,
      'starts_at', v_existing.starts_at,
      'ends_at', v_existing.ends_at,
      'capacity', v_existing.capacity,
      'registration_deadline', v_existing.registration_deadline,
      'cancellation_deadline', v_existing.cancellation_deadline
    ),
    jsonb_build_object(
      'title', v_title,
      'venue', v_venue,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'capacity', p_capacity,
      'registration_deadline', p_registration_deadline,
      'cancellation_deadline', p_cancellation_deadline
    )
  );
end;
$$;

create or replace function public.publish_event(
  p_event_id uuid,
  p_club_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_event public.events%rowtype;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.can_manage_club(p_club_id, v_user_id) then
    raise exception '총관리자와 관리자만 일정을 공개할 수 있습니다.';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id and e.club_id = p_club_id
  for update;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  if v_event.status <> 'draft' then
    raise exception '임시 저장된 일정만 공개할 수 있습니다.';
  end if;

  if v_event.starts_at <= now() or v_event.registration_deadline <= now() then
    raise exception '시작 시각과 신청 마감이 지나지 않은 일정만 공개할 수 있습니다.';
  end if;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_user_id;

  update public.events
  set
    status = 'published',
    published_at = now(),
    updated_by = v_user_id,
    updated_at = now()
  where id = p_event_id;

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
    'event_published',
    'event',
    p_event_id::text,
    v_event.title,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'published')
  );
end;
$$;

create or replace function public.cancel_event(
  p_event_id uuid,
  p_club_id uuid,
  p_cancellation_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_name text;
  v_event public.events%rowtype;
  v_reason text := btrim(coalesce(p_cancellation_reason, ''));
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.can_manage_club(p_club_id, v_user_id) then
    raise exception '총관리자와 관리자만 일정을 취소할 수 있습니다.';
  end if;

  if char_length(v_reason) not between 2 and 500 then
    raise exception '취소 사유는 2자 이상 500자 이하로 입력해 주세요.';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id and e.club_id = p_club_id
  for update;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  if v_event.status <> 'published' then
    raise exception '공개된 일정만 취소할 수 있습니다.';
  end if;

  if v_event.starts_at <= now() then
    raise exception '이미 시작된 일정은 취소할 수 없습니다.';
  end if;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_user_id;

  update public.events
  set
    status = 'cancelled',
    cancellation_reason = v_reason,
    cancelled_at = now(),
    updated_by = v_user_id,
    updated_at = now()
  where id = p_event_id;

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
    'event_cancelled',
    'event',
    p_event_id::text,
    v_event.title,
    jsonb_build_object('status', 'published'),
    jsonb_build_object('status', 'cancelled', 'reason', v_reason)
  );
end;
$$;

revoke all on function public.create_event(
  uuid, text, text, text, timestamptz, timestamptz, integer, timestamptz, timestamptz
) from public, anon;
revoke all on function public.update_event(
  uuid, uuid, text, text, text, timestamptz, timestamptz, integer, timestamptz, timestamptz
) from public, anon;
revoke all on function public.publish_event(uuid, uuid) from public, anon;
revoke all on function public.cancel_event(uuid, uuid, text) from public, anon;

grant execute on function public.create_event(
  uuid, text, text, text, timestamptz, timestamptz, integer, timestamptz, timestamptz
) to authenticated;
grant execute on function public.update_event(
  uuid, uuid, text, text, text, timestamptz, timestamptz, integer, timestamptz, timestamptz
) to authenticated;
grant execute on function public.publish_event(uuid, uuid) to authenticated;
grant execute on function public.cancel_event(uuid, uuid, text) to authenticated;

commit;
