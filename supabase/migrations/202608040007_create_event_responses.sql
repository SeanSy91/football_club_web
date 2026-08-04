begin;

create sequence if not exists public.event_response_queue_seq;
revoke all on sequence public.event_response_queue_seq from public, anon, authenticated;

alter table public.events
add column if not exists confirmed_count integer not null default 0,
add column if not exists waiting_count integer not null default 0;

alter table public.events
add constraint events_response_counts_check check (
  confirmed_count between 0 and capacity and waiting_count >= 0
);

create unique index if not exists events_id_club_unique_idx
on public.events (id, club_id);

create table if not exists public.event_responses (
  event_id uuid not null,
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('confirmed', 'waiting', 'absent', 'cancelled')),
  queue_order bigint not null default nextval('public.event_response_queue_seq'),
  responded_at timestamptz not null default now(),
  confirmed_at timestamptz,
  waiting_at timestamptz,
  absent_at timestamptz,
  cancelled_at timestamptz,
  promoted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, club_id)
    references public.events (id, club_id) on delete cascade
);

create index if not exists event_responses_event_status_queue_idx
on public.event_responses (event_id, status, queue_order);

create index if not exists event_responses_club_user_idx
on public.event_responses (club_id, user_id);

alter table public.event_responses enable row level security;
revoke all on table public.event_responses from anon, authenticated;
grant select on table public.event_responses to authenticated;

drop policy if exists "event_responses_select_event_members" on public.event_responses;
create policy "event_responses_select_event_members"
on public.event_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_responses.event_id
      and e.club_id = event_responses.club_id
  )
);

create or replace view public.event_response_profiles
with (security_invoker = true)
as
select
  er.event_id,
  er.club_id,
  er.user_id,
  er.status,
  er.queue_order,
  case
    when er.status = 'waiting' then
      count(*) filter (where er.status = 'waiting') over (
        partition by er.event_id
        order by er.queue_order
        rows between unbounded preceding and current row
      )
    else null
  end as wait_position,
  er.responded_at,
  er.confirmed_at,
  er.waiting_at,
  er.absent_at,
  er.cancelled_at,
  er.promoted_at,
  er.updated_at,
  p.display_name,
  p.age,
  p.avatar_url,
  p.avatar_path,
  p.use_default_avatar,
  p.preferred_position,
  p.preferred_foot,
  p.shirt_number
from public.event_responses er
join public.profiles p on p.id = er.user_id;

revoke all on table public.event_response_profiles from anon, authenticated;
grant select on table public.event_response_profiles to authenticated;

