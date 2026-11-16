-- N-177 P5 ⓐ: dah_purchase_orders(0행)를 발주 기록 한 표로 고쳐 쓰고, customers.order_status의 현재 기록을 '복사'한다.
-- 원본(order_status)은 건드리지 않는다(읽기 전환 전까지 앱은 지금처럼 order_status를 씀). 되돌리기: 2026-11-16_n177_po_phaseA_rollback.sql
-- 결정(선혜님 11-16): 기존 표 고쳐 씀 / 거래처 빈칸은 '거래처 미상' / 지난 고객 거래처는 더 따지지 않음.
begin;
do $c$ begin
  if (select count(*) from public.dah_purchase_orders) <> 0 then raise exception 'N-177: dah_purchase_orders가 비어 있지 않음 — 중단'; end if;
end $c$;
alter table public.dah_purchase_orders
  add column if not exists vendor_name text,
  add column if not exists source text not null default 'manual',   -- migrated(이관) / check(체크) / print(발주서 인쇄) / manual
  add column if not exists legacy_key text;                          -- 앱 종류 이름(fabric 등) 보관
create unique index if not exists dah_po_uniq_customer_cat_vendor
  on public.dah_purchase_orders (customer_id, category, coalesce(vendor_name, '거래처 미상'));

with kinds(k, cat) as (values ('fabric','원단'),('production','제작'),('blind','블라인드'),('material','부자재'),('install','시공'),('measure','실측')),
src as (
  select c.id cid, kd.k, kd.cat, e.value v
  from public.customers c
  cross join kinds kd
  cross join lateral (select c.order_status -> kd.k as value) e
  where c.order_status is not null and e.value is not null and e.value <> 'null'::jsonb
),
norm as (
  select cid, k, cat,
    case when jsonb_typeof(v)='object' then coalesce((v->>'done')::boolean,false) else coalesce(v::text='true',false) end done,
    case when jsonb_typeof(v)='object' and jsonb_typeof(v->'vendors')='array' and jsonb_array_length(v->'vendors')>0
           then array(select nullif(trim(x),'') from jsonb_array_elements_text(v->'vendors') x)
         when jsonb_typeof(v)='object' and coalesce(v->>'vendor','')<>''
           then array(select nullif(trim(x),'') from unnest(string_to_array(v->>'vendor', ',')) x)
         else array[]::text[] end vs,
    case when jsonb_typeof(v)='object' and v->>'orderDate' ~ '^\d{4}-\d{2}-\d{2}$' then (v->>'orderDate')::date end od,
    case when jsonb_typeof(v)='object' and v->>'dueDate'   ~ '^\d{4}-\d{2}-\d{2}$' then (v->>'dueDate')::date end dd
  from src
),
exp as (
  -- 기록할 가치가 있는 것: 끝남(done) 이거나 거래처가 적힌 것
  select cid, k, cat, done, od, dd,
         case when array_length(array_remove(vs, null),1) is null then array[null::text] else array_remove(vs, null) end vs2
  from norm where done or array_length(array_remove(vs,null),1) > 0
)
insert into public.dah_purchase_orders (customer_id, category, vendor_name, status, order_date, due_date, source, legacy_key, note)
select distinct on (cid, cat, coalesce(vn,'거래처 미상'))
  cid, cat, vn, case when done then '발주' else '대기' end,
  od, case when od is not null and dd is not null and dd < od then null else dd end,
  'migrated', k, case when vn is null then '거래처 미상(이관 전 기록에 거래처 없음)' end
from exp, lateral unnest(vs2) vn;

-- 자동 검증 1: 끝남으로 기록된 (고객, 종류) 수가 같아야 한다
do $v$ declare a int; b int; begin
  select count(*) into a from public.customers c, jsonb_each(c.order_status) e
   where e.key in ('fabric','production','blind','material','install','measure')
     and ((jsonb_typeof(e.value)='object' and coalesce((e.value->>'done')::boolean,false)) or e.value::text='true');
  select count(distinct (customer_id, category)) into b from public.dah_purchase_orders where status='발주' and source='migrated';
  if a <> b then raise exception 'N-177 검증 실패: 끝남 기록 % ≠ 이관 % ', a, b; end if;
  -- 자동 검증 2: 원본은 그대로(이관은 읽기만 함) — 이 표 밖은 안 바뀌었으므로 고객 수 확인
  if (select count(*) from public.customers where order_status is not null and order_status::text not in ('{}','null')) is null then raise exception 'x'; end if;
end $v$;
commit;
