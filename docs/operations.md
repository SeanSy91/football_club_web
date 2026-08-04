# KFC Football Club Web 운영 안내

이 문서는 초보 운영자가 배포 상태, 장애 대응, 데이터 백업을 안전하게 관리하기 위한 최소 절차다. 실제 서비스 데이터가 있는 작업은 한 번에 하나씩 수행하고 결과를 기록한다.

## 1. 배포 확인

1. `main` 브랜치에 커밋과 버전 태그를 푸시한다.
2. GitHub 저장소의 **Actions**에서 `Verify and deploy GitHub Pages`가 성공했는지 확인한다.
3. `https://seansy91.github.io/football_club_web/`을 새로고침한다.
4. 홈 화면 버전과 새 기능을 owner, admin, member 계정으로 각각 확인한다.
5. 배포 실패 시 Supabase 데이터는 변경하지 않고 실패한 Actions 로그부터 확인한다.

## 2. 장애 대응

### 조회만 실패할 때

1. 다른 화면도 실패하는지 확인한다.
2. 화면의 **다시 시도**를 한 번 누른다.
3. 계속 실패하면 Supabase Dashboard의 프로젝트 상태와 API 로그를 확인한다.
4. 오류 시각, 계정 역할, 화면, 오류 문구를 기록한다. 이메일, 토큰, 초대 코드 원문은 기록하지 않는다.

### 저장 작업이 실패할 때

1. 저장 버튼을 연속해서 누르지 않는다.
2. 화면을 새로고침해 실제 저장 여부를 먼저 확인한다.
3. 일정 참가, 대기 승급, 출석 등 서버 함수 작업은 데이터베이스 결과와 감사 기록을 확인한다.
4. 원인을 모르는 상태에서 SQL Editor로 행을 직접 수정하지 않는다.

### 권한 문제가 발생할 때

1. 클럽 화면에서 본인의 역할과 활성 상태를 확인한다.
2. 일반 회원에게 관리 버튼이 보이지 않는지 확인한다.
3. RLS를 끄거나 서비스 역할 키를 브라우저에 넣지 않는다.
4. 수정이 필요하면 새 마이그레이션을 작성하고 개발 검증 후 적용한다.

## 3. 시간 기준

- 사용자 입력과 화면 표시는 `Asia/Seoul`을 사용한다.
- 마감, 대기 순서, 게시 기간과 권한 판정은 데이터베이스 `now()`를 기준으로 한다.
- PC 시계가 잘못되어도 서버 판정은 바뀌지 않는다.
- 서머타임이 없는 한국 시간을 운영 기준으로 유지한다.

## 4. 데이터 백업 정책

Supabase 공식 문서에 따르면 Free 플랜 프로젝트는 정기적인 논리 백업과 별도 장소 보관이 권장된다. 데이터베이스 백업에는 Storage의 실제 파일이 포함되지 않으므로 프로필 사진은 별도로 보관해야 한다.

- 주기: 매주 1회, 그리고 모든 SQL 마이그레이션 실행 직전
- 보관: 최근 주간 백업 4개와 월간 백업 3개
- 위치: 저장소 밖의 암호화된 개인 폴더와 별도 외부 저장소
- 금지: 백업 파일, 데이터베이스 비밀번호, 액세스 토큰을 Git에 커밋하지 않는다.

관련 공식 문서:

