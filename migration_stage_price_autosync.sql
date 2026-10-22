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

-- ③ 단계 자동 이동: 선금 → 선금결제(기존) + 모든 견적서 완납 → 시공준비중(일부 잔금은 이동 안 함)
create or replace function public.customers_auto_stage_on_deposit()
returns trigger language plpgsql set search_path to '' as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.deposit_amount is distinct from OLD.deposit_amount
       and NEW.stage in ('방문예약','상담','가견적') and coalesce(NEW.deposit_amount,0) > 0 then
      NEW.stage := '선금결제';
    end if;
    if NEW.stage in ('방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제') then
      if public.dah_customer_fully_paid(NEW.id) then  -- 결정(2026-10-22): 완납일 때만 이동(일부 잔금은 이동 안 함)
        NEW.stage := '시공준비중';
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
