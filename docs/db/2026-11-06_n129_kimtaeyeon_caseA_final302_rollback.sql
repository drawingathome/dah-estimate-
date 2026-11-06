-- N-129 경우 A 되돌리기
begin;
update public.estimates set is_archived = false where id = 'cc4940ed-2e11-4122-8178-e096faa409a6' and client_id = 301;
update public.customers set is_archived = false where id = 301 and client_name = '김태연';
commit;
