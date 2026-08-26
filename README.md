# DAH (Drawing at Home) 업무관리 시스템

드로잉엣홈(커튼·블라인드 인테리어) 고객관리·견적·발주 자동화 시스템.
순수 HTML/JS로 작성된 3개의 웹앱 + Supabase(DB) + Google Apps Script(자동화)로 구성됩니다.

---

## 1. 전체 구조

```
[고객] → survey.html (사전 설문)
              ↓
[스태프/마스터] → dah-dashboard.html (고객관리·매출·설정)
              ↓
              → dah-estimate.html (견적서·발주서·의뢰서 작성)
              ↓
         Supabase (customers / estimates / surveys 테이블)
              ↓
    Google Apps Script 자동화
    ├─ 구글드라이브: 문서 자동저장 (카테고리별 정리)
    ├─ 구글시트: 고객명단 현황판 동기화
    ├─ 구글드라이브: 매일 전체 데이터 백업 (영구보관)
    └─ 설문 응답 → 고객 자동 등록 (시간 기반 폴링)
```

## 2. 앱 3개 및 코드 구조

각 앱은 `HTML(레이아웃+초기화) + CSS 1개 + JS 여러개`로 분리되어 있습니다.

| 앱 | 배포 URL | HTML | CSS | JS 분리 파일 |
|---|---|---|---|---|
| 대시보드 | `/dashboard` | `dah-dashboard.html` | `dash-styles.css` | `dash-utils.js`, `dash-api.js`, `dash-ui-helpers.js`, `dash-memo.js`, `dash-chart.js`, `dash-calendar.js`, `dash-kanban.js`, `dash-customer-detail.js`, `dash-auth.js`, `dash-settings.js`, `dash-export.js`, `dash-search.js`, `dash-core.js`, `dash-render.js` (14개) |
| 견적서 | `/estimate` | `dah-estimate.html` | `est-styles.css` | `est-utils.js`, `est-form-controls.js`, `est-product-calc.js`, `est-survey.js`, `est-save.js`, `est-documents.js`, `est-customer-load.js`, `est-misc.js` (8개) |
| 설문지 | `/survey` | `survey.html` | (인라인) | `survey-app.js` (React, CDN 로드) |

역할:
- **`dah-dashboard.html`**: 고객 목록(칸반/검색), 매출 대시보드, 설정(직원관리·백업), 마스터/스태프 권한 구분
- **`dah-estimate.html`**: 커튼·블라인드 견적서 작성, 발주서/실측·시공 의뢰서 자동생성
- **`survey.html`**: 고객용 사전 설문지 (구글시트+Supabase 이중저장)

루트(`/`)는 `dah-dashboard`로 리다이렉트됩니다 (`vercel.json`).

## 3. 로그인 / 권한

- **화면 흐름**: 마스터는 비밀번호로, 스태프는 이름 선택 후 비밀번호 1회 입력으로 로그인합니다(둘 다 화면상 UI는 기존 방식 유지).
- **실제 인증**: 화면 뒤에서는 **Supabase Auth(이메일+비밀번호)**로 진짜 로그인 세션을 발급·검증합니다(`dash-supabase-auth.js`, 대시보드·견적서 앱 공용). 모든 Supabase API 호출의 `Authorization` 헤더는 anon key가 아니라 이 로그인 토큰을 사용합니다. 세션 만료/토큰 갱신도 이 파일에서 처리합니다.
- **`staff_profiles` 테이블**: `id`(auth.users와 연결), `display_name`, `role`(`master`/`staff`)로 구성. 마스터/스태프 판별과 RLS 정책의 기준이 됩니다.
- **RLS(행 단위 보안) — 실제 적용됨**: `customers`/`estimates` 테이블의 SELECT/UPDATE는 "로그인한 사람이 마스터이거나, `staff_name` 컬럼 값이 본인의 `staff_profiles.display_name`과 일치할 때만" 허용됩니다. 즉 **스태프는 본인이 담당하는 고객만 조회·수정 가능**하고, 다른 스태프의 고객 정보는 개발자도구로도 접근할 수 없습니다. DELETE는 마스터만 가능합니다.
- **⚠️ 남은 주의사항**: 신규 스태프 계정을 만들 때는 (1) Supabase Auth에 이메일+비밀번호 계정 생성, (2) `staff_profiles`에 `display_name`을 등록하는데 이 값이 `customers.staff_name`에 저장된 값과 **정확히 일치**해야 합니다(다르면 본인 고객도 못 봄). (3) 설정탭에서 로그인 이메일을 등록해야 합니다.

