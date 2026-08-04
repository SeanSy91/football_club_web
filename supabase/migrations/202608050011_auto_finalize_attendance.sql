begin;

alter table public.events
add column if not exists attendance_finalized_at timestamptz;

create index if not exists events_pending_attendance_idx
on public.events (ends_at)
where status = 'published' and attendance_finalized_at is null;

create or replace function private.finalize_completed_attendance(
  p_club_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_inserted_count integer;
  v_total_inserted integer := 0;
begin
  for v_event in
    select e.id, e.club_id, e.title
    from public.events e
    where e.status = 'published'
      and e.ends_at <= now()
      and e.attendance_finalized_at is null
      and (p_club_id is null or e.club_id = p_club_id)
    order by e.ends_at
    for update skip locked
  loop
    insert into public.attendance_records (
      event_id,
      club_id,
      user_id,
      status,
      checked_by,
      checked_at,
      updated_at
    )
    select
      v_event.id,
      v_event.club_id,
      er.user_id,
      'attended',
      null,
      now(),
      now()
    from public.event_responses er
    join public.club_members cm
      on cm.club_id = er.club_id
     and cm.user_id = er.user_id
     and cm.status = 'active'
    where er.event_id = v_event.id
      and er.club_id = v_event.club_id
      and er.status = 'confirmed'
    on conflict (event_id, user_id) do nothing;

    get diagnostics v_inserted_count = row_count;
    v_total_inserted := v_total_inserted + v_inserted_count;

    update public.events
    set attendance_finalized_at = now()
    where id = v_event.id;

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
      v_event.club_id,
      null,
      '시스템',
      'attendance_auto_finalized',
      'event',
      v_event.id::text,
      v_event.title,
      jsonb_build_object('automatic_attended_count', v_inserted_count)
    );
  end loop;

  return v_total_inserted;
end;
$$;

revoke all on function private.finalize_completed_attendance(uuid)
from public, anon, authenticated;

create or replace function public.finalize_club_attendance(p_club_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_inserted integer;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.can_manage_club(p_club_id, v_user_id) then
    raise exception '총관리자와 관리자만 자동 출석을 확정할 수 있습니다.';
  end if;

  select private.finalize_completed_attendance(p_club_id)
  into v_total_inserted;

  return v_total_inserted;
end;
$$;

revoke all on function public.finalize_club_attendance(uuid) from public, anon;
grant execute on function public.finalize_club_attendance(uuid) to authenticated;

create or replace function private.prevent_finalized_event_response_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and exists (
    select 1
    from public.events e
    where e.id = old.event_id
      and e.attendance_finalized_at is not null
  ) then
    raise exception '출석이 확정된 일정의 참가 상태는 변경할 수 없습니다.';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_finalized_event_response_change()
from public, anon, authenticated;

drop trigger if exists event_responses_lock_after_attendance on public.event_responses;
create trigger event_responses_lock_after_attendance
before update on public.event_responses
for each row execute function private.prevent_finalized_event_response_change();

create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'kfc-finalize-completed-attendance'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'kfc-finalize-completed-attendance',
  '*/10 * * * *',
  $job$select private.finalize_completed_attendance();$job$
);

select private.finalize_completed_attendance();

commit;
