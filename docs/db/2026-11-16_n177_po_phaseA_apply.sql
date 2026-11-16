-- [적용 기록 2026-11-16 11:10] 운영에는 3조각으로 나눠 적용함(①칸·키 ②고객 연결 CASCADE ③함수·장치·복사·검증). 이유: 이 파일 통째로(drop trigger if exists 포함) 실행하면 Supabase가 사람 승인 창을 띄워 3번 시간 초과됨.
-- ③에서는 'drop trigger if exists' 2줄을 뺐다(장치가 아직 없어서 하는 일이 없는 줄). 결과 읽기 확인: 118행·거래처 미상 6·장치 2개 켜짐·연결 CASCADE·아침 17번 0건.
-- N-177 P5 ⓐ(개정): dah_purchase_orders(0행)를 '발주 기록 한 표'로 고쳐 쓰고, DB가 order_status 변경을 자동으로 따라가게 한다.
-- 앱은 지금처럼 customers.order_status만 쓰고(화면 영향 0), 새 표는 order_status가 바뀔 때마다 DB 장치가 즉시 다시 맞춘다 → '낡는 복사본' 문제 없음.
-- 체크·발주서 인쇄·시공 의뢰서·어느 화면이든 order_status에 저장하면 자동 반영되므로 앱 코드(ⓑ)를 바꾸지 않아도 된다.
-- 안전장치: 동기화가 실패해도 고객 저장은 절대 막지 않는다(경고만 남김). 고객 삭제가 새 표 때문에 막히지 않도록 연결을 '함께 삭제'로 바꾼다.
-- 되돌리기: 2026-11-16_n177_po_phaseA_rollback.sql
begin;
do $c$ begin
  if (select count(*) from public.dah_purchase_orders) <> 0 then raise exception 'N-177: dah_purchase_orders가 비어 있지 않음 — 중단'; end if;
end $c$;
alter table public.dah_purchase_orders
  add column if not exists vendor_name text,
  add column if not exists source text not null default 'manual',   -- sync(order_status에서 자동) / manual(사람이 직접)
  add column if not exists legacy_key text;                          -- 앱 종류 이름(fabric 등)
create unique index if not exists dah_po_uniq_customer_cat_vendor
  on public.dah_purchase_orders (customer_id, category, coalesce(vendor_name, '거래처 미상'));
-- 고객 완전삭제가 새 표 행 때문에 막히지 않게(원래 RESTRICT) 함께 삭제로 변경
alter table public.dah_purchase_orders drop constraint dah_purchase_orders_customer_id_fkey;
alter table public.dah_purchase_orders add constraint dah_purchase_orders_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete cascade;

-- 한 고객의 새 표 행을 order_status 기준으로 다시 만든다(source='sync' 행만 지우고 다시 넣음, 사람이 직접 넣은 manual 행은 건드리지 않음)
create or replace function public.dah_po_sync(p_cid bigint) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
begin
  delete from public.dah_purchase_orders where customer_id = p_cid and source = 'sync';
  insert into public.dah_purchase_orders (customer_id, category, vendor_name, status, order_date, due_date, source, legacy_key, note)
  with kinds(k, cat) as (values ('fabric','원단'),('production','제작'),('blind','블라인드'),('material','부자재'),('install','시공'),('measure','실측')),
  src as (
    select c.id cid, kd.k, kd.cat, c.order_status -> kd.k v
    from public.customers c cross join kinds kd
    where c.id = p_cid and c.order_status is not null and c.order_status -> kd.k is not null and c.order_status -> kd.k <> 'null'::jsonb
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
    select cid, k, cat, done, od, dd,
           case when array_length(array_remove(vs, null),1) is null then array[null::text] else array_remove(vs, null) end vs2
    from norm where done or array_length(array_remove(vs,null),1) > 0
  )
  select distinct on (cid, cat, coalesce(vn,'거래처 미상'))
    cid, cat, vn, case when done then '발주' else '대기' end,
    od, case when od is not null and dd is not null and dd < od then null else dd end,
    'sync', k, case when vn is null then '거래처 미상(기록에 거래처 없음)' end
  from exp, lateral unnest(vs2) vn
  on conflict do nothing;   -- 사람이 직접 넣은 같은 행이 있으면 그쪽을 유지
end $fn$;
revoke all on function public.dah_po_sync(bigint) from public, anon, authenticated;

-- 트리거: 실패해도 고객 저장은 막지 않는다(경고만)
create or replace function public.dah_po_sync_trg() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
begin
  begin
    perform public.dah_po_sync(new.id);
  exception when others then
    raise warning 'dah_po_sync 실패(고객 저장은 계속됨) customer=% : %', new.id, sqlerrm;
  end;
  return null;
end $fn$;
revoke all on function public.dah_po_sync_trg() from public, anon, authenticated;
drop trigger if exists trg_dah_po_sync_ins on public.customers;
drop trigger if exists trg_dah_po_sync_upd on public.customers;
create trigger trg_dah_po_sync_ins after insert on public.customers
  for each row when (new.order_status is not null) execute function public.dah_po_sync_trg();
create trigger trg_dah_po_sync_upd after update of order_status on public.customers
  for each row when (old.order_status is distinct from new.order_status) execute function public.dah_po_sync_trg();

-- 지금 있는 기록 전부 복사
select public.dah_po_sync(id) from public.customers where order_status is not null;

-- 자동 검증: 끝남으로 기록된 (고객, 종류) 수가 새 표와 같아야 한다. 다르면 전체 취소.
do $v$ declare a int; b int; begin
  select count(*) into a from public.customers c, jsonb_each(c.order_status) e
   where e.key in ('fabric','production','blind','material','install','measure')
     and ((jsonb_typeof(e.value)='object' and coalesce((e.value->>'done')::boolean,false)) or e.value::text='true');
  select count(distinct (customer_id, category)) into b from public.dah_purchase_orders where status='발주' and source='sync';
  if a <> b then raise exception 'N-177 검증 실패: 끝남 기록 % ≠ 새 표 % ', a, b; end if;
end $v$;
commit;
