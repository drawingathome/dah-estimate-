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
    Google Apps Script 자동화 허브
    ├─ 구글드라이브: 문서 자동저장 (카테고리별 정리)
    ├─ 구글시트: 고객명단 현황판 동기화
    └─ 구글드라이브: 매일 전체 데이터 백업 (영구보관)
```

## 2. 앱 3개

| 파일 | 배포 URL | 역할 |
|---|---|---|
| `dah-dashboard.html` | `/dashboard` | 고객 목록(칸반/검색), 매출 대시보드, 설정(직원관리·백업), 마스터/스태프 권한 구분 |
| `dah-estimate.html` | `/estimate` | 커튼·블라인드 견적서 작성, 발주서/실측·시공 의뢰서 자동생성 |
| `survey.html` | `/survey` | 고객용 사전 설문지 (React, 구글시트+Supabase 이중저장) |

루트(`/`)는 `dah-dashboard`로 리다이렉트됩니다 (`vercel.json`).

## 3. 로그인 / 권한

- **마스터**: 설정에서 변경 가능한 비밀번호로 로그인. 전체 기능 접근 가능
- **스태프**: 이름 선택만으로 로그인 (비밀번호 없음). 본인 담당 고객만 관리, 매출탭/설정탭 접근 불가
- ⚠️ **알려진 한계**: 현재 로그인은 브라우저(JS)에서만 검증하는 방식으로, 서버 측 인증이 아닙니다. 실질적인 보안은 Supabase RLS(행 단위 보안)가 담당합니다. 근본적으로 개선하려면 Supabase Auth 도입이 필요합니다 (계획 중, 아래 "알려진 제한사항" 참고).

## 4. Supabase 스키마

프로젝트: `sradnglutbzbyyunjyah`

| 테이블 | 주요 컬럼 | 비고 |
|---|---|---|
| `customers` | `client_name, phone, addr, stage, staff_name, price, is_archived, ...` | 고객 정보 |
| `estimates` | `customer_name, price, performance_revenue, status, data(jsonb), ...` | 견적 기록 |
| `surveys` | `client_name, phone, addr, space, answers(jsonb), staff_name, status` | 설문 응답 (레거시 스키마, 단수형 컬럼명 주의) |
| `as_records` | (마이그레이션만 존재, 앱에서 미사용) | AS 접수 — 기능 미구현 |

**데이터 보호**:
- 전 테이블 `is_archived` 컬럼으로 소프트 삭제 — 실제 DELETE는 RLS에서 완전 차단됨 (`migration_soft_delete.sql`)
- anon key(브라우저에 노출)로는 읽기/생성/수정만 가능, 삭제 불가

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
| `apps-script-survey-to-customer.js` | 구글폼 `onFormSubmit` 트리거 | 설문 제출 시 Supabase customers 테이블에 자동 등록 |

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

## 7. 테스트

`tests/` 폴더에 자동화된 회귀 테스트가 있습니다 (Puppeteer 기반).

```bash
node tests/run-all.js dah-dashboard.html
node tests/run-all.js dah-estimate.html
```

검사 항목: 폰트 크기 정책 위반, 터치타겟 최소 크기(32px), 모바일 가로스크롤, 마스터/스태프 권한별 UI 노출. 자세한 내용은 `tests/README.md` 참고.

## 8. 알려진 제한사항 (개선 예정)

- **로그인이 실제 인증이 아님** — Supabase Auth로 전환 필요 (프랜차이즈 확장 시 필수)
- **`!important` CSS 선언 1,200개 이상** — 대규모 리팩토링 필요, 위험도 높아 시각적 검증과 함께 진행 예정
- **파일 하나에 코드가 집중됨** (`dah-dashboard.html` ~3MB) — 컴포넌트/모듈 분리 안 됨
- **AS(수리) 접수 기능** — 테이블만 존재, 실제 UI 미구현
- **CI 테스트 자동화** — GitHub Actions 연결 준비 완료, GitHub 토큰에 `workflow` 권한 추가만 남음
- **프랜차이즈 지점 분리 구조** — 현재 단일 사업자 기준 설계, 다중 지점 지원 안 됨

## 9. 원단·거래처 정보 (하드코딩)

`dah-estimate.html`에 원단명(`fabric-list`)과 거래처명(`vendor-list`) datalist가 내장되어 있습니다. 새 거래처/원단 추가 시 해당 datalist에 직접 추가해야 합니다.

원단 단가 자동계산 기능은 아직 미구현 (단가표 정리되는 대로 추가 예정).
