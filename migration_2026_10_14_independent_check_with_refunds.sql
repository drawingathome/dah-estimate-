-- 2026-10-14: 월 마감 독립 검산(independent_month_check)에 환불 반영.
-- 화면 계산(splitCustomerPayments)의 환불 처리와 같은 규칙: 유효한 환불이 있는 견적서는 날짜순 "입금 +, 환불 -" 누계로 성과매출을 계산
-- (견적 총액이 상한), 환불이 없는 견적서는 기존 계산 그대로. 환불 취소(reversal)된 환불은 무시.
create or replace function public.independent_month_check(p_month text)
returns table(revenue numeric, perf_revenue numeric)
language sql stable set search_path to 'public' as $fn$
with cust as (
  select c.id, c.date::text cdate, coalesce(c.price,0) cprice, coalesce(nullif(c.performance_revenue,0),0) cperf,
         coalesce(c.deposit_amount,0) cdep, nullif(c.deposit_date::text,'') cdep_d,
         coalesce(c.balance_amount,0) cbal, nullif(c.balance_date::text,'') cbal_d, c.memo
  from customers c
  where coalesce(c.is_archived,false)=false and coalesce(c.stage,'') not in ('방문예약','상담','가견적')
),
est as (
  select e.id eid, e.client_id, coalesce(e.price,0) price, coalesce(e.performance_revenue,0) perf,
         coalesce(e.deposit_amount,0) dep, nullif(e.deposit_date::text,'') dep_d,
         coalesce(e.balance_amount,0) bal, nullif(e.balance_date::text,'') bal_d,
         row_number() over (partition by e.client_id order by e.created_at desc) rn
  from estimates e where e.client_id is not null
),
estsum as (select client_id, sum(dep+bal) paid, count(*) n from est group by client_id),
refs as (
  select r.estimate_id eid, r.amount, r.paid_date::text pd, r.refund_date::text rd
  from payment_refunds r
  where r.entry_type='refund' and r.amount>0 and not exists (select 1 from payment_refunds x where x.reverses_id=r.id)
),
est_ref as (select distinct eid from refs),
items as (
  select c.id, c.cdate, e.price, case when e.perf>0 then e.perf else e.price end perf, e.dep, e.dep_d, e.bal, e.bal_d
  from cust c join est e on e.client_id=c.id join estsum s on s.client_id=c.id and s.paid>0
  where e.eid not in (select eid from est_ref)
  union all
  select c.id, c.cdate, coalesce(nullif((select price from est x where x.client_id=c.id and x.rn=1),0), c.cprice),
         case when c.cperf>0 then c.cperf else coalesce(nullif((select price from est x where x.client_id=c.id and x.rn=1),0), c.cprice) end,
         c.cdep, c.cdep_d, c.cbal, c.cbal_d
  from cust c join estsum s on s.client_id=c.id and s.paid=0 where c.cdep+c.cbal>0
  union all
  select c.id, c.cdate, c.cprice, case when c.cperf>0 then c.cperf else c.cprice end, c.cdep, c.cdep_d, c.cbal, c.cbal_d
  from cust c where not exists (select 1 from estsum s where s.client_id=c.id) and c.cdep+c.cbal>0
),
ev as (
  select e.eid, e.perf eperf, e.price, e.dep, e.bal, x.d, x.amt, x.ord,
         case when e.price>0 then e.price when e.dep+e.bal>0 then e.dep+e.bal else 1 end tp
  from cust c
  join est e on e.client_id=c.id
  join estsum s on s.client_id=c.id and not (s.paid=0 and c.cdep+c.cbal>0)
  cross join lateral (
    select coalesce(e.dep_d, c.cdate) d, e.dep amt, 0 ord where e.dep>0
    union all select coalesce(e.bal_d, c.cdate), e.bal, 1 where e.bal>0
    union all select r.pd, r.amount, 2 from refs r where r.eid=e.eid
    union all select r.rd, -r.amount, 3 from refs r where r.eid=e.eid
  ) x
  where e.eid in (select eid from est_ref) and x.d is not null
),
ev2 as (
  select *, case when eperf>0 then eperf else tp end pf_base,
         sum(amt) over (partition by eid order by d, ord rows between unbounded preceding and current row) run_net
  from ev
),
parts as (
  select cdate, dep rev, case when price>0 then perf*least(dep,price)/price else 0 end pf, coalesce(dep_d, cdate) d from items where dep>0
  union all
  select cdate, bal, case when price>0 then perf*least(bal, greatest(0,price-least(dep,price)))/price else 0 end, coalesce(bal_d, cdate) from items where bal>0
  union all
  select c.cdate, c.cprice, case when c.cperf>0 then c.cperf else c.cprice end, c.cdate
  from cust c
  where c.cdate is not null and c.cdep+c.cbal=0
    and coalesce((select paid from estsum s where s.client_id=c.id),0)=0
    and (c.memo ~ '플러그|Pluuug' or (current_date - c.cdate::date) >= 7)
  union all
  select null::text, amt, pf_base * (least(greatest(run_net,0),tp) - least(greatest(run_net-amt,0),tp)) / tp, d from ev2
)
select coalesce(sum(rev),0)::numeric, coalesce(sum(pf),0)::numeric from parts where left(d,7)=p_month
$fn$;
