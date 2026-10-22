create or replace view public.data_integrity_issues_base as select null::text code,null::text severity,null::bigint customer_id,null::text client_name,null::text staff_name,null::text detail where false;
create or replace view public.data_integrity_issues with (security_invoker=true) as select code,severity,customer_id,client_name,staff_name,detail from public.data_integrity_issues_base;
grant select on public.data_integrity_issues to authenticated;
insert into customers(id,client_name,stage,memo,price,performance_revenue,staff_name) overriding system value values
 (244,'완납뒤처짐','잔금결제','',2091000,1781600,'마스터'),(63,'이관','시공완료','플러그(Pluuug)에서 이관된 기존 고객',3320000,574000,'마스터'),(7,'일반','가견적','',0,0,'마스터');
insert into estimates(id,customer_name,client_id,price,performance_revenue,staff_name) values
 ('00000000-0000-0000-0000-000000000244','완납뒤처짐',244,2091000,1781600,'마스터'),
 ('00000000-0000-0000-0000-0000000063a1','이관',63,574000,574000,'마스터'),('00000000-0000-0000-0000-0000000063a2','이관',63,3320000,0,'마스터'),
 ('00000000-0000-0000-0000-000000000007','일반',7,500000,400000,'마스터');
-- 운영 상태 흉내: 입금은 트리거를 끄고 직접 심어 "규칙 도입 전" 상태를 만든다
alter table estimates disable trigger user; alter table customers disable trigger user;
update estimates set deposit_amount=1000000,deposit_date='2026-10-01',balance_amount=1091000,balance_date='2026-10-05' where id='00000000-0000-0000-0000-000000000244';
update estimates set balance_amount=3320000,balance_date='2026-04-07' where id='00000000-0000-0000-0000-0000000063a2';
update customers set deposit_amount=1000000,balance_amount=1091000 where id=244; update customers set balance_amount=3320000 where id=63;
alter table estimates enable trigger user; alter table customers enable trigger user;
