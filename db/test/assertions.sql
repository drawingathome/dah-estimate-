-- DB 규칙 시험 (가상 데이터). 하나라도 어긋나면 에러로 멈춤 → CI 실패.
create schema if not exists t;
create or replace function t.eq(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL [%] 기대=% 실제=%', label, want, got; end if;
  raise notice 'PASS [%]', label;
end $$;
create or replace function t.fails(label text, stmt text, must_contain text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if position(must_contain in sqlerrm) = 0 then raise exception 'FAIL [%] 다른 이유로 거부됨: %', label, sqlerrm; end if;
    raise notice 'PASS [%] (거부됨)', label; return;
  end;
  raise exception 'FAIL [%] 거부돼야 하는데 통과함', label;
end $$;

-- 직원 계정(로그인 사용자 흉내)
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','staff@t');
insert into staff_profiles(id,display_name,role) values ('00000000-0000-0000-0000-0000000000a1','선혜','staff');

-- ===== 1. 단계 자동 이동 (완납일 때만 시공준비중) =====
insert into customers(id,client_name,stage,staff_name) overriding system value values (9001,'A','가견적','선혜');
insert into estimates(id,customer_name,client_id,price,performance_revenue,staff_name) values ('00000000-0000-0000-0000-0000000090a1','A',9001,1000000,800000,'선혜');
update estimates set deposit_amount=300000, deposit_date='2026-10-01' where id='00000000-0000-0000-0000-0000000090a1';
select t.eq('S1 선금 입금 → 선금결제', (select stage from customers where id=9001), '선금결제');
select t.eq('S1 기준금액 자동', (select price||'/'||performance_revenue from customers where id=9001), '1000000/800000');
update estimates set balance_amount=200000, balance_date='2026-10-05' where id='00000000-0000-0000-0000-0000000090a1';
select t.eq('S2 일부 잔금 → 단계 유지(완납 아님)', (select stage from customers where id=9001), '선금결제');
update estimates set balance_amount=700000 where id='00000000-0000-0000-0000-0000000090a1';
select t.eq('S2 나머지 입금해 완납 → 시공준비중', (select stage from customers where id=9001), '시공준비중');

insert into customers(id,client_name,stage,staff_name) overriding system value values (9002,'B','확정견적','선혜');
insert into estimates(id,customer_name,client_id,price,performance_revenue,staff_name,confirmed_at,deposit_amount,deposit_date,balance_amount,balance_date)
  values ('00000000-0000-0000-0000-0000000090b1','B',9002,500000,400000,'선혜',now(),200000,'2026-09-01',300000,'2026-09-20');
select t.eq('S3 완납 견적 저장 → 시공준비중', (select stage from customers where id=9002), '시공준비중');

insert into customers(id,client_name,stage,staff_name) overriding system value values (9003,'C','확정견적','선혜');
insert into estimates(id,customer_name,client_id,price,performance_revenue,staff_name,confirmed_at,deposit_amount,deposit_date) values
  ('00000000-0000-0000-0000-0000000090c1','C',9003,500000,400000,'선혜',now(),100000,'2026-09-01'),
  ('00000000-0000-0000-0000-0000000090c2','C',9003,300000,250000,'선혜',null,null,null);
update estimates set balance_amount=400000, balance_date='2026-09-10' where id='00000000-0000-0000-0000-0000000090c1';
select t.eq('S4 견적 2개 중 1개만 완납 → 단계 유지', (select stage from customers where id=9003), '확정견적');
select t.eq('S4 기준금액은 입금된 견적서만 합산', (select price::text from customers where id=9003), '500000');

-- ===== 2. 추가결제 =====
insert into customers(id,client_name,stage,staff_name) overriding system value values (9004,'D','확정견적','선혜');
insert into estimates(id,customer_name,client_id,price,performance_revenue,staff_name,confirmed_at,deposit_amount,deposit_date) values ('00000000-0000-0000-0000-0000000090d1','D',9004,600000,500000,'선혜',now(),100000,'2026-09-01');
insert into estimate_extra_payments(estimate_id,client_id,amount,paid_date) values ('00000000-0000-0000-0000-0000000090d1',9004,300000,'2026-09-15');
select t.eq('S5 추가결제 일부 → 단계 유지', (select stage from customers where id=9004), '확정견적');
insert into estimate_extra_payments(estimate_id,client_id,amount,paid_date) values ('00000000-0000-0000-0000-0000000090d1',9004,200000,'2026-09-20');
select t.eq('S5 추가결제로 완납 → 시공준비중', (select stage from customers where id=9004), '시공준비중');

-- ===== 3. 플러그 이관 고객은 자동 재계산 제외 =====
insert into customers(id,client_name,stage,memo,price,performance_revenue,staff_name) overriding system value values (9005,'이관','시공완료','플러그(Pluuug)에서 이관된 기존 고객',3320000,574000,'선혜');
insert into estimates(id,customer_name,client_id,price,performance_revenue,staff_name) values
  ('00000000-0000-0000-0000-0000000090e1','이관',9005,574000,574000,'선혜'),('00000000-0000-0000-0000-0000000090e2','이관',9005,3320000,0,'선혜');
update estimates set balance_amount=3320000, balance_date='2026-04-07' where id='00000000-0000-0000-0000-0000000090e2';
select t.eq('S6 이관 고객 금액 유지', (select price||'/'||performance_revenue from customers where id=9005), '3320000/574000');

-- ===== 4. 직원 권한성 규칙 =====
do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false); end $$;
select t.fails('S7 직원이 이미 기록된 입금 줄이기', $q$update estimates set deposit_amount=0 where id='00000000-0000-0000-0000-0000000090a1'$q$, '이미 기록된 입금액');
select t.fails('S8 입금일 없이 잔금 입력', $q$update estimates set balance_amount=1000, balance_date=null where id='00000000-0000-0000-0000-0000000090d1'$q$, '입금일이 비어');

-- ===== 5. 확정 보호 =====
select t.fails('G1 사유 없이 확정 해제', $q$update estimates set confirmed_at=null where id='00000000-0000-0000-0000-0000000090b1'$q$, '확정 해제에는 사유');
update estimates set confirmed_at=null, unconfirm_reason='재견적' where id='00000000-0000-0000-0000-0000000090b1';
select t.eq('G2 사유 있는 해제 → 가견적', (select estimate_status from estimates where id='00000000-0000-0000-0000-0000000090b1'), 'ga');
select t.eq('G2 해제 기록 1건+사유', (select count(*)||'/'||max(reason) from estimate_confirm_log where estimate_id='00000000-0000-0000-0000-0000000090b1' and action='unconfirm'), '1/재견적');
select t.eq('G2 해제 후 고객 단계 유지', (select stage from customers where id=9002), '시공준비중');
update estimates set confirmed_at=now() where id='00000000-0000-0000-0000-0000000090b1';
select t.eq('G3 재확정 → final + 확정 기록 1건(처음 입력 때는 기록 없음)', (select estimate_status||'/'||(select count(*) from estimate_confirm_log where estimate_id='00000000-0000-0000-0000-0000000090b1' and action='confirm') from estimates where id='00000000-0000-0000-0000-0000000090b1'), 'final/1');
do $$ begin perform set_config('request.jwt.claim.sub','',false); end $$;

-- ===== 6. 뒤처진 단계 정리 스크립트(95) 대상 판정 =====
alter table estimates disable trigger user; alter table customers disable trigger user;
insert into customers(id,client_name,stage,staff_name) overriding system value values (9006,'뒤처짐','잔금결제','선혜');
insert into estimates(id,customer_name,client_id,price,staff_name,deposit_amount,deposit_date,balance_amount,balance_date) values ('00000000-0000-0000-0000-0000000090f1','뒤처짐',9006,900000,'선혜',400000,'2026-10-01',500000,'2026-10-05');
alter table estimates enable trigger user; alter table customers enable trigger user;
select t.eq('B0 정리 전(규칙 도입 전 상태)', (select stage from customers where id=9006), '잔금결제');
