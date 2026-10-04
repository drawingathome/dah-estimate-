-- ════════════════════════════════════════════════════════
-- app_settings 테이블 생성
-- 목적: 담당자목록/월목표매출/계좌정보/Make.com웹훅/마스터비밀번호를
--       Supabase에 저장해서 어느 컴퓨터·휴대폰에서 로그인해도
--       동일한 설정값이 자동으로 동기화되도록 함
-- ════════════════════════════════════════════════════════

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;

-- 조회는 누구나 가능 (스태프도 담당자 목록은 봐야 로그인 가능)
create policy "app_settings_select" on app_settings
  for select using (true);

-- 저장(추가)도 허용 — 앱에서 anon key로 접근하는 구조라 기존 customers/estimates와 동일한 정책
create policy "app_settings_insert" on app_settings
  for insert with check (true);

-- 수정(덮어쓰기)도 허용
create policy "app_settings_update" on app_settings
  for update using (true);

-- DELETE 정책은 의도적으로 만들지 않음 (기존 데이터보호 원칙과 동일 — 삭제 불가, 값 변경만 가능)

-- 검증 쿼리 (실행 후 아래로 결과 확인)
-- select * from app_settings;
