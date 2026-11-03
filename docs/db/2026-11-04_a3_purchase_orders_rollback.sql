-- 되돌리기: 발주 기록이 한 건이라도 있으면 중단(기록 손실 방지). 정말 지우려면 먼저 선혜님 확인 + 복사본 저장.
begin;
do $$ begin
  if exists (select 1 from public.dah_purchase_orders limit 1) then
    raise exception '발주 기록이 있어 되돌리지 않음(먼저 복사본 저장 후 선혜님 확인)';
  end if;
end $$;
drop table if exists public.dah_purchase_orders;
drop table if exists public.dah_vendors;
commit;
