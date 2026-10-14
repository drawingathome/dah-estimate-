-- 2026-10-14 (2-2) DB 쪽 "받은 돈 / 계약 여부" 판정 한 곳. 운영 DB 적용 완료(마이그레이션 dah_received_and_contract_functions).
-- 앱의 getReceivedAmount / isContractedCustomer와 같은 규칙: 견적서(보관 제외)에 입금 기록이 있으면 견적서 합계, 하나도 없을 때만 고객 칸. 견적서 칸은 환불 반영 후 순입금.
-- 검증(운영): 고객 164명 중 고객칸 합계와 다른 건 0, 계약 114명, 계약 전 단계인데 입금 있는 고객 0, 계약 이후 단계인데 입금 없는 4명은 모두 0원 협찬(문수현·이솔·인플루언서 2명).
-- 되돌리기: drop function public.dah_is_contracted(bigint); drop function public.dah_received_amount(bigint);
create or replace function public.dah_received_amount(p_customer_id bigint)
returns numeric language sql stable set search_path = public, pg_temp as $$
  select case when coalesce(e.paid, 0) > 0 then e.paid else coalesce(c.deposit_amount, 0) + coalesce(c.balance_amount, 0) end
  from public.customers c
  left join lateral (select sum(coalesce(x.deposit_amount, 0) + coalesce(x.balance_amount, 0)) as paid
                     from public.estimates x where x.client_id = c.id and not coalesce(x.is_archived, false)) e on true
  where c.id = p_customer_id
$$;
create or replace function public.dah_is_contracted(p_customer_id bigint)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce(public.dah_received_amount(p_customer_id), 0) > 0
$$;
revoke all on function public.dah_received_amount(bigint) from public, anon;
revoke all on function public.dah_is_contracted(bigint) from public, anon;
grant execute on function public.dah_received_amount(bigint) to authenticated, service_role;
grant execute on function public.dah_is_contracted(bigint) to authenticated, service_role;
