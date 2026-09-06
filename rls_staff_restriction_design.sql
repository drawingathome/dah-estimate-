-- ══════════════════════════════════════════════════════════
-- DAH customers 테이블 RLS 강화 — 설계안 (2026-08-05, 미적용)
-- ══════════════════════════════════════════════════════════
--
-- 문제: 현재 SELECT/UPDATE 정책이 "로그인만 하면 전체 접근 가능"이라,
-- 스태프 계정도 다른 담당자의 전체 고객 데이터(연락처/주소/견적금액/메모)를
-- 서버에서 그대로 받아옴. 화면(JS)에서만 "본인 담당만" 필터링하고 있어서
-- 개발자도구로 우회하면 전부 보임.
--
-- 목표: 마스터는 전체 접근 유지, 스태프는 본인 담당(staff_name 일치) 고객만
-- SELECT/UPDATE 가능하도록 서버단(RLS)에서 강제.
--
-- ⚠️ 적용 전 필수 체크리스트 (7-11 절차):
--   [ ] 1. DB 백업: CREATE TABLE customers_backup_YYYYMMDD AS SELECT * FROM customers;
--   [ ] 2. 실장님(또는 향후 스태프) staff_profiles.display_name이
--          customers.staff_name과 "글자 하나까지" 정확히 일치하는지 확인
--          (예: "장선혜" vs "선혜"처럼 다르면 그 스태프는 담당고객이 0건으로 보임 —
--           보안사고는 아니지만 업무가 안 되는 장애가 됨. 반드시 사전 확인.)
--   [ ] 3. 스테이징(테스트 프로젝트 or 로컬)에서 먼저 검증 — 불가능하면
--          최소한 마스터 계정으로 로그인 테스트 먼저, 그다음 스태프 계정 테스트
--   [ ] 4. 적용 직후 PC+모바일에서 마스터/스태프 둘 다 로그인해서
--          "고객 목록이 예상대로 보이는지" 즉시 확인
--   [ ] 5. 문제 생기면 즉시 롤백 스크립트로 원복 (아래 맨 밑에 포함)
--
-- ══════════════════════════════════════════════════════════

-- 1) SELECT 정책 교체: 마스터는 전체, 스태프는 본인 담당 고객만
DROP POLICY IF EXISTS customers_select ON customers;
CREATE POLICY customers_select ON customers FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM staff_profiles
      WHERE staff_profiles.id = auth.uid() AND staff_profiles.role = 'master'
    )
    OR
    staff_name = (SELECT display_name FROM staff_profiles WHERE staff_profiles.id = auth.uid())
  )
);

-- 2) UPDATE 정책도 동일하게 강화 — 지금은 로그인만 하면 아무 고객이나 수정 가능한 상태.
--    스태프가 실수로(또는 고의로) 다른 담당자 고객 정보를 바꾸는 것도 막아야 함.
DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM staff_profiles
      WHERE staff_profiles.id = auth.uid() AND staff_profiles.role = 'master'
    )
    OR
    staff_name = (SELECT display_name FROM staff_profiles WHERE staff_profiles.id = auth.uid())
  )
);

-- DELETE 정책(customers_delete)은 이미 master 전용으로 잘 돼있어서 손 안 댐.
-- INSERT 정책은 그대로 둠(스태프가 신규고객 등록하는 건 문제 없음 — 앱 로직이
-- staffName을 본인 이름으로 자동 세팅하므로).

-- ══════════════════════════════════════════════════════════
-- estimates 테이블도 동일한 문제 확인됨 (2026-08-05 추가 확인) — 같은 방식으로 강화
-- ══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS estimates_select ON estimates;
CREATE POLICY estimates_select ON estimates FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM staff_profiles
      WHERE staff_profiles.id = auth.uid() AND staff_profiles.role = 'master'
    )
    OR
    staff_name = (SELECT display_name FROM staff_profiles WHERE staff_profiles.id = auth.uid())
  )
);

DROP POLICY IF EXISTS estimates_update ON estimates;
CREATE POLICY estimates_update ON estimates FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM staff_profiles
      WHERE staff_profiles.id = auth.uid() AND staff_profiles.role = 'master'
    )
    OR
    staff_name = (SELECT display_name FROM staff_profiles WHERE staff_profiles.id = auth.uid())
  )
);

-- ══════════════════════════════════════════════════════════
-- 롤백 스크립트 (문제 생기면 이걸로 즉시 원복)
-- ══════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS customers_select ON customers;
-- CREATE POLICY customers_select ON customers FOR SELECT
-- USING (( SELECT auth.uid() AS uid) IS NOT NULL);
--
-- DROP POLICY IF EXISTS customers_update ON customers;
-- CREATE POLICY customers_update ON customers FOR UPDATE
-- USING (( SELECT auth.uid() AS uid) IS NOT NULL);
--
-- DROP POLICY IF EXISTS estimates_select ON estimates;
-- CREATE POLICY estimates_select ON estimates FOR SELECT
-- USING (( SELECT auth.uid() AS uid) IS NOT NULL);
--
-- DROP POLICY IF EXISTS estimates_update ON estimates;
-- CREATE POLICY estimates_update ON estimates FOR UPDATE
-- USING (( SELECT auth.uid() AS uid) IS NOT NULL);
