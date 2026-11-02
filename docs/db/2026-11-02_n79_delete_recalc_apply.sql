-- N-79 ㉠: 견적서를 삭제하면 고객 금액을 "빼기"가 아니라 "남은 견적서로 다시 계산"한다.
-- 사고(11-02 17:53): 한은실(윤세현) 고객의 옛 견적서 2건(24,608,000·21,325,000원)을 정리하자 DB 장치가 그 금액을
-- 고객 금액(11,914,000원)에서 무조건 빼서 0이 됨. 고객 금액 규칙(2026-10-14 선혜님): 입금 있는 견적서(계약 건)가 있으면 그 합계,
-- 없으면 가장 최근에 저장한 견적서 금액(예상 금액, 합산 안 함).
-- 변경 대상은 함수 2개뿐(표·열·정책 변경 없음). 운영 데이터는 이 SQL로 바뀌지 않음(앞으로 견적서를 지울 때의 동작만 바뀜).
create or replace function public.dah_customer_amounts(p_customer_id bigint)
returns table(price bigint, performance_revenue bigint)
language sql stable set search_path to 'public','pg_temp' as $$
  with live as (
    select e.* from public.estimates e where e.client_id = p_customer_id and not coalesce(e.is_archived,false)
  ), paid as (
    select * from live where public.dah_estimate_paid(live.id) > 0
  )
  select
    case when exists(select 1 from paid) then coalesce((select sum(coalesce(p.price,0)) from paid p),0)
         else coalesce((select coalesce(l.price,0) from live l order by l.updated_at desc nulls last, l.created_at desc nulls last limit 1),0) end::bigint,
    case when exists(select 1 from paid) then coalesce((select sum(coalesce(p.performance_revenue,0)) from paid p),0)
         else coalesce((select coalesce(l.performance_revenue,0) from live l order by l.updated_at desc nulls last, l.created_at desc nulls last limit 1),0) end::bigint
$$;

create or replace function public.adjust_customer_amounts_on_estimate_delete()
returns trigger language plpgsql set search_path to 'public','pg_temp' as $$
declare np bigint; nr bigint;
begin
  if OLD.client_id is not null
     and not exists (select 1 from public.customers c where c.id = OLD.client_id and c.memo ~ '플러그|Pluuug') then  -- 플러그 이관 고객은 자동 재계산 제외(결정 2026-10-22)
    select a.price, a.performance_revenue into np, nr from public.dah_customer_amounts(OLD.client_id) a;
    update public.customers set price = np, performance_revenue = nr
     where id = OLD.client_id and (price is distinct from np or performance_revenue is distinct from nr);
  end if;
  return OLD;
end;
$$;
