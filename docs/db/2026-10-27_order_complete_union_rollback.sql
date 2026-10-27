-- H-30 되돌리기: 운영에서 읽은 적용 전 정의(최신 견적서 1건 기준)로 복원
create or replace function public.dah_order_complete(p_customer_id bigint, p_order_status jsonb) returns boolean
language sql stable set search_path to 'public','pg_temp' as $$
  with e as (select (select e1.line_items from public.estimates e1 where e1.client_id = p_customer_id order by e1.created_at desc limit 1) li),
  f as (
    select case when jsonb_typeof(li) = 'array' then li else '[]'::jsonb end li from e
  ),
  cnt as (
    select (select count(*) from f, jsonb_array_elements(f.li) x where x->>'type' = 'curtain') cc,
           (select count(*) from f, jsonb_array_elements(f.li) x where x->>'type' = 'blind') bc,
           (select coalesce(jsonb_array_length(f.li), 0) from f) n
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
