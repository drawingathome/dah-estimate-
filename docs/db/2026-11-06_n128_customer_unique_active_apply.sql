-- N-128(N-125/N-126 후속): 같은 번호+같은 이름의 '진행 중' 고객이 두 줄 생기는 것을 DB가 직접 막는 잠금. 미적용 초안(선혜님 승인 전 적용 금지).
-- 조건: 보관(is_archived)되지 않았고, 단계가 '시공완료'가 아니고, 번호가 있는 고객 중 (숫자만 번호, 공백·대소문자 무시한 이름)이 같으면 한 줄만 허용.
-- 이유: 시공완료 고객이 다시 상담하러 오는 재구매(예: 소지선 112 시공완료 + 307 방문예약)는 정상이라 막으면 안 됨.
-- 적용 전 필수: 현재 진행 중 중복 0건이어야 함(운영 11-06 07:20 기준 김태연 301·302, 임현정 311·312 — 정리 후 적용). 중복이 남아 있으면 아래 검사가 오류로 멈춰 아무것도 바뀌지 않음.
begin;
do $$ begin
  if exists (
    select 1 from public.customers
    where coalesce(is_archived,false)=false and coalesce(stage,'')<>'시공완료' and coalesce(phone,'')<>''
    group by regexp_replace(phone,'\D','','g'), lower(btrim(coalesce(client_name,'')))
    having count(*)>1
  ) then raise exception 'N-128: 진행 중 중복 고객이 남아 있어 잠금을 걸 수 없음 — 먼저 정리하세요'; end if;
end $$;
create unique index if not exists customers_active_phone_name_uniq
  on public.customers ((regexp_replace(phone,'\D','','g')), (lower(btrim(coalesce(client_name,'')))))
  where coalesce(is_archived,false)=false and coalesce(stage,'')<>'시공완료' and coalesce(phone,'')<>'';
commit;
