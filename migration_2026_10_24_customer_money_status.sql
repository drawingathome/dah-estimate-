-- 2026-10-24 (선혜님 — "완납인데 왜 미납으로 뜨지? 근본 원인을 찾아"): 고객별 "받은 금액·미수금"을 DB 한 곳에서 계산.
-- 원인: 홈·칸반·고객목록의 받은 금액/미수금이 기기(휴대폰)에 저장된 견적서 복사본(dah_saved)으로 계산되는데,
--       그 복사본은 견적서 탭·고객 상세를 열 때만 갱신됨 → 다른 기기(실장)가 입력한 잔금·추가결제가 이 기기엔 반영 안 된 채 "미수금"으로 보임.
-- 규칙은 앱의 getReceivedAmount/getAllEstPays와 같다: 견적서들의 (선금+잔금+추가결제) 합계, 견적서에 입금 기록이 전혀 없으면 고객 칸(선금+잔금).
-- SECURITY INVOKER: 호출한 사람의 권한(RLS)이 그대로 적용된다. 읽기 전용(데이터 변경 없음).
create or replace function public.customer_money_status()
returns table(customer_id bigint, price numeric, received numeric, unpaid numeric)
language sql stable
set search_path to 'public'
as $function$
with est as (
  select e.id eid, e.client_id, coalesce(e.deposit_amount,0)+coalesce(e.balance_amount,0) paid_main
  from estimates e where e.client_id is not null
),
xsum as (select p.estimate_id eid, sum(p.amount) amt from estimate_extra_payments p group by 1),
estsum as (
  select e.client_id, sum(e.paid_main + coalesce(x.amt,0)) paid
  from est e left join xsum x on x.eid = e.eid group by e.client_id
)
select c.id::bigint,
       coalesce(c.price,0)::numeric,
       r.received::numeric,
       greatest(0, coalesce(c.price,0) - r.received)::numeric
from customers c
left join estsum s on s.client_id = c.id
cross join lateral (select case when coalesce(s.paid,0) > 0 then s.paid else coalesce(c.deposit_amount,0)+coalesce(c.balance_amount,0) end received) r
where coalesce(c.is_archived,false) = false;
$function$;
revoke all on function public.customer_money_status() from public, anon;
grant execute on function public.customer_money_status() to authenticated, service_role;