- [Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase CLI db dump](https://supabase.com/docs/reference/cli/supabase-projects-create#supabase-db-dump)
- [Download Storage Objects](https://supabase.com/docs/guides/storage/management/download-objects)

## 5. 데이터베이스 수동 백업

최초 한 번 Supabase CLI 로그인과 프로젝트 연결을 완료한다. 데이터베이스 비밀번호는 명령문에 직접 적지 않고 CLI의 안전한 입력 창에서 입력한다.

```powershell
supabase login
supabase link --project-ref salmdtkbdruormkhdpkh
```

프로젝트 루트에서 날짜별 폴더를 만들고 스키마와 데이터를 나누어 저장한다.

```powershell
$backupDate = Get-Date -Format 'yyyy-MM-dd'
$backupDir = Join-Path 'backups' $backupDate
New-Item -ItemType Directory -Force -Path $backupDir
supabase db dump --linked --file (Join-Path $backupDir 'schema.sql')
supabase db dump --linked --data-only --use-copy --file (Join-Path $backupDir 'data.sql')
Get-FileHash (Join-Path $backupDir 'schema.sql'), (Join-Path $backupDir 'data.sql')
```

두 SQL 파일이 비어 있지 않고 해시가 출력되는지 확인한다. `backups/`는 `.gitignore`에 포함되어 있지만, 별도 저장소로 옮기기 전에도 개인정보가 포함된 파일로 취급한다.

## 6. Storage 백업

현재 `profile-images`는 비공개 bucket이다. 데이터베이스 백업은 파일 경로와 메타데이터만 보존하며 실제 WebP 파일은 보존하지 않는다.

회원 수가 적은 초기 운영 단계에서는 매월 Supabase Dashboard의 **Storage → profile-images**에서 파일을 내려받아 데이터베이스 백업과 같은 날짜 폴더의 `profile-images` 하위에 보관한다. 회원 수가 늘어나면 공식 Storage CLI 또는 S3 호환 도구를 이용한 일괄 백업으로 전환한다.

## 7. 복구 원칙

1. 운영 프로젝트에 즉시 덮어쓰지 않는다.
2. 새 테스트 프로젝트를 만들고 저장소의 마이그레이션으로 스키마를 먼저 재구성한다.
3. 백업 데이터를 테스트 프로젝트에 복원한다.
4. 회원, 클럽, 일정, 참가·대기, 출석, 공지와 RLS를 역할별로 확인한다.
5. Storage 파일과 프로필 경로가 일치하는지 확인한다.
6. 검증 결과와 손실 가능 범위를 운영자에게 보고한 뒤 운영 복구 여부를 결정한다.

복구는 데이터를 덮어쓸 수 있는 작업이므로 사용자 승인 없이 실행하지 않는다.

## 8. 월간 운영 점검

- GitHub Pages 최신 버전과 Actions 성공 여부
- Supabase 데이터베이스와 Storage 사용량
- owner 한 명 유지와 admin 권한 목록
- 최근 감사 기록의 이상 작업
- 만료된 공지와 오래된 테스트 일정
- 백업 파일 생성일, 크기와 해시
- 일반 회원 계정에서 관리 기능이 숨겨지고 서버에서도 거부되는지 여부

## 9. 계정 삭제 요청 처리

사용자의 요청 직후 클럽 접근은 중단되지만 Auth 계정과 Storage 파일은 운영자가 최종 정리해야 한다.

1. Supabase Dashboard의 **Table Editor → account_deletion_requests**에서 `pending` 요청을 확인한다.
2. `avatar_path`가 있으면 **Storage → profile-images**에서 해당 `<user-id>/avatar.webp` 파일을 삭제한다.
3. Storage 파일이 사라졌는지 확인한다. SQL Editor에서 `storage.objects` 행을 직접 삭제하지 않는다.
4. **Authentication → Users**에서 같은 `user_id`의 사용자를 삭제한다.
5. `profiles`, `club_members`, `account_deletion_requests`에서 해당 사용자 행이 사라졌는지 확인한다.
6. 일정·공지·출석의 작성자 참조가 `null`로 정리되고 감사 기록은 `탈퇴 회원`으로 남는지 확인한다.

총관리자의 요청은 서버에서 거부된다. 클럽 소유권 이전 기능이 마련되기 전에는 운영 데이터 보존 여부를 별도로 결정하고 새 마이그레이션으로 처리한다.

## 10. 사용량 확인

매월 첫째 주와 운영 회원이 크게 늘어난 날에 Supabase Dashboard의 조직 **Usage** 화면을 확인한다. 프로젝트 필터에서 KFC 프로젝트를 선택하고 다음 값을 기록한다.

- Database Size
- Storage Size
- Egress
- Monthly Active Users
- Realtime 메시지와 연결 수: 현재 앱은 Realtime을 사용하지 않으므로 증가하면 원인을 확인한다.
- Edge Function 호출 수: 현재 앱은 Edge Function을 사용하지 않으므로 0에 가까워야 한다.

GitHub 저장소의 **Actions**에서 불필요한 반복 배포가 없는지 확인하고 **Settings → Billing**에서 Actions 사용량을 확인한다. 정적 Pages 배포와 소규모 클럽 운영 범위를 벗어난 증가가 있으면 기능 추가보다 원인 확인을 우선한다.

관련 공식 문서:

- [Supabase Manage your usage](https://supabase.com/docs/guides/platform/manage-your-usage)
- [Supabase Billing](https://supabase.com/docs/guides/platform/billing-on-supabase)
