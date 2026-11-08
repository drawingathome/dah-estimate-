-- 2026-11-09 N-146(N-144 ⓓ): 감시 뷰에 11-07에 추가한 핵심 트리거 7개를 더한다 (16 -> 23개).
-- 컬럼·권한은 그대로(create or replace view, 컬럼 목록 동일). 뷰만 바뀌고 데이터·트리거는 안 바뀐다.
-- 순서: 이 SQL을 먼저 적용한 뒤에 apps-script-daily-backup.js의 EXPECTED 목록을 붙여넣는다(반대면 매일 거짓 알림).
create or replace view public.v_critical_triggers_status as
 SELECT (c.relname)::information_schema.sql_identifier AS table_name,
    (t.tgname)::information_schema.sql_identifier AS trigger_name,
    (string_agg(DISTINCT ev.e, '/'::text) COLLATE "C") AS fires_on
   FROM (((pg_trigger t
     JOIN pg_class c ON ((c.oid = t.tgrelid)))
     JOIN pg_namespace n ON (((n.oid = c.relnamespace) AND (n.nspname = 'public'::name))))
     CROSS JOIN LATERAL ( VALUES (4,'INSERT'::text), (8,'DELETE'::text), (16,'UPDATE'::text)) ev("bit", e))
  WHERE ((NOT t.tgisinternal) AND (t.tgenabled = 'O'::"char") AND (((t.tgtype)::integer & ev."bit") <> 0) AND (t.tgname = ANY (ARRAY['trg_enforce_estimate_status'::text, 'trg_estimate_history'::text, 'trg_customer_history'::text, 'trg_sync_customer_payment'::text, 'trg_guard_staff_name_customers'::text, 'trg_guard_staff_name_estimates'::text, 'trg_guard_payment_reduction_customers'::text, 'trg_guard_payment_reduction_estimates'::text, 'trg_guard_payment_date'::text, 'trg_guard_archived_estimate_payment'::text, 'trg_payment_refunds_append_only'::text, 'trg_estimates_confirm_guard'::text, 'trg_sync_customer_price'::text, 'trg_adjust_customer_amounts_on_estimate_delete'::text, 'trg_extra_payment_touch_customer'::text, 'trg_customers_auto_stage'::text, 'trg_customers_auto_stage_rule'::text, 'trg_customers_auto_stage_install'::text, 'trg_estimates_recheck_stage'::text, 'trg_extra_pay_recheck_stage'::text, 'trg_closed_month_guard_est'::text, 'trg_closed_month_guard_extra'::text, 'trg_closed_month_delete_guard'::text])))
  GROUP BY c.relname, t.tgname;
-- 뷰 교체 뒤 권한이 유지되는지 확인(기존: anon/authenticated/public 접근 없음, security_invoker=true)
alter view public.v_critical_triggers_status set (security_invoker = true);
