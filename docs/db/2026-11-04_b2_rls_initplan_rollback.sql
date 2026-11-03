-- 되돌리기: 아래 22개 정책만 (select auth.uid()) → auth.uid() 원래 모양으로.
do $$
declare r record; q text; w text; stmt text;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public' and (tablename || '.' || policyname) = any (array[
      'app_settings.app_settings_update','client_error_logs.client_error_logs_select','customer_history.customer_history_select',
      'customers.customers_delete','customers.customers_select','customers.customers_update','estimate_history.estimate_history_select',
      'estimates.estimates_delete','estimates.estimates_select','estimates.estimates_update','integrity_acks.integrity_acks_insert',
      'integrity_acks.integrity_acks_select','integrity_daily_log.integrity_daily_log_select','monthly_close.monthly_close_delete',
      'monthly_close.monthly_close_insert','monthly_close.monthly_close_select','monthly_close.monthly_close_update',
      'payment_ledger.payment_ledger_delete','payment_ledger.payment_ledger_insert','payment_ledger.payment_ledger_select',
      'payment_ledger.payment_ledger_update','payment_refunds.payment_refunds_select']) loop
    stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if r.qual is not null then
      stmt := stmt || ' using (' || replace(replace(r.qual, '( SELECT auth.uid() AS uid)', 'auth.uid()'), '(select auth.uid())', 'auth.uid()') || ')';
    end if;
    if r.with_check is not null then
      stmt := stmt || ' with check (' || replace(replace(r.with_check, '( SELECT auth.uid() AS uid)', 'auth.uid()'), '(select auth.uid())', 'auth.uid()') || ')';
    end if;
    execute stmt;
  end loop;
end $$;
