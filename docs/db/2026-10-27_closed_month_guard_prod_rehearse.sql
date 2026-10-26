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
revoke all on function public.dah_closed_month_guard() from public, anon, authenticated;

drop trigger if exists trg_closed_month_guard_extra on public.estimate_extra_payments;
create trigger trg_closed_month_guard_extra before insert or update or delete on public.estimate_extra_payments
  for each row execute function public.dah_closed_month_guard();
drop trigger if exists trg_closed_month_guard_est on public.estimates;
create trigger trg_closed_month_guard_est before update on public.estimates
  for each row execute function public.dah_closed_month_guard();

-- 정정(2026-10-27, 운영 함수 본문을 읽어 확인): register_refund·reverse_refund는 함수 맨 처음에 '마스터만' 검사한다.
--   가드는 마스터를 어차피 통과시키고 기록만 남기므로, 환불 함수에 dah.refund_in_progress 표시 한 줄을 넣는 수정은 **필요 없다**
--   (돈 함수를 건드리지 않는 쪽이 더 안전). 표시 변수는 있으면 기록 이름만 'refund'로 바꿔 줄 뿐이다.
--   근거: docs/db/2026-10-26_closed_month_guard_refund_rehearse.mjs (환불 함수 변경 없이 마스터 환불 통과·기록, 실장은 거부).
-- ============================================================
-- [운영 예행용 시험 블록 · 반드시 마지막에 오류를 내서 전부 취소됨]
-- 이 블록은 "마감월 가드 적용 SQL" 바로 뒤에 붙여 한 번에 실행한다(합본: 2026-10-27_closed_month_guard_prod_rehearse.sql).
-- 구조: 가드 설치 → 시험(각각 작은 안쪽 구역에서 실행, 실패해도 바깥은 계속) → 마지막에 무조건 REHEARSAL_RESULT 오류 → 위 모든 변경이 자동 취소.
-- 결과는 오류 메시지 안에 담겨 돌아온다. 오류 메시지에 'REHEARSAL_RESULT'가 없으면 취소가 보장되지 않으므로 즉시 읽기로 확인하고 되돌리기 SQL을 실행한다.
-- 시험 대상은 운영 데이터에서 자동으로 고르며(마감월 견적서 1건·열린 달 견적서 1건·마스터·실장 각 1명) 모든 수정은 취소된다.
-- ============================================================
do $rehearse$
declare
  v_res text := '';
  v_master uuid; v_staff uuid; v_est uuid; v_open_est uuid;
  v_n0 int; v_n1 int; v_msg text; v_first text;
begin
  select id into v_master from public.staff_profiles where role = 'master' limit 1;
  select id into v_staff  from public.staff_profiles where role <> 'master' limit 1;
  select id into v_est from public.estimates
    where left(coalesce(deposit_date,''),7) in (select month from public.monthly_close)
      and coalesce(deposit_amount,0) > 0 and coalesce(is_archived,false) = false limit 1;
  select id into v_open_est from public.estimates
    where coalesce(deposit_date,'') <> '' and left(deposit_date,7) not in (select month from public.monthly_close)
      and coalesce(deposit_amount,0) > 0 and coalesce(is_archived,false) = false limit 1;
  v_res := v_res || format('대상: 마스터=%s 실장=%s 마감월견적서=%s 열린달견적서=%s; ', v_master is not null, v_staff is not null, v_est is not null, v_open_est is not null);

  -- 시험 0: 실행 순서 (가드가 수정 BEFORE 트리거 중 가장 먼저)
  select t.tgname into v_first from pg_trigger t
   where t.tgrelid = 'public.estimates'::regclass and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16 order by t.tgname limit 1;
  v_res := v_res || case when v_first = 'trg_closed_month_guard_est' then 'T0 순서 PASS; ' else 'T0 순서 FAIL(' || coalesce(v_first,'-') || '); ' end;

  -- 시험 1: 실장이 마감월 입금액을 바꾸면 거부
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff)::text, true);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    update public.estimates set deposit_amount = deposit_amount + 1 where id = v_est;
    v_res := v_res || 'T1 실장 마감월 변경 FAIL(막히지 않음); ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_res := v_res || case when v_msg like '%마감된 달(%' then 'T1 실장 마감월 변경 거부 PASS; ' else 'T1 FAIL(다른 이유로 거부: ' || left(v_msg,60) || '); ' end;
  end;

  -- 시험 2: 실장이 마감월 견적서의 돈과 무관한 수정은 허용
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff)::text, true);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    update public.estimates set updated_at = now() where id = v_est;
    v_res := v_res || 'T2 돈 무관 수정 허용 PASS; ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_res := v_res || 'T2 FAIL(' || left(v_msg,60) || '); ';
  end;

  -- 시험 3: 마스터는 마감월 정정 가능 + 기록 1건
  begin
    select count(*) into v_n0 from public.closed_month_edit_log;
    perform set_config('request.jwt.claims', json_build_object('sub', v_master)::text, true);
    perform set_config('request.jwt.claim.sub', v_master::text, true);
    update public.estimates set deposit_amount = deposit_amount + 1 where id = v_est;
    select count(*) into v_n1 from public.closed_month_edit_log;
    v_res := v_res || case when v_n1 = v_n0 + 1 then 'T3 마스터 정정 허용+기록 PASS; ' else 'T3 FAIL(기록 ' || v_n0 || '→' || v_n1 || '); ' end;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_res := v_res || 'T3 FAIL(' || left(v_msg,60) || '); ';
  end;

  -- 시험 4: 열린 달 견적서는 가드가 방해하지 않음(마감월 문구가 나오면 안 됨)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff)::text, true);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    update public.estimates set deposit_amount = deposit_amount + 1 where id = v_open_est;
    v_res := v_res || 'T4 열린 달 변경 통과 PASS; ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_res := v_res || case when v_msg like '%마감된 달(%' then 'T4 FAIL(열린 달인데 마감월 거부)' else 'T4 열린 달: 기존 보호만 작동 PASS(' || left(v_msg,40) || ')' end || '; ';
  end;

  -- 무조건 취소: 위의 설치·수정이 모두 되돌려진다
  raise exception 'REHEARSAL_RESULT|%', v_res;
end
$rehearse$;
