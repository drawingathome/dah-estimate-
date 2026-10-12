-- 2026-10-13(김성은 사례): 견적서를 삭제해도 고객의 매출기준금액(price)·성과매출(performance_revenue)에서 그 몫이 안 빠져
-- 지운 견적서 금액이 유령처럼 남았음(실제 견적 6,203,000원인데 고객 금액 14,171,000원).
-- 두 값은 "고객의 모든 견적서 합계"를 앱이 저장 때 계산해 넣는 값이라, 삭제 때는 DB가 그 몫을 빼줌.
-- 처음부터 다시 합산하지 않고 "빼기"만 하는 이유: 직접 고친 기준금액(예전 이관 고객 등)을 건드리지 않기 위함. 음수는 0으로.
-- 검증: 실제 Postgres 엔진(pglite)에서 같은 함수·트리거로 시험함(운영 DB는 삭제 시험이 시스템에 의해 차단돼 직접 시험하지 못함).
create or replace function public.adjust_customer_amounts_on_estimate_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
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
create trigger trg_adjust_customer_amounts_on_estimate_delete
  after delete on public.estimates
  for each row execute function public.adjust_customer_amounts_on_estimate_delete();
