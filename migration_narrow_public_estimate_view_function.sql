-- 2026-10-01(선혜님 - "전문가입장에서도 보라니깐 놔둬도 될 정도이니??" 재점검 후 "하자")
-- 이미 Supabase에 직접 적용 완료(mcp__Supabase__apply_migration) - 이 파일은 저장소 기록용 사본.
--
-- 목적: est-public-view.js(알림톡으로 보내는 "견적서 공개보기" 링크)가 예전엔 estimates
-- 테이블 전체를 "id=eq.특정값"으로 필터링해서 요청했지만, 실제 서버 권한(estimates_public_view
-- 정책, anon, qual=true)은 "조건 없이 전체 테이블을 봐도 된다"로 열려있어서, 계약금/잔금/
-- 내부메모까지 포함한 전체 데이터가 클라이언트 코드에 노출된 anon 공개 키 하나로 통째로
-- 긁힐 수 있는 구조였음.
--
-- 해결: "딱 1건, 딱 필요한 6개 필드만" 돌려주는 전용 함수를 만들고, 테이블 전체 SELECT
-- 권한은 완전히 닫음 - 다른 방법으로 더 긁어갈 길 자체가 없어짐.
-- 보안 설계: SECURITY DEFINER + search_path 고정(검색경로 조작 공격 방지, 표준 관행) +
-- 파라미터화된 쿼리(동적 SQL 없음, SQL인젝션 불가) + 보관처리(is_archived)된 견적서는
-- 함수에서도 안 보이게 + 기본으로 모두에게 열리는 실행권한을 명시적으로 잠그고 anon에게만
-- 다시 열어줌. 반환 필드는 est-public-view.js가 실제로 읽는 6개(customer_name, phone,
-- staff_name, install_date, estimate_status, line_items)만 - price/deposit_amount/
-- balance_amount/memo 등 공개 화면이 안 쓰는 필드는 전부 제외.

CREATE OR REPLACE FUNCTION get_public_estimate(p_id uuid)
RETURNS TABLE (
  customer_name text,
  phone text,
  staff_name text,
  install_date text,
  estimate_status text,
  line_items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT e.customer_name, e.phone, e.staff_name, e.install_date, e.estimate_status, e.line_items
  FROM estimates e
  WHERE e.id = p_id AND e.is_archived = false;
END;
$$;

REVOKE ALL ON FUNCTION get_public_estimate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_estimate(uuid) TO anon;

-- 이제 테이블 전체를 직접 들여다보던 옛 창구를 닫음 - 위 함수가 유일한 공개 경로가 됨.
DROP POLICY IF EXISTS estimates_public_view ON estimates;

-- 검증 완료(2026-10-01, Supabase MCP로 직접 anon 역할 전환해 재현):
-- 1) 정상 견적서 ID로 함수 호출 → 딱 6개 필드만 정확히 반환(계약금/잔금 등은 안 나옴) 확인
-- 2) 랜덤/존재 안 하는 ID → 빈 결과 확인
-- 3) 테이블 직접 SELECT(조건 없이) → 0건(완전 차단) 확인
-- 클라이언트(est-public-view.js)도 이 함수를 호출하도록 교체, 실제 브라우저로 공개보기
-- 화면이 정상 렌더링되는지까지 재현 확인(tests/public-estimate-view-narrowed-check.js).
