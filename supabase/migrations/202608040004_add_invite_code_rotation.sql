begin;

alter table public.club_invites
  add column if not exists updated_by uuid references auth.users (id) on delete restrict;

update public.club_invites
set updated_by = created_by
where updated_by is null;

alter table public.club_invites
  alter column updated_by set not null;

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
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if v_code !~ '^[A-Z0-9]{10}$' then
    raise exception '초대 코드는 영문 대문자와 숫자 10자리여야 합니다.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    join public.club_members cm
      on cm.club_id = c.id
     and cm.user_id = v_user_id
     and cm.role = 'owner'
     and cm.status = 'active'
    where c.id = p_club_id
      and c.owner_id = v_user_id
      and c.status = 'active'
  ) then
    raise exception '총관리자만 초대 코드를 새로 발급할 수 있습니다.';
  end if;

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
end;
$$;

revoke all on function public.rotate_club_invite_code(uuid, text) from public, anon;
grant execute on function public.rotate_club_invite_code(uuid, text) to authenticated;

commit;
