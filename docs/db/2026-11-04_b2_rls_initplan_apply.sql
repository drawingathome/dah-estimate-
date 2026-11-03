-- B2 RLS 성능(초안 2판, 미적용): 아래 22개 정책만, 안의 auth.uid()를 (select auth.uid())로 감싼다. 보이는 행은 동일.
-- 안전장치: ①대상이 22개가 아니면 중단 ②바꾸기 전 원래 문장을 app_settings에 글자 그대로 백업 ③3초 안에 잠금을 못 잡으면 포기 ④이미 감싼 부분은 그대로.
do $$
declare
  -- NAMES-BEGIN
  names text[] := array[
    'app_settings.app_settings_update','client_error_logs.client_error_logs_select','customer_history.customer_history_select',
    'customers.customers_delete','customers.customers_select','customers.customers_update','estimate_history.estimate_history_select',
    'estimates.estimates_delete','estimates.estimates_select','estimates.estimates_update','integrity_acks.integrity_acks_insert',
    'integrity_acks.integrity_acks_select','integrity_daily_log.integrity_daily_log_select','monthly_close.monthly_close_delete',
    'monthly_close.monthly_close_insert','monthly_close.monthly_close_select','monthly_close.monthly_close_update',
    'payment_ledger.payment_ledger_delete','payment_ledger.payment_ledger_insert','payment_ledger.payment_ledger_select',
    'payment_ledger.payment_ledger_update','payment_refunds.payment_refunds_select'];
  -- NAMES-END
  r record; q text; w text; stmt text; cnt int;
begin
  execute 'set local lock_timeout = ''3s''';
  select count(*) into cnt from pg_policies where schemaname = 'public' and (tablename || '.' || policyname) = any (names);
  if cnt <> array_length(names, 1) then raise exception '대상 정책 수가 맞지 않아 중단: 기대 %, 실제 %', array_length(names, 1), cnt; end if;
  insert into public.app_settings(key, value)
    select 'b2_policy_backup_20261104', jsonb_agg(jsonb_build_object('t', tablename, 'p', policyname, 'q', qual, 'w', with_check))
    from pg_policies where schemaname = 'public' and (tablename || '.' || policyname) = any (names)
  on conflict (key) do nothing;
  for r in select tablename, policyname, qual, with_check from pg_policies
           where schemaname = 'public' and (tablename || '.' || policyname) = any (names) loop
    q := replace(replace(coalesce(r.qual, ''), 'SELECT auth.uid() AS uid', '@@W@@'), 'select auth.uid()', '@@W2@@');
    w := replace(replace(coalesce(r.with_check, ''), 'SELECT auth.uid() AS uid', '@@W@@'), 'select auth.uid()', '@@W2@@');
    if q like '%auth.uid()%' or w like '%auth.uid()%' then
      stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
      if r.qual is not null then
        stmt := stmt || ' using (' || replace(replace(replace(q, 'auth.uid()', '(select auth.uid())'), '@@W@@', 'SELECT auth.uid() AS uid'), '@@W2@@', 'select auth.uid()') || ')';
      end if;
      if r.with_check is not null then
        stmt := stmt || ' with check (' || replace(replace(replace(w, 'auth.uid()', '(select auth.uid())'), '@@W@@', 'SELECT auth.uid() AS uid'), '@@W2@@', 'select auth.uid()') || ')';
      end if;
      execute stmt;
    end if;
  end loop;
end $$;
