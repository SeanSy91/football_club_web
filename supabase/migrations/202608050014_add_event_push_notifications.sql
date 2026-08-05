begin;

create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

alter table public.events
add column if not exists reminder_at timestamptz,
add column if not exists reminder_sent_at timestamptz,
add column if not exists reminder_claimed_at timestamptz;

alter table public.events
drop constraint if exists events_reminder_before_start_check;

alter table public.events
add constraint events_reminder_before_start_check
check (reminder_at is null or reminder_at < starts_at);

create index if not exists events_due_reminder_idx
on public.events (reminder_at)
where status = 'published' and reminder_at is not null and reminder_sent_at is null;

alter table public.notification_preferences
add column if not exists admin_event_message boolean not null default true;

create table if not exists public.event_push_messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  message_type text not null check (message_type in ('scheduled_reminder', 'manual')),
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 300),
  created_by uuid references auth.users (id) on delete set null,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  eligible_user_count integer not null default 0 check (eligible_user_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists event_push_messages_event_created_idx
on public.event_push_messages (event_id, created_at desc);

alter table public.event_push_messages enable row level security;
revoke all on table public.event_push_messages from anon, authenticated;

create or replace function public.get_my_notification_settings_v2(p_club_id uuid)
returns table (
  event_created boolean,
  event_updated boolean,
  event_cancelled boolean,
  waitlist_promoted boolean,
  announcement_published boolean,
  event_reminder boolean,
  admin_event_message boolean,
  active_subscription_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  perform private.require_active_notification_member(p_club_id, v_user_id);

  insert into public.notification_preferences (club_id, user_id)
  values (p_club_id, v_user_id)
  on conflict (club_id, user_id) do nothing;

  return query
  select
    np.event_created,
    np.event_updated,
    np.event_cancelled,
    np.waitlist_promoted,
    np.announcement_published,
    np.event_reminder,
    np.admin_event_message,
    count(ps.id) filter (where ps.is_active)::integer
  from public.notification_preferences np
  left join public.push_subscriptions ps
    on ps.club_id = np.club_id
   and ps.user_id = np.user_id
  where np.club_id = p_club_id
    and np.user_id = v_user_id
  group by
    np.event_created,
    np.event_updated,
    np.event_cancelled,
    np.waitlist_promoted,
    np.announcement_published,
    np.event_reminder,
    np.admin_event_message;
end;
$$;

create or replace function public.update_my_notification_settings_v2(
  p_club_id uuid,
  p_event_created boolean,
  p_event_updated boolean,
  p_event_cancelled boolean,
  p_waitlist_promoted boolean,
  p_announcement_published boolean,
  p_event_reminder boolean,
  p_admin_event_message boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  perform private.require_active_notification_member(p_club_id, v_user_id);

  if p_event_created is null
    or p_event_updated is null
    or p_event_cancelled is null
    or p_waitlist_promoted is null
    or p_announcement_published is null
    or p_event_reminder is null
    or p_admin_event_message is null then
    raise exception '모든 알림 설정값이 필요합니다.';
  end if;

  insert into public.notification_preferences (
    club_id, user_id, event_created, event_updated, event_cancelled,
    waitlist_promoted, announcement_published, event_reminder, admin_event_message
  )
  values (
    p_club_id, v_user_id, p_event_created, p_event_updated, p_event_cancelled,
    p_waitlist_promoted, p_announcement_published, p_event_reminder, p_admin_event_message
  )
  on conflict (club_id, user_id) do update
  set
    event_created = excluded.event_created,
    event_updated = excluded.event_updated,
    event_cancelled = excluded.event_cancelled,
    waitlist_promoted = excluded.waitlist_promoted,
    announcement_published = excluded.announcement_published,
    event_reminder = excluded.event_reminder,
    admin_event_message = excluded.admin_event_message,
    updated_at = now();
end;
$$;

create or replace function public.save_event_with_reminder(
  p_event_id uuid,
  p_club_id uuid,
  p_title text,
  p_description text,
  p_venue text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_registration_deadline timestamptz,
  p_cancellation_deadline timestamptz,
  p_reminder_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_previous_reminder_at timestamptz;
  v_actor_name text;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not private.can_manage_club(p_club_id, v_user_id) then
    raise exception '총관리자와 관리자만 일정을 저장할 수 있습니다.';
  end if;

  if p_reminder_at is not null and p_reminder_at >= p_starts_at then
    raise exception '예약 알림은 일정 시작 전이어야 합니다.';
  end if;

  if p_event_id is null then
    if p_reminder_at is not null and p_reminder_at <= now() then
      raise exception '예약 알림은 현재 이후여야 합니다.';
    end if;

    v_event_id := public.create_event(
      p_club_id, p_title, p_description, p_venue, p_starts_at, p_ends_at,
      p_capacity, p_registration_deadline, p_cancellation_deadline
    );
  else
    select e.reminder_at into v_previous_reminder_at
    from public.events e
    where e.id = p_event_id and e.club_id = p_club_id
    for update;

    if not found then
      raise exception '일정을 찾을 수 없습니다.';
    end if;

    if p_reminder_at is distinct from v_previous_reminder_at
      and p_reminder_at is not null
      and p_reminder_at <= now() then
      raise exception '새 예약 알림은 현재 이후여야 합니다.';
    end if;

    perform public.update_event(
      p_event_id, p_club_id, p_title, p_description, p_venue, p_starts_at, p_ends_at,
      p_capacity, p_registration_deadline, p_cancellation_deadline
    );
    v_event_id := p_event_id;
  end if;

  update public.events
  set
    reminder_at = p_reminder_at,
    reminder_sent_at = case
      when reminder_at is not distinct from p_reminder_at then reminder_sent_at
      else null
    end,
    reminder_claimed_at = case
      when reminder_at is not distinct from p_reminder_at then reminder_claimed_at
      else null
    end,
    updated_by = v_user_id,
    updated_at = now()
  where id = v_event_id and club_id = p_club_id;

  if v_previous_reminder_at is distinct from p_reminder_at then
    select p.display_name into v_actor_name
    from public.profiles p where p.id = v_user_id;

    insert into public.audit_logs (
      club_id, actor_user_id, actor_display_name, action,
      target_type, target_id, target_display_name, before_state, after_state
    )
    values (
      p_club_id, v_user_id, v_actor_name, 'event_reminder_updated',
      'event', v_event_id::text, btrim(p_title),
      jsonb_build_object('reminder_at', v_previous_reminder_at),
      jsonb_build_object('reminder_at', p_reminder_at)
    );
  end if;

  return v_event_id;
end;
$$;

create or replace function public.create_manual_event_push_message(
  p_event_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_actor_name text;
  v_message_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_event
  from public.events e
  where e.id = p_event_id
  for update;

  if not found or not private.can_manage_club(v_event.club_id, v_user_id) then
    raise exception '총관리자와 관리자만 참가자 알림을 보낼 수 있습니다.';
  end if;

  if v_event.status <> 'published'
    or (v_event.starts_at at time zone 'Asia/Seoul')::date
      <> (now() at time zone 'Asia/Seoul')::date then
    raise exception '오늘 진행하는 공개 일정만 참가자 알림을 보낼 수 있습니다.';
  end if;

  if char_length(v_title) not between 2 and 60 then
    raise exception '알림 제목은 2자 이상 60자 이하로 입력해 주세요.';
  end if;

  if char_length(v_body) not between 2 and 300 then
    raise exception '알림 내용은 2자 이상 300자 이하로 입력해 주세요.';
  end if;

  if not exists (
    select 1 from public.event_responses er
    where er.event_id = p_event_id and er.status = 'confirmed'
  ) then
    raise exception '현재 참가 확정자가 없습니다.';
  end if;

  if exists (
    select 1
    from public.event_push_messages epm
    where epm.event_id = p_event_id
      and epm.message_type = 'manual'
      and epm.created_at > now() - interval '5 minutes'
  ) then
    raise exception '참가자 알림은 5분에 한 번만 보낼 수 있습니다.';
  end if;

  insert into public.event_push_messages (
    club_id, event_id, message_type, title, body, created_by
  )
  values (
    v_event.club_id, p_event_id, 'manual', v_title, v_body, v_user_id
  )
  returning id into v_message_id;

  select p.display_name into v_actor_name
  from public.profiles p where p.id = v_user_id;

  insert into public.audit_logs (
    club_id, actor_user_id, actor_display_name, action,
    target_type, target_id, target_display_name, after_state
  )
  values (
    v_event.club_id, v_user_id, v_actor_name, 'event_push_requested',
    'event', p_event_id::text, v_event.title,
    jsonb_build_object('message_id', v_message_id, 'title', v_title)
  );

  return v_message_id;
end;
$$;

create or replace function private.is_push_automation_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_secret is not null and exists (
    select 1
    from vault.decrypted_secrets secret
    where secret.name = 'push_automation_secret'
      and secret.decrypted_secret = p_secret
  );
$$;

revoke all on function private.is_push_automation_secret(text)
from public, anon, authenticated;

create or replace function public.claim_due_event_reminders(p_automation_secret text)
returns table (
  message_id uuid,
  event_id uuid,
  club_id uuid,
  event_title text,
  event_venue text,
  event_starts_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
begin
  if not private.is_push_automation_secret(p_automation_secret) then
    raise exception '예약 알림 인증에 실패했습니다.';
  end if;

  for v_event in
    select e.id, e.club_id, e.title, e.venue, e.starts_at
    from public.events e
    where e.status = 'published'
      and e.reminder_at is not null
      and e.reminder_at <= now()
      and e.starts_at > now()
      and e.reminder_sent_at is null
      and (e.reminder_claimed_at is null or e.reminder_claimed_at < now() - interval '15 minutes')
    order by e.reminder_at
    for update skip locked
    limit 10
  loop
    update public.event_push_messages
    set status = 'failed', completed_at = now()
    where event_id = v_event.id
      and message_type = 'scheduled_reminder'
      and status = 'processing';

    update public.events
    set reminder_claimed_at = now()
    where id = v_event.id;

    insert into public.event_push_messages (
      club_id, event_id, message_type, title, body
    )
    values (
      v_event.club_id, v_event.id, 'scheduled_reminder',
      v_event.title, '예약 일정 알림'
    )
    returning id into message_id;

    event_id := v_event.id;
    club_id := v_event.club_id;
    event_title := v_event.title;
    event_venue := v_event.venue;
    event_starts_at := v_event.starts_at;
    return next;
  end loop;
end;
$$;

create or replace function public.complete_event_reminder(
  p_automation_secret text,
  p_message_id uuid,
  p_eligible_user_count integer,
  p_sent_count integer,
  p_failed_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if not private.is_push_automation_secret(p_automation_secret) then
    raise exception '예약 알림 인증에 실패했습니다.';
  end if;

  select epm.event_id into v_event_id
  from public.event_push_messages epm
  where epm.id = p_message_id
    and epm.message_type = 'scheduled_reminder'
    and epm.status = 'processing'
  for update;

  if not found then
    raise exception '처리 중인 예약 알림을 찾을 수 없습니다.';
  end if;

  update public.event_push_messages
  set
    eligible_user_count = greatest(coalesce(p_eligible_user_count, 0), 0),
    sent_count = greatest(coalesce(p_sent_count, 0), 0),
    failed_count = greatest(coalesce(p_failed_count, 0), 0),
    status = case when coalesce(p_sent_count, 0) > 0 then 'sent' else 'failed' end,
    completed_at = now()
  where id = p_message_id;

  update public.events
  set reminder_sent_at = now(), reminder_claimed_at = null
  where id = v_event_id;
end;
$$;

create or replace function public.fail_event_reminder(
  p_automation_secret text,
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_push_automation_secret(p_automation_secret) then
    raise exception '예약 알림 인증에 실패했습니다.';
  end if;

  update public.event_push_messages epm
  set status = 'failed', failed_count = greatest(epm.failed_count, 1), completed_at = now()
  where epm.id = p_message_id
    and epm.message_type = 'scheduled_reminder'
    and epm.status = 'processing';

  -- Keep the claim timestamp so a transient failure retries after the 15-minute backoff.
end;
$$;

revoke all on function public.get_my_notification_settings_v2(uuid)
from public, anon;
revoke all on function public.update_my_notification_settings_v2(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) from public, anon;
revoke all on function public.save_event_with_reminder(
  uuid, uuid, text, text, text, timestamptz, timestamptz, integer,
  timestamptz, timestamptz, timestamptz
) from public, anon;
revoke all on function public.create_manual_event_push_message(uuid, text, text)
from public, anon;
revoke all on function public.claim_due_event_reminders(text)
from public, anon, authenticated;
revoke all on function public.complete_event_reminder(text, uuid, integer, integer, integer)
from public, anon, authenticated;
revoke all on function public.fail_event_reminder(text, uuid)
from public, anon, authenticated;

grant execute on function public.get_my_notification_settings_v2(uuid)
to authenticated;
grant execute on function public.update_my_notification_settings_v2(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.save_event_with_reminder(
  uuid, uuid, text, text, text, timestamptz, timestamptz, integer,
  timestamptz, timestamptz, timestamptz
) to authenticated;
grant execute on function public.create_manual_event_push_message(uuid, text, text)
to authenticated;
grant execute on function public.claim_due_event_reminders(text)
to service_role;
grant execute on function public.complete_event_reminder(text, uuid, integer, integer, integer)
to service_role;
grant execute on function public.fail_event_reminder(text, uuid)
to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_automation_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'push_automation_secret',
      '예약 푸시 Edge Function 호출 인증값'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'football_club_project_url') then
    perform vault.create_secret(
      'https://salmdtkbdruormkhdpkh.supabase.co',
      'football_club_project_url',
      '예약 푸시 Edge Function URL'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'football_club_publishable_key') then
    perform vault.create_secret(
      'sb_publishable_EG9mmZl1SR_40ZExz4k4fQ_pJOSJQvf',
      'football_club_publishable_key',
      '예약 푸시 Edge Function 공개 API 키'
    );
  end if;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'send-due-event-reminders';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'send-due-event-reminders',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'football_club_project_url'
      ) || '/functions/v1/push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'football_club_publishable_key'
        ),
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'football_club_publishable_key'
        ),
        'x-push-automation-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'push_automation_secret'
        )
      ),
      body := jsonb_build_object('action', 'process-reminders'),
      timeout_milliseconds := 10000
    );
  $cron$
);

commit;
