-- ══════════════════════════════════════════════════
-- DAH 인증/권한 잠금 마이그레이션
-- Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════════

-- 1) 스태프 프로필 테이블 (누가 마스터/스태프인지 구분)
create table if not exists staff_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null,
  role text not null check (role in ('master','staff')),
  created_at timestamptz default now()
);

alter table staff_profiles enable row level security;

-- 로그인한 사람은 누구나 이 테이블을 읽을 수 있어야 함 (자기 role 확인용)
drop policy if exists "staff_profiles_select" on staff_profiles;
create policy "staff_profiles_select" on staff_profiles
  for select using (auth.uid() is not null);

-- 2) customers / estimates / surveys 테이블 RLS 활성화
alter table customers enable row level security;
alter table estimates enable row level security;
alter table surveys enable row level security;

-- 3) 조회/등록/수정: 로그인한 사람이면 누구나 가능 (마스터+스태프 공통)
drop policy if exists "customers_select" on customers;
create policy "customers_select" on customers for select using (auth.uid() is not null);
drop policy if exists "customers_insert" on customers;
create policy "customers_insert" on customers for insert with check (auth.uid() is not null);
drop policy if exists "customers_update" on customers;
create policy "customers_update" on customers for update using (auth.uid() is not null);

drop policy if exists "estimates_select" on estimates;
create policy "estimates_select" on estimates for select using (auth.uid() is not null);
drop policy if exists "estimates_insert" on estimates;
create policy "estimates_insert" on estimates for insert with check (auth.uid() is not null);
drop policy if exists "estimates_update" on estimates;
create policy "estimates_update" on estimates for update using (auth.uid() is not null);

drop policy if exists "surveys_select" on surveys;
create policy "surveys_select" on surveys for select using (auth.uid() is not null);
drop policy if exists "surveys_insert" on surveys;
create policy "surveys_insert" on surveys for insert with check (auth.uid() is not null);
drop policy if exists "surveys_update" on surveys;
create policy "surveys_update" on surveys for update using (auth.uid() is not null);

-- 4) 삭제: 마스터만 가능 (staff_profiles에서 role 확인)
drop policy if exists "customers_delete" on customers;
create policy "customers_delete" on customers for delete using (
  exists (select 1 from staff_profiles where id = auth.uid() and role = 'master')
);
drop policy if exists "estimates_delete" on estimates;
create policy "estimates_delete" on estimates for delete using (
  exists (select 1 from staff_profiles where id = auth.uid() and role = 'master')
);
drop policy if exists "surveys_delete" on surveys;
create policy "surveys_delete" on surveys for delete using (
  exists (select 1 from staff_profiles where id = auth.uid() and role = 'master')
);
