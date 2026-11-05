-- N-105②·N-119③: 같은 전화번호를 쓰는 가족(이름이 다름)이 다른 담당자 고객과 겹쳐도 영영 막히지 않게, 중복 확인 함수에 '입력한 이름과 같은지(same_name)'만 추가. 미적용 초안.
-- 다른 담당자 고객의 이름은 돌려주지 않음(실장에게 마스터 고객 이름 노출 방지). 반환 열 추가라 함수를 지우고 다시 만듦. 권한: 로그인한 사용자만(익명 불가) — 기존과 동일.
begin;
drop function if exists public.check_phone_duplicate(text);
create function public.check_phone_duplicate(phone_input text, name_input text default null)
returns table(exists_flag boolean, staff_name text, same_name boolean)
language sql security definer set search_path to 'public' as $$
  select true as exists_flag, c.staff_name,
         (name_input is not null and lower(btrim(coalesce(c.client_name,''))) = lower(btrim(name_input))) as same_name
  from customers c
  where regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(phone_input, '\D', '', 'g')
    and c.is_archived = false
  order by (name_input is not null and lower(btrim(coalesce(c.client_name,''))) = lower(btrim(name_input))) desc, c.id
  limit 1;
$$;
revoke all on function public.check_phone_duplicate(text, text) from public, anon;
grant execute on function public.check_phone_duplicate(text, text) to authenticated;
commit;
