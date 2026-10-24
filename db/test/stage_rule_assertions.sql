-- 단계 이동 규칙(2026-10-24 확정안) 시나리오 시험. t.eq/t.fails 는 assertions.sql 에서 만들어짐.
-- 모드 전환 도우미
create or replace function t.mode(m text) returns void language sql as $$
  insert into app_settings(key,value) values ('stage_rule_mode', to_jsonb(m)) on conflict (key) do update set value = to_jsonb(m)
$$;
-- 고객 + 견적서(총액 price, 선금 dep) 만들기. 선금 입금으로 선금결제까지는 기존 규칙이 이동시킴.
create or replace function t.mk(cid bigint, nm text, price numeric, dep numeric, items jsonb default '[]'::jsonb) returns void language plpgsql as $$
begin
  insert into customers(id,client_name,stage,staff_name) overriding system value values (cid,nm,'가견적','선혜');
  insert into estimates(id,customer_name,client_id,price,performance_revenue,staff_name,line_items)
    values (('00000000-0000-0000-0000-00000000'||lpad(cid::text,4,'0'))::uuid, nm, cid, price, price, '선혜', items);
  update estimates set deposit_amount=dep, deposit_date='2026-10-01' where client_id=cid;
end $$;
create or replace function t.stage(cid bigint) returns text language sql as $$ select stage from customers where id=cid $$;
create or replace function t.paid(cid bigint) returns void language sql as $$
  update estimates set balance_amount = price - deposit_amount, balance_date='2026-10-10' where client_id=cid $$;
create or replace function t.orders(cid bigint, keys text[]) returns void language sql as $$
  update customers set order_status = (select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) from unnest(keys) k) where id=cid $$;

-- ===== 모드 off(기본): 새 규칙 없음 =====
select t.eq('R0 모드 기본값은 off', public.dah_stage_rule_mode(), 'off');
select t.mk(9101,'R0',1000000,300000);
update customers set measure_date='2026-11-05' where id=9101;
select t.eq('R0 off에서는 실측일을 넣어도 이동 없음', t.stage(9101), '선금결제');

select t.mode('on');
-- ===== #2,#3: 실측준비중 =====
select t.mk(9102,'R2',1000000,300000);
select t.eq('#1 선금 입금 → 선금결제(기존 규칙)', t.stage(9102), '선금결제');
update customers set measure_date='2026-11-05', measure_date_tbd=true where id=9102;
select t.eq('#3 실측일 미정 체크 → 선금결제 유지', t.stage(9102), '선금결제');
update customers set measure_date='', measure_date_tbd=false where id=9102;
select t.eq('#3 실측일 비어 있음 → 유지', t.stage(9102), '선금결제');
update customers set measure_date='2026-11-05' where id=9102;
select t.eq('#2 선금 + 실측일 확정 → 실측준비중', t.stage(9102), '실측준비중');
select t.eq('#2 이동이 기록표에 남음', (select count(*)::text from customer_stage_auto_log where customer_id=9102 and reason like '규칙 자동 이동%'), '1');

-- ===== #5,#6,#7: 잔금·발주 =====
update estimates set balance_amount=200000, balance_date='2026-10-05' where client_id=9102;
select t.eq('#5 잔금 일부 → 실측준비중 유지', t.stage(9102), '실측준비중');
select t.paid(9102);
select t.eq('#6 모든 견적서 완납 + 발주 미완료 → 잔금결제', t.stage(9102), '잔금결제');
select t.orders(9102, array['fabric','production','blind','material']);
select t.eq('#6 발주 일부만 → 잔금결제 유지', t.stage(9102), '잔금결제');
select t.orders(9102, array['fabric','production','blind','material','install']);
select t.eq('#7 완납 + 발주 전부(품목 정보 없으면 5개 전부) → 시공준비중', t.stage(9102), '시공준비중');
-- #8 발주 체크를 풀어도 단계는 안 내려감
select t.orders(9102, array['fabric']);
select t.eq('#8 발주 체크를 풀어도 시공준비중 유지(뒤로 이동은 사람만)', t.stage(9102), '시공준비중');
-- #13 완납 후 추가결제/증액이 생겨 미수금이 생겨도 단계 유지
update estimates set price = price + 300000 where client_id=9102;
select t.eq('#13 완납 후 증액으로 미수금이 생겨도 단계 유지', t.stage(9102), '시공준비중');

