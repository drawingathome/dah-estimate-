-- 2026-10-01(선혜님 - "또 발생 안 하겠어??" 질문에 대한 구조적 답변)
-- 이미 Supabase에 직접 적용 완료(mcp__Supabase__apply_migration) - 이 파일은 그 내용의
-- 저장소 기록용 사본. 다시 실행할 필요 없음(이미 운영 DB에 반영돼 있음).
--
-- 목적: "견적서에 결제를 저장할 때 고객 테이블까지 같이 갱신해야 한다"를 클라이언트 JS가
-- 매번 기억해야 하는 구조(2026-09-21에 한 번 깜빡해서 몇 달간 틀어져 있었음, 최금희 등
-- 다수 고객 영향) 대신, DB 트리거로 자동화 - 어떤 코드 경로든 estimates를 바꾸면
-- customers.deposit_amount/balance_amount가 자동으로 맞춰짐.
--
-- 안전장치: GREATEST(새로 계산한 합계, 기존 customers 값)로 절대 기존 값보다 작아지지
-- 않음 - 2026-09-21 이전 레거시 고객(견적서엔 입금기록 0, customers 레벨에만 과거 거액)의
-- 과거 기록을 이 트리거가 지우지 않도록 보호.
--
-- 실제 검증(2026-10-01, Supabase MCP로 직접 실행): 테스트 고객 생성 → 견적서 INSERT시
-- 자동 반영 확인 → 견적서 UPDATE시 자동 반영 확인 → 고객레벨에 과거 거액을 수동 세팅한
-- 뒤 견적서를 작은 값으로 바꿔도 과거 거액이 안 지워지는 것 확인 → 테스트 레코드 정리.

CREATE OR REPLACE FUNCTION sync_customer_payment_from_estimates()
RETURNS TRIGGER AS $$
DECLARE
  target_id BIGINT;
  new_dep NUMERIC;
  new_bal NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.client_id;
  ELSE
    target_id := NEW.client_id;
  END IF;

  IF target_id IS NOT NULL THEN
    SELECT COALESCE(SUM(deposit_amount), 0), COALESCE(SUM(balance_amount), 0)
      INTO new_dep, new_bal
      FROM estimates
      WHERE client_id = target_id AND is_archived = false;

    UPDATE customers
      SET deposit_amount = GREATEST(new_dep, COALESCE(deposit_amount, 0)),
          balance_amount = GREATEST(new_bal, COALESCE(balance_amount, 0))
      WHERE id = target_id;
  END IF;

  -- UPDATE로 견적서가 다른 고객에게로 옮겨간 경우(client_id 자체가 바뀜), 예전 고객도 재계산
  IF TG_OP = 'UPDATE' AND OLD.client_id IS DISTINCT FROM NEW.client_id AND OLD.client_id IS NOT NULL THEN
    SELECT COALESCE(SUM(deposit_amount), 0), COALESCE(SUM(balance_amount), 0)
      INTO new_dep, new_bal
      FROM estimates
      WHERE client_id = OLD.client_id AND is_archived = false;

    UPDATE customers
      SET deposit_amount = GREATEST(new_dep, COALESCE(deposit_amount, 0)),
          balance_amount = GREATEST(new_bal, COALESCE(balance_amount, 0))
      WHERE id = OLD.client_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_customer_payment ON estimates;
CREATE TRIGGER trg_sync_customer_payment
  AFTER INSERT OR DELETE OR UPDATE OF deposit_amount, balance_amount, is_archived, client_id
  ON estimates
  FOR EACH ROW
  EXECUTE FUNCTION sync_customer_payment_from_estimates();
