-- 2026-10-26(월) 보안·감시 묶음 — 선혜님 승인 후 적용. 되돌리기: 2026-10-26_security_batch_rollback.sql
-- 순서: (1) 단계 규칙 SQL(별도 파일, 먼저) → (2) 이 파일. 이 파일은 한 번에 실행해도 되고 항목별로 나눠 실행해도 됨.
-- 전수표 항목: T-04(설정표 새 항목 만들기 마스터 한정) / T-19(설정표에 남은 옛 비밀번호 삭제) / T-07(핵심 트리거 감시 목록 확장) / T-10(월 마감 변경 이력)

-- ── T-04: 설정표(app_settings)에 새 항목을 만드는 권한을 마스터로 한정 ──
-- 지금은 로그인한 누구나(실장 포함) 새 항목을 만들 수 있음. 아직 없는 항목(예: stage_rule_mode)을 실장이 먼저 만들어 버릴 수 있었음.
-- 수정(UPDATE)은 이미 마스터 한정. 앱은 같은 날 배포된 코드(설정 최초 올리기는 마스터 화면만)와 함께 동작.
drop policy if exists app_settings_insert on public.app_settings;
create policy app_settings_insert on public.app_settings for insert
  with check (exists (select 1 from public.staff_profiles where staff_profiles.id = (select auth.uid()) and staff_profiles.role = 'master'));

-- ── T-19: 설정표에 남아 있던 옛 마스터 비밀번호 항목 삭제 ──
-- 이 항목은 로그인한 모든 사용자가 읽을 수 있는 표에 있었음(앱은 더 이상 쓰지 않음). 삭제 전 값은 되돌리기 파일에 넣지 않음(비밀번호를 다시 노출하지 않으려고).
delete from public.app_settings where key = 'master_pw';

-- ── T-07: 핵심 트리거 감시 목록 확장 ──
create or replace view public.v_critical_triggers_status as
 SELECT (c.relname)::information_schema.sql_identifier AS table_name,
    (t.tgname)::information_schema.sql_identifier AS trigger_name,
    (string_agg(DISTINCT ev.e, '/'::text) COLLATE "C") AS fires_on
   FROM (((pg_trigger t
     JOIN pg_class c ON ((c.oid = t.tgrelid)))
     JOIN pg_namespace n ON (((n.oid = c.relnamespace) AND (n.nspname = 'public'::name))))
     CROSS JOIN LATERAL ( VALUES (4,'INSERT'::text), (8,'DELETE'::text), (16,'UPDATE'::text)) ev("bit", e))
  WHERE ((NOT t.tgisinternal) AND (t.tgenabled = 'O'::"char") AND (((t.tgtype)::integer & ev."bit") <> 0) AND (t.tgname = ANY (ARRAY[
    'trg_enforce_estimate_status'::text, 'trg_estimate_history'::text, 'trg_customer_history'::text, 'trg_sync_customer_payment'::text,
    'trg_guard_staff_name_customers'::text, 'trg_guard_staff_name_estimates'::text, 'trg_guard_payment_reduction_customers'::text,
    'trg_guard_payment_reduction_estimates'::text, 'trg_guard_payment_date'::text, 'trg_guard_archived_estimate_payment'::text,
    'trg_payment_refunds_append_only'::text,
    'trg_estimates_confirm_guard'::text, 'trg_sync_customer_price'::text, 'trg_adjust_customer_amounts_on_estimate_delete'::text,
    'trg_extra_payment_touch_customer'::text, 'trg_customers_auto_stage'::text])))
  GROUP BY c.relname, t.tgname;

-- ── T-10: 월 마감 변경 이력 ──
-- 마감값을 다시 마감(덮어쓰기)하거나 지우면 이전 값이 사라졌음. 바뀌기 직전 값을 이력 표에 남김.
create table if not exists public.monthly_close_history (
  id bigserial primary key,
  changed_at timestamptz not null default now(),
  action text not null,                 -- 'update' | 'delete'
  changed_by uuid default auth.uid(),
  month text,
  old_row jsonb not null
);
alter table public.monthly_close_history enable row level security;
drop policy if exists monthly_close_history_select on public.monthly_close_history;
create policy monthly_close_history_select on public.monthly_close_history for select
  using (exists (select 1 from public.staff_profiles s where s.id = (select auth.uid()) and s.role = 'master'));
-- 쓰기는 트리거(security definer)만 함. 일반 사용자 직접 쓰기 정책 없음.
create or replace function public.trg_monthly_close_history() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  insert into public.monthly_close_history(action, month, old_row) values (lower(TG_OP), OLD.month, to_jsonb(OLD));
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;
drop trigger if exists trg_monthly_close_history on public.monthly_close;
create trigger trg_monthly_close_history before update or delete on public.monthly_close
  for each row execute function public.trg_monthly_close_history();
