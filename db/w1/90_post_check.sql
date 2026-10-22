-- 적용 직후 자동 검증: 하나라도 틀리면 예외 → 전체 취소(트랜잭션)
do $$
declare n int; d int;
begin
  -- 고객/견적서 값이 하나도 바뀌지 않았는가 (적용은 구조만 바꾸고 데이터는 건드리면 안 됨)
  select count(*) into d from public.customers c join backup_w1_20261022.customers b using (id)
   where to_jsonb(c) is distinct from to_jsonb(b);
  if d <> 0 then raise exception '검증 실패: 고객 % 건이 적용 중 바뀜', d; end if;
  select count(*) into d from public.estimates e join backup_w1_20261022.estimates b using (id)
   where e.id is not null and (e.price, e.performance_revenue, e.deposit_amount, e.balance_amount, e.confirmed_at, e.client_id, e.is_archived)
         is distinct from (b.price, b.performance_revenue, b.deposit_amount, b.balance_amount, b.confirmed_at, b.client_id, b.is_archived);
  if d <> 0 then raise exception '검증 실패: 견적서 % 건이 적용 중 바뀜', d; end if;
  select count(*) into n from public.customers; select count(*) into d from backup_w1_20261022.customers;
  if n <> d then raise exception '검증 실패: 고객 수 % -> %', d, n; end if;
  -- 새 규칙이 실제로 존재하는가
  for n in select 1 where not exists (select 1 from pg_trigger where tgname='trg_customers_auto_stage' and tgrelid='public.customers'::regclass) loop raise exception '검증 실패: 단계 트리거 없음'; end loop;
  for n in select 1 where not exists (select 1 from pg_trigger where tgname='trg_sync_customer_price') loop raise exception '검증 실패: 금액 트리거 없음'; end loop;
  for n in select 1 where not exists (select 1 from pg_trigger where tgname='trg_extra_payment_touch_customer') loop raise exception '검증 실패: 추가결제 트리거 없음'; end loop;
  for n in select 1 where not exists (select 1 from pg_trigger where tgname='trg_estimates_confirm_guard') loop raise exception '검증 실패: 확정 보호 트리거 없음'; end loop;
  -- 보안: 점검 뷰 security_invoker, 기록표 RLS
  for n in select 1 where not exists (select 1 from pg_class where relname='data_integrity_issues' and relnamespace='public'::regnamespace and 'security_invoker=true' = any(reloptions)) loop raise exception '검증 실패: 점검 뷰 security_invoker 꺼짐'; end loop;
  for n in select 1 where not exists (select 1 from pg_class where relname='estimate_confirm_log' and relrowsecurity) loop raise exception '검증 실패: 확정 기록표 RLS 꺼짐'; end loop;
  -- 기존 점검 뷰가 여전히 읽힘
  perform count(*) from public.data_integrity_issues;
end $$;
