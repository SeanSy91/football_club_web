begin;

create table if not exists public.attendance_records (
  event_id uuid not null,
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('attended', 'late', 'absent', 'excused')),
  checked_by uuid not null references auth.users (id) on delete restrict,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, club_id)
    references public.events (id, club_id) on delete cascade
);

create index if not exists attendance_records_club_user_idx
on public.attendance_records (club_id, user_id);

alter table public.attendance_records enable row level security;
revoke all on table public.attendance_records from anon, authenticated;
grant select on table public.attendance_records to authenticated;

drop policy if exists "attendance_records_select_event_members" on public.attendance_records;
create policy "attendance_records_select_event_members"
on public.attendance_records
for select
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = attendance_records.event_id
      and e.club_id = attendance_records.club_id
  )
);

create or replace view public.attendance_record_profiles
with (security_invoker = true)
as
select
  ar.event_id,
  ar.club_id,
  ar.user_id,
  ar.status,
  ar.checked_by,
  ar.checked_at,
  ar.updated_at,
  p.display_name,
  p.avatar_url,
  p.avatar_path,
  p.use_default_avatar,
  p.preferred_position
from public.attendance_records ar
join public.profiles p on p.id = ar.user_id;

revoke all on table public.attendance_record_profiles from anon, authenticated;
grant select on table public.attendance_record_profiles to authenticated;

create or replace view public.monthly_attendance_stats
with (security_invoker = true)
as
select
  ar.club_id,
  ar.user_id,
  date_trunc('month', e.starts_at at time zone 'Asia/Seoul')::date as month_start,
  count(*) filter (where ar.status = 'attended')::integer as attended_count,
  count(*) filter (where ar.status = 'late')::integer as late_count,
  count(*) filter (where ar.status = 'absent')::integer as absent_count,
  count(*) filter (where ar.status = 'excused')::integer as excused_count,
  count(*)::integer as checked_count,
  round(
    100.0 * count(*) filter (where ar.status in ('attended', 'late'))
    / nullif(count(*) filter (where ar.status <> 'excused'), 0),
    1
  ) as attendance_rate
from public.attendance_records ar
join public.events e on e.id = ar.event_id and e.club_id = ar.club_id
group by ar.club_id, ar.user_id, date_trunc('month', e.starts_at at time zone 'Asia/Seoul')::date;

revoke all on table public.monthly_attendance_stats from anon, authenticated;
grant select on table public.monthly_attendance_stats to authenticated;

create or replace function public.set_attendance(
  p_event_id uuid,
  p_target_user_id uuid,
  p_status text
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
  v_previous_status text;
begin
  if v_actor_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id
  for update;

  if not found or v_event.status <> 'published' then
    raise exception '출석을 기록할 수 있는 일정을 찾을 수 없습니다.';
  end if;

  if not private.can_manage_club(v_event.club_id, v_actor_user_id) then
    raise exception '총관리자와 관리자만 출석을 기록할 수 있습니다.';
  end if;

  if now() < v_event.starts_at then
    raise exception '일정 시작 시각 이후에 출석을 기록할 수 있습니다.';
  end if;

  if p_status not in ('attended', 'late', 'absent', 'excused', 'unmarked') then
    raise exception '올바른 출석 상태를 선택해 주세요.';
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

  select ar.status into v_previous_status
  from public.attendance_records ar
  where ar.event_id = p_event_id and ar.user_id = p_target_user_id
  for update;

  if v_previous_status is not distinct from null and p_status = 'unmarked' then
    return;
  end if;

  if v_previous_status is not distinct from p_status then
    return;
  end if;

  if p_status = 'unmarked' then
    delete from public.attendance_records
    where event_id = p_event_id and user_id = p_target_user_id;
  else
    insert into public.attendance_records (
      event_id, club_id, user_id, status, checked_by, checked_at, updated_at
    )
    values (
      p_event_id, v_event.club_id, p_target_user_id, p_status,
      v_actor_user_id, now(), now()
    )
    on conflict (event_id, user_id) do update
    set
      status = excluded.status,
      checked_by = excluded.checked_by,
      checked_at = now(),
      updated_at = now();
  end if;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_actor_user_id;

  insert into public.audit_logs (
    club_id, actor_user_id, actor_display_name, action,
    target_type, target_id, target_display_name, before_state, after_state
  )
  values (
    v_event.club_id,
    v_actor_user_id,
    v_actor_name,
    'attendance_updated',
    'member',
    p_target_user_id::text,
    v_target_name,
    jsonb_build_object('event_id', p_event_id, 'status', v_previous_status),
    jsonb_build_object('event_id', p_event_id, 'status', nullif(p_status, 'unmarked'))
  );
end;
$$;

revoke all on function public.set_attendance(uuid, uuid, text) from public, anon;
grant execute on function public.set_attendance(uuid, uuid, text) to authenticated;

commit;
