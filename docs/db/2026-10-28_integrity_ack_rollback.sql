-- [폐기 10-28 22:15] N-36 선혜님 결정(①)으로 이 초안은 쓰지 않음. 대체: 2026-10-29_integrity_acks_expiry_{apply,rollback}.sql (기존 integrity_acks에 기한 칸만 추가)
-- 2026-10-28 N-26 integrity_ack 되돌리기 (적용 전 상태로: 표와 규칙이 없던 상태)
-- 주의: 표 안의 "확인함" 기록은 함께 사라짐(경고가 다시 전부 보임). 돈·고객 원본 데이터는 영향 없음.
drop policy if exists integrity_ack_master_all on public.integrity_ack;
drop table if exists public.integrity_ack;   -- 시퀀스(integrity_ack_id_seq)도 함께 삭제됨
