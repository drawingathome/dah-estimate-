-- H-30: 발주 완료 판정을 '가장 최근 견적서 1건'이 아니라 '보관되지 않은 모든 견적서'의 품목 합집합 기준으로 바꿈.
-- 이유: 같은 고객이 견적서를 여러 건 만들면(예: 271번 커튼·블라인드 견적 + 기타만 견적) 최신이 '기타만'일 때 발주가 필요 없는 것으로 잘못 판정되어,
--       완납 즉시 발주 없이 '시공준비중'으로 갈 수 있었음. 보관된(is_archived) 견적서는 무시. 견적서가 없거나 품목이 하나도 없으면 예전처럼 5개 항목 전부 필요.
create or replace function public.dah_order_complete(p_customer_id bigint, p_order_status jsonb) returns boolean
language sql stable set search_path to 'public','pg_temp' as $$
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
$$;
