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
