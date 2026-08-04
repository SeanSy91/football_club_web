# KFC Football Club Web

비공개 축구 모임의 일정, 참가 신청, 대기 순번, 출석과 회원 현황을 관리하는 반응형 웹사이트입니다.

## 기술 구성

- HTML, CSS, JavaScript만 사용하는 정적 웹 화면
- Supabase Auth: Google 로그인, 추후 Kakao 로그인
- Supabase PostgreSQL: 회원, 클럽, 일정, 참가 및 출석 데이터
- Supabase Storage: 프로필과 공지 이미지
- GitHub Pages: 정적 웹 배포
- GitHub Actions: 테스트 및 자동 배포

별도 Node.js API 서버나 프런트엔드 빌드 도구를 운영하지 않습니다. 권한과 중요한 상태 변경은 PostgreSQL Row Level Security와 데이터베이스 함수에서 검증합니다.

## 현재 버전

`0.7.0` — 선착순 참가·대기, 불참·취소와 대기 1순위 자동 승급

## 로컬 실행

프로젝트 루트에서 다음 명령을 실행합니다.

```powershell
python -m http.server 8080 --directory site
```

브라우저에서 `http://127.0.0.1:8080`을 엽니다.

## 테스트

```powershell
node --test
```

## 배포

`main` 브랜치에 푸시하면 GitHub Actions가 테스트를 실행하고 `site/` 디렉터리만 GitHub Pages에 배포합니다.

예정 주소: `https://seansy91.github.io/football_club_web/`

## 환경 설정과 비밀정보

`site/js/config.js`에는 브라우저에 공개해도 되는 Supabase 프로젝트 URL과 publishable key만 둡니다. 다음 값은 절대로 저장소나 `site/`에 넣지 않습니다.

- Supabase service-role key
- Google 또는 Kakao OAuth client secret
- 데이터베이스 비밀번호
- 개인 액세스 토큰

OAuth 비밀값은 Supabase 대시보드에서만 관리합니다.

## 문서

- [웹 제품 사양](docs/product-spec.md)
- [기술 구조와 보안](docs/architecture.md)
- [단계별 개발 계획](docs/development-plan.md)
- [Supabase 개발 환경 설정](docs/supabase-setup.md)

기존 Flutter/Firebase 프로토타입은 별도 저장소 `football_club_app`의 `v0.4.0` 태그로 보존합니다.
