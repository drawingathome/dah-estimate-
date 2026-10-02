-- 2026-10-01(선혜님과의 권한 전수점검 중 발견한 부가 항목 처리)
-- 이미 Supabase에 직접 적용 완료(mcp__Supabase__apply_migration) - 이 파일은 저장소 기록용 사본.
--
-- 발견: app_settings의 staff_list(담당자 이름 목록)가 로그인 없이도 조회 가능했음
-- (app_settings_select_stafflist_anon 정책, roles=public, qual="key = 'staff_list'").
-- 코드 전수검색 결과 이 값을 쓰는 곳은 dash-*.js(대시보드, 로그인한 직원 화면)뿐이고,
-- 견적서 앱(est-*.js)/설문 페이지(survey.html) 등 비로그인 화면은 전혀 안 씀 - 즉 의도된
-- 공개 기능이 아니라 불필요하게 열려있던 것. 민감도는 전화번호/주소보다 훨씬 낮지만
-- (직원 이름 하나), 최소권한 원칙에 따라 로그인 필요로 전환.

DROP POLICY IF EXISTS app_settings_select_stafflist_anon ON app_settings;

-- 검증 완료(2026-10-01, Supabase MCP로 직접 anon 역할 전환해 재현):
-- anon으로 staff_list 조회 시도 → 빈 결과 확인(차단됨). 로그인한 사용자(authenticated)는
-- app_settings_select 정책(auth.uid() IS NOT NULL)으로 계속 정상 조회 가능 - 기능 영향 없음.
