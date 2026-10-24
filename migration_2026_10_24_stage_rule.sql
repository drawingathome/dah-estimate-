-- 2026-10-24 단계 이동 규칙을 DB 한 곳으로 (선혜님 승인: "수정된 확정안으로 진행").
-- 규칙(앞으로만 이동. 뒤로 이동은 사람만, 이 규칙은 절대 단계를 내리지 않음):
--   선금 입금 > 0                                  → 선금결제            (기존 규칙 그대로, 항상 작동)
--   선금결제 + 선금 있음 + 실측일 확정(미정 아님)    → 실측준비중
--   (선금결제·실측준비중·확정견적) + 보관 안 된 모든 견적서 완납 → 잔금결제
--   잔금결제 + 필요한 발주 전부 체크(앱 발주 탭과 같은 기준)    → 시공준비중
-- 동작 모드(app_settings.stage_rule_mode): "off"(기본, 새 규칙 없음) / "shadow"(기록만, 단계는 안 바꿈) / "on"(실제 이동)
-- 사람이 같은 저장에서 단계를 직접 바꿨으면 그 선택이 우선. 플러그 이관 고객은 제외. 모든 이동은 customer_stage_auto_log에 기록.

create or replace function public.dah_stage_rule_mode() returns text
language sql stable security definer set search_path to '' as $$
  select coalesce((select trim(both '"' from s.value::text) from public.app_settings s where s.key = 'stage_rule_mode'), 'off')
$$;

-- 이 고객의 발주가 전부 끝났는가(order_status는 저장 중인 새 값을 받음: BEFORE 트리거에서 표에는 아직 옛 값이 있으므로). 앱(dash-customer-order.js getRelevantOrderItems/isOrderItemDone)과 같은 규칙:
-- 최신 견적서 품목에 커튼/블라인드가 있는지로 관련 항목을 정하고(품목 정보가 없으면 5개 전부), order_status의 각 항목이 완료인지 본다.
create or replace function public.dah_order_complete(p_customer_id bigint, p_order_status jsonb) returns boolean
language sql stable set search_path to 'public','pg_temp' as $$
  with e as (select (select e1.line_items from public.estimates e1 where e1.client_id = p_customer_id order by e1.created_at desc limit 1) li),
  f as (
    select case when jsonb_typeof(li) = 'array' then li else '[]'::jsonb end li from e
  ),
  cnt as (
    select (select count(*) from f, jsonb_array_elements(f.li) x where x->>'type' = 'curtain') cc,
           (select count(*) from f, jsonb_array_elements(f.li) x where x->>'type' = 'blind') bc,
           (select coalesce(jsonb_array_length(f.li), 0) from f) n
  ),
  rel as (
    select (not (cc > 0 or bc > 0 or n > 0)) or cc > 0 hc, (not (cc > 0 or bc > 0 or n > 0)) or bc > 0 hb from cnt
  ),
  items(k, r) as (
    select 'fabric', hc from rel union all select 'production', hc from rel union all select 'blind', hb from rel
    union all select 'material', hc from rel union all select 'install', (hc or hb) from rel
  ),
  st as (select coalesce(p_order_status, '{}'::jsonb) os)
  select not exists (
    select 1 from items i, st
    where i.r and not (
      case when jsonb_typeof(st.os -> i.k) = 'object' then coalesce((st.os -> i.k ->> 'done')::boolean, false)
           else coalesce((st.os ->> i.k) = 'true', false) end)
  )
$$;

-- 새 규칙을 적용했을 때의 단계(앞으로만). 고객 한 행(NEW 포함)을 받아 계산한다. 이동할 게 없으면 현재 단계 그대로 돌려준다.
create or replace function public.dah_target_stage(c public.customers) returns text
language plpgsql stable set search_path to 'public','pg_temp' as $$
declare s text := c.stage;
begin
  if coalesce(c.is_archived, false) or coalesce(c.memo, '') ~ '플러그|Pluuug' then return s; end if;
  if s = '선금결제' and coalesce(c.deposit_amount, 0) > 0
     and coalesce(c.measure_date, '') <> '' and not coalesce(c.measure_date_tbd, false) then s := '실측준비중'; end if;
  if s in ('선금결제','실측준비중','확정견적') and public.dah_customer_fully_paid(c.id) then s := '잔금결제'; end if;
  if s = '잔금결제' and public.dah_order_complete(c.id, c.order_status) then s := '시공준비중'; end if;
  return s;
end $$;

