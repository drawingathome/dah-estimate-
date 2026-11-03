-- A3 발주 테이블 (초안 2판, 미적용). 거래처 목록 + 발주 기록. 기존 customers.order_status는 건드리지 않음(A7에서 옮김).
-- 2판 변경(독립 검토 반영): 고객 삭제는 막기(restrict, 선혜님 결정 대기) / 견적서 연결 FK / 수정 시각 자동 / anon 권한 회수 /
-- 쓰기 권한 동작별 분리 + 만든 사람 위조 방지 + 이름표 명시 / 날짜 순서·'취소' 상태 / 다시 실행해도 안전 / 한 번에 적용.
begin;
set local lock_timeout = '3s';
create table if not exists public.dah_vendors (
  id bigint generated always as identity primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.dah_purchase_orders (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete restrict,
  estimate_id uuid null references public.estimates(id) on delete set null,
  category text not null check (category in ('원단','블라인드','부자재','제작','시공','실측')),
  vendor_id bigint null references public.dah_vendors(id),
  status text not null default '대기' check (status in ('대기','발주','입고','취소')),
  order_date date null,
  due_date date null,
  note text null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or order_date is null or due_date >= order_date)
);
create index if not exists dah_po_customer_idx on public.dah_purchase_orders(customer_id);
create index if not exists dah_po_status_idx on public.dah_purchase_orders(status, due_date);
create index if not exists dah_po_vendor_idx on public.dah_purchase_orders(vendor_id);
drop trigger if exists trg_dah_po_updated on public.dah_purchase_orders;
create trigger trg_dah_po_updated before update on public.dah_purchase_orders for each row execute function public.update_updated_at();
revoke all on public.dah_vendors, public.dah_purchase_orders from anon;
alter table public.dah_vendors enable row level security;
alter table public.dah_purchase_orders enable row level security;
-- 거래처: 로그인한 직원은 읽기, 마스터만 추가/수정/삭제
drop policy if exists dah_vendors_select on public.dah_vendors;
drop policy if exists dah_vendors_insert on public.dah_vendors;
drop policy if exists dah_vendors_update on public.dah_vendors;
drop policy if exists dah_vendors_delete on public.dah_vendors;
create policy dah_vendors_select on public.dah_vendors for select to authenticated using ((select auth.uid()) is not null);
create policy dah_vendors_insert on public.dah_vendors for insert to authenticated with check (exists (select 1 from public.staff_profiles s where s.id = (select auth.uid()) and s.role = 'master'));
create policy dah_vendors_update on public.dah_vendors for update to authenticated
  using (exists (select 1 from public.staff_profiles s where s.id = (select auth.uid()) and s.role = 'master'))
  with check (exists (select 1 from public.staff_profiles s where s.id = (select auth.uid()) and s.role = 'master'));
create policy dah_vendors_delete on public.dah_vendors for delete to authenticated using (exists (select 1 from public.staff_profiles s where s.id = (select auth.uid()) and s.role = 'master'));
-- 발주: 고객을 볼 수 있는 사람만(customers의 RLS가 그대로 적용: 마스터 전체 / 실장은 본인 담당·미배정). 만든 사람은 본인만 기록 가능.
drop policy if exists dah_po_all on public.dah_purchase_orders;
drop policy if exists dah_po_select on public.dah_purchase_orders;
drop policy if exists dah_po_insert on public.dah_purchase_orders;
drop policy if exists dah_po_update on public.dah_purchase_orders;
drop policy if exists dah_po_delete on public.dah_purchase_orders;
create policy dah_po_select on public.dah_purchase_orders for select to authenticated
  using (exists (select 1 from public.customers c where c.id = dah_purchase_orders.customer_id));
create policy dah_po_insert on public.dah_purchase_orders for insert to authenticated
  with check (exists (select 1 from public.customers c where c.id = dah_purchase_orders.customer_id)
              and (created_by is null or created_by = (select auth.uid()))
              and (estimate_id is null or exists (select 1 from public.estimates e where e.id = dah_purchase_orders.estimate_id and e.client_id = dah_purchase_orders.customer_id)));
create policy dah_po_update on public.dah_purchase_orders for update to authenticated
  using (exists (select 1 from public.customers c where c.id = dah_purchase_orders.customer_id))
  with check (exists (select 1 from public.customers c where c.id = dah_purchase_orders.customer_id)
              and (estimate_id is null or exists (select 1 from public.estimates e where e.id = dah_purchase_orders.estimate_id and e.client_id = dah_purchase_orders.customer_id)));
create policy dah_po_delete on public.dah_purchase_orders for delete to authenticated
  using (exists (select 1 from public.customers c where c.id = dah_purchase_orders.customer_id));
commit;
