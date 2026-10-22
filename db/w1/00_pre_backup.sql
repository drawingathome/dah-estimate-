-- 적용 직전 백업: 별도 스키마(API에 노출되지 않음)에 현재 상태 복사. 확인 후 삭제.
create schema if not exists backup_w1_20261022;
revoke all on schema backup_w1_20261022 from public, anon, authenticated;
create table backup_w1_20261022.customers as select * from public.customers;
create table backup_w1_20261022.estimates as select * from public.estimates;
create table backup_w1_20261022.estimate_extra_payments as select * from public.estimate_extra_payments;
-- 바꾸기 전 함수/트리거 정의(되돌리기용)
create table backup_w1_20261022.old_defs as
  select 'function'::text kind, p.proname::text name, pg_get_functiondef(p.oid) def from pg_proc p
   where p.pronamespace='public'::regnamespace and p.proname in ('customers_auto_stage_on_deposit')
  union all
  select 'trigger', t.tgname::text, pg_get_triggerdef(t.oid) from pg_trigger t where t.tgname in ('trg_customers_auto_stage') and not t.tgisinternal
  union all
  select 'view', c.relname::text, pg_get_viewdef(c.oid, true) from pg_class c where c.relnamespace='public'::regnamespace and c.relname='data_integrity_issues';
