begin;

drop policy if exists "events_select_club_members" on public.events;
create policy "events_select_club_members"
on public.events
for select
to authenticated
using (
  (select private.is_active_club_member(club_id))
  and (
    status = 'published'
    or (select private.can_manage_club(club_id))
  )
);

commit;
