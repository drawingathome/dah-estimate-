-- 운영 DB의 발주 완료 규칙 함수(2026-11-09 pg_get_functiondef로 읽기 전용 추출). 운영 함수가 바뀌면 이 파일도 갱신할 것.
-- 용도: db/test/order_rule_parity.js — 화면(JS) 판정과 같은 결과를 내는지 비교하는 일치 시험.
CREATE OR REPLACE FUNCTION public.dah_order_complete(p_customer_id bigint, p_order_status jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with li as (
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
  items(k, r) as (
    select 'fabric', hc from rel union all select 'production', hc from rel union all select 'blind', hb from rel
    union all select 'material', hc from rel union all select 'install', (hc or hb) from rel
  ),
  st as (select coalesce(p_order_status, '{}'::jsonb) os)
  select not exists (
    select 1 from items i, st
    where i.r and not (
      case when jsonb_typeof(st.os -> i.k) = 'object' then coalesce((st.os -> i.k ->> 'done')::boolean, false)
           else coalesce((st.os ->> i.k) = 'true', false) end)
  )
$function$;
