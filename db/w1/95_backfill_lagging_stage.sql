-- 적용 후 1회: "모든 견적서가 완납인데 단계가 뒤처진" 고객만 규칙을 한 번 태워 시공준비중으로 정리.
-- 대상은 먼저 아래 select로 확인(승인 후 실행). 플러그 이관 고객은 제외.
-- 미리보기:
--   select id, client_name, stage from public.customers c where not coalesce(is_archived,false)
--     and stage in ('방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제')
--     and public.dah_customer_fully_paid(id) and coalesce(memo,'') !~ '플러그|Pluuug';
begin;
update public.customers c set price = c.price
 where not coalesce(c.is_archived,false)
   and c.stage in ('방문예약','상담','가견적','선금결제','실측준비중','확정견적','잔금결제')
   and public.dah_customer_fully_paid(c.id)
   and coalesce(c.memo,'') !~ '플러그|Pluuug';
commit;
