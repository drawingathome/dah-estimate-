-- N-73 2단계: 30일 넘게 활동 없는 선금 전 리드를 매일 자동으로 대기 리드로 옮기고, 다시 움직이면 자동 복귀 (+ 이동·복귀 기록)
-- 활동 = 보관 안 된 견적서의 수정. 제외 조건은 dah_stale_lead_candidates 와 같음. 스위치: app_settings 'lead_park_mode' = 'shadow'(기록만) / 'on'(실제 이동)
-- 1) 스위치 (기본: on — 선혜님 지시 11-03 / 되돌리기 쉬움)
insert into public.app_settings(key, value) values ('lead_park_mode', to_jsonb('on'::text)) on conflict (key) do nothing;

-- 2) 자동 이동 함수 (매일 1회 실행). 반환 = 이동(또는 기록)한 인원
create or replace function public.dah_park_stale_leads(p_days int default 30)
 returns int language plpgsql security definer set search_path to ''
as $function$
declare r record; n int := 0; v_mode text;
begin
  select trim(both '"' from value::text) into v_mode from public.app_settings where key = 'lead_park_mode';
  if coalesce(v_mode, 'off') not in ('shadow', 'on') then return 0; end if;
  for r in select customer_id, stage, idle_days from public.dah_stale_lead_candidates(p_days) loop
    if v_mode = 'on' then
      update public.customers set lead_parked = true where id = r.customer_id and not coalesce(lead_parked, false);
      if found then
        insert into public.customer_stage_auto_log(customer_id, from_stage, to_stage, reason)
        values (r.customer_id, r.stage, r.stage, '대기 리드 자동 이동: ' || r.idle_days || '일 활동 없음');
        n := n + 1;
      end if;
    else
      if not exists (select 1 from public.customer_stage_auto_log l where l.customer_id = r.customer_id and l.reason like '[기록전용] 대기 리드%' and l.changed_at > now() - interval '20 hours') then
        insert into public.customer_stage_auto_log(customer_id, from_stage, to_stage, reason)
        values (r.customer_id, r.stage, r.stage, '[기록전용] 대기 리드로 옮겼을 결과: ' || r.idle_days || '일 활동 없음');
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $function$;
revoke all on function public.dah_park_stale_leads(int) from public, anon, authenticated;

-- 3) 자동 복귀: 견적서가 새로 생기거나 금액·입금이 바뀌면 대기 리드 해제 (기존 단계 재판정 트리거 함수에 한 줄 추가)
create or replace function public.dah_estimates_recheck_stage()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare v_back boolean; v_cnt int;
begin
  perform public.dah_recheck_customer_stage(NEW.client_id);
  if TG_OP = 'UPDATE' and OLD.client_id is distinct from NEW.client_id then perform public.dah_recheck_customer_stage(OLD.client_id); end if;
  -- N-73: 대기 리드 고객의 견적서가 움직이면(보관된 견적서 제외) 자동 복귀 + 기록
  if not coalesce(NEW.is_archived, false) then
    update public.customers set lead_parked = false where id = NEW.client_id and coalesce(lead_parked, false);
    get diagnostics v_cnt = row_count; v_back := v_cnt > 0;
    if v_back then
      insert into public.customer_stage_auto_log(customer_id, from_stage, to_stage, reason)
      select c.id, c.stage, c.stage, '대기 리드 자동 복귀: 견적서가 수정됨' from public.customers c where c.id = NEW.client_id;
    end if;
  end if;
  return null;
end $function$;

-- 4) 매일 한국 시각 07:10 (UTC 22:10)에 자동 실행 예약
select cron.schedule('dah-park-stale-leads', '10 22 * * *', 'select public.dah_park_stale_leads(30)');
