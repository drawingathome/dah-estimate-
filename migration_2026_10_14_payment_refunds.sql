-- 2026-10-14 1-4/1-5: 환불 기록 표(추가만 가능) + 마스터 전용 환불 등록/취소 함수 + 실장의 입금 감액·입금일 변경 차단.
-- 원칙: 입금은 원본을 지우지 않고, 환불은 "환불 -얼마" 기록을 따로 쌓는다. 환불로 줄어드는 칸의 원래 입금일·금액은 환불 행에 남는다.
create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null default 'refund' check (entry_type in ('refund','reversal')),
  reverses_id uuid unique references public.payment_refunds(id),
  estimate_id uuid not null,            -- 외래키를 걸지 않음: 견적서·고객을 삭제해도 환불 기록은 남기기 위함
  client_id bigint,
  customer_name text,
  staff_name text,                       -- 그 시점의 담당자(나중에 이관돼도 당시 실적 귀속 확인용)
  slot text not null check (slot in ('deposit','balance')),
  amount numeric not null check (amount > 0),
  paid_date text not null check (paid_date ~ '^\d{4}-\d{2}-\d{2}$'),   -- 환불되는 입금의 원래 입금일
  pay_method text,
  refund_date text not null check (refund_date ~ '^\d{4}-\d{2}-\d{2}$'),
  reason text not null check (length(btrim(reason)) > 0),
  request_id uuid unique,                -- 같은 버튼을 두 번 눌러도 한 번만 기록되게
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (refund_date >= paid_date or entry_type = 'reversal')
);
alter table public.payment_refunds enable row level security;
create policy payment_refunds_select on public.payment_refunds for select using (
  auth.uid() is not null and (
    exists (select 1 from public.staff_profiles p where p.id = auth.uid() and p.role = 'master')
    or staff_name = (select display_name from public.staff_profiles where id = auth.uid())));
-- insert/update/delete 정책 없음 = 앱에서 직접 쓰기 불가. 아래 함수로만 기록.
create or replace function public.payment_refunds_append_only() returns trigger language plpgsql as $f$
begin raise exception '환불 기록은 수정·삭제할 수 없습니다. 잘못 등록했다면 "환불 취소"로 되돌려 주세요.' using errcode='42501'; end $f$;
create or replace trigger trg_payment_refunds_append_only before update or delete on public.payment_refunds
  for each row execute function public.payment_refunds_append_only();

create or replace function public.register_refund(p_estimate_id uuid, p_slot text, p_amount numeric, p_refund_date text, p_reason text, p_request_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $f$
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
end $f$;

create or replace function public.reverse_refund(p_refund_id uuid, p_reason text, p_request_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $f$
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
end $f$;
revoke execute on function public.register_refund(uuid,text,numeric,text,text,uuid) from public, anon;
revoke execute on function public.reverse_refund(uuid,text,uuid) from public, anon;
grant execute on function public.register_refund(uuid,text,numeric,text,text,uuid) to authenticated;
grant execute on function public.reverse_refund(uuid,text,uuid) to authenticated;

-- 실장(비마스터)의 입금 감액·기존 입금일 변경 차단. 마스터·서버 작업(로그인 없음)·DB 트리거가 내부에서 하는 갱신은 통과.
create or replace function public.guard_payment_reduction() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v_role text;
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return NEW; end if;
  select role into v_role from public.staff_profiles where id = auth.uid();
  if v_role = 'master' then return NEW; end if;
  if coalesce(NEW.deposit_amount,0) < coalesce(OLD.deposit_amount,0) or coalesce(NEW.balance_amount,0) < coalesce(OLD.balance_amount,0) then
    raise exception '이미 기록된 입금액은 줄이거나 지울 수 없습니다. 환불·정정은 마스터에게 요청해 주세요.' using errcode='42501'; end if;
  if TG_TABLE_NAME = 'estimates' then
    if coalesce(OLD.deposit_amount,0) > 0 and coalesce(OLD.deposit_date,'') <> '' and NEW.deposit_date is distinct from OLD.deposit_date
       or coalesce(OLD.balance_amount,0) > 0 and coalesce(OLD.balance_date,'') <> '' and NEW.balance_date is distinct from OLD.balance_date then
      raise exception '이미 기록된 입금의 입금일은 바꿀 수 없습니다. 정정은 마스터에게 요청해 주세요.' using errcode='42501'; end if;
  end if;
  return NEW;
end $f$;
create or replace trigger trg_guard_payment_reduction_estimates before update of deposit_amount, balance_amount, deposit_date, balance_date on public.estimates
  for each row execute function public.guard_payment_reduction();
create or replace trigger trg_guard_payment_reduction_customers before update of deposit_amount, balance_amount on public.customers
  for each row execute function public.guard_payment_reduction();
