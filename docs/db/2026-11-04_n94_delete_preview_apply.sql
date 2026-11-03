-- N-94(N-79 ㉣): 견적서 삭제 확인창에 "삭제하면 고객 금액이 ○○원이 돼요"를 미리 보여주기 위한 읽기 전용 함수.
-- 데이터를 바꾸지 않음. 규칙은 dah_customer_amounts와 같다(결제된 견적서가 있으면 그 합, 없으면 가장 최근 견적서 금액).
-- 같은 규칙이 두 곳에 있게 되므로 아침 점검에 "두 함수 결과 불일치 0" 검사를 추가한다.
create or replace function public.dah_customer_amounts_after_delete(p_estimate_id uuid)
returns table(customer_id bigint, price bigint, performance_revenue bigint)
language sql stable security invoker set search_path to 'public','pg_temp' as $$
  with target as (select e.client_id cid from public.estimates e where e.id = p_estimate_id),
  live as (
    select e.* from public.estimates e, target t
    where e.client_id = t.cid and e.id <> p_estimate_id and not coalesce(e.is_archived,false)
  ), paid as (
    select * from live where public.dah_estimate_paid(live.id) > 0
  )
  select (select cid from target),
    case when exists(select 1 from paid) then coalesce((select sum(coalesce(p.price,0)) from paid p),0)
         else coalesce((select coalesce(l.price,0) from live l order by l.updated_at desc nulls last, l.created_at desc nulls last limit 1),0) end::bigint,
    case when exists(select 1 from paid) then coalesce((select sum(coalesce(p.performance_revenue,0)) from paid p),0)
         else coalesce((select coalesce(l.performance_revenue,0) from live l order by l.updated_at desc nulls last, l.created_at desc nulls last limit 1),0) end::bigint
  where exists (select 1 from target)
$$;
