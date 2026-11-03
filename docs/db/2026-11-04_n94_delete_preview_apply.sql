-- N-94(N-79 ㉣) 2판: 견적서 삭제 확인창 미리보기용 읽기 전용 함수. 데이터를 바꾸지 않음.
-- 실제 삭제 장치(adjust_customer_amounts_on_estimate_delete)와 같은 조건을 따른다:
--   고객 연결이 없는 견적서 → 결과 없음 / 메모에 플러그·Pluuug가 있는 고객 → 결과 없음(실제로 금액이 안 바뀜) / 그 외 → 삭제 후 재계산 값.
-- 실행 권한: 로그인한 사용자만(anon·public 회수). 로그인한 사용자 권한(RLS)으로 읽으므로 실제 삭제 장치와 같은 견적서만 보고 계산한다.
-- 같은 금액 규칙이 dah_customer_amounts와 두 곳에 있으므로 아침 점검에 '두 함수 불일치 0' 검사를 둔다(아래 주석 SQL).
create or replace function public.dah_customer_amounts_after_delete(p_estimate_id uuid)
returns table(customer_id bigint, price bigint, performance_revenue bigint)
language sql stable security invoker set search_path to 'public','pg_temp' as $$
  with target as (
    select e.client_id cid from public.estimates e
    where e.id = p_estimate_id and e.client_id is not null
      and not exists (select 1 from public.customers c where c.id = e.client_id and c.memo ~ '플러그|Pluuug')
  ),
  live as (
    select e.* from public.estimates e, target t
    where e.client_id = t.cid and e.id <> p_estimate_id and not coalesce(e.is_archived,false)
  ), paid as (
    select * from live where public.dah_estimate_paid(live.id) > 0
  )
  select (select cid from target),
    case when exists(select 1 from paid) then coalesce((select sum(coalesce(p.price,0)) from paid p),0)
         else coalesce((select coalesce(l.price,0) from live l order by l.updated_at desc nulls last, l.created_at desc nulls last, l.id limit 1),0) end::bigint,
    case when exists(select 1 from paid) then coalesce((select sum(coalesce(p.performance_revenue,0)) from paid p),0)
         else coalesce((select coalesce(l.performance_revenue,0) from live l order by l.updated_at desc nulls last, l.created_at desc nulls last, l.id limit 1),0) end::bigint
  where exists (select 1 from target)
$$;
revoke execute on function public.dah_customer_amounts_after_delete(uuid) from public, anon;
grant execute on function public.dah_customer_amounts_after_delete(uuid) to authenticated;
-- [아침 점검용 SQL, 읽기 전용] ① 견적서가 있는 고객마다: 한 견적서를 뺀 미리보기 = 그 견적서를 보관 처리한 뒤의 dah_customer_amounts 와 같은가
--   (운영에서는 보관 처리를 하지 않고, 대신 '견적서 1개뿐인 고객' 제외 후 두 함수의 규칙이 같은 데이터를 보는지로 대체: 아래 ②)
-- ② 고객과 견적서 담당자(staff_name)가 다른 건 수(정상 0, 실장 권한으로 재계산 시 일부 견적서가 가려지는 위험 감시):
--   select count(*) from customers c join estimates e on e.client_id=c.id where not coalesce(e.is_archived,false) and coalesce(e.staff_name,'')<>coalesce(c.staff_name,'');
