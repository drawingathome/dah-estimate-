-- 되돌리기: 11-07 수정 전(10-26 초안 적용본)으로 복원
create or replace function public.dah_closed_month_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := false;
  v_old_m text; v_new_m text; v_hit text;
  v_refund boolean := coalesce(current_setting('dah.refund_in_progress', true), '') = '1';
  v_cdate text;
begin
  if v_uid is not null then
    select exists (select 1 from public.staff_profiles where id = v_uid and role = 'master') into v_master;
  end if;

  if tg_table_name = 'estimate_extra_payments' then
    v_old_m := case when tg_op in ('UPDATE','DELETE') then left(coalesce(old.paid_date,''), 7) end;
    v_new_m := case when tg_op in ('INSERT','UPDATE') then left(coalesce(new.paid_date,''), 7) end;
    -- 날짜·금액이 실제로 안 바뀐 UPDATE는 통과
    if tg_op = 'UPDATE' and old.paid_date is not distinct from new.paid_date and old.amount is not distinct from new.amount then
      return new;
    end if;
  elsif tg_table_name = 'estimates' then
    -- 입금일/금액이 바뀐 칸만 검사(선금·잔금)
    if tg_op <> 'UPDATE' then return coalesce(new, old); end if;
    select nullif(c.date::text,'') into v_cdate from public.customers c where c.id = new.client_id;
    if old.deposit_date is not distinct from new.deposit_date and old.deposit_amount is not distinct from new.deposit_amount
       and old.balance_date is not distinct from new.balance_date and old.balance_amount is not distinct from new.balance_amount then
      return new;
    end if;
    -- 바뀐 칸의 옛/새 날짜 중 마감월에 걸리는 첫 달을 찾음.
    -- 입금일이 비어 있으면 월 매출 계산(independent_month_check)과 같이 '고객 날짜(customers.date)'의 달로 본다(잔금일 없는 64건 대응).
    select m into v_hit from (
      select left(coalesce(nullif(old.deposit_date,''), v_cdate),7) m where old.deposit_date is distinct from new.deposit_date or old.deposit_amount is distinct from new.deposit_amount
      union select left(coalesce(nullif(new.deposit_date,''), v_cdate),7) where old.deposit_date is distinct from new.deposit_date or old.deposit_amount is distinct from new.deposit_amount
      union select left(coalesce(nullif(old.balance_date,''), v_cdate),7) where old.balance_date is distinct from new.balance_date or old.balance_amount is distinct from new.balance_amount
      union select left(coalesce(nullif(new.balance_date,''), v_cdate),7) where old.balance_date is distinct from new.balance_date or old.balance_amount is distinct from new.balance_amount
    ) x where m is not null and m <> '' and exists (select 1 from public.monthly_close c where c.month = x.m) limit 1;
    if v_hit is null then return new; end if;
    v_old_m := v_hit; v_new_m := v_hit;
  end if;

  v_hit := coalesce(v_hit, case when exists (select 1 from public.monthly_close c where c.month = v_new_m) then v_new_m
                                when exists (select 1 from public.monthly_close c where c.month = v_old_m) then v_old_m end);
  if v_hit is null then return coalesce(new, old); end if;

  -- 합법적 환불(register_refund)은 통과 + 기록
  if not v_refund and v_uid is not null and not v_master then
    raise exception '마감된 달(%)의 입금 기록은 수정할 수 없습니다. 마스터에게 요청하세요.', v_hit using errcode = '42501';
  end if;

  insert into public.closed_month_edit_log(actor, tbl, row_id, month, action, old_val, new_val)
  values (v_uid, tg_table_name, coalesce(new.id::text, old.id::text), v_hit,
          case when v_refund then 'refund' else tg_op end,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
