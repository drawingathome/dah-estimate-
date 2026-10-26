-- H-5 되돌리기: 적용 전 권한(읽기로 확인한 값: public·anon·authenticated·service_role·postgres 모두 실행 가능)으로 복원
grant execute on function public.customers_auto_stage_on_deposit() to public, anon, authenticated, service_role;
grant execute on function public.estimates_confirm_guard() to public, anon, authenticated, service_role;
