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

## 8. 일정 관리

`v0.6.0`을 적용할 때 SQL Editor에서
`supabase/migrations/202608040006_create_events.sql`을 실행한다.

이 마이그레이션은 다음 항목을 설정한다.

- 임시 저장, 공개, 취소 상태를 갖는 `events` 테이블
- 정원 1–100명과 시작·종료·신청 마감·취소 마감의 시간 관계 제약
- 같은 클럽의 활성 회원만 공개·취소 일정을 조회하는 RLS
- owner와 admin에게만 임시 일정까지 조회를 허용하는 RLS
- owner와 admin 권한을 다시 검사하는 작성·수정·공개·취소 서버 함수
- 일정 관리 작업을 총관리자 전용 감사 로그에 기록하는 트랜잭션

브라우저는 한국 시간으로 입력하고 ISO 시각으로 변환해 전송한다. 최종 미래 시각, 마감 관계와 역할은 데이터베이스의 `now()`와 서버 함수가 판정한다. 일반 회원은 공개된 일정과 취소 사유만 조회할 수 있고 일정 테이블을 직접 추가·수정·삭제할 수 없다.

## 9. 참가 신청과 대기열

`v0.7.0`을 적용할 때 SQL Editor에서
`supabase/migrations/202608040007_create_event_responses.sql`을 실행한다.

이 마이그레이션은 다음 항목을 설정한다.

- 참가 확정, 대기, 불참, 참가 취소 상태를 갖는 `event_responses` 테이블
- 서버 접수 순서를 보존하는 비공개 시퀀스와 대기 순위 조회 뷰
- 이벤트 행 잠금으로 마지막 자리 신청을 직렬화하는 `apply_to_event`
- 확정 취소와 동시에 대기 1순위를 승급하는 `cancel_event_participation`
- 불참 응답과 관리자 참가 상태 변경 서버 함수
- 확정·대기 공식 카운트를 서버에서만 갱신하는 내부 함수
- 회원 탈퇴 시 미래 참가 응답을 취소하고 대기자를 승급하는 트리거
- 같은 클럽 회원에게만 응답과 공개 프로필을 보여주는 RLS

클라이언트는 참가 응답 테이블을 직접 쓰지 않는다. 신청·취소 가능 여부는 데이터베이스 `now()`와 일정의 마감 시각으로 판정하며, 같은 이벤트의 참가 변경은 이벤트 행 잠금 안에서 처리한다.

## 10. 출석 기록과 월별 집계

`v0.8.0`에 적용하려면 SQL Editor에서
`supabase/migrations/202608040008_create_attendance.sql`을 실행한다.

이 마이그레이션은 다음 항목을 설정한다.

- 출석, 지각, 결석, 사유 인정 상태를 저장하는 `attendance_records` 테이블
- 같은 일정과 회원에 하나의 결과만 허용하는 복합 기본 키
- 시작된 공개 일정만 출석 처리할 수 있게 검사하는 `set_attendance` 서버 함수
- owner와 admin만 출석 결과를 변경하고 모든 활성 회원은 결과를 조회하는 권한 경계
- 한국 시간의 일정 시작일을 기준으로 계산하는 `monthly_attendance_stats` 월별 집계 뷰
- 출석과 지각을 출석 횟수로 합산하고 사유 인정은 출석률 분모에서 제외하는 계산 규칙
- 출석 상태 변경을 총관리자 감사 기록에 남기는 처리

클라이언트는 출석 테이블을 직접 쓰지 않고 `set_attendance` 함수만 호출한다. 일정 시작 전 기록 요청, 일반 회원의 변경 요청, 다른 클럽 회원에 대한 요청은 데이터베이스에서 거부한다.

## 11. 공지사항과 게시 기간

`v0.9.0`에 적용하려면 SQL Editor에서
`supabase/migrations/202608040009_create_announcements.sql`을 실행한다.

이 마이그레이션은 다음 항목을 설정한다.

- 임시 저장, 공개, 보관 상태와 중요 공지 고정을 지원하는 `announcements` 테이블
- 게시 시작과 종료 시각을 데이터베이스 `now()`로 판정하는 공개 정책
- 같은 클럽의 활성 회원에게만 현재 공개 중인 공지를 보여주는 RLS
- owner와 admin이 예약 공지와 종료된 공지를 함께 관리할 수 있는 조회 권한
- 공지 작성·수정·보관 때 역할을 다시 확인하는 서버 함수
- 공지 관리 작업을 총관리자 감사 기록에 남기는 처리

일반 회원은 임시 저장, 공개 예정, 게시 종료, 보관 공지를 조회할 수 없다. 클라이언트는 공지 테이블을 직접 변경하지 않고 `create_announcement`, `update_announcement`, `archive_announcement` 함수만 호출한다.

## 12. 계정 삭제 요청

`v1.0.0`에 적용하려면 SQL Editor에서
`supabase/migrations/202608040010_add_account_deletion_requests.sql`을 실행한다.

이 마이그레이션은 다음 항목을 설정한다.

- 계정 삭제 요청 상태와 요청 시각
- 본인 요청만 조회할 수 있는 `account_deletion_requests` 테이블과 RLS
- 총관리자의 실수로 인한 클럽 소유권 유실 방지
- 요청 회원의 클럽 접근 중단과 향후 참가·가입 차단
- 향후 참가 취소와 대기 회원 자동 승급 트리거 재사용
- 감사 기록의 회원 이름과 식별자 익명화
- Auth 계정 삭제 때 일정·공지·출석 작성자 참조를 `null`로 정리하는 외래 키

정적 사이트는 서비스 역할 키를 사용하지 않는다. 최종 삭제는 `docs/operations.md`의 절차에 따라 프로필 사진을 Storage에서 먼저 제거하고 Supabase Dashboard의 **Authentication → Users**에서 처리한다.

## 13. 웹 푸시 구독

SQL Editor에서 `supabase/migrations/202608050013_create_push_subscriptions.sql`을 실행한다.
회원별 알림 선택값과 브라우저 푸시 구독을 저장하며, 구독 원문은 본인도 직접 조회할 수 없고
보안 서버 함수와 Edge Function만 사용한다. VAPID 키와 함수 배포는
`docs/push-notifications.md`를 따른다.

## 14. 일정 예약 알림과 관리자 즉시 알림

SQL Editor에서 `supabase/migrations/202608050014_add_event_push_notifications.sql`을 실행한다.

- 일정별 예약 알림 시각과 전송 처리 상태
- 오늘 공개 일정의 참가 확정자에게 보내는 owner/admin 전용 알림
- 5분 재전송 제한과 알림 요청 결과 기록
- Supabase Vault의 자동화 비밀값과 5분 간격 Cron 작업
- 회원별 일정 알림 및 관리자 경기 안내 수신 설정

예약 시각이 지나면 다음 Cron 주기에 처리되므로 실제 전송은 최대 약 5분 늦을 수 있다. 실행 후
Edge Function을 `docs/push-notifications.md`의 명령으로 다시 배포한다.

## 15. 취소 일정 일반 회원 비공개

SQL Editor에서
`supabase/migrations/202608050015_hide_cancelled_events_from_members.sql`을 실행한다.
이 정책부터 일반 회원은 공개 상태의 일정만 조회하고, owner와 admin만 임시 저장 및 취소 일정을
계속 조회할 수 있다. 화면 필터와 별개로 데이터베이스 RLS가 취소 일정과 취소 사유 조회를 차단한다.
