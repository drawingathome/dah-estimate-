-- N-177 ⓐ 되돌리기: 자동 장치·함수·추가 칸·키를 제거하고 연결을 원래(RESTRICT)로 복원. 이관 전 표가 0행이었고 원본(order_status)은 안 바뀌었음.
begin;
drop trigger if exists trg_dah_po_sync_ins on public.customers;
drop trigger if exists trg_dah_po_sync_upd on public.customers;
drop function if exists public.dah_po_sync_trg();
drop function if exists public.dah_po_sync(bigint);
delete from public.dah_purchase_orders where source = 'sync';
do $c$ begin if (select count(*) from public.dah_purchase_orders) <> 0 then raise exception '자동 행 외 데이터가 있어 중단: 직접 확인 필요'; end if; end $c$;
drop index if exists public.dah_po_uniq_customer_cat_vendor;
alter table public.dah_purchase_orders drop column if exists legacy_key, drop column if exists source, drop column if exists vendor_name;
alter table public.dah_purchase_orders drop constraint dah_purchase_orders_customer_id_fkey;
alter table public.dah_purchase_orders add constraint dah_purchase_orders_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete restrict;
commit;