-- ===== #9,#10: 커튼만 / 커튼+블라인드 =====
select t.mk(9103,'R9',500000,500000, '[{"type":"curtain"}]'::jsonb);
update customers set measure_date='2026-11-01' where id=9103;
select t.orders(9103, array['fabric','production','material','install']);
select t.eq('#9 커튼만 주문, 커튼 관련 4개 발주 완료 → 시공준비중(블라인드 발주 불필요)', t.stage(9103), '시공준비중');
select t.mk(9104,'R10',500000,500000, '[{"type":"curtain"},{"type":"blind"}]'::jsonb);
update customers set measure_date='2026-11-01' where id=9104;
select t.orders(9104, array['fabric','production','material','install']);
select t.eq('#10 커튼+블라인드, 블라인드 발주 빠짐 → 잔금결제 유지', t.stage(9104), '잔금결제');
update customers set order_status = order_status || '{"blind":{"done":true,"vendor":"윈텍"}}'::jsonb where id=9104;
select t.eq('#10 블라인드(객체 형식 done)까지 → 시공준비중', t.stage(9104), '시공준비중');

-- ===== #11,#12: 견적서 2개 =====
select t.mk(9105,'R11',400000,100000);
insert into estimates(id,customer_name,client_id,price,performance_revenue,staff_name) values ('00000000-0000-0000-0000-000000919105','R11',9105,300000,300000,'선혜');
update estimates set deposit_amount=100000, deposit_date='2026-10-02' where id='00000000-0000-0000-0000-000000919105';
update customers set measure_date='2026-11-01' where id=9105;
select t.eq('#11 사전: 실측준비중', t.stage(9105), '실측준비중');
update estimates set balance_amount=300000, balance_date='2026-10-09' where id='00000000-0000-0000-0000-000000009105';
select t.eq('#11 견적서 2개 중 1개만 완납 → 잔금결제 아님', t.stage(9105), '실측준비중');
update estimates set balance_amount=200000, balance_date='2026-10-09' where id='00000000-0000-0000-0000-000000919105';
select t.eq('#12 견적서 2개 모두 완납 → 잔금결제', t.stage(9105), '잔금결제');

-- ===== 사람이 같은 저장에서 단계를 바꾸면 사람이 우선, 뒤로 이동은 막지 않음 =====
update customers set stage='실측준비중', order_status='{}'::jsonb where id=9103;
select t.eq('#16 사람이 단계를 뒤로 옮기면(발주 칸이 같이 바뀌어도) 그대로 유지', t.stage(9103), '실측준비중');
update customers set stage='실측준비중' where id=9102;
select t.eq('#16 단계만 뒤로 옮기는 저장도 막지 않음', t.stage(9102), '실측준비중');
-- 규칙은 절대 단계를 내리지 않음 / 시공완료는 건드리지 않음
select t.mk(9106,'R-done',300000,300000);
update customers set stage='시공완료', measure_date='2026-11-01' where id=9106;
select t.eq('시공완료 고객은 규칙이 건드리지 않음', t.stage(9106), '시공완료');
-- 플러그 이관 고객 제외
insert into customers(id,client_name,stage,staff_name,memo) overriding system value values (9107,'R-plug','가견적','선혜','플러그(Pluuug)에서 이관');
insert into estimates(id,customer_name,client_id,price,performance_revenue,staff_name) values ('00000000-0000-0000-0000-000000009107','R-plug',9107,300000,300000,'선혜');
update estimates set deposit_amount=300000, deposit_date='2026-10-01' where client_id=9107;
update customers set measure_date='2026-11-01' where id=9107;
select t.eq('플러그 이관 고객은 제외', t.stage(9107), '선금결제');

-- ===== #20 기록 전용(shadow) =====
select t.mode('shadow');
select t.mk(9108,'R-shadow',300000,100000);
update customers set measure_date='2026-11-01' where id=9108;
select t.eq('#20 기록 전용: 단계는 안 바뀜', t.stage(9108), '선금결제');
select t.eq('#20 기록 전용: 규칙이 이동했을 결과가 기록됨', (select count(*)||'/'||min(to_stage) from customer_stage_auto_log where customer_id=9108 and reason like '[기록전용]%'), '1/실측준비중');
update customers set measure_date='2026-11-02' where id=9108;
select t.eq('#20 기록 전용: 같은 결과는 중복 기록 안 함', (select count(*)::text from customer_stage_auto_log where customer_id=9108 and reason like '[기록전용]%'), '1');
select t.mode('off');
select t.mk(9109,'R-off',300000,100000);
update customers set measure_date='2026-11-01' where id=9109;
select t.eq('#20 off: 이동도 기록도 없음', t.stage(9109)||'/'||(select count(*) from customer_stage_auto_log where customer_id=9109 and reason like '%규칙%'), '선금결제/0');
