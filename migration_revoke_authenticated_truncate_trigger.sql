-- 2026-10-01(선혜님 - "전문업체 기준으로도 본거야??" 질문으로 확인 후 실행)
-- 이미 Supabase에 직접 적용 완료(mcp__Supabase__apply_migration) - 이 파일은 저장소 기록용 사본.
--
-- 배경: anon 권한 전수조사(migration_revoke_anon_unnecessary_privileges.sql) 이후, "로그인한
-- 직원 계정(authenticated)도 같은 방식으로 점검했는지"를 재확인하라는 요청을 받고, 실제 공개된
-- 여러 Supabase 보안감사 사례(GitHub 이슈)로 "anon/authenticated 권한을 함께 점검하고
-- 불필요한 걸 제거하라"가 표준 점검 항목임을 먼저 확인한 뒤 진행.
--
-- 발견: authenticated 역할도 10개 테이블 전부 TRUNCATE/TRIGGER 권한이 열려있었음.
-- SELECT/INSERT/UPDATE/DELETE는 RLS가 행 단위로 걸러주니 정상(담당자 제한 등 이미 적용돼
-- 있어 그대로 둠) - 다만 TRUNCATE/TRIGGER는 PostgreSQL 공식 문서로 확인된 대로 RLS 적용을
-- 아예 안 받는 영역이라, 직원 계정이 탈취되거나 실수로 잘못된 요청을 보내면 여전히 테이블
-- 전체를 날릴 수 있는 위험이 남아있었음. 앱 코드 어디도 이 권한을 직접 쓰지 않아 전부
-- 회수해도 기능 영향 없음.

REVOKE TRUNCATE, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

-- 검증 완료(2026-10-01, Supabase MCP로 직접 authenticated 역할 전환해 재현):
-- 1) authenticated로 customers TRUNCATE 시도 → "permission denied" 확인(막힘)
-- 2) customers/estimates의 SELECT/UPDATE 권한은 그대로 true로 유지됨 확인(정상 업무 기능 보존)
