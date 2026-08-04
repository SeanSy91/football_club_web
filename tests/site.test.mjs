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
