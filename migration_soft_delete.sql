-- ══════════════════════════════════════════════════
-- DAH 데이터 보호: 삭제방지(소프트 삭제) 마이그레이션
-- Supabase > SQL Editor에서 실행하세요
--
-- 배경: 지금은 브라우저에 노출된 anon key만 있으면 누구든
-- customers/estimates 데이터를 통째로 delete 할 수 있는 상태입니다.
-- 이 마이그레이션 이후에는:
--   - anon key로는 절대 실제 삭제(DELETE)가 불가능해집니다
--   - 앱의 "고객 삭제" 기능은 실제로는 is_archived=true로
--     표시만 하고, 데이터는 DB에 그대로 남습니다 (영구 보존)
--   - 나중에 실수로 지운 고객도 DB에서 직접 복구 가능
-- ══════════════════════════════════════════════════

-- 1. is_archived 컬럼 추가 (없으면)
alter table customers  add column if not exists is_archived boolean default false;
alter table estimates  add column if not exists is_archived boolean default false;
alter table surveys    add column if not exists is_archived boolean default false;

-- 기존 데이터 중 null인 값 false로 채우기 (조회 필터 안전하게 하기 위함)
update customers set is_archived = false where is_archived is null;
update estimates set is_archived = false where is_archived is null;
update surveys set is_archived = false where is_archived is null;

-- 2. as_records / surveys 테이블이 있으면 같이 보호 (없어도 에러 안 나게 예외 처리)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'as_records') then
    alter table as_records add column if not exists is_archived boolean default false;
    update as_records set is_archived = false where is_archived is null;
  end if;
end $$;

-- 3. 기존 정책 전부 제거 (allow_all_* 와 별도로 생성된 "anon full access" 정책까지
--    DELETE까지 허용하던 정책이 테이블마다 겹쳐서 존재하는 것을 확인함 —
--    하나만 지우면 나머지 정책으로 여전히 삭제가 가능하므로 전부 지워야 함)
drop policy if exists "allow_all_customers" on customers;
drop policy if exists "anon full access" on customers;
drop policy if exists "allow_all_estimates" on estimates;
drop policy if exists "anon full access" on estimates;
drop policy if exists "allow_all_as_records" on as_records;
drop policy if exists "anon full access" on as_records;
drop policy if exists "allow_all_surveys" on surveys;
drop policy if exists "anon full access" on surveys;

-- 4. 읽기/생성/수정만 허용하는 정책으로 재생성 (DELETE 정책은 만들지 않음
--    → RLS 기본 원칙상 정책 없는 작업은 자동으로 거부됨)
create policy "select_customers" on customers for select using (true);
create policy "insert_customers" on customers for insert with check (true);
create policy "update_customers" on customers for update using (true) with check (true);

create policy "select_estimates" on estimates for select using (true);
create policy "insert_estimates" on estimates for insert with check (true);
create policy "update_estimates" on estimates for update using (true) with check (true);

create policy "select_surveys" on surveys for select using (true);
create policy "insert_surveys" on surveys for insert with check (true);
create policy "update_surveys" on surveys for update using (true) with check (true);

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'as_records') then
    execute 'create policy "select_as_records" on as_records for select using (true)';
    execute 'create policy "insert_as_records" on as_records for insert with check (true)';
    execute 'create policy "update_as_records" on as_records for update using (true) with check (true)';
  end if;
end $$;

select '✅ 삭제방지 적용 완료 — 이제 anon key로는 절대 실제 삭제가 불가능합니다. 고객 삭제 기능은 소프트 삭제(is_archived)로 동작합니다.' as result;

-- 최종 검증: 아래 결과가 0행이어야 정상 (DELETE 허용 정책이 하나도 없어야 함)
select tablename, policyname, cmd from pg_policies
where tablename in ('customers','estimates','surveys','as_records')
  and (cmd = 'DELETE' or cmd = 'ALL');
