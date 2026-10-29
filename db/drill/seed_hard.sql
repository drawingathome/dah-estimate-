-- 실제 운영에서 문제될 만한 값들: 한글·이모지·따옴표·줄바꿈·큰 id·소수·null·JSON 중첩·시간대
insert into customers (id, client_name, phone, addr, memo, price, deposit_amount, balance_amount, stage, order_status, created_at, install_date, deposit_date, balance_date)
overriding system value values
 (900001,'시험저 "따옴표" ''작은'' 😀','010-1234-5678','서울 서초구 반포동 \백슬래시','줄1
줄2	탭','12345678','1000000.50','2000000','시공준비중','{"a":{"b":[1,2,{"c":null}]},"한글":"값"}','2026-01-02 03:04:05.123456+09','2026-11-30','2026-01-03','2026-02-01'),
 (900002,'시험호',null,null,null,0,0,0,'상담','{}', now(), null, null, null);
insert into estimates (id, customer_name, client_id, price, line_items, price_breakdown, created_at, confirmed_at, estimate_status, deposit_amount, deposit_date)
values ('11111111-1111-1111-1111-111111111111','시험저',900001,12345678.99,'[{"n":"커튼","q":2,"p":1.5}]','{"x":{"y":"z"}}','2026-03-04 05:06:07.891','2026-03-05 00:00:00+00','confirmed',1000000.50,'2026-01-03');
insert into payment_ledger (id, customer_id, estimate_id, kind, amount, paid_at, memo) overriding system value values
 (800001,900001,'11111111-1111-1111-1111-111111111111','입금',1000000.50,'2026-01-03','메모, with "comma"');
