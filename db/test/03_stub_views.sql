-- 점검 뷰는 이 시험의 대상이 아니므로 같은 열 구조의 빈 뷰로 대신한다(운영 뷰는 매우 김).
create or replace view public.data_integrity_issues_base as
  select null::text as code, null::text as severity, null::bigint as customer_id, null::text as client_name, null::text as staff_name, null::text as detail where false;
create or replace view public.data_integrity_issues with (security_invoker = true) as
  select code, severity, customer_id, client_name, staff_name, detail from public.data_integrity_issues_base;
grant select on public.data_integrity_issues to authenticated;
