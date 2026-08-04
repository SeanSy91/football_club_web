# Supabase 개발 환경 설정

이 문서는 `v0.2.0` Google 로그인 단계에서 대시보드에 한 번만 적용할 설정을 정리한다.

## 1. profiles 테이블과 RLS

1. Supabase Dashboard에서 `football-club-web-dev` 프로젝트를 연다.
2. 왼쪽 메뉴에서 **SQL Editor**를 선택한다.
3. **New query**를 선택한다.
4. 저장소의 `supabase/migrations/202608040001_create_profiles.sql` 내용을 전부 붙여 넣는다.
5. **Run**을 누르고 성공 메시지를 확인한다.

이 SQL은 로그인 사용자에게 본인 프로필 조회와 허용된 항목 수정만 허용한다. 익명 사용자의 접근은 허용하지 않는다.

## 2. 인증 URL

Supabase Dashboard의 **Authentication → URL Configuration**에서 다음을 설정한다.

- Site URL: `https://seansy91.github.io/football_club_web/`
- Redirect URLs:
  - `https://seansy91.github.io/football_club_web/`
  - `http://127.0.0.1:8765/`

운영 주소는 정확한 URL로 등록하고, 와일드카드는 사용하지 않는다.

## 3. Google OAuth

1. Google Auth Platform에서 OAuth 클라이언트를 만든다.
2. 애플리케이션 유형은 **웹 애플리케이션**을 선택한다.
3. 승인된 JavaScript 원본에 `https://seansy91.github.io`를 등록한다.
4. 승인된 리디렉션 URI에는 Supabase Dashboard의 **Authentication → Sign In / Providers → Google** 화면에 표시되는 Callback URL을 등록한다.
5. Google에서 발급한 Client ID와 Client Secret을 Supabase의 Google provider 화면에 입력하고 활성화한다.

Client Secret은 Supabase Dashboard에만 입력한다. 저장소, 정적 웹 파일, 채팅에는 입력하지 않는다.

## 4. 완료 확인

1. 배포된 웹사이트에서 **Google로 계속하기**를 누른다.
2. Google 계정을 선택한 뒤 `#profile` 화면으로 돌아오는지 확인한다.
3. 이름, 이메일과 Google 프로필 사진이 본인 계정 정보로 표시되는지 확인한다.
4. **로그아웃** 후 보호 화면에 다시 접근하면 로그인 화면으로 이동하는지 확인한다.
