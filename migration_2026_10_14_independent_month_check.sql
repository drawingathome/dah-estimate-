-- 2026-10-14 D1: 월 매출 "독립 검산" 함수.
-- 화면(dash-chart.js splitCustomerPayments)과 다른 곳(DB)에서 같은 규칙을 한 번 더 계산해, 월 마감 전에 두 숫자가 같은지 비교한다.
-- 규칙(화면과 동일): 계약 이전 단계(방문예약/상담/가견적)·삭제 고객 제외 / 견적서별 입금을 입금일 달에 배분(입금일 없으면 고객 등록일) /
-- 성과매출 = (그 견적서 성과매출, 없으면 총액) × 입금액÷총액(총액 상한) / 견적서에 입금이 전혀 없고 고객 칸에만 있으면 고객 칸 입금 사용 /
-- 견적서가 없고 입금도 없는 옛 이관 고객(플러그 메모 또는 등록 7일 경과)은 등록일 달에 총액 전체.
create or replace function public.independent_month_check(p_month text)
returns table(revenue numeric, perf_revenue numeric)
language sql stable security invoker set search_path = public as $$
with cust as (
  select c.id, c.date::text cdate, coalesce(c.price,0) cprice, coalesce(nullif(c.performance_revenue,0),0) cperf,
         coalesce(c.deposit_amount,0) cdep, nullif(c.deposit_date::text,'') cdep_d,
         coalesce(c.balance_amount,0) cbal, nullif(c.balance_date::text,'') cbal_d, c.memo
  from customers c
  where coalesce(c.is_archived,false)=false and coalesce(c.stage,'') not in ('방문예약','상담','가견적')
),
est as (
  select e.client_id, coalesce(e.price,0) price, coalesce(e.performance_revenue,0) perf,
         coalesce(e.deposit_amount,0) dep, nullif(e.deposit_date::text,'') dep_d,
         coalesce(e.balance_amount,0) bal, nullif(e.balance_date::text,'') bal_d,
         row_number() over (partition by e.client_id order by e.created_at desc) rn
  from estimates e where e.client_id is not null
),
estsum as (select client_id, sum(dep+bal) paid, count(*) n from est group by client_id),
-- 사용할 "결제 항목" 목록
items as (
  -- 1) 견적서 기준 (견적서에 입금이 하나라도 있을 때)
  select c.id, c.cdate, e.price, case when e.perf>0 then e.perf else e.price end perf, e.dep, e.dep_d, e.bal, e.bal_d
  from cust c join est e on e.client_id=c.id join estsum s on s.client_id=c.id and s.paid>0
  union all
  -- 2) 견적서는 있으나 입금 0, 고객 칸에만 입금 있음: 최신 견적서 총액 기준, 고객 칸 입금 사용
  select c.id, c.cdate, coalesce(nullif((select price from est x where x.client_id=c.id and x.rn=1),0), c.cprice),
         case when c.cperf>0 then c.cperf else coalesce(nullif((select price from est x where x.client_id=c.id and x.rn=1),0), c.cprice) end,
         c.cdep, c.cdep_d, c.cbal, c.cbal_d
  from cust c join estsum s on s.client_id=c.id and s.paid=0 where c.cdep+c.cbal>0
  union all
  -- 3) 견적서 없음: 고객 칸 입금
  select c.id, c.cdate, c.cprice, case when c.cperf>0 then c.cperf else c.cprice end, c.cdep, c.cdep_d, c.cbal, c.cbal_d
  from cust c where not exists (select 1 from estsum s where s.client_id=c.id) and c.cdep+c.cbal>0
),
parts as (
  select cdate, dep rev, case when price>0 then perf*least(dep,price)/price else 0 end pf, coalesce(dep_d, cdate) d from items where dep>0
  union all
  select cdate, bal, case when price>0 then perf*least(bal, greatest(0,price-least(dep,price)))/price else 0 end, coalesce(bal_d, cdate) from items where bal>0
  union all
  -- 4) 옛 이관 고객: 입금 기록이 전혀 없음 → 등록일 달 총액 전체
  select c.cdate, c.cprice, case when c.cperf>0 then c.cperf else c.cprice end, c.cdate
  from cust c
  where c.cdate is not null and c.cdep+c.cbal=0
    and coalesce((select paid from estsum s where s.client_id=c.id),0)=0
    and (c.memo ~ '플러그|Pluuug' or (current_date - c.cdate::date) >= 7)
)
select coalesce(sum(rev),0)::numeric, coalesce(sum(pf),0)::numeric from parts where left(d,7)=p_month
$$;
revoke all on function public.independent_month_check(text) from public, anon;
grant execute on function public.independent_month_check(text) to authenticated;
