# KFC Football Club Web 개인정보 처리 안내

시행 및 최종 수정: 2026년 8월 4일

이 문서는 친구 중심의 비공개 축구 모임에서 KFC Football Club Web을 운영할 때 적용하는 개인정보 처리 안내다. 실제 외부 공개 운영 전에는 운영 주체의 이름과 연락 방법을 추가하고 지역 법률에 맞는 검토가 필요하다.

## 1. 처리하는 정보

- Google OAuth에서 제공하는 계정 식별자, 이메일과 기본 프로필
- 회원이 입력하는 이름 또는 닉네임, 나이, 선호 포지션, 주 사용 발, 등번호와 자기소개
- 선택적으로 업로드하는 프로필 사진
- 클럽 가입 상태와 owner, admin, member 역할
- 일정 참가, 대기, 불참, 취소와 출석 기록
- 공지, 일정, 권한과 출석 등 관리 작업의 감사 기록

초대 코드 원문, Google OAuth Client Secret, Supabase 서비스 역할 키와 데이터베이스 비밀번호는 브라우저나 회원 데이터로 저장하지 않는다.

## 2. 처리 목적

- Google 계정으로 회원을 식별하고 로그인 상태 유지
- 비공개 클럽 가입과 역할 관리
- 일정, 참가 정원, 대기 순번과 자동 승급 운영
- 출석과 월별 참석 현황 공개
- 공지 전달과 중요 관리 작업 확인
- 오류 대응, 권한 오용 방지와 데이터 복구

## 3. 공개 범위

- 이메일은 다른 회원에게 공개하지 않는다.
- 공개 프로필, 일정 응답과 출석 현황은 같은 클럽의 활성 회원에게만 보인다.
- 임시 일정과 공개 기간 밖의 공지는 owner와 admin만 조회한다.
- 감사 기록은 owner만 조회한다.
- RLS와 서버 함수가 최종 접근 권한을 확인한다.

## 4. 외부 서비스

- Google: OAuth 로그인과 계정 인증
- Supabase: Auth, PostgreSQL 데이터베이스와 비공개 Storage
- GitHub Pages: 공개 정적 HTML, CSS와 JavaScript 배포

정적 사이트에는 Supabase 공개 URL과 publishable key만 포함한다. 비밀 키를 필요로 하는 Auth 관리자 작업은 Supabase Dashboard에서만 수행한다.

## 5. 보관과 삭제

회원 데이터는 계정과 클럽 운영에 필요한 동안 보관한다. 계정 삭제 요청이 접수되면 다음 순서로 처리한다.

1. 해당 회원의 활성 클럽 상태와 향후 참가를 즉시 중단한다.
2. 감사 기록에 남은 회원 이름과 계정 식별자를 `탈퇴 회원`으로 익명화한다.
3. 운영자가 Supabase Storage API 또는 Dashboard로 프로필 사진을 삭제한다.
4. 운영자가 Supabase Dashboard의 **Authentication → Users**에서 Auth 계정을 삭제한다.
5. Auth 계정 외래 키의 cascade 또는 set null 규칙으로 프로필과 작성자 참조를 정리한다.

감사 목적의 이벤트·공지 내용과 익명화된 작업 기록은 클럽 운영 기록으로 남을 수 있다. 총관리자는 클럽 소유권을 정리하기 전에는 계정 삭제를 요청할 수 없다.

## 6. 회원의 선택

- 내 정보 화면에서 본인 프로필을 수정할 수 있다.
- 기본 이미지를 선택해 업로드한 프로필 사진을 제거할 수 있다.
- 내 정보 화면에서 계정 삭제를 요청할 수 있다.
- 최종 Auth 삭제 전 문의가 필요한 경우 클럽 총관리자에게 연락한다.

Supabase 공식 안내에 따라 사용자 소유 Storage 객체는 Auth 사용자 삭제 전에 Storage API로 제거한다. SQL로 `storage.objects` 행만 삭제하면 실제 파일이 남을 수 있으므로 사용하지 않는다.

- [Supabase User Management](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase Delete Storage Objects](https://supabase.com/docs/guides/storage/management/delete-objects)
