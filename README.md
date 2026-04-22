# 수행Lab (Next.js + OAuth + Google Drive API)

Apps Script 버전(`../teacher`, `../student`)을 대체하는 현대적 웹 앱.
각 교사가 **본인 Google 계정**으로 인증하고, **본인 Drive 할당량**으로 시험지를 관리합니다.

## 왜 새로 만드나?

- **Apps Script 한계**: 배포자 할당량 의존, 90분/일 실행 시간 제한, 동시 30개 실행 한계
- **해결**: OAuth 2.0 + 각 교사의 Drive API 직접 호출 → 교사별 할당량 사용

## 아키텍처

```
브라우저 (교사/학생)
   │
   ├─ /             ← 랜딩 (로그인 버튼)
   ├─ /dashboard    ← 교사 관리 (시험지 CRUD)
   └─ /test/[teacherId]/[testId]  ← 학생 응시 (인증 불필요)
   │
   ↓ fetch
Next.js API Routes (Vercel)
   │
   ├─ /api/auth/*    ← OAuth 로그인/세션
   ├─ /api/tests/*   ← 교사 CRUD (세션 필요)
   └─ /api/public/tests/* ← 학생용 (teacherId로 교사 토큰 조회)
   │
   ↓ Bearer token (교사 accessToken)
Google Drive API v3 + Sheets API v4 + Docs API
   │
   ↓
각 교사의 Drive (시험지, 이미지, 답안지 스프레드시트)

Vercel KV (별도):
   teacherId → refreshToken 매핑 저장
```

## 구현 진행 상황

- [x] 프로젝트 스캐폴딩 (package.json, tsconfig, next.config)
- [x] 세션 관리 (`lib/session.ts`) — HMAC 서명 쿠키
- [x] 교사 레지스트리 (`lib/teacherRegistry.ts`) — Vercel KV
- [x] OAuth 헬퍼 (`lib/googleAuth.ts`) — PKCE + refresh
- [x] OAuth 라우트 (login, callback, me, logout)
- [x] 랜딩 + 대시보드 스캐폴딩
- [x] Drive API wrapper (`lib/drive.ts`)
- [x] Sheets API wrapper (`lib/sheets.ts`)
- [x] 시험지 CRUD API (`/api/tests`, `/api/tests/[testId]`)
- [x] 학생 응시 API (`/api/public/tests/*`)
- [x] 교사 대시보드 UI (목록 + 객관식 생성 폼)
- [x] 학생 응시 UI (`/test/[teacherId]/[testId]`)
- [x] 다른 문제 유형 지원 (OX, 단답, 연결하기)
- [x] 이미지 업로드 UI (문제 본문 / 선택지 / 연결쌍)
- [x] 시험지 수정 UI
- [x] Google Docs 미리보기 생성 (`lib/docs.ts`)
- [x] 기존 Apps Script 데이터 마이그레이션 도구 (`/api/migrate/import` + Apps Script `exportAllTestsAsJson()`)

## 셋업 (개발 시작 전 1회)

### 1. 의존성 설치

```bash
cd web
npm install
```

### 2. Google Cloud Console에서 OAuth 2.0 Client 생성

1. https://console.cloud.google.com/ 접속
2. 새 프로젝트 생성 (예: `suhaeng-lab`)
3. **API 및 서비스 → 라이브러리**에서 활성화:
   - Google Drive API
   - Google Sheets API
   - Google Docs API
4. **API 및 서비스 → OAuth 동의 화면**
   - User Type: **외부**
   - 앱 이름, 로고 등 기본 정보 입력
   - 범위(Scope): `drive.file`, `spreadsheets`, `documents`, `openid`, `profile`, `email`
   - 테스트 사용자에 본인 이메일 추가
5. **API 및 서비스 → 사용자 인증 정보 → + 사용자 인증 정보 만들기 → OAuth 2.0 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI:
     - `http://localhost:3000/api/auth/callback` (개발)
     - `https://your-app.vercel.app/api/auth/callback` (배포 후)
6. Client ID / Client Secret 복사

### 3. Vercel KV 설정

1. https://vercel.com/ 가입/로그인
2. 새 프로젝트 만들고 GitHub 연결 (또는 `vercel` CLI로 배포)
3. **Storage → Create → KV**로 KV 인스턴스 생성
4. KV 환경변수 4개 자동 연결 (`KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`)
5. 로컬 개발엔 `vercel env pull .env.local`로 가져오기

### 4. 환경변수 파일 생성

```bash
cp .env.local.example .env.local
```

`.env.local`을 열고 실제 값 입력:

```bash
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
APP_URL=http://localhost:3000
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
# Vercel KV 값은 `vercel env pull`로 자동 추가
```

### 5. 개발 서버 실행

```bash
npm run dev
```

http://localhost:3000 에서 확인.

## 현재 작동하는 것 (auth 셋업 후)

✅ OAuth 로그인 → `/dashboard`
✅ 4가지 문제 유형 (객관식/OX/단답/연결하기) 생성 · 수정 · 삭제
✅ 본문/선택지/연결쌍 이미지 업로드 (data URL → Drive `lh3` CDN URL)
✅ 학생 응시 (`/test/[teacherId]/[testId]`) — 교사 할당량으로 답안 제출
✅ 답안 스프레드시트 자동 생성
✅ 미리보기 Google Docs 자동 생성 · 재생성
✅ Apps Script 기존 데이터 JSON 가져오기

## 기존 Apps Script에서 마이그레이션하기

1. 기존 Apps Script 편집기 열기 → `teacher/Code.gs` → 함수 목록에서 **`exportAllTestsAsJson`** 선택 → 실행
2. 로그(보기 > 로그)에 찍힌 JSON 전체를 복사
3. 신 앱 대시보드 → "저장된 시험지 목록" 탭 → "📥 Apps Script 기존 시험지 가져오기" 펼치기 → 붙여넣기 → 가져오기
4. 진행 결과(가져옴/건너뜀/실패) 확인

## 파일 구조

```
web/
├── app/
│   ├── api/auth/{login,callback,me,logout}/route.ts   ← OAuth 엔드포인트
│   ├── dashboard/page.tsx                              ← 교사 대시보드 (스캐폴딩)
│   ├── layout.tsx                                      ← 전역 레이아웃 (주아체 로드)
│   ├── globals.css                                     ← 전역 스타일
│   └── page.tsx                                        ← 랜딩
├── lib/
│   ├── session.ts              ← 세션 쿠키 encode/decode (HMAC 서명)
│   ├── googleAuth.ts           ← OAuth 헬퍼 (PKCE, refresh)
│   └── teacherRegistry.ts      ← KV 기반 teacherId ↔ refreshToken
├── .env.local.example          ← 환경변수 템플릿
├── next.config.ts
├── package.json
└── tsconfig.json
```
