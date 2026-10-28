-- N-25 되돌리기: 보기만 삭제. 원본 client_error_logs 는 건드리지 않음.
drop view if exists public.client_error_logs_real;
