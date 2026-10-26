-- ============================================================
-- [초안·미적용·미예행] N-24 마감월 입력 가드 (2026-10-26)
-- 상태: 선혜님 Q9 결정 전. 이 파일은 운영 DB에 실행하지 않았음.
-- 적용 순서: Q9 결정 → 예행(롤백되는 트랜잭션) → 선혜님 승인 → 적용 → 읽기 검증
-- 되돌리기: 2026-10-26_closed_month_guard_DRAFT_rollback.sql
--
-- 규칙(Phase 1, 추천안 일부): 마감된 달(monthly_close에 있는 달)에 속한 입금일·추가결제일이
--   새로 생기거나 바뀌거나 지워질 때
--   - 마스터가 아니면(실장 등 로그인 사용자) 거부
--   - 마스터·서버(auth.uid() 없음)는 허용하되 closed_month_edit_log에 기록
--   (사유 필수는 화면 입력칸이 필요해서 Phase 2)
-- 변수(반드시 예행으로 확인): register_refund가 마감월 입금일의 견적서 입금액을 줄임(합법적 환불).
--   환불은 환불일 달에 마이너스로 잡히므로 마감월 숫자를 바꾸지 않음 → 이 가드가 환불을 막으면 안 됨.
--   → register_refund 안에서 set_config('dah.refund_in_progress','1',true)로 표시하고 가드는 그 표시가 있으면 통과(기록만).
-- ============================================================

create table if not exists public.closed_month_edit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  tbl text not null,
  row_id text,
  month text not null,
  action text not null,
  old_val jsonb,
  new_val jsonb
);
alter table public.closed_month_edit_log enable row level security;
-- 마스터만 읽기
drop policy if exists closed_month_edit_log_select on public.closed_month_edit_log;
create policy closed_month_edit_log_select on public.closed_month_edit_log for select
  using (exists (select 1 from public.staff_profiles p where p.id = (select auth.uid()) and p.role = 'master'));

create or replace function public.dah_closed_month_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_master boolean := false;
  v_old_m text; v_new_m text; v_hit text;
  v_refund boolean := coalesce(current_setting('dah.refund_in_progress', true), '') = '1';
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
    if old.deposit_date is not distinct from new.deposit_date and old.deposit_amount is not distinct from new.deposit_amount
       and old.balance_date is not distinct from new.balance_date and old.balance_amount is not distinct from new.balance_amount then
      return new;
    end if;
    -- 바뀐 칸의 옛/새 날짜 중 마감월에 걸리는 첫 달을 찾음
    select m into v_hit from (
      select left(old.deposit_date,7) m where old.deposit_date is distinct from new.deposit_date or old.deposit_amount is distinct from new.deposit_amount
      union select left(new.deposit_date,7) where old.deposit_date is distinct from new.deposit_date or old.deposit_amount is distinct from new.deposit_amount
      union select left(old.balance_date,7) where old.balance_date is distinct from new.balance_date or old.balance_amount is distinct from new.balance_amount
      union select left(new.balance_date,7) where old.balance_date is distinct from new.balance_date or old.balance_amount is distinct from new.balance_amount
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
revoke all on function public.dah_closed_month_guard() from public, anon, authenticated;

drop trigger if exists trg_closed_month_guard_extra on public.estimate_extra_payments;
create trigger trg_closed_month_guard_extra before insert or update or delete on public.estimate_extra_payments
  for each row execute function public.dah_closed_month_guard();
drop trigger if exists trg_closed_month_guard_est on public.estimates;
create trigger trg_closed_month_guard_est before update on public.estimates
  for each row execute function public.dah_closed_month_guard();

-- TODO(예행 후): register_refund 본문 첫머리(권한 확인 직후)에
--   perform set_config('dah.refund_in_progress', '1', true);
-- 한 줄 추가 (트랜잭션 안에서만 유효). 함수 전체 교체 SQL은 예행 때 함께 작성.
