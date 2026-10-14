-- 2026-10-15 점검 규칙 PAID_CUSTOMER_DELETED: 최근 30일 안에 삭제된, 입금이 기록돼 있던 고객(테스트·진단 이름 제외)을 점검 카드에 띄움.
-- 계기: 신화경(시공완료, 오지은 실장 담당)이 10-11에 삭제된 것을 아무도 몰랐음. 삭제는 customer_history(before_delete)에서 복구 가능.
-- 운영 DB 적용 완료(신화경 1건 감지, security_invoker 유지 확인). 되돌리기: 이 규칙의 UNION ALL 블록을 뺀 정의로 create or replace 후 security_invoker 재설정.
DO $m$
declare d text; d2 text;
  add_ text := $q$
 UNION ALL
 SELECT 'PAID_CUSTOMER_DELETED'::text AS code, 'warn'::text AS severity, h.customer_id AS customer_id,
   (h.snapshot ->> 'client_name') AS client_name, (h.snapshot ->> 'staff_name') AS staff_name,
   ('입금 '::text || (COALESCE((h.snapshot ->> 'deposit_amount')::numeric, 0::numeric) + COALESCE((h.snapshot ->> 'balance_amount')::numeric, 0::numeric))::bigint
     || '원이 기록돼 있던 고객이 '::text || to_char(h.changed_at AT TIME ZONE 'Asia/Seoul', 'MM-DD') || '에 삭제됨 - 의도한 삭제인지 확인(이력에서 복구 가능)'::text) AS detail
 FROM customer_history h
 WHERE h.change_type = 'before_delete'
   AND h.changed_at > (now() - interval '30 days')
   AND (COALESCE((h.snapshot ->> 'deposit_amount')::numeric, 0::numeric) + COALESCE((h.snapshot ->> 'balance_amount')::numeric, 0::numeric)) > 0
   AND COALESCE(h.snapshot ->> 'client_name', '') !~ '테스트|진단'
   AND NOT EXISTS (SELECT 1 FROM customers x WHERE x.id = h.customer_id)$q$;
begin
  d := rtrim(pg_get_viewdef('public.data_integrity_issues'::regclass), '; ' || chr(10));
  if position('PAID_CUSTOMER_DELETED' in d) > 0 then return; end if;
  d2 := d || add_;
  execute 'create or replace view public.data_integrity_issues as ' || d2;
  execute 'alter view public.data_integrity_issues set (security_invoker = true)';
end $m$;
