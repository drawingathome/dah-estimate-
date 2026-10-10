-- 2026-10-01(선혜님 - "전문가입장에서도 보라니깐 놔둬도 될 정도이니??" 질문에 대한 긴급 조치)
-- 이미 Supabase에 직접 적용 완료(mcp__Supabase__apply_migration) - 이 파일은 저장소 기록용 사본.
--
-- 발견: PostgreSQL 공식 문서로 확인 - TRUNCATE/REFERENCES는 RLS(권한규칙)의 적용을 아예 안 받음.
-- anon(로그인 안 한 누구나 쓰는 공개 키)에게 이 프로젝트의 10개 테이블(customers, estimates,
-- staff_profiles 등 전부) 전부 TRUNCATE/DELETE/UPDATE/INSERT가 열려있었음 - Supabase 구버전
-- 프로젝트 생성시 자동으로 부여되던 기본권한이 한 번도 정리된 적 없이 남아있던 것.
-- 즉 공개 anon 키 하나만 있으면 로그인 전혀 없이 전체 고객/견적서 테이블을 통째로 비우거나
-- 마음대로 고치고 지울 수 있는 상태였음.
--
-- 실제로 비로그인(anon) 상태에서 꼭 필요한 건 딱 두 가지뿐:
-- 1) surveys 테이블 INSERT (고객이 설문 제출)
-- 2) estimates 테이블 SELECT (알림톡 공개 견적서 보기 - 추후 좁은 함수로 교체 예정, 그 전까지 유지)
-- 그 외 모든 테이블의 TRUNCATE/DELETE/UPDATE와, surveys를 제외한 모든 테이블의 INSERT는
-- anon에게 전혀 필요 없음(대시보드/견적서 앱의 모든 실제 쓰기는 로그인한 사용자 세션 토큰을
-- 쓰지 anon 키를 쓰지 않음) - 전부 회수.

REVOKE TRUNCATE, DELETE, UPDATE, INSERT ON ALL TABLES IN SCHEMA public FROM anon;
GRANT INSERT ON surveys TO anon;

-- 검증 완료(2026-10-01, Supabase MCP로 실제 SET LOCAL ROLE anon 전환 후 직접 재현):
-- 1) anon으로 estimates TRUNCATE 시도 → "permission denied" 확인(막힘)
-- 2) anon으로 estimates SELECT(기존 견적서 ID) → 정상 조회됨(공개 견적서 보기 기능 안 깨짐)
-- 3) anon으로 surveys INSERT(RETURNING 없이, 실제 survey-app.js와 동일하게 Prefer: return=minimal
--    방식) → 정상 성공(설문 제출 기능 안 깨짐). 테스트 중 RETURNING을 붙이면 SELECT 정책에
--    걸려 실패하는 것도 확인했으나, 실제 코드는 return=minimal만 쓰므로 무관함을 확인.
-- 테스트로 생성된 임시 레코드는 전부 삭제로 정리함.
