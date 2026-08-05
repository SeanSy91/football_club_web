begin;

create table if not exists public.notification_preferences (
  club_id uuid not null,
  user_id uuid not null,
  event_created boolean not null default true,
  event_updated boolean not null default true,
  event_cancelled boolean not null default true,
  waitlist_promoted boolean not null default true,
  announcement_published boolean not null default true,
  event_reminder boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (club_id, user_id),
  constraint notification_preferences_member_fkey
    foreign key (club_id, user_id)
    references public.club_members (club_id, user_id)
    on delete cascade
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  user_id uuid not null,
  endpoint text not null unique
    check (char_length(endpoint) between 20 and 2048 and endpoint ~ '^https://'),
  p256dh text not null
    check (char_length(p256dh) between 80 and 120 and p256dh ~ '^[A-Za-z0-9_-]+$'),
  auth_key text not null
    check (char_length(auth_key) between 16 and 64 and auth_key ~ '^[A-Za-z0-9_-]+$'),
  expiration_time bigint check (expiration_time is null or expiration_time > 0),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_member_fkey
    foreign key (club_id, user_id)
    references public.club_members (club_id, user_id)
    on delete cascade
);

create index if not exists push_subscriptions_active_club_idx
on public.push_subscriptions (club_id, user_id)
where is_active;

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on table public.notification_preferences from anon, authenticated;
revoke all on table public.push_subscriptions from anon, authenticated;

create or replace function private.require_active_notification_member(
  p_club_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not exists (
    select 1
    from public.club_members cm
    join public.profiles p on p.id = cm.user_id
    join public.clubs c on c.id = cm.club_id
    where cm.club_id = p_club_id
      and cm.user_id = p_user_id
      and cm.status = 'active'
      and p.account_status = 'active'
      and c.status = 'active'
  ) then
    raise exception '활성 클럽 회원만 알림 설정을 사용할 수 있습니다.';
  end if;
end;
$$;

revoke all on function private.require_active_notification_member(uuid, uuid)
from public, anon, authenticated;

create or replace function public.get_my_notification_settings(p_club_id uuid)
returns table (
  event_created boolean,
  event_updated boolean,
  event_cancelled boolean,
  waitlist_promoted boolean,
  announcement_published boolean,
  event_reminder boolean,
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
    np.event_reminder;
end;
$$;

create or replace function public.update_my_notification_settings(
  p_club_id uuid,
  p_event_created boolean,
  p_event_updated boolean,
  p_event_cancelled boolean,
  p_waitlist_promoted boolean,
  p_announcement_published boolean,
  p_event_reminder boolean
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
    or p_event_reminder is null then
    raise exception '모든 알림 설정값이 필요합니다.';
  end if;

  insert into public.notification_preferences (
    club_id,
    user_id,
    event_created,
    event_updated,
    event_cancelled,
    waitlist_promoted,
    announcement_published,
    event_reminder
  )
  values (
    p_club_id,
    v_user_id,
    p_event_created,
    p_event_updated,
    p_event_cancelled,
    p_waitlist_promoted,
    p_announcement_published,
    p_event_reminder
  )
  on conflict (club_id, user_id) do update
  set
    event_created = excluded.event_created,
    event_updated = excluded.event_updated,
    event_cancelled = excluded.event_cancelled,
    waitlist_promoted = excluded.waitlist_promoted,
    announcement_published = excluded.announcement_published,
    event_reminder = excluded.event_reminder,
    updated_at = now();
end;
$$;

create or replace function public.save_my_push_subscription(
  p_club_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_expiration_time bigint default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := btrim(p_endpoint);
  v_p256dh text := btrim(p_p256dh);
  v_auth_key text := btrim(p_auth_key);
  v_user_agent text := nullif(left(btrim(p_user_agent), 300), '');
  v_subscription_id uuid;
begin
  perform private.require_active_notification_member(p_club_id, v_user_id);

  if v_endpoint is null
    or char_length(v_endpoint) not between 20 and 2048
    or v_endpoint !~ '^https://' then
    raise exception '올바른 HTTPS 푸시 구독 주소가 필요합니다.';
  end if;

  if v_p256dh is null
    or char_length(v_p256dh) not between 80 and 120
    or v_p256dh !~ '^[A-Za-z0-9_-]+$' then
    raise exception '올바른 푸시 공개 키가 필요합니다.';
  end if;

  if v_auth_key is null
    or char_length(v_auth_key) not between 16 and 64
    or v_auth_key !~ '^[A-Za-z0-9_-]+$' then
    raise exception '올바른 푸시 인증 키가 필요합니다.';
  end if;

  if p_expiration_time is not null and p_expiration_time <= 0 then
    raise exception '구독 만료 시각이 올바르지 않습니다.';
  end if;

  insert into public.push_subscriptions (
    club_id,
    user_id,
    endpoint,
    p256dh,
    auth_key,
    expiration_time,
    user_agent
  )
  values (
    p_club_id,
    v_user_id,
    v_endpoint,
    v_p256dh,
    v_auth_key,
    p_expiration_time,
    v_user_agent
  )
  on conflict (endpoint) do update
  set
    club_id = excluded.club_id,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    expiration_time = excluded.expiration_time,
    user_agent = excluded.user_agent,
    is_active = true,
    updated_at = now(),
    last_seen_at = now()
  where public.push_subscriptions.user_id = v_user_id
  returning id into v_subscription_id;

  if v_subscription_id is null then
    raise exception '이 브라우저의 푸시 구독은 다른 계정에 연결되어 있습니다.';
  end if;

  return v_subscription_id;
end;
$$;

create or replace function public.disable_my_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_count integer;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  update public.push_subscriptions
  set is_active = false, updated_at = now()
  where user_id = v_user_id
    and endpoint = btrim(p_endpoint)
    and is_active;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function private.deactivate_member_push_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    update public.push_subscriptions
    set is_active = false, updated_at = now()
    where club_id = new.club_id
      and user_id = new.user_id
      and is_active;
  end if;
  return new;
end;
$$;

revoke all on function private.deactivate_member_push_subscriptions()
from public, anon, authenticated;

drop trigger if exists club_members_deactivate_push_subscriptions on public.club_members;
create trigger club_members_deactivate_push_subscriptions
after update of status on public.club_members
for each row execute function private.deactivate_member_push_subscriptions();

revoke all on function public.get_my_notification_settings(uuid)
from public, anon;
revoke all on function public.update_my_notification_settings(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean
) from public, anon;
revoke all on function public.save_my_push_subscription(
  uuid, text, text, text, bigint, text
) from public, anon;
revoke all on function public.disable_my_push_subscription(text)
from public, anon;

grant execute on function public.get_my_notification_settings(uuid)
to authenticated;
grant execute on function public.update_my_notification_settings(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.save_my_push_subscription(
  uuid, text, text, text, bigint, text
) to authenticated;
grant execute on function public.disable_my_push_subscription(text)
to authenticated;

commit;
