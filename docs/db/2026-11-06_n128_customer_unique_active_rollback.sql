-- N-128 되돌리기: 잠금(유니크 인덱스)만 제거. 고객 데이터는 건드리지 않음.
drop index if exists public.customers_active_phone_name_uniq;
