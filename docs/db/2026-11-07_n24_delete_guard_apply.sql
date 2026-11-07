-- N-24 삭제 가드(11-07 적용, 독립 검토 9번): 마감된 달의 입금이 있는 견적서는 실장이 지울 수 없음(마스터·서버는 허용+기록).
create or replace function public.dah_closed_month_delete_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := false;
  v_cdate text; v_hit text;
begin
  if v_uid is not null then
    select exists (select 1 from public.staff_profiles where id = v_uid and role = 'master') into v_master;
  end if;
  select nullif(c.date::text,'') into v_cdate from public.customers c where c.id = old.client_id;
  select m into v_hit from (
    select left(coalesce(nullif(old.deposit_date,''), v_cdate),7) m where coalesce(old.deposit_amount,0) > 0
    union select left(coalesce(nullif(old.balance_date,''), v_cdate),7) where coalesce(old.balance_amount,0) > 0
  ) x where m is not null and m <> '' and exists (select 1 from public.monthly_close c where c.month = x.m) limit 1;
  if v_hit is null then return old; end if;
  if v_uid is not null and not v_master then
    raise exception '마감된 달(%)의 입금이 있는 견적서는 삭제할 수 없습니다. 마스터에게 요청하세요.', v_hit using errcode = '42501';
  end if;
  insert into public.closed_month_edit_log(actor, tbl, row_id, month, action, old_val, new_val)
  values (v_uid, 'estimates', old.id::text, v_hit, 'DELETE', to_jsonb(old), null);
  return old;
end $$;
revoke all on function public.dah_closed_month_delete_guard() from public, anon, authenticated;
create trigger trg_closed_month_delete_guard before delete on public.estimates
  for each row execute function public.dah_closed_month_delete_guard();
