-- ══════════════════════════════════════════════════
-- 드로잉엣홈 결제 컬럼 추가 마이그레이션
-- Supabase > SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════════

-- customers 테이블에 선금/잔금 컬럼 추가
alter table customers
  add column if not exists deposit_amount    bigint default 0,
  add column if not exists deposit_date      text,
  add column if not exists deposit_method    text,
  add column if not exists deposit_receipt   boolean default false,
  add column if not exists balance_amount    bigint default 0,
  add column if not exists balance_date      text,
  add column if not exists balance_method    text,
  add column if not exists balance_receipt   boolean default false;

-- 인덱스 (월별 매출 조회 성능)
create index if not exists idx_customers_deposit_date  on customers(deposit_date);
create index if not exists idx_customers_balance_date  on customers(balance_date);

select '✅ 결제 컬럼 추가 완료 (deposit_* / balance_*)' as result;
