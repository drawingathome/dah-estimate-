-- 2026-10-06 DB 변경 기록 (이미 Supabase에 적용 완료 - 이 파일은 기록용이며 다시 실행해도 안전하도록 작성됨)
-- 선혜님 요청: "상세주소랑 따로 넣어도 왜 이렇게 뜨지?" + 보안 점검 + 결제 안 보임(문지윤님)

-- 1) 상세주소를 따로 저장하는 칸 추가 (addr는 기본주소+상세주소 합친 값 그대로 유지 - 실측요청서/알림톡 등이 계속 사용)
alter table public.customers add column if not exists addr_detail text;
comment on column public.customers.addr_detail is '상세주소(동/호수 등) 원본. addr는 기본주소+상세주소를 합친 값 - 이 칸이 있으면 화면이 기본주소/상세주소를 다시 나눠 보여줄 수 있음. 2026-10-06 추가';

-- 2) 보안 점검(Supabase advisors) 조치
alter view public.v_critical_triggers_status set (security_invoker = true);
alter view public.v_critical_constraints_status set (security_invoker = true);
revoke all on public.v_critical_triggers_status from anon, authenticated, public;
revoke all on public.v_critical_constraints_status from anon, authenticated, public;
alter function public.log_customer_history() set search_path = public, pg_temp;
alter function public.log_estimate_history() set search_path = public, pg_temp;
alter function public.enforce_estimate_status_from_confirmed_at() set search_path = public, pg_temp;
alter function public.sync_customer_payment_from_estimates() set search_path = public, pg_temp;
revoke execute on function public.log_customer_history() from public, anon, authenticated;
revoke execute on function public.log_estimate_history() from public, anon, authenticated;
-- 전화번호 중복확인: 로그인한 직원만(익명이 "이 번호가 등록돼 있나"를 물어볼 수 없게)
revoke execute on function public.check_phone_duplicate(text) from public, anon;
grant execute on function public.check_phone_duplicate(text) to authenticated, service_role;

-- 3) (1회성 데이터 보정, 재실행 불필요) 고객 레벨에만 있던 결제를 견적서 레벨로 복사 - 견적서 1건 + 금액 일치 고객 91명,
--    구정화(id 110) 선금 250만원. 결제 탭이 견적서 값만 읽어 선금/잔금이 비어 보이던 문제(문지윤님 등 93명)의 데이터 쪽 해결.
