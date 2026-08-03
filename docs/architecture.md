# 기술 구조와 보안

## 1. 구성

```text
GitHub repository
  └─ GitHub Actions
       └─ GitHub Pages: HTML + CSS + JavaScript
                    │
                    └─ Supabase HTTPS API
                         ├─ Auth: Google, 추후 Kakao
                         ├─ PostgreSQL
                         ├─ Storage
                         └─ Database Functions
```

GitHub는 소스와 정적 화면을 배포한다. Supabase는 인증, 데이터, 파일과 서버 측 비즈니스 규칙을 담당한다.

## 2. 브라우저 공개 정보

다음 값은 브라우저에 공개되는 것을 전제로 한다.

- Supabase project URL
- Supabase publishable key
- Google OAuth 공개 client ID가 필요한 경우 해당 값

공개 키는 데이터 접근 권한을 뜻하지 않는다. 모든 공개 스키마 테이블과 Storage bucket에 Row Level Security 정책이 있어야 한다.

다음 값은 Supabase 또는 OAuth 제공자 대시보드에서만 관리한다.

- Supabase service-role key
- OAuth client secret
- 데이터베이스 비밀번호
- GitHub 개인 액세스 토큰

## 3. 데이터 모델 초안

| 테이블 | 책임 |
|---|---|
| `profiles` | 본인 계정 프로필과 계정 상태 |
| `clubs` | 클럽 기본 정보와 owner |
| `club_members` | 클럽별 역할, 상태와 공개 프로필 |
| `club_invites` | 해시된 초대 코드와 활성 상태 |
| `events` | 일정, 정원, 마감, 서버 관리 카운트 |
| `event_responses` | 회원별 confirmed, waiting, absent, cancelled 상태 |
| `attendance_records` | 이벤트별 출석 상태 |
| `announcements` | 공지와 게시 기간 |
| `audit_logs` | 중요 관리자 작업 기록 |

주요 식별자는 UUID를 사용한다. 모든 클럽 데이터는 `club_id`를 포함하고, 다대다 관계는 연결 테이블과 외래 키로 표현한다.

## 4. 서버 측 함수

클라이언트에서 테이블을 직접 조합해 처리하지 않고 다음 PostgreSQL 함수가 트랜잭션을 담당한다.

- `join_club_with_invite_code`
- `apply_to_event`
- `set_event_absent`
- `cancel_event_participation`
- `admin_change_participant_status`
- `set_attendance`
- `change_member_role`
- `change_invite_code`

함수는 `auth.uid()`, 회원 상태와 역할을 다시 확인한다. 참가 순서와 마감은 `now()`를 사용한다.

## 5. GitHub Pages 제약 대응

- 서버 코드를 실행하지 않는다.
- 화면 전환은 `#schedule`과 같은 hash route를 사용한다.
- 저장소의 `site/`만 배포한다.
- OAuth redirect URL에는 실제 Pages 주소를 등록한다.
- 권한 검증과 비밀 처리를 JavaScript에 구현하지 않는다.

## 6. 보안 완료 조건

- RLS 없는 공개 스키마 테이블이 없음
- 일반 사용자가 다른 클럽 데이터를 조회할 수 없음
- 본인이 역할과 회원 상태를 변경할 수 없음
- 초대 코드 원문을 조회할 수 없음
- 참가 카운트와 대기 순번을 직접 쓸 수 없음
- Storage는 파일 크기, MIME과 소유권을 검증함
- 주요 함수에 정상, 비회원, 일반 회원, 관리자와 동시 요청 테스트가 있음
