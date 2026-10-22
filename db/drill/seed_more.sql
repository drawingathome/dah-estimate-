insert into analytics_events(event_type,event_detail,staff_name) select 'open', jsonb_build_object('n',g,'한글','값'), '선혜' from generate_series(1,3806) g;
insert into client_error_logs(app,message,stack,url,extra) select 'dash','오류 "x" '||g, E'줄1\n줄2', 'https://x/?a=1&b=2', '{"k":[1,2]}' from generate_series(1,300) g;
insert into as_records(customer_id,customer_name,symptom) values (900001,'장민영','소리 😀 "나요"');
insert into customer_stage_auto_log(id,customer_id,from_stage,to_stage,reason) overriding system value values (1,900001,'선금결제','시공준비중','완납 "자동"');
insert into estimate_confirm_log(id,estimate_id,client_id,action,reason,confirmed_at_before) overriding system value values (1,'11111111-1111-1111-1111-111111111111',900001,'unconfirm','고객 요청으로 수정 😀','2026-03-05 00:00:00+00');
insert into monthly_close(month,revenue,perf_revenue,contract_count,by_staff,note) values ('2026-09',123456789.5,100000000,12,'{"선혜":{"r":1}}','마감');
insert into integrity_acks(ack_key,code,customer_id,client_name,note,acked_by) values ('k1','PAID_STAGE_LAG',900001,'장민영','확인함','00000000-0000-0000-0000-000000000001');
insert into estimate_extra_payments(estimate_id,client_id,amount,paid_date,method,memo) values ('11111111-1111-1111-1111-111111111111',900001,500000.25,'2026-04-01','카드','추가 "결제"');
insert into payment_refunds(estimate_id,client_id,customer_name,slot,amount,paid_date,refund_date,reason) values ('11111111-1111-1111-1111-111111111111',900001,'장민영','deposit',100000,'2026-01-03','2026-05-01','환불 사유 😀');
