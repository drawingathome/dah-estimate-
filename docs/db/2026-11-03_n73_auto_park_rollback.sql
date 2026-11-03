-- 되돌리기: 자동 복귀 한 줄 제거(원래 트리거 함수), 자동 이동 함수 삭제, 스위치 삭제. (매일 실행 예약은 별도 줄)
create or replace function public.dah_estimates_recheck_stage()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  perform public.dah_recheck_customer_stage(NEW.client_id);
  if TG_OP = 'UPDATE' and OLD.client_id is distinct from NEW.client_id then perform public.dah_recheck_customer_stage(OLD.client_id); end if;
  return null;
end $function$;
drop function if exists public.dah_park_stale_leads(int);
delete from public.app_settings where key = 'lead_park_mode';
-- 예약 해제: select cron.unschedule('dah-park-stale-leads');
