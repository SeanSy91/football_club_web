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
