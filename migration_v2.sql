-- ══════════════════════════════════════════════════
-- DAH 스키마 보완 마이그레이션 v2
-- Supabase > SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════════

-- 1. addr 컬럼 분리 (도로명 / 상세주소)
alter table customers
  add column if not exists addr_road   text,
  add column if not exists addr_detail text;

-- 기존 addr 데이터 → addr_road로 이전
update customers set addr_road = addr where addr_road is null and addr is not null;

-- 2. stage CHECK 제약 추가
alter table customers
  drop constraint if exists chk_stage;
alter table customers
  add constraint chk_stage
  check (stage in ('상담','계약금','실측','잔금','시공','완료','미계약'));

-- 3. AS 접수 테이블 추가
create table if not exists as_records (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references customers(id) on delete cascade,
  customer_name   text not null,
  install_date    text,            -- 시공일자
  receipt_date    text,            -- 접수일자
  as_type         text,            -- 커튼수선/블라인드수선/레일교체/재시공/기타
  fee_type        text default '무상', -- 무상/유상
  fee_amount      bigint default 0,
  symptom         text,            -- 증상 설명
  photo_memo      text,            -- 사진 메모
  visit_date      text,            -- 방문예정일
  visit_time      text,            -- 방문시간
  staff_name      text default '마스터',
  status          text default '접수', -- 접수/처리중/완료
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- AS 테이블 RLS
alter table as_records enable row level security;
create policy "allow_all_as_records" on as_records
  for all using (true) with check (true);

-- AS 테이블 트리거
drop trigger if exists trg_as_records_updated on as_records;
create trigger trg_as_records_updated
  before update on as_records
  for each row execute function update_updated_at();

-- AS 테이블 인덱스
create index if not exists idx_as_customer_id   on as_records(customer_id);
create index if not exists idx_as_customer_name on as_records(customer_name);
create index if not exists idx_as_created_at    on as_records(created_at desc);

-- 4. 인덱스 추가 (staff_name 기준 필터)
create index if not exists idx_customers_staff_name on customers(staff_name);

select '✅ DAH 스키마 v2 마이그레이션 완료' as result;
