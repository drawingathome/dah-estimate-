-- 2026-10-14 (2-4) 점검 규칙 PAID_NO_ESTIMATE: 고객 칸에 입금이 있는데 보관되지 않은 견적서가 하나도 없는 고객(견적서 삭제 후 남는 돈 기록).
-- 운영 DB 적용 완료. 적용 전 해당 고객 0명. 모의 실행(롤백): 입금 있는 단일 견적서 고객의 견적서를 보관 처리하면 규칙이 1건 감지함을 확인.
-- 되돌리기: create or replace view로 이 규칙의 UNION ALL 블록을 뺀 정의를 다시 적용.
DO $m$
declare d text; d2 text;
  add_ text := $q$
 UNION ALL
 SELECT 'PAID_NO_ESTIMATE'::text AS code, 'warn'::text AS severity, c.id AS customer_id, c.client_name, c.staff_name,
   ('입금 '::text || (COALESCE(c.deposit_amount, 0::numeric) + COALESCE(c.balance_amount, 0::numeric))::bigint || '원이 기록돼 있는데 견적서가 하나도 없음 - 견적서를 지운 경우 받은 돈 기록 확인'::text) AS detail
 FROM customers c
 WHERE NOT COALESCE(c.is_archived, false)
   AND (COALESCE(c.deposit_amount, 0::numeric) + COALESCE(c.balance_amount, 0::numeric)) > 0
   AND NOT EXISTS (SELECT 1 FROM estimates x WHERE x.client_id = c.id AND NOT COALESCE(x.is_archived, false))$q$;
begin
  d := rtrim(pg_get_viewdef('public.data_integrity_issues'::regclass), '; ' || chr(10));
  if position('PAID_NO_ESTIMATE' in d) > 0 then return; end if;
  d2 := d || add_;
  execute 'create or replace view public.data_integrity_issues as ' || d2;
end $m$;
