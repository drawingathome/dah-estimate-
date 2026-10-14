# 인수인계 · 사고 복구 안내 (2026-10-14 작성)

비밀번호·키 값은 이 문서에 적지 않습니다(저장소가 공개일 수 있음). 어디에 있는지만 적습니다.

## 1. 시스템이 어디에 있는가
| 구성요소 | 위치 | 비고 |
|---|---|---|
| 코드 | GitHub `drawingathome/dah-estimate-` (main) | main에 push → 자동 테스트 → Vercel 배포 → 운영 사후검증 |
| 배포 | Vercel (대시보드 `dah-dashboard.vercel.app`, 견적서 `dah-estimate.vercel.app`) | 배포 훅 주소는 GitHub Secrets `VERCEL_DEPLOY_HOOK_DASHBOARD` 등 |
| DB·로그인 | Supabase 프로젝트 `dahcurtain` (ref `sradnglutbzbyyunjyah`, 리전 ap-southeast-1) | 테이블·RLS·트리거·매일 점검(pg_cron `integrity-daily-check`) |
| 서버 함수 | Supabase Edge Function `generate-recovery-link` | 비밀번호 재설정 링크 |
| 자동화 | Google Apps Script 3개(`apps-script-*.js`) | 매일 백업·점검 메일, 설문→고객 등록, 문서 자동저장. 키는 Script Properties(`SUPABASE_SERVICE_ROLE_KEY`, `DAH_BRIDGE_SECRET_KEY`)에 있음 |
| 백업 | 구글 드라이브 `DAH_자동백업` 폴더, 매일 `DAH_백업_YYYY-MM-DD.json` | 자동 삭제 없음. 2026-10-14 현재 매일 생성 확인(최근 파일 약 9.8MB) |

## 2. 매일 자동으로 도는 것
- Supabase: 매일 07:00(한국시간) 데이터 점검 → `integrity_daily_log`. 이상이 있으면 대시보드 홈 점검 카드에 표시.
- 구글 스크립트(`dahDailyBackup`): 백업 저장 + 중복·정합성·핵심 트리거·DB 점검 결과 이메일 + 클라이언트 오류 이메일. 메일 본문에 **스크립트 버전**이 찍힘 — 저장소 최신(`DAH_SCRIPT_VERSION`)과 다르면 코드를 다시 붙여넣어야 한다.
- GitHub: 코드가 바뀔 때마다 전체 테스트(약 20분) + 운영 사후검증.

## 3. 사고 유형별 첫 대응
| 상황 | 먼저 할 일 |
|---|---|
| 숫자가 이상하다 | 대시보드 홈 점검 카드 → 해당 고객 변경 이력(고객 상세) 확인 → `docs/DATA_FIX_PROCEDURE.md` |
| 화면이 이상하다(배포 직후) | GitHub Actions에서 마지막 배포·사후검증 결과 확인 → 이전 정상 커밋으로 되돌리기(`git revert` 후 push) 또는 Vercel에서 이전 배포로 롤백 |
| 데이터가 사라졌다 | 변경 이력 표(`customer_history`, `estimate_history`)에서 삭제 전 내용 확인 → 없으면 구글 드라이브 최신 백업 JSON에서 해당 행 복원 |
| 직원 계정 문제 | Supabase Auth에서 계정 확인, `staff_profiles.display_name`이 고객의 담당자 이름과 일치하는지 확인 |
| 이메일이 안 온다 | Apps Script 실행 기록에서 오류 확인, 스크립트 버전 확인 |

## 4. 복구 단계 (순서)
1. 원인 파악 전까지 **추가 입력 중단**(직원에게 공지).
2. 최근 정상 시점 판단(변경 이력 표·백업 파일 날짜로).
3. 행 단위 복구: 백업 JSON(또는 변경 이력)에서 해당 행을 읽어 DB에 되돌린다 — `DATA_FIX_PROCEDURE.md` 절차(수정 전 값 기록·재검산) 준수. 환불·입금은 반드시 장부(`payment_refunds`)와 맞춰서.
4. 전체 복구가 필요하면 Supabase 자체 백업/시점 복구(PITR) 사용 — **현재 요금제에서 가능한지는 아직 확인되지 않음(선혜님 확인 필요)**.
5. 복구 후 `data_integrity_issues`·월 매출·고객 합계 대조로 확인.

## 5. 아직 검증되지 않은 것 (솔직하게)
- 백업 JSON으로 **전체를 새 DB에 복구해 본 적 없음**(구글 스크립트에 구조 검증용 `dahRestoreDrill`은 있으나 전체 복구 훈련은 아님). 분기마다 별도 환경에 복구해 숫자를 대조하는 훈련이 필요.
- Supabase 요금제의 자동 백업·PITR 범위 미확인.
- 마스터 계정 2단계 인증, 유출 비밀번호 보호 설정 미확인.
- 구글 드라이브 백업 폴더 공유 범위 확인 필요("나만").

## 6. 변경 전에 읽을 문서
`README.md`(구조) · `docs/BUSINESS_RULES.md`(업무 규칙) · `docs/DATA_FIX_PROCEDURE.md`(데이터 수정 절차) · `CHANGE_IMPACT_CHECKLIST.md`(변경 영향 점검표) · `CODE_MAP.md`(코드 지도).
