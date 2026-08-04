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

## 5. 프로필과 비공개 사진 저장소

`v0.3.0`을 적용할 때 SQL Editor에서
`supabase/migrations/202608040002_add_profile_details_and_storage.sql`을 실행한다.

이 마이그레이션은 다음 항목을 함께 설정한다.

- 나이와 선택 프로필 필드
- 본인만 수정 가능한 컬럼 권한
- 1MB WebP만 받는 비공개 `profile-images` bucket
- 사용자별 고정 경로 `<user-id>/avatar.webp`
- 본인이 소유한 사진만 조회·업로드·교체·삭제할 수 있는 Storage RLS

사진 원본은 웹 브라우저에서 512×512 WebP로 압축한 뒤 업로드한다. 데이터베이스에는 만료되는 서명 URL이 아니라 파일 경로만 저장한다.

## 6. 클럽과 해시 초대 코드

`v0.4.0`을 적용할 때 SQL Editor에서
`supabase/migrations/202608040003_create_clubs_and_invites.sql`을 실행한다.

이 마이그레이션은 다음 항목을 함께 설정한다.

- `clubs`, `club_members`, 비공개 `club_invites` 테이블
- 사용자당 활성 클럽 하나를 보장하는 부분 고유 인덱스
- 생성·가입을 한 트랜잭션에서 처리하는 PostgreSQL 함수
- `owner`, `admin`, `member` 역할을 서버에서만 부여하는 경계
- 같은 클럽 회원에게만 공개 프로필과 사진을 보여주는 RLS
- 초대 코드를 bcrypt로 해시해 원문을 저장하지 않는 정책

클럽 생성 직후 코드 원문은 한 번만 화면에 표시한다. 새 회원에게 전달할 때 복사해 두며, 데이터베이스에서는 다시 조회할 수 없다.

클럽 생성 후 코드를 보관하지 못한 경우
`supabase/migrations/202608040004_add_invite_code_rotation.sql`을 실행한다.
이후 클럽 화면의 **새 초대 코드 발급**을 사용한다. 서버는 owner 권한을 다시 검사하고 기존 해시를 새 bcrypt 해시로 교체하므로 이전 코드는 즉시 무효화된다.

## 7. 회원 권한 관리와 감사 로그

`v0.5.0`을 적용할 때 SQL Editor에서
`supabase/migrations/202608040005_add_member_management_and_audit.sql`을 실행한다.

이 마이그레이션은 다음 항목을 설정한다.

- 총관리자만 일반 회원을 관리자로 지정하거나 관리자 권한을 해제하는 서버 함수
- 총관리자만 일반 회원과 관리자를 탈퇴 처리하는 서버 함수
- 총관리자 자신과 `owner` 역할은 변경하거나 탈퇴 처리할 수 없는 보호 규칙
- 탈퇴한 회원이 유효한 초대 코드로 다시 가입할 수 있는 복귀 처리
- 권한 변경, 탈퇴, 가입, 초대 코드 재발급을 기록하는 `audit_logs` 테이블
- 감사 로그 원문은 총관리자만 조회하고 브라우저에서는 추가·수정·삭제할 수 없는 RLS와 테이블 권한

SQL 실행 후 총관리자 계정으로 클럽 화면을 새로고침한다. 다른 회원 카드에 **관리자로 지정**과 **회원 탈퇴 처리** 버튼이 표시되고, 화면 아래에 **최근 관리 기록**이 표시되어야 한다. 일반 회원과 관리자는 이 버튼, 초대 코드 관리 도구, 감사 로그를 볼 수 없어야 한다.
