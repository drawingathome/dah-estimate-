-- N-176 (P4) 발주 현황 읽기 함수 — 읽기 전용(데이터를 바꾸지 않음). 되돌리기: 2026-11-16_n176_order_overview_rollback.sql
-- 목적: 화면·홈·아침 점검이 "어떤 발주가 필요하고 / 끝났고 / 어느 거래처·언제"를 같은 규칙으로 한 번에 받게 한다.
-- 규칙은 기존 public.dah_order_complete 와 똑같이 맞춤(필요 판정: 보관 안 된 견적서 품목 기준, 견적 없으면 전부 필요).
begin;
create or replace function public.dah_order_overview(p_customer_id bigint)
returns table(kind text, relevant boolean, done boolean, vendor text, order_date text, due_date text)
language sql stable security invoker
set search_path to 'public', 'pg_temp'
as $fn$
  with c as (select order_status os from public.customers where id = p_customer_id),
  li as (
    select case when jsonb_typeof(e1.line_items) = 'array' then e1.line_items else '[]'::jsonb end li
    from public.estimates e1 where e1.client_id = p_customer_id and not coalesce(e1.is_archived, false)
  ),
  cnt as (
    select (select count(*) from li, jsonb_array_elements(li.li) x where x->>'type' = 'curtain') cc,
           (select count(*) from li, jsonb_array_elements(li.li) x where x->>'type' = 'blind') bc,
           (select coalesce(sum(jsonb_array_length(li.li)), 0) from li) n
  ),
  rel as (
    select (not (cc > 0 or bc > 0 or n > 0)) or cc > 0 hc, (not (cc > 0 or bc > 0 or n > 0)) or bc > 0 hb from cnt
  ),
  items(k, r, ord) as (
    select 'fabric', hc, 1 from rel union all select 'production', hc, 2 from rel union all select 'blind', hb, 3 from rel
    union all select 'material', hc, 4 from rel union all select 'install', (hc or hb), 5 from rel
  )
  select i.k, i.r,
    case when jsonb_typeof(c.os -> i.k) = 'object' then coalesce((c.os -> i.k ->> 'done')::boolean, false)
         else coalesce((c.os ->> i.k) = 'true', false) end,
    case when jsonb_typeof(c.os -> i.k) = 'object' then nullif(c.os -> i.k ->> 'vendor', '') end,
    case when jsonb_typeof(c.os -> i.k) = 'object' then nullif(c.os -> i.k ->> 'orderDate', '') end,
    case when jsonb_typeof(c.os -> i.k) = 'object' then nullif(c.os -> i.k ->> 'dueDate', '') end
  from items i left join c on true order by i.ord
$fn$;
grant execute on function public.dah_order_overview(bigint) to authenticated;
-- 자동 검증: 모든 고객에서 "필요한 것이 전부 끝남" 결과가 기존 dah_order_complete 와 같아야 한다. 다르면 전체 취소.
do $v$ declare bad int; begin
  select count(*) into bad from public.customers c
  where coalesce((select bool_and(o.done or not o.relevant) from public.dah_order_overview(c.id) o), true)
        is distinct from public.dah_order_complete(c.id, c.order_status);
  if bad > 0 then raise exception 'N-176 검증 실패: 기존 규칙과 다른 고객 % 명', bad; end if;
end $v$;
commit;
