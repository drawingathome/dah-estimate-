-- N-164(선혜님 11-13 결정): '시공준비중' 기준 = 입금 완료(잔금결제) + 시공일 지정(미정 아님).
-- 이유: 원단 거래처 정보가 빠진 경우가 있어 '원단·제작·자재·블라인드 발주 체크'로 단계를 막으면 실제로 발주했어도 단계가 멈춤. 실측시공(시공일)은 반드시 하는 영역이라 이것으로 확인.
-- 바뀌는 것: dah_target_stage 한 함수만(트리거·표·데이터는 그대로). 발주 체크리스트(order_status)는 '참고 기록'으로 남고 단계를 막지 않음.
-- 영향받는 기존 고객(운영 읽기 계산, 11-13): 민지성(251)·이상옥(271) 2명이 '잔금결제'→'시공준비중'으로 다음 저장 때 자동 이동. 나머지 변화 없음.
begin;
create or replace function public.dah_target_stage(c customers)
 returns text language plpgsql stable
 set search_path to 'public', 'pg_temp'
as $function$
declare s text := c.stage;
begin
  if coalesce(c.is_archived, false) or coalesce(c.memo, '') ~ '플러그|Pluuug' then return s; end if;
  -- N-74: 선금 입금이 없는 방문예약·상담 + 보관 안 된 견적서 1건 이상 → 가견적
  if s in ('방문예약','상담') and coalesce(c.deposit_amount, 0) = 0
     and exists (select 1 from public.estimates e where e.client_id = c.id and not coalesce(e.is_archived, false)) then
    s := '가견적';
  end if;
  if s = '선금결제' and coalesce(c.deposit_amount, 0) > 0
     and coalesce(c.measure_date, '') <> '' and not coalesce(c.measure_date_tbd, false) then s := '실측준비중'; end if;
  if s in ('선금결제','실측준비중','확정견적') and public.dah_customer_fully_paid(c.id) then s := '잔금결제'; end if;
  -- N-164: 입금 완료 + 시공일 지정(미정 아님) → 시공준비중. 원단·제작·자재·블라인드 발주 체크는 단계를 막지 않는다.
  if s = '잔금결제' and coalesce(c.install_date, '') <> '' and not coalesce(c.install_date_tbd, false) then s := '시공준비중'; end if;
  return s;
end $function$;
-- 자동 검증: 시공일 있는 잔금결제 고객은 시공준비중, 시공일 미정/없음은 잔금결제로 남아야 함(안 맞으면 전체 취소)
do $$ begin
  if (select count(*) from public.customers c where c.stage='잔금결제' and not coalesce(c.is_archived,false) and coalesce(c.memo,'') !~ '플러그|Pluuug'
        and coalesce(c.install_date,'')<>'' and not coalesce(c.install_date_tbd,false)
        and public.dah_target_stage(c) <> '시공준비중') > 0 then
    raise exception 'N-164 검증 실패: 시공일 있는 잔금결제 고객이 시공준비중으로 안 감';
  end if;
end $$;
commit;
