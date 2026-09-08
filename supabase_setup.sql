-- ══════════════════════════════════════════════════
-- 드로잉엣홈 Supabase 테이블 생성 스크립트
-- Supabase > SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════════

-- 1. customers 테이블
create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  client_name   text not null,
  phone         text,
  addr          text,
  space         text,
  price         bigint default 0,
  performance_revenue bigint default 0,
  staff_name    text default '마스터',
  stage         text default '상담',
  date          text,
  measure_date  text,
  install_date  text,
  memo          text,
  visit_count   int default 1,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 2. estimates 테이블
create table if not exists estimates (
  id            uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_id   uuid references customers(id) on delete set null,
  no            text,
  status        text default 'ga',
  price         bigint default 0,
  performance_revenue bigint default 0,
  staff_name    text default '마스터',
  data          jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 3. updated_at 자동 갱신 트리거
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_customers_updated on customers;
create trigger trg_customers_updated
  before update on customers
  for each row execute function update_updated_at();

drop trigger if exists trg_estimates_updated on estimates;
create trigger trg_estimates_updated
  before update on estimates
  for each row execute function update_updated_at();

-- 4. RLS (Row Level Security) — anon key로 읽기/쓰기 허용
alter table customers enable row level security;
alter table estimates enable row level security;

create policy "allow_all_customers" on customers
  for all using (true) with check (true);

create policy "allow_all_estimates" on estimates
  for all using (true) with check (true);

-- 5. 인덱스
create index if not exists idx_customers_client_name on customers(client_name);
create index if not exists idx_customers_stage on customers(stage);
create index if not exists idx_customers_created_at on customers(created_at desc);
create index if not exists idx_estimates_customer_name on estimates(customer_name);
create index if not exists idx_estimates_created_at on estimates(created_at desc);

select 'Setup complete! customers + estimates 테이블 생성됨' as result;
