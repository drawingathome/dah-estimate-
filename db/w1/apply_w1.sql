-- W1 운영 적용: 전체가 한 트랜잭션. 중간에 하나라도 실패하면 아무것도 바뀌지 않음. (build-apply.sh 로 자동 생성 — 직접 고치지 말 것)
begin;
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
-- ① 단계·금액 자동 규칙
-- 2026-10-20  단계·기준금액을 DB가 한 곳에서 맞추기 (이민선·조유정·이상옥 사례)
-- 원칙: 화면(버튼) 코드가 아니라 DB 규칙이 단계·고객 기준금액을 맞춘다. 어느 화면에서 저장해도 같은 결과.
-- 안전: 애매한 경우(견적서 여러 개 중 일부만 입금 등)는 자동으로 옮기지 않고 점검 카드로만 알린다.

-- ① 견적서별 "받은 돈"(선금+잔금+추가결제)
create or replace function public.dah_estimate_paid(p_estimate_id uuid)
returns numeric language sql stable set search_path to 'public','pg_temp' as $$
  select coalesce(e.deposit_amount,0) + coalesce(e.balance_amount,0)
       + coalesce((select sum(x.amount) from public.estimate_extra_payments x where x.estimate_id = e.id),0)
  from public.estimates e where e.id = p_estimate_id
$$;

-- ② "모든 견적서가 완납"인지(금액이 있는 견적서 기준, 입금 있는 견적서가 최소 1개). 애매하면 false.
create or replace function public.dah_customer_fully_paid(p_customer_id bigint)
returns boolean language sql stable set search_path to 'public','pg_temp' as $$
  select exists (select 1 from public.estimates e where e.client_id = p_customer_id and not coalesce(e.is_archived,false)
                   and public.dah_estimate_paid(e.id) > 0)
     and not exists (select 1 from public.estimates e where e.client_id = p_customer_id and not coalesce(e.is_archived,false)
                   and coalesce(e.price,0) > 0 and public.dah_estimate_paid(e.id) < e.price)
$$;