## 4. Supabase 스키마

프로젝트: `sradnglutbzbyyunjyah`

| 테이블 | 주요 컬럼 | 비고 |
|---|---|---|
| `customers` | `client_name, phone, addr, stage, staff_name, price, is_archived, ...` | 고객 정보 |
| `estimates` | `customer_name, price, performance_revenue, status, data(jsonb), ...` | 견적 기록 |
| `surveys` | `client_name, phone, addr, space, answers(jsonb), staff_name, status` | 설문 응답 (레거시 스키마, 단수형 컬럼명 주의). `status`는 제출 시 `'신규'`로 저장되고, `apps-script-survey-to-customer.js`가 처리 후 `'등록완료'`로 변경 |
| `as_records` | (마이그레이션만 존재, 앱에서 미사용) | AS 접수 — 기능 미구현 |

**데이터 보호**:
- 전 테이블 `is_archived` 컬럼으로 소프트 삭제 — 실제 DELETE는 RLS에서 마스터 전용으로 제한됨 (`migration_soft_delete.sql`, `migration_auth_rls.sql`)
- 모든 API 호출은 로그인 토큰(Supabase Auth) 기준으로 인증되며, RLS 정책이 스태프별 접근범위를 강제함 (3번 섹션 참고)
- **⚠️ 백업/임시 테이블(`*_backup_*`) 규칙**: 작업 중 스냅샷용으로 `customers_backup_YYYYMMDD` 같은 테이블을 만들 경우, **반드시 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`를 함께 실행**할 것. 정책을 안 만들어도 RLS만 켜두면 "누구도 접근 불가" 상태가 되어 안전합니다. (2026-08-26: 과거에 만든 백업 테이블 8개가 이 조치 없이 방치되어 외부 anon key로 조회 가능한 상태였던 것을 발견·수정함. 주기적으로 Supabase 보안 어드바이저로 재검사할 것.)

**⚠️ 로그인/권한/데이터 저장구조 관련 작업 시**: 코드를 고치기 전에 `CHANGE_IMPACT_CHECKLIST.md`를 먼저 읽으세요. 여러 화면에 걸쳐 영향을 주는 변경에서 반복적으로 발생했던 실수(전수조사 누락, 이름 충돌 등)를 방지하기 위한 체크리스트입니다.

**마이그레이션 SQL 실행 순서** (신규 환경 구축 시):
1. `supabase_setup.sql` → 기본 테이블 생성
2. `migration_v2.sql`, `migration_payment.sql` → 컬럼 추가
3. `migration_soft_delete.sql` → 삭제방지 적용 (필수)
4. `migration_surveys.sql`은 **실행하지 마세요** — surveys 테이블은 이미 다른 스키마로 존재함

## 5. Google Apps Script 자동화 (3개, 각각 별도 프로젝트로 배포)

| 스크립트 | 트리거 방식 | 역할 |
|---|---|---|
| `apps-script-automation-hub.js` | 웹 앱 (앱에서 실시간 호출) | 발주서/의뢰서/견적서를 카테고리별(제작/원단/블라인드/레일외 부자재/전동/실측시공/견적서)로 구글드라이브에 저장. 고객명단 구글시트("DAH_고객명단") 현황판 동기화 |
| `apps-script-daily-backup.js` | 시간 기반 트리거 (매일) | customers/estimates/surveys 전체를 JSON으로 구글드라이브("DAH_자동백업")에 영구 백업 |
| `apps-script-survey-to-customer.js` | 시간 기반 트리거 (분 단위, 예: 10분마다) | Supabase `surveys` 테이블에서 `status='신규'`인 설문을 찾아 `customers` 테이블에 자동 등록 후 `status='등록완료'`로 변경. ⚠️ 설치 후 `testProcessSurveys()`를 먼저 수동 실행해서 정상 동작을 확인하세요 (스크립트 상단 주석 참고) |

웹 앱으로 배포한 `apps-script-automation-hub.js`의 URL은 `dah-dashboard.html`과 `dah-estimate.html`의 `DRIVE_WEBHOOK_URL` 상수에 연결되어 있습니다.

**발주서 파일명 규칙**: `{견적번호 또는 날짜}_{고객명}_{거래처}.html` — 같은 견적번호로 재저장하면 기존 파일을 덮어씁니다 (며칠 뒤 수정해도 새 파일이 안 쌓임). 완전히 새 견적(새 견적번호)이면 새 파일이 생성됩니다.

## 6. 배포

- **호스팅**: Vercel (`dah-estimate.vercel.app`)
- **자동배포**: `main` 브랜치에 push되면 `.github/workflows/deploy.yml`이 Vercel 배포훅을 호출
- **수동배포** (비상용): 로컬에 클론된 레포에서
  ```bash
  git pull
  vercel --token <VERCEL_TOKEN> --prod --force
  ```

## 7. 테스트 / CI

`tests/` 폴더에 자동화된 회귀 테스트가 40여 개 있습니다 (Puppeteer 기반, `run-all.js`가 전체 실행). GitHub Actions로 **push할 때마다 자동 실행되며 정상 작동 중**입니다 (`.github/workflows/test.yml`).

로컬 실행:
```bash
node tests/run-all.js dah-dashboard.html
node tests/run-all.js dah-estimate.html
```

검사 항목(일부): 폰트 크기 정책 위반, 터치타겟 최소 크기(32px), 모바일 가로스크롤, 마스터/스태프 권한별 UI 노출, 로그인 흐름, 견적 계산, 매출 집계 정합성, 데이터 안전성(삭제/복구), 여러 기기 동기화, 경쟁 상태(race condition) 등. 자세한 내용은 `tests/README.md` 참고.

## 8. 알려진 제한사항 (개선 예정)

- **Supabase "Leaked Password Protection" 미활성화** — HaveIBeenPwned 대조 기능. Supabase 대시보드에서 토글만 켜면 되는데 아직 대기 중.
- **`!important` CSS 선언** — 대시보드/견적서 양쪽에 다수 존재. 대규모 정리를 진행했지만 완전히 0개로 만드는 것 자체가 목표는 아니며, "충돌 없이 정리된 상태"를 기준으로 판단 중. 대규모 일괄 정리는 반드시 실사용자가 화면을 직접 보며 검증할 수 있는 세션에서 진행할 것(무인 자동정리 금지 — 미묘한 시각적 회귀를 놓칠 수 있음).
- **AS(수리) 접수 기능** — `as_records` 테이블만 존재, 실제 UI 미구현. 구축 여부 결정 대기 중.
- **프랜차이즈 지점 분리 구조** — 현재 단일 사업자 기준 설계, 다중 지점 지원 안 됨.
- **원단 단가 자동계산 미구현** — 아래 9번 참고.
- **아이패드/아이폰(Safari, WebKit) 실기기 검증의 한계** — 개발 환경(Puppeteer/Chromium)은 크롬 엔진만 구동되어, 인쇄/PDF저장처럼 iOS 사파리에서만 재현되는 문제는 실기기 확인이 반드시 필요합니다.

## 9. 원단·거래처 정보 (하드코딩)

`dah-estimate.html`에 원단명(`fabric-list`)과 거래처명(`vendor-list`) datalist가 내장되어 있습니다. 새 거래처/원단 추가 시 해당 datalist에 직접 추가해야 합니다.

원단 단가 자동계산 기능은 아직 미구현 (단가표 정리되는 대로 추가 예정).
