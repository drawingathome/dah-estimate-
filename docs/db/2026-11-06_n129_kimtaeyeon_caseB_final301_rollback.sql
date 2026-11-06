-- N-129 경우 B 되돌리기
begin;
update public.estimates set is_archived = false where id = 'a27c8970-460a-49e4-8036-f94198b82b5c' and client_id = 302;
update public.customers set is_archived = false where id = 302 and client_name = '김태연';
commit;
