-- ============================================================
-- [제안·미적용] H-5 보안 경고 정리: 트리거 전용 함수 2개의 외부 호출 권한 닫기 (2026-10-27)
-- 상태: 운영 DB에 실행하지 않았음. 선혜님 승인 후에만 적용.
-- 왜: 이 두 함수는 DB 트리거가 내부에서만 쓰는 함수(반환형 trigger)인데, anon(로그인 안 한 사람)·authenticated(로그인한 사람)에게
--     실행 권한이 열려 있어 보안 점검(Supabase advisor)이 경고함. 반환형이 trigger라 직접 호출은 어차피 불가능해 위험은 낮지만 경고를 없앤다.
-- 안전한 이유: 트리거 함수는 "트리거를 만들 때"만 실행 권한을 검사하고, 트리거가 발동할 때는 검사하지 않는다(PostgreSQL 동작).
--     그래서 권한을 닫아도 고객 입금 시 자동 단계 이동·견적서 확정 보호 동작은 그대로다 → 예행(가짜 DB)으로 확인.
-- 유지: get_public_estimate(고객 링크용 공개 함수)는 건드리지 않음.
-- 되돌리기: 2026-10-27_h5_trigger_fn_revoke_rollback.sql
-- ============================================================
revoke execute on function public.customers_auto_stage_on_deposit() from public, anon, authenticated;
revoke execute on function public.estimates_confirm_guard() from public, anon, authenticated;
-- service_role과 소유자(postgres)의 권한은 그대로 둔다.
