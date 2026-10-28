-- 운영 DB(10-29 읽기 전용 조회, pg_get_functiondef)의 register_refund / reverse_refund 본문을 그대로 옮긴 것 — 시험용 복사본(운영에 실행 금지)
CREATE OR REPLACE FUNCTION public.register_refund(p_estimate_id uuid, p_slot text, p_amount numeric, p_refund_date text, p_reason text, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare e record; v_paid_date text; v_method text; v_cur numeric; v_id uuid;
begin
  if not exists (select 1 from public.staff_profiles where id = auth.uid() and role = 'master') then
    raise exception '환불 등록은 마스터만 할 수 있습니다.' using errcode='42501'; end if;
  if p_request_id is not null then select id into v_id from public.payment_refunds where request_id = p_request_id; if found then return v_id; end if; end if;
  if p_slot not in ('deposit','balance') then raise exception '환불할 칸(선금/잔금)이 올바르지 않습니다.'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception '환불 금액은 0보다 커야 합니다.'; end if;
  if p_refund_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '환불일을 입력해 주세요.'; end if;
  if length(btrim(coalesce(p_reason,''))) = 0 then raise exception '환불 사유를 입력해 주세요.'; end if;
  select * into e from public.estimates where id = p_estimate_id for update;
  if not found then raise exception '견적서를 찾을 수 없습니다.'; end if;
  if p_slot = 'deposit' then v_cur := coalesce(e.deposit_amount,0); v_paid_date := e.deposit_date; v_method := e.deposit_method;
  else v_cur := coalesce(e.balance_amount,0); v_paid_date := e.balance_date; v_method := e.balance_method; end if;
  if p_amount > v_cur then raise exception '환불 금액(%원)이 해당 입금액(%원)보다 큽니다.', p_amount, v_cur; end if;
  if coalesce(v_paid_date,'') = '' then raise exception '입금일이 없는 입금은 환불 등록 전에 입금일부터 입력해 주세요.'; end if;
  if p_refund_date < v_paid_date then raise exception '환불일이 입금일(%)보다 빠를 수 없습니다.', v_paid_date; end if;
  insert into public.payment_refunds(entry_type, estimate_id, client_id, customer_name, staff_name, slot, amount, paid_date, pay_method, refund_date, reason, request_id)
    values ('refund', e.id, e.client_id, e.customer_name, e.staff_name, p_slot, p_amount, v_paid_date, v_method, p_refund_date, btrim(p_reason), p_request_id) returning id into v_id;
  if p_slot = 'deposit' then
    update public.estimates set deposit_amount = v_cur - p_amount,
      deposit_date = case when v_cur - p_amount = 0 then '' else deposit_date end,
      deposit_method = case when v_cur - p_amount = 0 then '' else deposit_method end where id = e.id;
  else
    update public.estimates set balance_amount = v_cur - p_amount,
      balance_date = case when v_cur - p_amount = 0 then '' else balance_date end,
      balance_method = case when v_cur - p_amount = 0 then '' else balance_method end where id = e.id;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.reverse_refund(p_refund_id uuid, p_reason text, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; e record; v_id uuid; v_cur numeric; v_date text;
begin
  if not exists (select 1 from public.staff_profiles where id = auth.uid() and role = 'master') then
    raise exception '환불 취소는 마스터만 할 수 있습니다.' using errcode='42501'; end if;
  if p_request_id is not null then select id into v_id from public.payment_refunds where request_id = p_request_id; if found then return v_id; end if; end if;
  if length(btrim(coalesce(p_reason,''))) = 0 then raise exception '취소 사유를 입력해 주세요.'; end if;
  select * into r from public.payment_refunds where id = p_refund_id for update;
  if not found or r.entry_type <> 'refund' then raise exception '되돌릴 환불 기록을 찾을 수 없습니다.'; end if;
  if exists (select 1 from public.payment_refunds where reverses_id = r.id) then raise exception '이미 취소된 환불입니다.'; end if;
  select * into e from public.estimates where id = r.estimate_id for update;
  if not found then raise exception '견적서가 이미 삭제되어 환불을 되돌릴 수 없습니다.'; end if;
  if (r.slot = 'deposit' and coalesce(e.deposit_date,'') not in ('', r.paid_date)) or (r.slot = 'balance' and coalesce(e.balance_date,'') not in ('', r.paid_date)) then
    raise exception '그 칸에 환불 이후 새 입금이 기록되어 있어 취소할 수 없습니다. 새 입금을 먼저 정리해 주세요.'; end if;
  insert into public.payment_refunds(entry_type, reverses_id, estimate_id, client_id, customer_name, staff_name, slot, amount, paid_date, pay_method, refund_date, reason, request_id)
    values ('reversal', r.id, r.estimate_id, r.client_id, r.customer_name, r.staff_name, r.slot, r.amount, r.paid_date, r.pay_method, to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'), btrim(p_reason), p_request_id) returning id into v_id;
  if r.slot = 'deposit' then
    v_cur := coalesce(e.deposit_amount,0);
    update public.estimates set deposit_amount = v_cur + r.amount,
      deposit_date = case when coalesce(deposit_date,'')='' then r.paid_date else deposit_date end,
      deposit_method = case when coalesce(deposit_method,'')='' then r.pay_method else deposit_method end where id = e.id;
  else
    v_cur := coalesce(e.balance_amount,0);
    update public.estimates set balance_amount = v_cur + r.amount,
      balance_date = case when coalesce(balance_date,'')='' then r.paid_date else balance_date end,
      balance_method = case when coalesce(balance_method,'')='' then r.pay_method else balance_method end where id = e.id;
  end if;
  return v_id;
end $function$;
