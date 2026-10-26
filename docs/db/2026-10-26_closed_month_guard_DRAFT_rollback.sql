-- [초안] N-24 마감월 가드 되돌리기 — 가드만 제거. 이미 쌓인 기록 표(closed_month_edit_log)는 지우지 않음(필요하면 선혜님이 직접 판단).
drop trigger if exists trg_closed_month_guard_extra on public.estimate_extra_payments;
drop trigger if exists trg_closed_month_guard_est on public.estimates;
drop function if exists public.dah_closed_month_guard();
-- register_refund에 set_config 한 줄을 넣었다면 그 줄도 원래 정의로 되돌림(적용 시 원본 정의를 backup 스키마에 저장).
