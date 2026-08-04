import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('정적 사이트의 필수 파일과 접근성 구조가 존재한다', async () => {
  const [html, css, script] = await Promise.all([
    readProjectFile('site/index.html'),
    readProjectFile('site/styles.css'),
    readProjectFile('site/js/app.js'),
  ]);

  assert.match(html, /<html lang="ko">/);
  assert.match(html, /id="main-content"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/js\/app\.js"/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(script, /hashchange/);
});

test('프레임워크와 비밀 서버 키를 정적 사이트에 포함하지 않는다', async () => {
  const [html, config, script] = await Promise.all([
    readProjectFile('site/index.html'),
    readProjectFile('site/js/config.js'),
    readProjectFile('site/js/app.js'),
  ]);
  const publishedSource = `${html}\n${config}\n${script}`;

  assert.doesNotMatch(publishedSource, /react|vue|angular/i);
  assert.doesNotMatch(publishedSource, /serviceRoleKey\s*[:=]/i);
  assert.doesNotMatch(publishedSource, /clientSecret\s*[:=]/i);
  assert.match(config, /supabasePublishableKey/);
});

test('GitHub Pages는 검증 후 site 디렉터리만 배포한다', async () => {
  const workflow = await readProjectFile('.github/workflows/pages.yml');

  assert.match(workflow, /node --test/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: site/);
});

test('Supabase 공개 설정과 Google 인증 흐름이 연결되어 있다', async () => {
  const [html, config, script] = await Promise.all([
    readProjectFile('site/index.html'),
    readProjectFile('site/js/config.js'),
    readProjectFile('site/js/app.js'),
  ]);

  assert.match(html, /@supabase\/supabase-js@2\.112\.0/);
  assert.match(config, /https:\/\/salmdtkbdruormkhdpkh\.supabase\.co/);
  assert.match(config, /sb_publishable_/);
  assert.match(script, /createClient/);
  assert.match(script, /signInWithOAuth/);
  assert.match(script, /provider: 'google'/);
  assert.match(script, /signOut/);
  assert.match(script, /onAuthStateChange/);
});

test('profiles 마이그레이션은 RLS와 본인 전용 정책을 설정한다', async () => {
  const migration = await readProjectFile(
    'supabase/migrations/202608040001_create_profiles.sql',
  );

  assert.match(migration, /create table if not exists public\.profiles/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /to authenticated/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /after insert on auth\.users/);
  assert.doesNotMatch(migration, /to anon/);
});

test('프로필 입력 화면은 필수값, 선택값과 접근 가능한 사진 입력을 제공한다', async () => {
  const html = await readProjectFile('site/index.html');

  assert.match(html, /data-profile-form/);
  assert.match(html, /name="displayName"[^>]+required/);
  assert.match(html, /name="age"[^>]+required[^>]+min="1"[^>]+max="120"/);
  assert.match(html, /name="shirtNumber"[^>]+min="0"[^>]+max="99"/);
  assert.match(html, /for="profile-photo"/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(html, /aria-live="polite" data-profile-form-status/);
});

test('프로필 사진은 브라우저에서 압축한 WebP만 비공개 저장소에 업로드한다', async () => {
  const script = await readProjectFile('site/js/app.js');

  assert.match(script, /PROFILE_IMAGE_SIZE = 512/);
  assert.match(script, /MAX_PROFILE_IMAGE_BYTES = 1024 \* 1024/);
  assert.match(script, /canvas\.toBlob/);
  assert.match(script, /'image\/webp'/);
  assert.match(script, /\.from\(PROFILE_BUCKET\)/);
  assert.match(script, /\.upload\(avatarPath, selectedAvatarBlob/);
  assert.match(script, /createSignedUrl/);
});

test('프로필 Storage 마이그레이션은 크기, MIME, 경로와 소유권을 제한한다', async () => {
  const migration = await readProjectFile(
    'supabase/migrations/202608040002_add_profile_details_and_storage.sql',
  );

  assert.match(migration, /'profile-images'/);
  assert.match(migration, /public,\s+file_size_limit,\s+allowed_mime_types/);
  assert.match(migration, /1048576/);
  assert.match(migration, /array\['image\/webp'\]/);
  assert.match(migration, /auth\.uid\(\)\)::text \|\| '\/avatar\.webp'/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)::text/);
  assert.match(migration, /for insert\s+to authenticated\s+with check/);
  assert.match(migration, /for update\s+to authenticated/);
  assert.match(migration, /for delete\s+to authenticated/);
});

test('클럽 화면은 생성과 코드 가입을 분리하고 키보드 탭 구조를 제공한다', async () => {
  const html = await readProjectFile('site/index.html');

  assert.match(html, /data-view="club"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-create-club-form/);
  assert.match(html, /data-join-club-form/);
  assert.match(html, /name="clubName"[^>]+required[^>]+minlength="2"[^>]+maxlength="50"/);
  assert.match(html, /name="inviteCode"[^>]+minlength="10"[^>]+maxlength="10"/);
  assert.match(html, /data-member-directory/);
});

test('클럽 클라이언트는 난수 코드를 만들고 서버 함수로만 생성과 가입을 요청한다', async () => {
  const script = await readProjectFile('site/js/app.js');

  assert.match(script, /crypto\.getRandomValues/);
  assert.match(script, /create_club_with_invite_code/);
  assert.match(script, /join_club_with_invite_code/);
  assert.match(script, /\.from\('club_member_profiles'\)/);
  assert.doesNotMatch(script, /\.from\('club_invites'\)/);
  assert.doesNotMatch(script, /\.from\('clubs'\)\.insert/);
  assert.doesNotMatch(script, /\.from\('club_members'\)\.insert/);
});

test('클럽 마이그레이션은 RLS, 단일 활성 클럽과 bcrypt 초대 코드를 강제한다', async () => {
  const migration = await readProjectFile(
    'supabase/migrations/202608040003_create_clubs_and_invites.sql',
  );
  const inviteTable = migration.match(
    /create table if not exists public\.club_invites \(([\s\S]*?)\n\);/,
  )?.[1];

  assert.ok(inviteTable);
  assert.match(inviteTable, /code_hash text not null/);
  assert.doesNotMatch(inviteTable, /\n\s*code text/);
  assert.match(migration, /where status = 'active'/);
  assert.match(migration, /alter table public\.clubs enable row level security/);
  assert.match(migration, /alter table public\.club_members enable row level security/);
  assert.match(migration, /alter table public\.club_invites enable row level security/);
  assert.match(migration, /revoke all on table public\.club_invites from anon, authenticated/);
  assert.match(migration, /extensions\.crypt\(v_code, extensions\.gen_salt\('bf', 10\)\)/);
  assert.match(migration, /ci\.code_hash = extensions\.crypt\(v_code, ci\.code_hash\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /with \(security_invoker = true\)/);
  assert.match(migration, /grant execute on function public\.create_club_with_invite_code/);
  assert.match(migration, /grant execute on function public\.join_club_with_invite_code/);
});

test('총관리자만 기존 코드를 무효화하고 새 초대 코드를 발급할 수 있다', async () => {
  const [html, script, migration] = await Promise.all([
    readProjectFile('site/index.html'),
    readProjectFile('site/js/app.js'),
    readProjectFile('supabase/migrations/202608040004_add_invite_code_rotation.sql'),
  ]);

  assert.match(html, /data-owner-invite-tools/);
  assert.match(html, /data-rotate-invite-code/);
  assert.match(script, /activeClub\.role !== 'owner'/);
  assert.match(script, /rotate_club_invite_code/);
  assert.match(migration, /cm\.role = 'owner'/);
  assert.match(migration, /c\.owner_id = v_user_id/);
  assert.match(migration, /code_hash = extensions\.crypt\(v_code, extensions\.gen_salt\('bf', 10\)\)/);
  assert.match(migration, /revoke all on function public\.rotate_club_invite_code/);
  assert.match(migration, /grant execute on function public\.rotate_club_invite_code\(uuid, text\) to authenticated/);
});

test('총관리자는 회원 권한과 탈퇴를 관리하고 감사 로그를 확인할 수 있다', async () => {
  const [html, script] = await Promise.all([
    readProjectFile('site/index.html'),
    readProjectFile('site/js/app.js'),
  ]);

  assert.match(html, /data-owner-audit/);
  assert.match(html, /data-audit-list/);
  assert.match(script, /activeClub\?\.role === 'owner' && member\.role !== 'owner'/);
  assert.match(script, /change_member_role/);
  assert.match(script, /remove_club_member/);
  assert.match(script, /\.from\('audit_logs'\)/);
  assert.match(script, /membership\.role !== 'owner'/);
});

test('회원 관리 마이그레이션은 owner 권한, 역할 경계와 감사 기록을 서버에서 강제한다', async () => {
  const migration = await readProjectFile(
    'supabase/migrations/202608040005_add_member_management_and_audit.sql',
  );

  assert.match(migration, /create table if not exists public\.audit_logs/);
  assert.match(migration, /alter table public\.audit_logs enable row level security/);
  assert.match(migration, /revoke all on table public\.audit_logs from anon, authenticated/);
  assert.match(migration, /create policy "audit_logs_select_owner"/);
  assert.match(migration, /private\.is_club_owner\(p_club_id, v_actor_user_id\)/);
  assert.match(migration, /p_new_role not in \('admin', 'member'\)/);
  assert.match(migration, /v_previous_role = 'owner'/);
  assert.match(migration, /'member_promoted'/);
  assert.match(migration, /'admin_revoked'/);
  assert.match(migration, /'member_removed'/);
  assert.match(migration, /'invite_code_rotated'/);
  assert.match(migration, /'member_joined'/);
  assert.match(migration, /on conflict \(club_id, user_id\) do update/);
  assert.match(migration, /where public\.club_members\.status = 'removed'/);
  assert.match(migration, /grant execute on function public\.change_member_role\(uuid, uuid, text\) to authenticated/);
  assert.match(migration, /grant execute on function public\.remove_club_member\(uuid, uuid\) to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on table public\.audit_logs/i);
});

test('v0.7.1 공개 버전 표기가 사이트와 문서에서 일치한다', async () => {
  const [html, config, readme] = await Promise.all([
    readProjectFile('site/index.html'),
    readProjectFile('site/js/config.js'),
    readProjectFile('README.md'),
  ]);

  assert.match(html, /data-app-version>0\.7\.1</);
  assert.match(config, /appVersion: '0\.7\.1'/);
  assert.match(readme, /`0\.7\.1`/);
});

test('일정 화면은 목록, 상세와 접근 가능한 관리 폼을 제공한다', async () => {
  const html = await readProjectFile('site/index.html');

  assert.match(html, /data-view="schedule"/);
  assert.match(html, /data-schedule-loading/);
  assert.match(html, /data-schedule-no-club/);
  assert.match(html, /data-schedule-list/);
  assert.match(html, /data-event-detail/);
  assert.match(html, /data-event-form/);
  assert.match(html, /name="title"[^>]+required[^>]+minlength="2"[^>]+maxlength="80"/);
  assert.match(html, /name="startsAt"[^>]+type="datetime-local"[^>]+required/);
  assert.match(html, /name="registrationDeadline"[^>]+type="datetime-local"[^>]+required/);
  assert.match(html, /name="cancellationDeadline"[^>]+type="datetime-local"[^>]+required/);
  assert.match(html, /name="capacity"[^>]+min="1"[^>]+max="100"/);
  assert.match(html, /aria-live="polite" data-event-form-status/);
});

test('일정 클라이언트는 한국 시간을 변환하고 서버 함수로만 관리 작업을 요청한다', async () => {
  const script = await readProjectFile('site/js/app.js');

  assert.match(script, /timeZone: 'Asia\/Seoul'/);
  assert.match(script, /new Date\(`\$\{value\}:00\+09:00`\)/);
  assert.match(script, /activeClub\?\.role/);
  assert.match(script, /create_event/);
  assert.match(script, /update_event/);
  assert.match(script, /publish_event/);
  assert.match(script, /cancel_event/);
  assert.match(script, /\.from\('events'\)/);
  assert.doesNotMatch(script, /\.from\('events'\)\s*\.insert/);
  assert.doesNotMatch(script, /\.from\('events'\)\s*\.update/);
  assert.doesNotMatch(script, /\.from\('events'\)\s*\.delete/);
});

test('일정 마이그레이션은 역할, 상태, 시간과 직접 쓰기 권한을 서버에서 강제한다', async () => {
  const migration = await readProjectFile(
    'supabase/migrations/202608040006_create_events.sql',
  );

  assert.match(migration, /create table if not exists public\.events/);
  assert.match(migration, /status in \('draft', 'published', 'cancelled'\)/);
  assert.match(migration, /capacity between 1 and 100/);
  assert.match(migration, /ends_at > starts_at/);
  assert.match(migration, /registration_deadline < starts_at/);
  assert.match(migration, /cancellation_deadline >= registration_deadline/);
  assert.match(migration, /alter table public\.events enable row level security/);
  assert.match(migration, /revoke all on table public\.events from anon, authenticated/);
  assert.match(migration, /cm\.role in \('owner', 'admin'\)/);
  assert.match(migration, /status in \('published', 'cancelled'\)/);
  assert.match(migration, /private\.validate_event_details/);
  assert.match(migration, /p_starts_at <= now\(\)/);
  assert.match(migration, /p_registration_deadline <= now\(\)/);
  assert.match(migration, /v_event\.status <> 'draft'/);
  assert.match(migration, /v_event\.status <> 'published'/);
  assert.match(migration, /target_type in \('club', 'member', 'invite', 'event'\)/);
  assert.match(migration, /'event_created'/);
  assert.match(migration, /'event_updated'/);
  assert.match(migration, /'event_published'/);
  assert.match(migration, /'event_cancelled'/);
  assert.match(migration, /grant execute on function public\.create_event/);
  assert.match(migration, /grant execute on function public\.update_event/);
  assert.match(migration, /grant execute on function public\.publish_event/);
  assert.match(migration, /grant execute on function public\.cancel_event/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on table public\.events/i);
});

test('일정 상세는 참가 응답과 네 가지 공개 명단을 제공한다', async () => {
  const html = await readProjectFile('site/index.html');

  assert.match(html, /data-event-participation/);
  assert.match(html, /data-apply-event/);
  assert.match(html, /data-absent-event/);
  assert.match(html, /data-cancel-participation/);
  assert.match(html, /data-confirmed-roster/);
  assert.match(html, /data-waiting-roster/);
  assert.match(html, /data-absent-roster/);
  assert.match(html, /data-unanswered-roster/);
  assert.match(html, /aria-live="polite" data-participation-status/);
});

test('참가 클라이언트는 응답과 관리자 변경을 서버 함수로만 요청한다', async () => {
  const script = await readProjectFile('site/js/app.js');

  assert.match(script, /\.from\('event_response_profiles'\)/);
  assert.match(script, /apply_to_event/);
  assert.match(script, /set_event_absent/);
  assert.match(script, /cancel_event_participation/);
  assert.match(script, /admin_change_participant_status/);
  assert.match(script, /wait_position/);
  assert.doesNotMatch(script, /\.from\('event_responses'\)\s*\.insert/);
  assert.doesNotMatch(script, /\.from\('event_responses'\)\s*\.update/);
  assert.doesNotMatch(script, /\.from\('event_responses'\)\s*\.delete/);
});

test('참가 마이그레이션은 마지막 자리와 자동 승급을 이벤트 잠금 안에서 처리한다', async () => {
  const migration = await readProjectFile(
    'supabase/migrations/202608040007_create_event_responses.sql',
  );

  assert.match(migration, /create table if not exists public\.event_responses/);
  assert.match(migration, /status in \('confirmed', 'waiting', 'absent', 'cancelled'\)/);
  assert.match(migration, /alter table public\.event_responses enable row level security/);
  assert.match(migration, /revoke all on table public\.event_responses from anon, authenticated/);
  assert.match(migration, /with \(security_invoker = true\)/);
  assert.match(migration, /create or replace function public\.apply_to_event/);
  assert.match(migration, /from public\.events e[\s\S]+for update/);
  assert.match(migration, /now\(\) >= v_event\.registration_deadline/);
  assert.match(migration, /now\(\) >= v_event\.cancellation_deadline/);
  assert.match(migration, /nextval\('public\.event_response_queue_seq'\)/);
  assert.match(migration, /order by er\.queue_order[\s\S]+for update of er/);
  assert.match(migration, /private\.promote_next_waiting\(p_event_id\)/);
  assert.match(migration, /private\.refresh_event_response_counts\(p_event_id\)/);
  assert.match(migration, /create or replace function public\.admin_change_participant_status/);
  assert.match(migration, /club_members_cancel_event_responses/);
  assert.match(migration, /grant execute on function public\.apply_to_event\(uuid\)/);
  assert.match(migration, /grant execute on function public\.set_event_absent\(uuid\)/);
  assert.match(migration, /grant execute on function public\.cancel_event_participation\(uuid\)/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on table public\.event_responses/i);
});

test('회원 명단은 겹친 조회의 이전 응답을 버리고 사용자 ID별로 한 번만 렌더링한다', async () => {
  const script = await readProjectFile('site/js/app.js');

  assert.match(script, /const loadId = \+\+memberDirectoryLoadId/);
  assert.match(script, /loadId !== memberDirectoryLoadId/);
  assert.match(script, /new Map\(data\.map\(\(member\) => \[member\.user_id, member\]\)\)/);
  assert.match(script, /document\.createDocumentFragment\(\)/);
  assert.match(script, /directory\.replaceChildren\(fragment\)/);
  assert.match(script, /uniqueMembers\.length/);
});
