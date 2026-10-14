-- 2026-10-14: 핵심 트리거 감시 뷰에 보호 트리거 7종 추가 + 꺼진(disabled) 트리거는 "없음"으로 취급. (운영 DB 적용 완료: critical_triggers_view_include_guards)
create or replace view public.v_critical_triggers_status as
select c.relname::information_schema.sql_identifier as table_name,
       t.tgname::information_schema.sql_identifier as trigger_name,
       (string_agg(distinct ev.e, '/'))::text collate "C" as fires_on
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
cross join lateral (values (4, 'INSERT'), (8, 'DELETE'), (16, 'UPDATE')) as ev(bit, e)
where not t.tgisinternal and t.tgenabled = 'O' and (t.tgtype & ev.bit) <> 0
  and t.tgname = any (array['trg_enforce_estimate_status','trg_estimate_history','trg_customer_history','trg_sync_customer_payment',
    'trg_guard_staff_name_customers','trg_guard_staff_name_estimates','trg_guard_payment_reduction_customers','trg_guard_payment_reduction_estimates',
    'trg_guard_payment_date','trg_guard_archived_estimate_payment','trg_payment_refunds_append_only'])
group by c.relname, t.tgname;
