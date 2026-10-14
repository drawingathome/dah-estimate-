-- 2026-10-15 사고 수정: 10-14 점검 뷰 교체(create or replace view)가 뷰 옵션 security_invoker를 초기화해,
-- 실장 계정이 다른 담당자(마스터) 고객의 점검 항목을 API로 볼 수 있는 상태였음(모의 실행: 실장이 마스터 고객 이상 3건 보임 → 수정 후 0건).
-- 운영 DB 적용 완료. 앞으로 이 뷰를 create or replace 할 때는 반드시 아래 alter를 같이 실행(tests/view-security-invoker-check.js가 정적으로 검사).
alter view public.data_integrity_issues set (security_invoker = true);
