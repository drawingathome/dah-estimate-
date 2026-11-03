-- A3 발주 테이블 (초안, 미적용). 거래처 목록 + 발주 기록. 기존 customers.order_status는 건드리지 않음(A7에서 옮김).
create table if not exists public.dah_vendors (
  id bigint generated always as identity primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.dah_purchase_orders (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  estimate_id uuid null,
  category text not null check (category in ('원단','블라인드','부자재','제작','시공','실측')),
  vendor_id bigint null references public.dah_vendors(id),
  status text not null default '대기' check (status in ('대기','발주','입고')),
  order_date date null,
  due_date date null,
  note text null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dah_po_customer_idx on public.dah_purchase_orders(customer_id);
create index if not exists dah_po_status_idx on public.dah_purchase_orders(status, due_date);
alter table public.dah_vendors enable row level security;
alter table public.dah_purchase_orders enable row level security;
-- 거래처: 로그인한 직원은 읽기, 마스터만 추가/수정
create policy dah_vendors_select on public.dah_vendors for select to authenticated using ((select auth.uid()) is not null);
create policy dah_vendors_write on public.dah_vendors for all to authenticated
  using (exists (select 1 from public.staff_profiles s where s.id = (select auth.uid()) and s.role = 'master'))
  with check (exists (select 1 from public.staff_profiles s where s.id = (select auth.uid()) and s.role = 'master'));
-- 발주: 고객을 볼 수 있는 사람만(마스터 전체 / 실장은 본인 담당·미배정 — customers의 RLS가 그대로 적용됨)
create policy dah_po_all on public.dah_purchase_orders for all to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id))
  with check (exists (select 1 from public.customers c where c.id = customer_id));
