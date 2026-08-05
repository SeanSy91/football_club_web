# 푸시 알림 배포와 운영

## 구성

- 브라우저는 서비스 워커와 VAPID 공개 키로 기기 구독을 만듭니다.
- 구독 주소와 기기 암호화 키는 `save_my_push_subscription` 함수로 저장합니다.
- `push-notifications` Edge Function은 로그인 사용자를 다시 확인하고 본인 구독에만 시험 알림을 보냅니다.
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
npx.cmd --yes supabase@2.111.0 functions deploy push-notifications --project-ref salmdtkbdruormkhdpkh --use-api
```

함수의 JWT 검증은 기본값인 활성 상태를 유지합니다. `--no-verify-jwt`를 사용하지 않습니다.

## 확인 절차

1. GitHub Pages 운영 사이트에 로그인합니다.
2. iPhone은 Safari에서 홈 화면에 설치한 앱으로 엽니다.
3. **내 정보 → 푸시 알림 설정 → 이 기기 알림 켜기**를 누릅니다.
4. 브라우저 또는 운영체제의 알림 권한을 허용합니다.
5. `KFC Football Club` 시험 알림이 표시되는지 확인합니다.
6. **시험 알림 보내기**와 **이 기기 알림 끄기**도 확인합니다.

알림이 오지 않으면 Supabase Dashboard의 Edge Function 로그, 브라우저 알림 권한,
PWA 설치 여부와 `push_subscriptions.is_active` 상태를 순서대로 확인합니다. 구독 주소나
암호화 키의 원문은 로그에 출력하지 않습니다.
