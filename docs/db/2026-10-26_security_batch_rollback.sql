-- 2026-10-26 보안·감시 묶음 되돌리기 (적용 전 상태로)
drop trigger if exists trg_monthly_close_history on public.monthly_close;
drop function if exists public.trg_monthly_close_history();
-- 이력 표는 기록 보존을 위해 지우지 않음. 필요하면 별도로: drop table public.monthly_close_history;
create or replace view public.v_critical_triggers_status as
 SELECT (c.relname)::information_schema.sql_identifier AS table_name,
    (t.tgname)::information_schema.sql_identifier AS trigger_name,
    (string_agg(DISTINCT ev.e, '/'::text) COLLATE "C") AS fires_on
   FROM (((pg_trigger t
     JOIN pg_class c ON ((c.oid = t.tgrelid)))
     JOIN pg_namespace n ON (((n.oid = c.relnamespace) AND (n.nspname = 'public'::name))))
     CROSS JOIN LATERAL ( VALUES (4,'INSERT'::text), (8,'DELETE'::text), (16,'UPDATE'::text)) ev("bit", e))
  WHERE ((NOT t.tgisinternal) AND (t.tgenabled = 'O'::"char") AND (((t.tgtype)::integer & ev."bit") <> 0) AND (t.tgname = ANY (ARRAY['trg_enforce_estimate_status'::text, 'trg_estimate_history'::text, 'trg_customer_history'::text, 'trg_sync_customer_payment'::text, 'trg_guard_staff_name_customers'::text, 'trg_guard_staff_name_estimates'::text, 'trg_guard_payment_reduction_customers'::text, 'trg_guard_payment_reduction_estimates'::text, 'trg_guard_payment_date'::text, 'trg_guard_archived_estimate_payment'::text, 'trg_payment_refunds_append_only'::text])))
  GROUP BY c.relname, t.tgname;
drop policy if exists app_settings_insert on public.app_settings;
create policy app_settings_insert on public.app_settings for insert with check (((select auth.uid()) is not null));
-- 삭제한 master_pw 항목은 복원하지 않음(옛 비밀번호 재노출 방지).
