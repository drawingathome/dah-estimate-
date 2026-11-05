-- N-105② 되돌리기: 2026-11-05 운영에서 읽은 원래 함수 그대로 복원(이름 비교 없음). 앱은 same_name이 없으면 예전처럼 차단하므로 안전.
begin;
drop function if exists public.check_phone_duplicate(text, text);
create function public.check_phone_duplicate(phone_input text)
returns table(exists_flag boolean, staff_name text)
language sql security definer set search_path to 'public' as $$
  select true as exists_flag, c.staff_name
  from customers c
  where regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(phone_input, '\D', '', 'g')
    and c.is_archived = false
  limit 1;
$$;
revoke all on function public.check_phone_duplicate(text) from public, anon;
grant execute on function public.check_phone_duplicate(text) to authenticated;
commit;