create or replace function public.dah_log_stage_rule(p_cid bigint, p_from text, p_to text, p_applied boolean) returns void
language plpgsql security definer set search_path to '' as $$
declare r text := case when p_applied then '규칙 자동 이동: ' else '[기록전용] 규칙이 이동했을 결과: ' end || p_from || ' → ' || p_to;
begin
  if not p_applied and exists (select 1 from public.customer_stage_auto_log l where l.customer_id = p_cid and l.reason = r and l.changed_at > now() - interval '12 hours') then return; end if;
  insert into public.customer_stage_auto_log(customer_id, from_stage, to_stage, reason) values (p_cid, p_from, p_to, r);
end $$;

create or replace function public.customers_auto_stage_on_deposit()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_from text; v_mode text; v_target text;
begin
  if TG_OP = 'UPDATE' then
    -- 선금 입금 → 선금결제 (기존 규칙, 항상 작동)
    if NEW.deposit_amount is distinct from OLD.deposit_amount
       and NEW.stage in ('방문예약','상담','가견적') and coalesce(NEW.deposit_amount,0) > 0 then
      v_from := NEW.stage;
      NEW.stage := '선금결제';
      insert into public.customer_stage_auto_log(customer_id, from_stage, to_stage, reason)
        values (NEW.id, v_from, NEW.stage, '선금 입금이 기록되어 자동 이동');
    end if;
    -- 2026-10-24 새 규칙(앞으로만). 같은 저장에서 사람이 단계를 직접 바꿨으면 건드리지 않는다.
    if NEW.stage = OLD.stage then
      v_mode := public.dah_stage_rule_mode();
      if v_mode in ('shadow','on') then
        v_target := public.dah_target_stage(NEW);
        if v_target is distinct from NEW.stage then
          if v_mode = 'on' then
            v_from := NEW.stage; NEW.stage := v_target;
            perform public.dah_log_stage_rule(NEW.id, v_from, v_target, true);
          else
            perform public.dah_log_stage_rule(NEW.id, NEW.stage, v_target, false);
          end if;
        end if;
      end if;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_customers_auto_stage on public.customers;
create trigger trg_customers_auto_stage before update of deposit_amount, balance_amount, price, measure_date, measure_date_tbd, order_status on public.customers
  for each row execute function public.customers_auto_stage_on_deposit();

-- 견적서·추가결제가 바뀌어 완납 상태가 달라졌을 때 그 고객을 다시 점검
create or replace function public.dah_recheck_customer_stage(p_cid bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare v_mode text; v_c public.customers; v_target text;
begin
  if p_cid is null then return; end if;
  v_mode := public.dah_stage_rule_mode();
  if v_mode not in ('shadow','on') then return; end if;
  select * into v_c from public.customers where id = p_cid;
  if not found then return; end if;
  v_target := public.dah_target_stage(v_c);
  if v_target is not distinct from v_c.stage then return; end if;
  if v_mode = 'on' then
    update public.customers set stage = v_target where id = p_cid and stage = v_c.stage;
    if found then perform public.dah_log_stage_rule(p_cid, v_c.stage, v_target, true); end if;
  else
    perform public.dah_log_stage_rule(p_cid, v_c.stage, v_target, false);
  end if;
end $$;

create or replace function public.dah_estimates_recheck_stage() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  perform public.dah_recheck_customer_stage(NEW.client_id);
  if TG_OP = 'UPDATE' and OLD.client_id is distinct from NEW.client_id then perform public.dah_recheck_customer_stage(OLD.client_id); end if;
  return null;
end $$;
drop trigger if exists trg_estimates_recheck_stage on public.estimates;
create trigger trg_estimates_recheck_stage after insert or update of deposit_amount, balance_amount, price, is_archived, client_id on public.estimates
  for each row execute function public.dah_estimates_recheck_stage();

create or replace function public.dah_extra_pay_recheck_stage() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_cid bigint;
begin
  select e.client_id into v_cid from public.estimates e where e.id = coalesce(NEW.estimate_id, OLD.estimate_id);
  perform public.dah_recheck_customer_stage(v_cid);
  return null;
end $$;
drop trigger if exists trg_extra_pay_recheck_stage on public.estimate_extra_payments;
create trigger trg_extra_pay_recheck_stage after insert or update or delete on public.estimate_extra_payments
  for each row execute function public.dah_extra_pay_recheck_stage();

-- 내부 도우미 함수는 앱(로그인 사용자)이 직접 호출하지 못하게 한다(트리거 안에서만 실행).
revoke all on function public.dah_log_stage_rule(bigint, text, text, boolean) from public, anon, authenticated;
revoke all on function public.dah_recheck_customer_stage(bigint) from public, anon, authenticated;
revoke all on function public.dah_stage_rule_mode() from public, anon, authenticated;
revoke all on function public.dah_estimates_recheck_stage() from public, anon, authenticated;
revoke all on function public.dah_extra_pay_recheck_stage() from public, anon, authenticated;
