begin;

create or replace function public.get_admin_monthly_attendance(
  p_club_id uuid,
  p_month_start date
)
returns table (
  user_id uuid,
  display_name text,
  member_role text,
  attended_count integer,
  declared_absent_count integer,
  late_count integer,
  no_show_count integer,
  unprocessed_count integer,
  finalized_event_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date;
  v_range_start timestamptz;
  v_range_end timestamptz;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.can_manage_club(p_club_id, v_user_id) then
    raise exception '총관리자와 관리자만 월별 출석 관리 현황을 조회할 수 있습니다.';
  end if;

  if p_month_start is null then
    raise exception '조회할 월을 선택해 주세요.';
  end if;

  v_month_start := date_trunc('month', p_month_start)::date;
  v_range_start := v_month_start::timestamp at time zone 'Asia/Seoul';
  v_range_end := (v_month_start + interval '1 month')::timestamp at time zone 'Asia/Seoul';

  return query
  with active_members as (
    select
      cm.user_id as member_user_id,
      cm.role as current_role,
      cm.joined_at,
      p.display_name as current_display_name
    from public.club_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.club_id = p_club_id
      and cm.status = 'active'
      and p.account_status = 'active'
  ),
  completed_events as (
    select e.id, e.starts_at
    from public.events e
    where e.club_id = p_club_id
      and e.status = 'published'
      and e.attendance_finalized_at is not null
      and e.starts_at >= v_range_start
      and e.starts_at < v_range_end
  ),
  event_states as (
    select
      m.member_user_id,
      e.id as event_id,
      case
        when ar.status = 'attended' then 'attended'
        when ar.status = 'late' then 'late'
        when ar.status = 'absent' then 'no_show'
        when ar.status = 'excused' then 'declared_absent'
        when er.status = 'absent' then 'declared_absent'
        when er.status in ('waiting', 'cancelled') then 'excluded'
        else 'unprocessed'
      end as attendance_state
    from active_members m
    join completed_events e on m.joined_at <= e.starts_at
    left join public.attendance_records ar
      on ar.event_id = e.id
     and ar.user_id = m.member_user_id
    left join public.event_responses er
      on er.event_id = e.id
     and er.user_id = m.member_user_id
  )
  select
    m.member_user_id,
    m.current_display_name,
    m.current_role,
    count(s.event_id) filter (where s.attendance_state = 'attended')::integer,
    count(s.event_id) filter (where s.attendance_state = 'declared_absent')::integer,
    count(s.event_id) filter (where s.attendance_state = 'late')::integer,
    count(s.event_id) filter (where s.attendance_state = 'no_show')::integer,
    count(s.event_id) filter (where s.attendance_state = 'unprocessed')::integer,
    count(s.event_id) filter (where s.attendance_state <> 'excluded')::integer
  from active_members m
  left join event_states s on s.member_user_id = m.member_user_id
  group by m.member_user_id, m.current_display_name, m.current_role
  order by
    case m.current_role when 'owner' then 1 when 'admin' then 2 else 3 end,
    m.current_display_name;
end;
$$;

revoke all on function public.get_admin_monthly_attendance(uuid, date)
from public, anon;
grant execute on function public.get_admin_monthly_attendance(uuid, date)
to authenticated;

commit;