create or replace function private.refresh_event_response_counts(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmed_count integer;
  v_waiting_count integer;
begin
  select
    count(*) filter (where er.status = 'confirmed'),
    count(*) filter (where er.status = 'waiting')
  into v_confirmed_count, v_waiting_count
  from public.event_responses er
  join public.club_members cm
    on cm.club_id = er.club_id
   and cm.user_id = er.user_id
   and cm.status = 'active'
  where er.event_id = p_event_id;

  update public.events
  set
    confirmed_count = v_confirmed_count,
    waiting_count = v_waiting_count
  where id = p_event_id;
end;
$$;

create or replace function private.promote_next_waiting(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select er.user_id
  into v_user_id
  from public.event_responses er
  join public.club_members cm
    on cm.club_id = er.club_id
   and cm.user_id = er.user_id
   and cm.status = 'active'
  where er.event_id = p_event_id
    and er.status = 'waiting'
  order by er.queue_order
  limit 1
  for update of er;

  if v_user_id is not null then
    update public.event_responses
    set
      status = 'confirmed',
      confirmed_at = now(),
      promoted_at = now(),
      updated_at = now()
    where event_id = p_event_id and user_id = v_user_id;
  end if;

  return v_user_id;
end;
$$;

revoke all on function private.refresh_event_response_counts(uuid) from public, anon, authenticated;
revoke all on function private.promote_next_waiting(uuid) from public, anon, authenticated;

create or replace function public.apply_to_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_existing_status text;
  v_status text;
  v_wait_position bigint;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id
  for update;

  if not found or v_event.status <> 'published' then
    raise exception '참가 신청할 수 있는 일정을 찾을 수 없습니다.';
  end if;

  if not private.is_active_club_member(v_event.club_id, v_user_id) then
    raise exception '활성 클럽 회원만 참가 신청할 수 있습니다.';
  end if;

  if now() >= v_event.registration_deadline then
    raise exception '참가 신청이 마감되었습니다.';
  end if;

  select er.status into v_existing_status
  from public.event_responses er
  where er.event_id = p_event_id and er.user_id = v_user_id
  for update;

  if v_existing_status in ('confirmed', 'waiting') then
    perform private.refresh_event_response_counts(p_event_id);
    select e.confirmed_count, e.waiting_count
    into v_event.confirmed_count, v_event.waiting_count
    from public.events e where e.id = p_event_id;

    if v_existing_status = 'waiting' then
      select count(*) into v_wait_position
      from public.event_responses er
      join public.club_members cm
        on cm.club_id = er.club_id and cm.user_id = er.user_id and cm.status = 'active'
      where er.event_id = p_event_id
        and er.status = 'waiting'
        and er.queue_order <= (
          select mine.queue_order from public.event_responses mine
          where mine.event_id = p_event_id and mine.user_id = v_user_id
        );
    end if;

    return jsonb_build_object(
      'status', v_existing_status,
      'wait_position', v_wait_position,
      'confirmed_count', v_event.confirmed_count,
      'waiting_count', v_event.waiting_count
    );
  end if;

  perform private.refresh_event_response_counts(p_event_id);
  select * into v_event from public.events e where e.id = p_event_id;
  v_status := case
    when v_event.confirmed_count < v_event.capacity then 'confirmed'
    else 'waiting'
  end;

  insert into public.event_responses (
    event_id,
    club_id,
    user_id,
    status,
    queue_order,
    responded_at,
    confirmed_at,
    waiting_at,
    absent_at,
    cancelled_at,
    promoted_at,
    updated_at
  )
  values (
    p_event_id,
    v_event.club_id,
    v_user_id,
    v_status,
    nextval('public.event_response_queue_seq'),
    now(),
    case when v_status = 'confirmed' then now() else null end,
    case when v_status = 'waiting' then now() else null end,
    null,
    null,
    null,
    now()
  )
  on conflict (event_id, user_id) do update
  set
    status = excluded.status,
    queue_order = excluded.queue_order,
    responded_at = excluded.responded_at,
    confirmed_at = excluded.confirmed_at,
    waiting_at = excluded.waiting_at,
    absent_at = null,
    cancelled_at = null,
    promoted_at = null,
    updated_at = excluded.updated_at;

  perform private.refresh_event_response_counts(p_event_id);
  select e.confirmed_count, e.waiting_count
  into v_event.confirmed_count, v_event.waiting_count
  from public.events e where e.id = p_event_id;

  if v_status = 'waiting' then
    v_wait_position := v_event.waiting_count;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'wait_position', v_wait_position,
    'confirmed_count', v_event.confirmed_count,
    'waiting_count', v_event.waiting_count
  );
end;
$$;

create or replace function public.set_event_absent(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_existing_status text;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id
  for update;

  if not found or v_event.status <> 'published' then
    raise exception '응답할 수 있는 일정을 찾을 수 없습니다.';
  end if;

  if not private.is_active_club_member(v_event.club_id, v_user_id) then
    raise exception '활성 클럽 회원만 응답할 수 있습니다.';
  end if;

  select er.status into v_existing_status
  from public.event_responses er
  where er.event_id = p_event_id and er.user_id = v_user_id
  for update;

  if v_existing_status in ('confirmed', 'waiting') then
    if now() >= v_event.cancellation_deadline then
      raise exception '참가 취소가 마감되었습니다.';
    end if;
  elsif now() >= v_event.registration_deadline then
    raise exception '참가 응답이 마감되었습니다.';
  end if;

  if v_existing_status = 'absent' then
    return;
  end if;

  insert into public.event_responses (
    event_id,
    club_id,
    user_id,
    status,
    queue_order,
    responded_at,
    absent_at,
    updated_at
  )
  values (
    p_event_id,
    v_event.club_id,
    v_user_id,
    'absent',
    nextval('public.event_response_queue_seq'),
    now(),
    now(),
    now()
  )
  on conflict (event_id, user_id) do update
  set
    status = 'absent',
    absent_at = now(),
    cancelled_at = null,
    updated_at = now();

  if v_existing_status = 'confirmed' then
    perform private.promote_next_waiting(p_event_id);
  end if;

  perform private.refresh_event_response_counts(p_event_id);
end;
$$;

create or replace function public.cancel_event_participation(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_existing_status text;
  v_promoted_user_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id
  for update;

  if not found or v_event.status <> 'published' then
    raise exception '참가 취소할 수 있는 일정을 찾을 수 없습니다.';
  end if;

  if not private.is_active_club_member(v_event.club_id, v_user_id) then
    raise exception '활성 클럽 회원만 참가 취소할 수 있습니다.';
  end if;

  if now() >= v_event.cancellation_deadline then
    raise exception '참가 취소가 마감되었습니다.';
  end if;

  select er.status into v_existing_status
  from public.event_responses er
  where er.event_id = p_event_id and er.user_id = v_user_id
  for update;

  if v_existing_status is null or v_existing_status not in ('confirmed', 'waiting') then
    raise exception '취소할 참가 또는 대기 응답이 없습니다.';
  end if;

  update public.event_responses
  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  where event_id = p_event_id and user_id = v_user_id;

  if v_existing_status = 'confirmed' then
    v_promoted_user_id := private.promote_next_waiting(p_event_id);
  end if;

  perform private.refresh_event_response_counts(p_event_id);

  return jsonb_build_object('promoted_user_id', v_promoted_user_id);
end;
$$;

create or replace function public.admin_change_participant_status(
  p_event_id uuid,
  p_target_user_id uuid,
  p_new_status text
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
  v_event public.events%rowtype;
  v_existing_status text;
  v_other_confirmed_count integer;
begin
  if v_actor_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id
  for update;

  if not found or v_event.status <> 'published' then
    raise exception '참가자를 관리할 수 있는 일정을 찾을 수 없습니다.';
  end if;

  if not private.can_manage_club(v_event.club_id, v_actor_user_id) then
    raise exception '총관리자와 관리자만 참가자 상태를 변경할 수 있습니다.';
  end if;

  if p_new_status not in ('confirmed', 'waiting', 'absent', 'cancelled') then
    raise exception '올바른 참가자 상태를 선택해 주세요.';
  end if;

  select p.display_name into v_target_name
  from public.club_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.club_id = v_event.club_id
    and cm.user_id = p_target_user_id
    and cm.status = 'active';

  if not found then
    raise exception '활성 클럽 회원을 찾을 수 없습니다.';
  end if;

  select er.status into v_existing_status
  from public.event_responses er
  where er.event_id = p_event_id and er.user_id = p_target_user_id
  for update;

  if v_existing_status = p_new_status then
    return;
  end if;

  if p_new_status = 'confirmed' then
    select count(*) into v_other_confirmed_count
    from public.event_responses er
    join public.club_members cm
      on cm.club_id = er.club_id and cm.user_id = er.user_id and cm.status = 'active'
    where er.event_id = p_event_id
      and er.status = 'confirmed'
      and er.user_id <> p_target_user_id;

    if v_other_confirmed_count >= v_event.capacity then
      raise exception '정원이 가득 차 참가 확정으로 변경할 수 없습니다.';
    end if;
  end if;

  insert into public.event_responses (
    event_id,
    club_id,
    user_id,
    status,
    queue_order,
    responded_at,
    confirmed_at,
    waiting_at,
    absent_at,
    cancelled_at,
    updated_at
  )
  values (
    p_event_id,
    v_event.club_id,
    p_target_user_id,
    p_new_status,
    nextval('public.event_response_queue_seq'),
    now(),
    case when p_new_status = 'confirmed' then now() else null end,
    case when p_new_status = 'waiting' then now() else null end,
    case when p_new_status = 'absent' then now() else null end,
    case when p_new_status = 'cancelled' then now() else null end,
    now()
  )
  on conflict (event_id, user_id) do update
  set
    status = excluded.status,
    queue_order = case
      when excluded.status = 'waiting' then excluded.queue_order
      else public.event_responses.queue_order
    end,
    confirmed_at = case when excluded.status = 'confirmed' then now() else public.event_responses.confirmed_at end,
    waiting_at = case when excluded.status = 'waiting' then now() else public.event_responses.waiting_at end,
    absent_at = case when excluded.status = 'absent' then now() else public.event_responses.absent_at end,
    cancelled_at = case when excluded.status = 'cancelled' then now() else null end,
    updated_at = now();

  if v_existing_status = 'confirmed' and p_new_status <> 'confirmed' then
    perform private.promote_next_waiting(p_event_id);
  end if;

  perform private.refresh_event_response_counts(p_event_id);

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_actor_user_id;

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
    v_event.club_id,
    v_actor_user_id,
    v_actor_name,
    'participant_status_changed',
    'member',
    p_target_user_id::text,
    v_target_name,
    jsonb_build_object('event_id', p_event_id, 'status', v_existing_status),
    jsonb_build_object('event_id', p_event_id, 'status', p_new_status)
  );
end;
$$;

create or replace function private.cancel_inactive_member_event_responses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response record;
begin
  if old.status = 'active' and new.status <> 'active' then
    for v_response in
      select er.event_id, er.status
      from public.event_responses er
      join public.events e on e.id = er.event_id
      where er.club_id = new.club_id
        and er.user_id = new.user_id
        and er.status in ('confirmed', 'waiting')
        and e.status = 'published'
        and e.starts_at > now()
      order by er.event_id
      for update of e, er
    loop
      update public.event_responses
      set
        status = 'cancelled',
        cancelled_at = now(),
        updated_at = now()
      where event_id = v_response.event_id and user_id = new.user_id;

      if v_response.status = 'confirmed' then
        perform private.promote_next_waiting(v_response.event_id);
      end if;

      perform private.refresh_event_response_counts(v_response.event_id);
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function private.cancel_inactive_member_event_responses() from public, anon, authenticated;

drop trigger if exists club_members_cancel_event_responses on public.club_members;
create trigger club_members_cancel_event_responses
after update of status on public.club_members
for each row execute function private.cancel_inactive_member_event_responses();

revoke all on function public.apply_to_event(uuid) from public, anon;
revoke all on function public.set_event_absent(uuid) from public, anon;
revoke all on function public.cancel_event_participation(uuid) from public, anon;
revoke all on function public.admin_change_participant_status(uuid, uuid, text) from public, anon;
grant execute on function public.apply_to_event(uuid) to authenticated;
grant execute on function public.set_event_absent(uuid) to authenticated;
grant execute on function public.cancel_event_participation(uuid) to authenticated;
grant execute on function public.admin_change_participant_status(uuid, uuid, text) to authenticated;

commit;
