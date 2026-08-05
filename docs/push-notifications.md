# 푸시 알림 배포와 운영

## 구성

- 브라우저는 서비스 워커와 VAPID 공개 키로 기기 구독을 만듭니다.
- 구독 주소와 기기 암호화 키는 `save_my_push_subscription` 함수로 저장합니다.
- `push-notifications` Edge Function은 사용자 JWT를 직접 확인한 뒤 시험 알림과 관리자 즉시 알림을 처리합니다.
- 예약 알림은 `pg_cron`이 5분마다 함수를 호출하고, 함수가 참가 확정자와 개인 알림 설정을 다시 확인해 전송합니다.
- 예약 호출용 비밀값, 프로젝트 URL과 publishable key는 Supabase Vault에 저장합니다.
- VAPID 비공개 키와 Supabase secret key는 `site/`와 Git 저장소에 두지 않습니다.

## 최초 1회 설정

프로젝트 루트의 PowerShell에서 Supabase 계정에 로그인합니다.

```powershell
npx.cmd --yes supabase@2.111.0 login
```

VAPID 키를 한 번 생성해 PowerShell 메모리에만 보관한 뒤 Supabase Secret으로 전송합니다.

```powershell
$vapidKeys = npx.cmd --yes web-push@3.6.7 generate-vapid-keys --json | ConvertFrom-Json
npx.cmd --yes supabase@2.111.0 secrets set --project-ref salmdtkbdruormkhdpkh "VAPID_PUBLIC_KEY=$($vapidKeys.publicKey)" "VAPID_PRIVATE_KEY=$($vapidKeys.privateKey)" "VAPID_SUBJECT=https://seansy91.github.io/football_club_web/"
Remove-Variable vapidKeys
```

키는 다시 생성하지 않습니다. 키를 바꾸면 기존 브라우저 구독을 모두 새로 받아야 합니다.

## Edge Function 배포

Docker 없이 Supabase API 번들링으로 배포합니다.

```powershell
npx.cmd --yes supabase@2.111.0 functions deploy push-notifications --project-ref salmdtkbdruormkhdpkh --use-api --no-verify-jwt
```

예약 작업에는 사용자 JWT가 없으므로 API Gateway의 JWT 검증은 끕니다. 대신 Edge Function이
브라우저 요청의 사용자 JWT를 직접 검증하고, `process-reminders` 요청은 14번째 SQL이 Vault에
생성한 임의 비밀값으로 별도 검증합니다. 이 비밀값은 출력하거나 Git에 저장하지 않습니다.

## 알림 종류

- **시험 알림**: 로그인한 본인이 현재 연결한 기기로만 전송
- **예약 일정 알림**: 관리자가 일정에 지정한 시각 이후 첫 5분 주기에 참가 확정자에게 전송
- **오늘 참석자 알림**: owner/admin이 오늘의 공개 일정 상세에서 즉시 전송, 5분 재전송 제한

예약·즉시 알림은 전송 순간에도 참가 확정 상태와 각 회원의 알림 설정을 확인합니다. 브라우저
알림을 켜지 않은 회원은 대상 회원 수에는 포함될 수 있지만 전송 기기 수에는 포함되지 않습니다.

## 확인 절차

1. GitHub Pages 운영 사이트에 로그인합니다.
2. iPhone은 Safari에서 홈 화면에 설치한 앱으로 엽니다.
3. **내 정보 → 푸시 알림 설정 → 이 기기 알림 켜기**를 누릅니다.
4. 브라우저 또는 운영체제의 알림 권한을 허용합니다.
5. `KFC Football Club` 시험 알림이 표시되는지 확인합니다.
6. **시험 알림 보내기**와 **이 기기 알림 끄기**도 확인합니다.
7. owner/admin 계정으로 오늘 공개 일정의 **오늘 참석자에게 알림**을 전송합니다.
8. 미래 공개 일정의 예약 시각을 5분 이상 뒤로 지정하고 참가 확정 계정에서 수신을 확인합니다.

알림이 오지 않으면 Supabase Dashboard의 Edge Function 로그, 브라우저 알림 권한,
PWA 설치 여부, `push_subscriptions.is_active`, `event_push_messages` 상태, Cron 작업 이력을
순서대로 확인합니다. 구독 주소, 암호화 키와 Vault 비밀값의 원문은 로그에 출력하지 않습니다.
