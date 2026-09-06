
-- ══════════════════════════════════════════════
-- DAH 전체 스키마 생성 (Supabase SQL Editor용)
-- ══════════════════════════════════════════════

-- updated_at 자동갱신 함수
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ① customers 테이블
create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  client_name     text not null,
  phone           text,
  addr            text,
  addr_road       text,
  addr_detail     text,
  space           text,
  stage           text default '상담',
  staff_name      text default '마스터',
  measure_date    text,
  install_date    text,
  price           bigint default 0,
  deposit_amount  bigint default 0,
  balance_amount  bigint default 0,
  deposit_date    text,
  balance_date    text,
  memo            text,
  kakao_sent      boolean default false,
  is_archived     boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists trg_customers_updated on customers;
create trigger trg_customers_updated
  before update on customers
  for each row execute function update_updated_at();

alter table customers enable row level security;
drop policy if exists "allow_all_customers" on customers;
create policy "allow_all_customers" on customers
  for all using (true) with check (true);

create index if not exists idx_customers_stage      on customers(stage);
create index if not exists idx_customers_staff_name on customers(staff_name);
create index if not exists idx_customers_created_at on customers(created_at desc);

-- ② estimates 테이블
create table if not exists estimates (
  id                  uuid primary key default gen_random_uuid(),
  no                  text,
  customer_name       text not null,
  customer_phone      text,
  status              text default '가견적',
  contract_status     text default '미계약',
  total_amount        bigint default 0,
  deposit_amount      bigint default 0,
  balance_amount      bigint default 0,
  performance_revenue bigint default 0,
  staff_name          text,
  measure_date        text,
  install_date        text,
  memo                text,
  data                jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

drop trigger if exists trg_estimates_updated on estimates;
create trigger trg_estimates_updated
  before update on estimates
  for each row execute function update_updated_at();

alter table estimates enable row level security;
drop policy if exists "allow_all_estimates" on estimates;
create policy "allow_all_estimates" on estimates
  for all using (true) with check (true);

create index if not exists idx_estimates_customer_name on estimates(customer_name);
create index if not exists idx_estimates_created_at    on estimates(created_at desc);

-- ③ as_records 테이블
create table if not exists as_records (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references customers(id) on delete cascade,
  customer_name   text not null,
  install_date    text,
  receipt_date    text,
  as_type         text,
  fee_type        text default '무상',
  fee_amount      bigint default 0,
  symptom         text,
  photo_memo      text,
  visit_date      text,
  visit_time      text,
  staff_name      text default '마스터',
  status          text default '접수',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists trg_as_updated on as_records;
create trigger trg_as_updated
  before update on as_records
  for each row execute function update_updated_at();

alter table as_records enable row level security;
drop policy if exists "allow_all_as_records" on as_records;
create policy "allow_all_as_records" on as_records
  for all using (true) with check (true);

create index if not exists idx_as_customer_name on as_records(customer_name);
create index if not exists idx_as_created_at    on as_records(created_at desc);

select '✅ DAH 전체 스키마 생성 완료' as result;
