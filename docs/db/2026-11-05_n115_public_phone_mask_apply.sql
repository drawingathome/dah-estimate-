-- N-115: 공개 링크(get_public_estimate)가 고객 전화번호 전체를 내려주던 것을 '뒤 4자리만' 보이게 가림. 미적용 초안.
-- 반환 열·순서·권한·search_path는 그대로, phone 값만 바뀜(예: 010-7282-4432 → ***-****-4432). 번호가 없거나 4자리 미만이면 빈 값.
begin;
create or replace function public.get_public_estimate(p_id uuid)
returns table(customer_name text, phone text, staff_name text, install_date text, estimate_status text, line_items jsonb)
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  return query
  select e.customer_name,
         case when length(regexp_replace(coalesce(e.phone,''), '\D', '', 'g')) >= 4
              then '***-****-' || right(regexp_replace(e.phone, '\D', '', 'g'), 4) else '' end,
         e.staff_name, e.install_date, e.estimate_status, e.line_items
  from estimates e
  where e.id = p_id and e.is_archived = false;
end;
$$;
commit;
