-- 2026-10-14 (2-2 마무리) 점검 뷰 data_integrity_issues의 OVERPAID·PAID_STAGE_NO_DEPOSIT 규칙이 고객 칸을 직접 더하지 않고
-- dah_received_amount()(앱과 같은 받은 돈 규칙)를 쓰도록 교체. 운영 DB 적용 완료.
-- 모의 실행(롤백)으로 변경 전후 점검 결과 동일(OVERPAID 이영욱 1건) 확인 후 적용. 뷰 권한(authenticated 조회, anon 없음) 유지 확인.
-- 되돌리기: 이 파일의 치환 문자열 n1↔o1, n2↔o2를 반대로 적용해 create or replace view.
DO $m$
declare d text; d2 text;
  o1 text := '((COALESCE(c.deposit_amount, (0)::numeric) + COALESCE(c.balance_amount, (0)::numeric)) > (c.price)::numeric)';
  n1 text := '(public.dah_received_amount(c.id) > (c.price)::numeric)';
  o2 text := '(COALESCE(c.deposit_amount, (0)::numeric) = (0)::numeric) AND (COALESCE(c.balance_amount, (0)::numeric) = (0)::numeric)';
  n2 text := '(public.dah_received_amount(c.id) = (0)::numeric)';
begin
  d := pg_get_viewdef('public.data_integrity_issues'::regclass);
  d2 := replace(replace(d, o1, n1), o2, n2);
  if position(n1 in d2) = 0 or position(n2 in d2) = 0 then raise exception '치환 실패'; end if;
  execute 'create or replace view public.data_integrity_issues as ' || d2;
  execute 'alter view public.data_integrity_issues set (security_invoker = true)'; -- create or replace가 옵션을 초기화하므로 반드시 다시 설정
end $m$;
