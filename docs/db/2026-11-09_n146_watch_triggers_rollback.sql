-- 2026-11-09 N-146 되돌리기: 감시 뷰를 적용 전(16개)으로
create or replace view public.v_critical_triggers_status as
 SELECT (c.relname)::information_schema.sql_identifier AS table_name,
    (t.tgname)::information_schema.sql_identifier AS trigger_name,
    (string_agg(DISTINCT ev.e, '/'::text) COLLATE "C") AS fires_on
   FROM (((pg_trigger t
     JOIN pg_class c ON ((c.oid = t.tgrelid)))
     JOIN pg_namespace n ON (((n.oid = c.relnamespace) AND (n.nspname = 'public'::name))))
     CROSS JOIN LATERAL ( VALUES (4,'INSERT'::text), (8,'DELETE'::text), (16,'UPDATE'::text)) ev("bit", e))
  WHERE ((NOT t.tgisinternal) AND (t.tgenabled = 'O'::"char") AND (((t.tgtype)::integer & ev."bit") <> 0) AND (t.tgname = ANY (ARRAY['trg_enforce_estimate_status'::text, 'trg_estimate_history'::text, 'trg_customer_history'::text, 'trg_sync_customer_payment'::text, 'trg_guard_staff_name_customers'::text, 'trg_guard_staff_name_estimates'::text, 'trg_guard_payment_reduction_customers'::text, 'trg_guard_payment_reduction_estimates'::text, 'trg_guard_payment_date'::text, 'trg_guard_archived_estimate_payment'::text, 'trg_payment_refunds_append_only'::text, 'trg_estimates_confirm_guard'::text, 'trg_sync_customer_price'::text, 'trg_adjust_customer_amounts_on_estimate_delete'::text, 'trg_extra_payment_touch_customer'::text, 'trg_customers_auto_stage'::text])))
  GROUP BY c.relname, t.tgname;
