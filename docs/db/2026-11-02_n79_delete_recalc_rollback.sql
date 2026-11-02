-- N-79 ㉠ 되돌리기: 옛 "빼기" 방식 복원(2026-10-13 원본) + 새 계산 함수 삭제
create or replace function public.adjust_customer_amounts_on_estimate_delete()
returns trigger language plpgsql set search_path to 'public','pg_temp' as $$
begin
  if OLD.client_id is not null then
    update public.customers
       set price = greatest(0, coalesce(price, 0) - coalesce(OLD.price, 0))::bigint,
           performance_revenue = greatest(0, coalesce(performance_revenue, 0) - coalesce(OLD.performance_revenue, 0))::bigint
     where id = OLD.client_id;
  end if;
  return OLD;
end;
$$;
drop function if exists public.dah_customer_amounts(bigint);
