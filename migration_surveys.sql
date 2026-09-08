-- ══════════════════════════════════════════════════
-- DAH 설문지(survey.html) → surveys 테이블 생성
-- Supabase > SQL Editor에서 실행하세요
--
-- 배경: survey.html은 현재 Google Apps Script 웹훅
-- (script.google.com/.../exec)으로만 저장되고 있고,
-- Supabase에는 저장되지 않고 있습니다.
-- 이 테이블은 향후 survey.html에 Supabase 저장을 추가할 때
-- 사용할 스키마입니다. (실제 JS 저장 코드는 별도 작업 필요)
-- ══════════════════════════════════════════════════

create table if not exists surveys (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references customers(id) on delete set null,
  name            text not null,
  phone           text not null,
  addr            text,
  pyeong          text,                 -- 평수대 (예: '30평대')
  home_dir        text,                 -- 집 방향 (남향/동향/서향/북향/모름)
  home_dir_etc    text,
  wall_tone       text,                 -- 벽지 톤
  wall_tone_etc   text,
  floor_type      text,                 -- 바닥재 종류
  floor_type_etc  text,
  spaces          jsonb default '[]',   -- 시공 공간 배열 (예: ["거실","안방"])
  moods           jsonb default '[]',   -- 원하는 분위기 배열
  moods_etc       text,
  functions       jsonb default '[]',   -- 원하는 기능 배열
  functions_etc   text,
  budget          text,                 -- 예산대
  budget_etc      text,
  ref_url         text,                 -- 참고 이미지/링크
  memo            text,
  synced_to_sheet boolean default false, -- 구글시트 웹훅 전송 성공 여부
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- updated_at 자동 갱신 트리거 (기존 update_updated_at 함수 재사용)
drop trigger if exists trg_surveys_updated on surveys;
create trigger trg_surveys_updated
  before update on surveys
  for each row execute function update_updated_at();

-- RLS (기존 테이블들과 동일한 정책 — anon key로 전체 허용)
alter table surveys enable row level security;
drop policy if exists "allow_all_surveys" on surveys;
create policy "allow_all_surveys" on surveys
  for all using (true) with check (true);

-- 인덱스
create index if not exists idx_surveys_phone      on surveys(phone);
create index if not exists idx_surveys_name       on surveys(name);
create index if not exists idx_surveys_created_at on surveys(created_at desc);
create index if not exists idx_surveys_customer_id on surveys(customer_id);

select '✅ surveys 테이블 생성 완료' as result;