-- ②-1 자동 이동 기록표: 규칙(DB)이 단계를 옮길 때마다 "언제·무엇에서 무엇으로·왜"를 남긴다. (사람이 직접 옮긴 것은 기록하지 않음)
create table if not exists public.customer_stage_auto_log (
  id bigint generated always as identity primary key,
  customer_id bigint not null,
  from_stage text,
  to_stage text not null,
  reason text not null,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index if not exists customer_stage_auto_log_customer_idx on public.customer_stage_auto_log (customer_id, changed_at desc);
alter table public.customer_stage_auto_log enable row level security;
drop policy if exists customer_stage_auto_log_select on public.customer_stage_auto_log;
create policy customer_stage_auto_log_select on public.customer_stage_auto_log for select using (
  (select auth.uid()) is not null and (
    exists (select 1 from public.staff_profiles p where p.id = (select auth.uid()) and p.role = 'master')
    or exists (select 1 from public.customers c join public.staff_profiles sp on sp.display_name = c.staff_name
               where c.id = customer_stage_auto_log.customer_id and sp.id = (select auth.uid()))
  )
);

-- ③ 단계 자동 이동: 선금 → 선금결제(기존) + 모든 견적서 완납 → 시공준비중(일부 잔금은 이동 안 함). 옮길 때마다 기록표에 남김.
create or replace function public.customers_auto_stage_on_deposit()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_from text;
begin
  if TG_OP = 'UPDATE' then
    if NEW.deposit_amount is distinct from OLD.deposit_amount
       and NEW.stage in ('방문예약','상담','가견적') and coalesce(NEW.deposit_amount,0) > 0 then
      v_from := NEW.stage;
      NEW.stage := '선금결제';
      insert into public.customer_stage_auto_log(customer_id, from_stage, to_stage, reason)
        values (NEW.id, v_from, NEW.stage, '선금 입금이 기록되어 자동 이동');
    end if;
    if NEW.stage in ('방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제') then
      if public.dah_customer_fully_paid(NEW.id) then  -- 결정(2026-10-22): 완납일 때만 이동(일부 잔금은 이동 안 함)
        v_from := NEW.stage;
        NEW.stage := '시공준비중';
        insert into public.customer_stage_auto_log(customer_id, from_stage, to_stage, reason)
          values (NEW.id, v_from, NEW.stage, '모든 견적서가 완납되어 자동 이동');
      end if;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_customers_auto_stage on public.customers;
create trigger trg_customers_auto_stage before update of deposit_amount, balance_amount, price on public.customers
  for each row execute function public.customers_auto_stage_on_deposit();

-- ④ 고객 기준금액(price / performance_revenue) = 입금이 있는 견적서들의 합계 (견적서가 바뀔 때마다 DB가 다시 계산)
create or replace function public.sync_customer_price_from_estimates()
returns trigger language plpgsql set search_path to 'public','pg_temp' as $$
declare cid bigint; p numeric; r numeric; has_paid boolean;
begin
  foreach cid in array array[NEW.client_id, case when TG_OP='UPDATE' and OLD.client_id is distinct from NEW.client_id then OLD.client_id end] loop
    continue when cid is null;
    continue when exists (select 1 from public.customers c where c.id = cid and c.memo ~ '플러그|Pluuug');  -- 결정(2026-10-22): 플러그 이관 고객은 자동 재계산 제외
    select coalesce(sum(e.price),0), coalesce(sum(e.performance_revenue),0), count(*) > 0
      into p, r, has_paid
      from public.estimates e where e.client_id = cid and not coalesce(e.is_archived,false) and public.dah_estimate_paid(e.id) > 0;
    if has_paid then
      update public.customers set price = p::bigint, performance_revenue = r::bigint
       where id = cid and (price is distinct from p::bigint or performance_revenue is distinct from r::bigint);
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists trg_sync_customer_price on public.estimates;
create trigger trg_sync_customer_price after insert or update of price, performance_revenue, deposit_amount, balance_amount, is_archived, client_id on public.estimates
  for each row execute function public.sync_customer_price_from_estimates();

-- ⑤ 점검 카드: "모든 견적서 완납인데 단계가 뒤처짐" 추가 + "확정견적 2건"(견적서가 여러 개인 고객은 정상) 제외
create or replace view public.data_integrity_issues with (security_invoker = true) as
 select b.code, b.severity, b.customer_id, b.client_name, b.staff_name, b.detail
   from public.data_integrity_issues_base b where b.code <> 'MULTI_FINAL'
 union all
 select 'CONFIRM_MISSING'::text, 'warn'::text, c.id, c.client_name, c.staff_name,
        ('진행 단계(' || c.stage || ')인데 확정된 견적서가 없음(가견적) - 확정 후 저장했는지, 의도한 상태인지 확인')
   from public.customers c
  where not coalesce(c.is_archived,false) and c.stage = any (array['확정견적','잔금결제','시공준비중'])
    and exists (select 1 from public.estimates x where x.client_id = c.id and not coalesce(x.is_archived,false))
    and not exists (select 1 from public.estimates x where x.client_id = c.id and not coalesce(x.is_archived,false) and x.confirmed_at is not null)
 union all
 select 'PAY_DATE_MISMATCH'::text, 'warn'::text, c.id, c.client_name, c.staff_name,
        ('고객 칸 입금일(' || coalesce(nullif(c.deposit_date,''),'없음') || ')이 견적서 최신 입금일(' || e.ed || ')과 다름')
   from public.customers c
   join lateral (select max(x.deposit_date) filter (where x.deposit_date is not null and x.deposit_date <> '') as ed
                   from public.estimates x where x.client_id = c.id and not coalesce(x.is_archived,false)) e on true
  where not coalesce(c.is_archived,false) and e.ed is not null and coalesce(c.deposit_date,'') <> e.ed
 union all
 select 'PAY_DATE_MISMATCH'::text, 'warn'::text, c.id, c.client_name, c.staff_name,
        ('고객 칸 잔금일(' || coalesce(nullif(c.balance_date,''),'없음') || ')이 견적서 최신 잔금일(' || e.ed || ')과 다름')
   from public.customers c
   join lateral (select max(x.balance_date) filter (where x.balance_date is not null and x.balance_date <> '') as ed
                   from public.estimates x where x.client_id = c.id and not coalesce(x.is_archived,false)) e on true
  where not coalesce(c.is_archived,false) and e.ed is not null and coalesce(c.balance_date,'') <> e.ed
 union all
 select 'ESTIMATE_UNCONFIRMED_PAID'::text, 'warn'::text, c.id, c.client_name, c.staff_name,
        ('입금 ' || to_char(p.paid,'FM999,999,999,999') || '원이 있는 견적서(총액 ' || to_char(coalesce(e.price,0),'FM999,999,999,999') || '원)가 아직 가견적 - 확정이 필요한지 확인')
   from public.estimates e
   join public.customers c on c.id = e.client_id
  cross join lateral (select public.dah_estimate_paid(e.id) as paid) p
  where not coalesce(e.is_archived,false) and not coalesce(c.is_archived,false) and e.confirmed_at is null and p.paid > 0
    and c.stage = any (array['확정견적','잔금결제','시공준비중'])
    and exists (select 1 from public.estimates y where y.client_id = c.id and not coalesce(y.is_archived,false) and y.confirmed_at is not null)
 union all
 select 'PAID_STAGE_LAG'::text, 'warn'::text, c.id, c.client_name, c.staff_name,
        ('모든 견적서가 완납인데 단계가 아직 ' || c.stage || ' - 시공준비중으로 옮길 때가 됐는지 확인')
   from public.customers c
  where not coalesce(c.is_archived,false)
    and c.stage = any (array['방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제'])
    and public.dah_customer_fully_paid(c.id);
-- ② 추가결제 보완
-- 2026-10-22 추가결제가 입력·수정·삭제되면 고객 단계·기준금액 규칙을 다시 돌린다 (추가결제로 완납돼도 단계가 안 움직이던 허점 보완)
-- 선행: migration_stage_price_autosync.sql (dah_estimate_paid 함수 필요)
-- 추가결제가 입력·수정·삭제되면 고객 단계/기준금액 규칙을 다시 돌린다 (S5 보완)
create or replace function public.extra_payment_touch_customer() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $$
declare cid bigint;
begin
  cid := coalesce(case when TG_OP='DELETE' then OLD.client_id else NEW.client_id end,
                  (select client_id from public.estimates where id = case when TG_OP='DELETE' then OLD.estimate_id else NEW.estimate_id end));
  if cid is not null then
    -- 기준금액 재계산(입금 있는 견적서 합계) 후, price를 SET 목록에 넣어 단계 규칙 트리거를 깨운다
    update public.customers c set price = coalesce((
        select sum(e.price)::bigint from public.estimates e
         where e.client_id = cid and not coalesce(e.is_archived,false) and public.dah_estimate_paid(e.id) > 0), c.price),
      performance_revenue = coalesce((
        select sum(e.performance_revenue)::bigint from public.estimates e
         where e.client_id = cid and not coalesce(e.is_archived,false) and public.dah_estimate_paid(e.id) > 0), c.performance_revenue)
    where c.id = cid;
  end if;
  return null;
end $$;
drop trigger if exists trg_extra_payment_touch_customer on public.estimate_extra_payments;
create trigger trg_extra_payment_touch_customer after insert or update or delete on public.estimate_extra_payments
  for each row execute function public.extra_payment_touch_customer();
-- ③ 확정 보호
-- 2026-10-22 확정 보호: 확정 해제에는 사유 필수 + 확정/해제 기록표(RLS 포함). 앱(est-form-controls.js)은 이미 사유를 함께 보냄.
-- ③ 확정 보호 (정식본: RLS 포함, 문서 2026-10-17 A)

alter table public.estimates add column if not exists unconfirm_reason text;

create table if not exists public.estimate_confirm_log (
  id bigint generated always as identity primary key,
  estimate_id uuid not null,
  client_id bigint,
  action text not null check (action in ('confirm','unconfirm')),
  reason text,
  confirmed_at_before timestamptz,
  confirmed_at_after timestamptz,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
alter table public.estimate_confirm_log enable row level security;

drop policy if exists estimate_confirm_log_select on public.estimate_confirm_log;
create policy estimate_confirm_log_select on public.estimate_confirm_log for select using (
  (select auth.uid()) is not null and (
    exists (select 1 from public.staff_profiles p where p.id = (select auth.uid()) and p.role = 'master')
    or exists (select 1 from public.estimates e
               where e.id = estimate_confirm_log.estimate_id
                 and e.staff_name = (select sp.display_name from public.staff_profiles sp where sp.id = (select auth.uid())))
  )
);

create or replace function public.estimates_confirm_guard() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_reason text;
begin
  if TG_OP = 'UPDATE' and OLD.confirmed_at is distinct from NEW.confirmed_at then
    v_reason := nullif(btrim(coalesce(NEW.unconfirm_reason, '')), '');
    if OLD.confirmed_at is not null and NEW.confirmed_at is null then
      if auth.uid() is not null and v_reason is null then
        raise exception '확정 해제에는 사유가 필요합니다. 견적서 화면의 "확정" 버튼으로 사유를 선택해 해제해 주세요.' using errcode = '42501';
      end if;
      insert into public.estimate_confirm_log(estimate_id, client_id, action, reason, confirmed_at_before, confirmed_at_after)
        values (OLD.id, OLD.client_id, 'unconfirm', coalesce(v_reason, '(관리자 작업)'), OLD.confirmed_at, NEW.confirmed_at);
    elsif NEW.confirmed_at is not null then
      insert into public.estimate_confirm_log(estimate_id, client_id, action, reason, confirmed_at_before, confirmed_at_after)
        values (OLD.id, OLD.client_id, 'confirm', null, OLD.confirmed_at, NEW.confirmed_at);
    end if;
  end if;
  if TG_OP = 'UPDATE' then NEW.unconfirm_reason := null; end if;
  return NEW;
end $f$;

drop trigger if exists trg_estimates_confirm_guard on public.estimates;
create trigger trg_estimates_confirm_guard
  before update on public.estimates
  for each row execute function public.estimates_confirm_guard();
-- 적용 직후 자동 검증: 하나라도 틀리면 예외 → 전체 취소(트랜잭션)
do $$
declare n int; d int;
begin
  -- 고객/견적서 값이 하나도 바뀌지 않았는가 (적용은 구조만 바꾸고 데이터는 건드리면 안 됨)
  select count(*) into d from public.customers c join backup_w1_20261022.customers b using (id)
   where to_jsonb(c) is distinct from to_jsonb(b);
  if d <> 0 then raise exception '검증 실패: 고객 % 건이 적용 중 바뀜', d; end if;
  select count(*) into d from public.estimates e join backup_w1_20261022.estimates b using (id)
   where e.id is not null and (e.price, e.performance_revenue, e.deposit_amount, e.balance_amount, e.confirmed_at, e.client_id, e.is_archived)
         is distinct from (b.price, b.performance_revenue, b.deposit_amount, b.balance_amount, b.confirmed_at, b.client_id, b.is_archived);
  if d <> 0 then raise exception '검증 실패: 견적서 % 건이 적용 중 바뀜', d; end if;
  select count(*) into n from public.customers; select count(*) into d from backup_w1_20261022.customers;
  if n <> d then raise exception '검증 실패: 고객 수 % -> %', d, n; end if;
  -- 새 규칙이 실제로 존재하는가
  for n in select 1 where not exists (select 1 from pg_trigger where tgname='trg_customers_auto_stage' and tgrelid='public.customers'::regclass) loop raise exception '검증 실패: 단계 트리거 없음'; end loop;
  for n in select 1 where not exists (select 1 from pg_trigger where tgname='trg_sync_customer_price') loop raise exception '검증 실패: 금액 트리거 없음'; end loop;
  for n in select 1 where not exists (select 1 from pg_trigger where tgname='trg_extra_payment_touch_customer') loop raise exception '검증 실패: 추가결제 트리거 없음'; end loop;
  for n in select 1 where not exists (select 1 from pg_trigger where tgname='trg_estimates_confirm_guard') loop raise exception '검증 실패: 확정 보호 트리거 없음'; end loop;
  -- 보안: 점검 뷰 security_invoker, 기록표 RLS
  for n in select 1 where not exists (select 1 from pg_class where relname='data_integrity_issues' and relnamespace='public'::regnamespace and 'security_invoker=true' = any(reloptions)) loop raise exception '검증 실패: 점검 뷰 security_invoker 꺼짐'; end loop;
  for n in select 1 where not exists (select 1 from pg_class where relname='estimate_confirm_log' and relrowsecurity) loop raise exception '검증 실패: 확정 기록표 RLS 꺼짐'; end loop;
  for n in select 1 where not exists (select 1 from pg_class where relname='customer_stage_auto_log' and relrowsecurity) loop raise exception '검증 실패: 자동 이동 기록표 RLS 꺼짐'; end loop;
  -- 기존 점검 뷰가 여전히 읽힘
  perform count(*) from public.data_integrity_issues;
end $$;
commit;
