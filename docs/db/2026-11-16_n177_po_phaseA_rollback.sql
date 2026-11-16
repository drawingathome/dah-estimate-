-- N-177 ⓐ 되돌리기: 이관된 행을 지우고 추가한 칸·인덱스를 제거(원본 order_status는 처음부터 안 바뀌었음). 이관 전 표가 0행이었으므로 안전.
begin;
delete from public.dah_purchase_orders where source = 'migrated';
do $c$ begin if (select count(*) from public.dah_purchase_orders) <> 0 then raise exception '이관 외 행이 있어 중단: 직접 확인 필요'; end if; end $c$;
drop index if exists public.dah_po_uniq_customer_cat_vendor;
alter table public.dah_purchase_orders drop column if exists legacy_key, drop column if exists source, drop column if exists vendor_name;
commit;
