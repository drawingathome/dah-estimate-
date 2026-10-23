-- 2026-10-23 (선혜님 승인 — "근본 수정"): 월 매출·성과매출 계산을 DB 한 곳으로.
-- 화면(기기)이 각자 계산하던 것을 이 함수가 돌려주는 "입금 건별 목록"으로 대체한다.
-- 규칙은 기존 independent_month_check(2026-10-14~)와 완전히 같다(복사). independent_month_check 는 이 함수의 합계로 바꿔
-- 계산식이 두 벌로 갈라지지 않게 한다(아래 2번).
-- SECURITY INVOKER: 호출한 사람의 권한(RLS)이 그대로 적용된다(직원은 본인 고객분만 보일 수 있음).

create or replace function public.month_revenue_detail(p_month text)
returns table(customer_id bigint, client_name text, staff_name text, kind text, pay_date text, revenue numeric, perf numeric)
language sql stable
set search_path to 'public'
as $function$
with cust as (
  select c.id, c.client_name, coalesce(nullif(c.staff_name,''),'마스터') staff_name, c.date::text cdate, coalesce(c.price,0) cprice,
         coalesce(nullif(c.performance_revenue,0),0) cperf,
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
xp as (select p.estimate_id eid, p.amount amt, p.paid_date::text d, p.created_at ca from estimate_extra_payments p),
estsum as (
  select client_id,
         sum(dep+bal) + coalesce((select sum(x.amt) from xp x join est e2 on e2.eid=x.eid where e2.client_id = est.client_id),0) paid,
         count(*) n
  from est group by client_id
),
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
exr as (
  select c.id, c.cdate, x.amt, x.d, e.price, case when e.perf>0 then e.perf else e.price end pfb, e.dep, e.bal,
         coalesce(sum(x.amt) over (partition by x.eid order by x.d, x.ca rows between unbounded preceding and 1 preceding),0) prior
  from cust c join est e on e.client_id=c.id join estsum s on s.client_id=c.id and s.paid>0
  join xp x on x.eid=e.eid
  where e.eid not in (select eid from est_ref)
),
ev as (
  select c.id, e.eid, e.perf eperf, e.price, e.dep, e.bal, x.d, x.amt, x.ord,
         case when e.price>0 then e.price when e.dep+e.bal>0 then e.dep+e.bal else 1 end tp
  from cust c
  join est e on e.client_id=c.id
  join estsum s on s.client_id=c.id and not (s.paid=0 and c.cdep+c.cbal>0)
  cross join lateral (
    select coalesce(e.dep_d, c.cdate) d, e.dep amt, 0 ord where e.dep>0
    union all select coalesce(e.bal_d, c.cdate), e.bal, 1 where e.bal>0
    union all select xx.d, xx.amt, 1 from xp xx where xx.eid=e.eid
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
  select id, 'dep' k, dep rev, case when price>0 then perf*least(dep,price)/price else 0 end pf, coalesce(dep_d, cdate) d from items where dep>0
  union all
  select id, 'bal', bal, case when price>0 then perf*least(bal, greatest(0,price-least(dep,price)))/price else 0 end, coalesce(bal_d, cdate) from items where bal>0
  union all
  select id, 'extra', amt, case when price>0 then pfb*least(amt, greatest(0, price - least(dep,price) - least(bal, greatest(0,price-least(dep,price))) - prior))/price else 0 end, d from exr
  union all
  select c.id, 'nopay', c.cprice, case when c.cperf>0 then c.cperf else c.cprice end, c.cdate
  from cust c
  where c.cdate is not null and c.cdep+c.cbal=0
    and coalesce((select paid from estsum s where s.client_id=c.id),0)=0
    and (c.memo ~ '플러그|Pluuug' or (current_date - c.cdate::date) >= 7)
  union all
  select id, 'refund', amt, pf_base * (least(greatest(run_net,0),tp) - least(greatest(run_net-amt,0),tp)) / tp, d from ev2
)
select c.id::bigint, c.client_name::text, c.staff_name::text, p.k::text, p.d::text, p.rev::numeric, p.pf::numeric
from parts p join cust c on c.id=p.id
where left(p.d,7)=p_month
order by p.d, c.client_name, p.k
$function$;

revoke all on function public.month_revenue_detail(text) from public, anon;
grant execute on function public.month_revenue_detail(text) to authenticated, service_role;
